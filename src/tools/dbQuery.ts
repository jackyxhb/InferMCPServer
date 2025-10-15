import { z } from "zod";
import { Client as PgClient } from "pg";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerDbTool(server: McpServer): void {
  server.registerTool(
    "dbQuery",
    {
      description: "Execute a SQL query on a PostgreSQL database",
      inputSchema: {
        connectionString: z.string().describe("Database connection string"),
        query: z.string().describe("SQL query to execute")
      }
    },
    async (args) => {
      const client = new PgClient(args.connectionString);
      await client.connect();
      try {
        const result = await client.query(args.query);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.rows)
            }
          ]
        };
      } finally {
        await client.end();
      }
    }
  );
}
