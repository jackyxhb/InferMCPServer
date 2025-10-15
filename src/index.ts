import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { registerTools } from "./tools/index.js";

async function main(): Promise<void> {
  const server = createServer();
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Infer MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
