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
    delete process.env.TRAINING_METADATA_DB_URL;
    refreshConfig();
  });

  it("returns defaults when no env is provided", () => {
    const config = loadConfig();
    expect(config.sshProfiles).toEqual({});
    expect(config.databaseProfiles).toEqual({});
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
    expect(config.sshProfiles.training.policy.maxExecutionMs).toBeGreaterThan(0);
    expect(config.sshProfiles.training.policy.maxOutputBytes).toBeGreaterThan(0);
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

  it("resolves database profile connection strings from environment", () => {
    process.env.TRAINING_METADATA_DB_URL = "postgres://user:pass@localhost:5432/db";
    process.env.INFER_MCP_CONFIG = JSON.stringify({
      databaseProfiles: {
        metadata: {
          connectionString: { env: "TRAINING_METADATA_DB_URL" },
          allowedStatements: ["^\\s*SELECT"],
          maxRows: 10,
          maxExecutionMs: 5000
        }
      }
    });

    const config = loadConfig();
    expect(config.databaseProfiles.metadata.connectionString).toBe(
      "postgres://user:pass@localhost:5432/db"
    );
    expect(config.databaseProfiles.metadata.allowedStatementPatterns).toHaveLength(1);
    expect(config.databaseProfiles.metadata.maxRows).toBe(10);
  });
});
