import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { refreshConfig } from "../src/config/index.js";

const mockExecute = vi.fn();

vi.mock("../src/services/sshService.js", () => ({
  executeSshCommand: mockExecute
}));

describe("runTrainingJob", () => {
  const baseConfig = {
    sshProfiles: {
      training: {
        host: "cluster.example.com",
        username: "trainer",
        password: { value: "secret" },
        policy: {
          allowedCommands: ["^python"],
          maxExecutionMs: 60_000,
          maxOutputBytes: 1024,
          maxConcurrent: 1
        }
      }
    },
    databaseProfiles: {},
    training: {
      defaultCommandTemplate: "python train.py --dataset={{datasetPath}} --class={{subclass}}",
      defaultTimeoutMs: 60_000
    }
  };

  beforeEach(() => {
    process.env.INFER_MCP_CONFIG = JSON.stringify(baseConfig);
    refreshConfig();
    mockExecute.mockReset();
  });

  afterEach(() => {
    delete process.env.INFER_MCP_CONFIG;
    refreshConfig();
  });

  it("marks tasks as succeeded when SSH execution completes", async () => {
    mockExecute.mockResolvedValue({
      stdout: "ok",
      stderr: "",
      truncated: { stdout: false, stderr: false },
      exitCode: 0,
      signal: undefined,
      durationMs: 1200
    });

    const { runTrainingJob } = await import("../src/services/trainingService.js");
    const report = await runTrainingJob({
      profile: "training",
      subclasses: ["cat", "dog"],
      datasetPath: "/data/train",
      dryRun: false
    });

    expect(report.status).toBe("succeeded");
    expect(report.tasks).toHaveLength(2);
    expect(report.tasks.every((task) => task.status === "succeeded")).toBe(true);
  expect(report.tasks[0]?.logs.some((entry) => /completed/i.test(entry.message))).toBeTruthy();
  });

  it("records failures without throwing", async () => {
    mockExecute.mockRejectedValueOnce(new Error("boom"));

    const { runTrainingJob } = await import("../src/services/trainingService.js");
    const report = await runTrainingJob({
      profile: "training",
      subclasses: ["cat"],
      datasetPath: "/data/train",
      dryRun: false
    });

    expect(report.status).toBe("failed");
    expect(report.tasks[0]?.status).toBe("failed");
    expect(report.tasks[0]?.error).toContain("boom");
  });

  it("supports dry runs without invoking SSH", async () => {
    const { runTrainingJob } = await import("../src/services/trainingService.js");
    const report = await runTrainingJob({
      profile: "training",
      subclasses: ["cat"],
      datasetPath: "/data/train",
      dryRun: true
    });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(report.tasks[0]?.status).toBe("succeeded");
    expect(report.tasks[0]?.logs[0]?.message).toContain("Dry run");
  });
});
