import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

interface SimulatorOptions {
  command: string;
  args: string[];
  cwd?: string;
}

function buildEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

function parsePayload(payloadArg?: string): Record<string, unknown> {
  if (!payloadArg) {
    return {};
  }

  const parsed = JSON.parse(payloadArg);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object");
  }

  return parsed as Record<string, unknown>;
}

function parseArgs(): { mode: "list" } | { mode: "call"; tool: string; payload: Record<string, unknown> } {
  const [, , ...argv] = process.argv;
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
    printUsage();
    process.exit(0);
  }

  const [mode, ...rest] = argv;

  if (mode === "list") {
    return { mode: "list" };
  }

  if (mode === "call") {
    const [tool, payloadArg] = rest;
    if (!tool) {
      console.error("Error: missing tool name\n");
      printUsage();
      process.exit(1);
    }

    const payload = parsePayload(payloadArg);
    return { mode: "call", tool, payload };
  }

  console.error(`Unknown mode '${mode}'\n`);
  printUsage();
  process.exit(1);
}

function printUsage(): void {
  const script = "npm run simulate";
  console.log(`Usage:
  ${script} list
  ${script} call <toolName> '<payloadJSON>'

Environment overrides:
  MCP_SERVER_COMMAND  Command executed to start the MCP server (default: node)
  MCP_SERVER_ARGS     Comma-separated list of arguments (default: build/index.js)
  MCP_SERVER_CWD      Working directory for the spawned server (default: current cwd)
`);
}

function resolveSimulatorOptions(): SimulatorOptions {
  const command = process.env.MCP_SERVER_COMMAND ?? "node";
  const argsEnv = process.env.MCP_SERVER_ARGS;
  const args = argsEnv ? argsEnv.split(",").map((part) => part.trim()).filter(Boolean) : ["build/index.js"];
  const cwd = process.env.MCP_SERVER_CWD;
  return { command, args, cwd };
}

async function createTransport(options: SimulatorOptions): Promise<StdioClientTransport> {
  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args,
    env: buildEnvironment(),
    cwd: options.cwd,
    stderr: "pipe"
  });

  const stderrStream = transport.stderr;
  if (stderrStream) {
    stderrStream.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
  }

  return transport;
}

export async function main(): Promise<void> {
  const parsed = parseArgs();
  const options = resolveSimulatorOptions();
  const client = new Client({ name: "infer-mcp-simulator", version: "1.0.0" });
  const transport = await createTransport(options);

  try {
    await client.connect(transport);

    if (parsed.mode === "list") {
      const tools = await client.listTools({});
      console.log(JSON.stringify(tools.tools, null, 2));
      return;
    }

    const result = await client.callTool({ name: parsed.tool, arguments: parsed.payload });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}
function isDirectExecution(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  try {
    const invokedUrl = pathToFileURL(resolvePath(process.argv[1])).href;
    return invokedUrl === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  void main().catch((error) => {
    console.error("Simulator failed:", error);
    process.exit(1);
  });
}
