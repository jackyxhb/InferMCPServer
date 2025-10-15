import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access } from "node:fs/promises";
import path from "node:path";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const integrationEnabled = process.env.INTEGRATION === "1";
const hasConfig = Boolean(process.env.INFER_MCP_CONFIG_PATH || process.env.INFER_MCP_CONFIG);
const buildPath = path.join(process.cwd(), "build", "simulator.js");

const suite = integrationEnabled && hasConfig ? describe : describe.skip;

suite("Simulator integration", () => {
  it("lists available tools via npm script", async () => {
    const buildReady = await fileExists(buildPath);
    if (!buildReady) {
      expect.fail("build/simulator.js is missing; run npm run build before integration tests");
    }

    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(command, ["run", "simulate", "--", "list"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const [code] = (await once(child, "close")) as [number];

    if (code !== 0) {
      const message = ["Simulator exited with code", String(code), "stderr:", stderr.trim()].join(" ");
      expect.fail(message);
    }

    expect(stdout).toMatch(/sshExecute/);
    expect(stdout).toMatch(/dbQuery/);
    expect(stdout).toMatch(/trainClassifier/);
  });
});
