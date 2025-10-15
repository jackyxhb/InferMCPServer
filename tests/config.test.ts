import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, refreshConfig } from "../src/config/index.js";

describe("config loader", () => {
  afterEach(() => {
    delete process.env.INFER_MCP_CONFIG;
    delete process.env.INFER_MCP_CONFIG_PATH;
    delete process.env.TRAINING_CLUSTER_PASSWORD;
    delete process.env.TRAINING_CLUSTER_KEY_PASSPHRASE;
    refreshConfig();
  });

  it("returns defaults when no env is provided", () => {
    const config = loadConfig();
    expect(config.sshProfiles).toEqual({});
    expect(config.training.defaultTimeoutMs).toBeGreaterThan(0);
  });

  it("resolves secrets from environment variables", () => {
    process.env.TRAINING_CLUSTER_PASSWORD = "super-secret";
    process.env.INFER_MCP_CONFIG = JSON.stringify({
      sshProfiles: {
        training: {
          host: "cluster.example.com",
          username: "trainer",
          password: { env: "TRAINING_CLUSTER_PASSWORD" }
        }
      }
    });

    const config = loadConfig();
    expect(config.sshProfiles.training.password).toBe("super-secret");
    expect(config.sshProfiles.training.privateKey).toBeUndefined();
  });

  it("resolves file-based secrets relative to the config file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "infer-mcp-config-"));
    const keyPath = join(tempDir, "training.key");
    writeFileSync(keyPath, "PRIVATE KEY CONTENT\n", "utf8");

    const configPath = join(tempDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        sshProfiles: {
          training: {
            host: "cluster.example.com",
            username: "trainer",
            privateKey: { path: "./training.key" }
          }
        }
      })
    );

    process.env.INFER_MCP_CONFIG_PATH = configPath;

    const config = loadConfig();
    expect(config.sshProfiles.training.privateKey).toContain("PRIVATE KEY CONTENT");

    rmSync(tempDir, { recursive: true, force: true });
  });
});
