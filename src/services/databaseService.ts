import { Client, type QueryResult } from "pg";
import { getConfig } from "../config/index.js";
import { ConcurrencyLimiter } from "../utils/concurrency.js";
import { createAbortError } from "../utils/abort.js";
import type { ProgressUpdate } from "../utils/progress.js";
import { logger } from "../utils/logger.js";

export interface DatabaseQueryOptions {
  timeoutMs?: number;
  rowLimit?: number;
  requestId?: string;
  tool?: string;
  signal?: AbortSignal;
  onProgress?: (update: ProgressUpdate) => void;
}

export interface DatabaseQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

const dbConcurrency = new ConcurrencyLimiter();

function validateQuerySafety(query: string): void {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error("Query cannot be empty");
  }

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let semicolonIndex: number | null = null;

  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    const prev = trimmed[i - 1];
    const next = trimmed[i + 1];
    const isEscaped = prev === "\\";

    if (!isEscaped && char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!isEscaped && char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === "-" && next === "-") {
      throw new Error("Inline SQL comments are not allowed");
    }

    if (char === "/" && next === "*") {
      throw new Error("Block SQL comments are not allowed");
    }

    if (char === ";") {
      if (semicolonIndex !== null) {
        throw new Error("Query must be a single statement");
      }
      semicolonIndex = i;
    }
  }

  if (semicolonIndex !== null) {
    const trailing = trimmed.slice(semicolonIndex + 1).trim();
    if (trailing.length > 0) {
      throw new Error("Query must not contain multiple statements");
    }
  }
}

function ensureQueryAllowed(query: string, patterns?: RegExp[]): void {
  if (!patterns || patterns.length === 0) {
    return;
  }

  const allowed = patterns.some((regex) => regex.test(query));
  if (!allowed) {
    throw new Error("Query is not permitted by policy");
  }
}

async function applyTimeout(client: Client, timeoutMs: number): Promise<void> {
  await client.query("SET statement_timeout = $1", [timeoutMs]);
}

export async function executeDatabaseQuery(
  profileName: string,
  query: string,
  values: unknown[] | undefined,
  options: DatabaseQueryOptions = {}
): Promise<DatabaseQueryResult> {
  const config = getConfig();
  const profile = config.databaseProfiles[profileName];
  if (!profile) {
    throw new Error(`Database profile '${profileName}' not found`);
  }

  validateQuerySafety(query);
  ensureQueryAllowed(query, profile.allowedStatementPatterns);

  const timeoutMs = Math.min(options.timeoutMs ?? profile.maxExecutionMs, profile.maxExecutionMs);
  const rowLimit = Math.min(options.rowLimit ?? profile.maxRows, profile.maxRows);

  options.onProgress?.({ progress: 0, message: "Waiting for database availability" });
  const release = await dbConcurrency.acquire(profileName, profile.maxConcurrent, options.signal);

  const client = new Client({ connectionString: profile.connectionString });
  const start = Date.now();
  const abortError = createAbortError("Database query cancelled");
  let aborted = false;
  let abortListener: (() => void) | undefined;

  logger.info("Executing database query", {
    profile: profileName,
    requestId: options.requestId,
    tool: options.tool
  });

  try {
    if (options.signal) {
      if (options.signal.aborted) {
        aborted = true;
        throw abortError;
      }

      abortListener = () => {
        aborted = true;
        options.onProgress?.({ progress: 1, message: "Database query cancelled" });
        if (client.connection?.stream) {
          client.connection.stream.destroy(abortError);
        }
      };

      options.signal.addEventListener("abort", abortListener, { once: true });
    }

    options.onProgress?.({ progress: 0.1, message: "Connecting to database" });
    await client.connect();
    if (aborted) {
      throw abortError;
    }

    options.onProgress?.({ progress: 0.3, message: "Applying session limits" });
    await applyTimeout(client, timeoutMs);

    options.onProgress?.({ progress: 0.6, message: "Executing query" });
    const result: QueryResult = await client.query({ text: query, values });
    if (aborted) {
      throw abortError;
    }

    const rows = result.rows.slice(0, rowLimit);
    const truncated = result.rows.length > rows.length;
    const rowCount = result.rowCount ?? rows.length;
    const durationMs = Date.now() - start;

    logger.info("Database query completed", {
      profile: profileName,
      requestId: options.requestId,
      tool: options.tool,
      rowCount,
      truncated,
      durationMs
    });

    options.onProgress?.({ progress: 1, message: "Database query completed" });

    return {
      rows,
      rowCount,
      truncated,
      durationMs
    };
  } catch (error) {
    if (aborted) {
      throw abortError;
    }

    logger.error("Database query failed", {
      profile: profileName,
      requestId: options.requestId,
      tool: options.tool,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    if (options.signal && abortListener) {
      options.signal.removeEventListener("abort", abortListener);
    }
    try {
      await client.end();
    } catch (endError) {
      logger.debug("Error closing database client", {
        profile: profileName,
        error: endError instanceof Error ? endError.message : String(endError)
      });
    }
    release();
  }
}
