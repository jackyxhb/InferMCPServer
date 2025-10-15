import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppConfigSchema, type AppConfig } from "./schema.js";

let cachedConfig: AppConfig | null = null;

function parseJson(source: string, origin: string): unknown {
  try {
    return JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON config from ${origin}: ${message}`);
  }
}

function readConfigSource(): unknown {
  const path = process.env.INFER_MCP_CONFIG_PATH;
  if (path) {
    const absolutePath = resolve(path);
    const fileContents = readFileSync(absolutePath, "utf8");
    return parseJson(fileContents, absolutePath);
  }

  const inline = process.env.INFER_MCP_CONFIG;
  if (inline) {
    return parseJson(inline, "INFER_MCP_CONFIG");
  }

  return {};
}

export function loadConfig(): AppConfig {
  const raw = readConfigSource();
  return AppConfigSchema.parse(raw);
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }

  return cachedConfig;
}

export function refreshConfig(): AppConfig {
  cachedConfig = loadConfig();
  return cachedConfig;
}
