import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSshTool } from "./sshExecute.js";
import { registerDbTool } from "./dbQuery.js";
import { registerTrainingTool } from "./trainClassifier.js";

export function registerTools(server: McpServer): void {
  registerSshTool(server);
  registerDbTool(server);
  registerTrainingTool(server);
}
