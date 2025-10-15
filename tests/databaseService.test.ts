import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { refreshConfig } from "../src/config/index.js";

interface QueryCall {
  text?: string;
}

interface MockPgModule {
  __setQueryRows(rows: Array<Record<string, unknown>>): void;
  __setQueryError(error: Error | null): void;
  __getQueryCalls(): QueryCall[];
  __reset(): void;
}

vi.mock("pg", async () => {
  let rows: Array<Record<string, unknown>> = [];
  let error: Error | null = null;
  const queryCalls: QueryCall[] = [];

  class MockClient {
    public connection = { stream: { destroy: vi.fn() } };
    connect = vi.fn(async () => {});
    end = vi.fn(async () => {});
    query = vi.fn(async (config: QueryCall | string) => {
      const normalized: QueryCall = typeof config === "string" ? { text: config } : config;
      queryCalls.push(normalized);

      if (typeof normalized.text === "string" && normalized.text.startsWith("SET statement_timeout")) {
        return { rows: [], rowCount: 0 };
      }

      if (error) {
        throw error;
      }

      return {
        rows,
        rowCount: rows.length
      };
    });
  }

  return {
    Client: MockClient,
    __setQueryRows(newRows: Array<Record<string, unknown>>) {
      rows = newRows;
      error = null;
    },
    __setQueryError(newError: Error | null) {
      error = newError;
    },
    __getQueryCalls() {
      return queryCalls;
    },
    __reset() {
      rows = [];
      error = null;
      queryCalls.length = 0;
    }
  } as unknown as Record<string, unknown>;
});

describe("executeDatabaseQuery", () => {
  const baseConfig = {
    sshProfiles: {},
    databaseProfiles: {
      analytics: {
        connectionString: { value: "postgres://user:pass@localhost/db" },
        allowedStatements: ["^\\s*SELECT"],
        maxRows: 2,
        maxExecutionMs: 1000,
        maxConcurrent: 1
      }
    },
    training: {}
  };

  let pgModule: MockPgModule;

  beforeEach(async () => {
    process.env.INFER_MCP_CONFIG = JSON.stringify(baseConfig);
    refreshConfig();
    pgModule = (await import("pg")) as unknown as MockPgModule;
    pgModule.__reset();
  });

  afterEach(() => {
    delete process.env.INFER_MCP_CONFIG;
    refreshConfig();
    pgModule?.__reset();
  });

  it("rejects statements outside the allowlist", async () => {
    const { executeDatabaseQuery } = await import("../src/services/databaseService.js");

    await expect(() => executeDatabaseQuery("analytics", "DELETE FROM data", undefined, {}))
      .rejects.toThrow(/not permitted/i);
  });

  it("enforces row limits and reports truncation", async () => {
    pgModule.__setQueryRows([
      { id: 1 },
      { id: 2 },
      { id: 3 }
    ]);

    const { executeDatabaseQuery } = await import("../src/services/databaseService.js");
    const result = await executeDatabaseQuery("analytics", "SELECT * FROM data", undefined, {});

    expect(result.rows).toHaveLength(2);
    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(true);

    const queries = pgModule.__getQueryCalls();
    expect(queries[0]?.text).toContain("SET statement_timeout");
    expect(queries[1]?.text).toContain("SELECT");
  });
});
