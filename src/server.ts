import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ServerOptions {
  name?: string;
  version?: string;
}

export function createServer(options?: ServerOptions): McpServer {
  return new McpServer({
    name: options?.name ?? "infer-mcp-server",
    version: options?.version ?? "1.0.0"
  });
}
