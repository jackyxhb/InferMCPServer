import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { EventEmitter } from "node:events";

const connectMock = vi.fn();
const listToolsMock = vi.fn(async () => ({ tools: [{ name: "sshExecute" }] }));
const callToolMock = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
const closeMock = vi.fn();
const transportCloseMock = vi.fn();

const transportInstances: Array<{ options: unknown; stderr: EventEmitter }> = [];

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
  class MockClient {
    listTools = listToolsMock;
    callTool = callToolMock;
    connect = connectMock;
    close = closeMock;
  }

  return { Client: MockClient };
});

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", async () => {
  const { EventEmitter } = await import("node:events");
  class MockTransport extends EventEmitter {
    public stderr = new EventEmitter();
    public options: unknown;

    constructor(options: unknown) {
      super();
      this.options = options;
      transportInstances.push({ options, stderr: this.stderr });
    }

    close = transportCloseMock;
  }

  return { StdioClientTransport: MockTransport };
});

describe("simulator CLI", () => {
  const originalArgv = process.argv.slice();
  const originalEnv = { ...process.env };
  let consoleLogMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.argv = originalArgv.slice(0, 2);
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    transportInstances.length = 0;
    connectMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);
    transportCloseMock.mockResolvedValue(undefined);
    listToolsMock.mockClear();
    callToolMock.mockClear();
    consoleLogMock = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv.slice();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    consoleLogMock.mockRestore();
    connectMock.mockReset();
    closeMock.mockReset();
    transportCloseMock.mockReset();
  });

  it("lists available tools", async () => {
    process.argv = ["node", "simulator", "list"];
    const { main } = await import("../src/simulator.js");

    await main();

    expect(listToolsMock).toHaveBeenCalledTimes(1);
    expect(consoleLogMock).toHaveBeenCalled();
  });

  it("invokes a tool with provided payload", async () => {
    process.argv = ["node", "simulator", "call", "sshExecute", '{"profile":"training"}'];
    const { main } = await import("../src/simulator.js");

    await main();

    expect(callToolMock).toHaveBeenCalledWith({ name: "sshExecute", arguments: { profile: "training" } });
    expect(consoleLogMock).toHaveBeenCalled();
  });

  it("passes environment overrides to the transport", async () => {
    process.env.MCP_SERVER_COMMAND = "custom-node";
    process.env.MCP_SERVER_ARGS = "server.js, --flag";
    process.env.MCP_SERVER_CWD = "/tmp";
    process.argv = ["node", "simulator", "list"]; // shortlist run

    const { main } = await import("../src/simulator.js");
    await main();

    expect(transportInstances).toHaveLength(1);
    expect(transportInstances[0]?.options).toMatchObject({
      command: "custom-node",
      args: ["server.js", "--flag"],
      cwd: "/tmp"
    });
  });
});
