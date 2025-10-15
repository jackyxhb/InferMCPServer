import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeDatabaseQuery,
  type DatabaseQueryResult
} from "../services/databaseService.js";
import { createProgressReporter } from "../utils/progress.js";

const DbQueryInputSchema = z.object({
  profile: z.string().describe("Database profile to use"),
  query: z.string().min(1).describe("SQL query to execute"),
  parameters: z.array(z.unknown()).optional().describe("Positional parameters for the query"),
  timeoutMs: z.number().int().positive().optional().describe("Query timeout in milliseconds"),
  rowLimit: z.number().int().positive().optional().describe("Override maximum number of rows to return")
});

const DbQueryOutputShape = {
  rows: z.array(z.record(z.string(), z.unknown())),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  durationMs: z.number().int().nonnegative()
};

const DbQueryOutputSchema = z.object(DbQueryOutputShape);

export function registerDbTool(server: McpServer): void {
  server.registerTool(
    "dbQuery",
    {
      description: "Execute a SQL query on a PostgreSQL database using a configured profile",
      inputSchema: DbQueryInputSchema.shape,
      outputSchema: DbQueryOutputShape
    },
    async (args, extra) => {
      const progress = createProgressReporter(extra, "dbQuery");
      const total = 1;

      progress?.({ progress: 0, total, message: "Dispatching database query" });

      const result: DatabaseQueryResult = await executeDatabaseQuery(
        args.profile,
        args.query,
        args.parameters,
        {
          timeoutMs: args.timeoutMs,
          rowLimit: args.rowLimit,
          requestId: String(extra.requestId),
          tool: "dbQuery",
          signal: extra.signal,
          onProgress: (update) => {
            progress?.({
              progress: update.progress,
              total,
              message: update.message
            });
          }
        }
      );

      const structuredContent: Record<string, unknown> = {
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
        durationMs: result.durationMs
      };

      return {
        content: [],
        structuredContent
      };
    }
  );
}
