import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { EventEmitter } from "node:events";
import { refreshConfig } from "../src/config/index.js";

vi.mock("ssh2", async () => {
  const { EventEmitter } = await import("node:events");
  const instances: MockSshClient[] = [];

  class MockSshClient extends EventEmitter {
    public lastExec?: {
      command: string;
      options: Record<string, unknown>;
      stream: EventEmitter & { stderr: EventEmitter };
    };

    public ended = vi.fn();
    public destroyed = vi.fn();

    constructor() {
      super();
      instances.push(this);
    }

    connect(): void {
      queueMicrotask(() => {
        this.emit("ready");
      });
    }

    exec(command: string, options: Record<string, unknown>, callback: (err: Error | null, stream: EventEmitter & { stderr: EventEmitter }) => void): void {
      const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
      stream.stderr = new EventEmitter();
      this.lastExec = { command, options, stream };
      callback(null, stream);
    }

    end(): void {
      this.ended();
    }

    destroy(): void {
      this.destroyed();
    }
  }

  return {
    Client: MockSshClient,
    __instances: instances
  };
});

type MockClientModule = {
  __instances: Array<{
    lastExec?: {
      stream: EventEmitter & { stderr: EventEmitter };
    };
  }>;
};

describe("executeSshCommand", () => {
  const allowlistedConfig = {
    sshProfiles: {
      training: {
        host: "cluster.example.com",
        username: "trainer",
        password: { value: "secret" },
        policy: {
          allowedCommands: ["^safe"],
          maxExecutionMs: 100,
          maxOutputBytes: 4,
          maxConcurrent: 1
        }
      }
    },
    databaseProfiles: {},
    training: {}
  };

  beforeEach(() => {
    process.env.INFER_MCP_CONFIG = JSON.stringify(allowlistedConfig);
    refreshConfig();
  });

  afterEach(() => {
    delete process.env.INFER_MCP_CONFIG;
    refreshConfig();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const flushAsync = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it("rejects commands outside the allowlist", async () => {
    const { executeSshCommand } = await import("../src/services/sshService.js");

    await expect(executeSshCommand("training", "rm -rf /"))
      .rejects.toThrowError(/not permitted/i);
  });

  it("truncates stdout and stderr when output exceeds limits", async () => {
    const { executeSshCommand } = await import("../src/services/sshService.js");
    const sshModule = (await import("ssh2")) as unknown as MockClientModule;

    const promise = executeSshCommand("training", "safe command");
    await flushAsync();
    await flushAsync();

    const stream = sshModule.__instances.at(-1)?.lastExec?.stream;
    expect(stream).toBeDefined();

    stream!.emit("data", Buffer.from("abcdef"));
    stream!.stderr.emit("data", Buffer.from("ghijk"));
    stream!.emit("close", 0);

    const result = await promise;
    expect(result.stdout.length).toBeLessThanOrEqual(4);
    expect(result.stderr.length).toBeLessThanOrEqual(4);
    expect(result.truncated.stdout).toBe(true);
    expect(result.truncated.stderr).toBe(true);
  });

  it("rejects when the command exceeds the timeout", async () => {
    vi.useFakeTimers();

    const { executeSshCommand } = await import("../src/services/sshService.js");

    const promise = executeSshCommand("training", "safe command");
    const caught = promise.then(
      (value) => value,
      (error: unknown) => error as Error
    );
    await flushAsync();
    await vi.advanceTimersByTimeAsync(101);

    const error = await caught;
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).toMatch(/timed out/i);
    } else {
      throw new Error("Expected SSH timeout to reject");
    }
  });
});
