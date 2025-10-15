import { Client, type QueryResult } from "pg";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";

export interface DatabaseQueryOptions {
  timeoutMs?: number;
  rowLimit?: number;
  requestId?: string;
  tool?: string;
}

export interface DatabaseQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
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

  ensureQueryAllowed(query, profile.allowedStatementPatterns);

  const timeoutMs = Math.min(options.timeoutMs ?? profile.maxExecutionMs, profile.maxExecutionMs);
  const rowLimit = Math.min(options.rowLimit ?? profile.maxRows, profile.maxRows);

  const client = new Client({ connectionString: profile.connectionString });
  const start = Date.now();

  logger.info("Executing database query", {
    profile: profileName,
    requestId: options.requestId,
    tool: options.tool
  });

  try {
    await client.connect();
    await applyTimeout(client, timeoutMs);

    const result: QueryResult = await client.query({ text: query, values });
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

    return {
      rows,
      rowCount,
      truncated,
      durationMs
    };
  } catch (error) {
    logger.error("Database query failed", {
      profile: profileName,
      requestId: options.requestId,
      tool: options.tool,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await client.end();
  }
}
