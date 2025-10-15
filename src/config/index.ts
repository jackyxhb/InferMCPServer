import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import {
  AppConfigSchema,
  type AppConfig,
  type ResolvedAppConfig,
  type ResolvedSshCredential,
  type SecretDefinition,
  type SshCredential,
  type TrainingConfig
} from "./schema.js";

interface ConfigSource {
  data: unknown;
  baseDir: string;
  origin: string;
}

let cachedConfig: ResolvedAppConfig | null = null;

function parseJson(source: string, origin: string): unknown {
  try {
    return JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON config from ${origin}: ${message}`);
  }
}

function readConfigSource(): ConfigSource {
  const path = process.env.INFER_MCP_CONFIG_PATH;
  if (path) {
    const absolutePath = resolvePath(path);
    const fileContents = readFileSync(absolutePath, "utf8");
    return {
      data: parseJson(fileContents, absolutePath),
      baseDir: dirname(absolutePath),
      origin: absolutePath
    };
  }

  const inline = process.env.INFER_MCP_CONFIG;
  if (inline) {
    return {
      data: parseJson(inline, "INFER_MCP_CONFIG"),
      baseDir: process.cwd(),
      origin: "INFER_MCP_CONFIG"
    };
  }

  return { data: {}, baseDir: process.cwd(), origin: "default" };
}

function resolveSecret(
  definition: SecretDefinition | undefined,
  label: string,
  baseDir: string,
  origin: string
): string | undefined {
  if (!definition) {
    return undefined;
  }

  if (typeof definition === "string") {
    return definition;
  }

  if ("value" in definition) {
    return definition.value;
  }

  if ("env" in definition) {
    const value = process.env[definition.env];
    if (value === undefined || value === "") {
      if (definition.optional) {
        return undefined;
      }

      throw new Error(
        `Environment variable '${definition.env}' required for ${label} (origin: ${origin})`
      );
    }

    return value;
  }

  if ("path" in definition) {
    const resolvedPath = resolvePath(baseDir, definition.path);
    const fileContents = readFileSync(resolvedPath, "utf8");
    if (definition.encoding === "base64") {
      const sanitized = fileContents.replace(/\s+/g, "");
      return Buffer.from(sanitized, "base64").toString("utf8");
    }

    return fileContents;
  }

  throw new Error(`Unsupported secret definition for ${label}`);
}

function resolveSshCredential(
  profileName: string,
  credential: SshCredential,
  baseDir: string,
  origin: string
): ResolvedSshCredential {
  const resolved: ResolvedSshCredential = {
    host: credential.host,
    port: credential.port,
    username: credential.username,
    password: resolveSecret(credential.password, `sshProfiles.${profileName}.password`, baseDir, origin),
    privateKey: resolveSecret(credential.privateKey, `sshProfiles.${profileName}.privateKey`, baseDir, origin),
    passphrase: resolveSecret(credential.passphrase, `sshProfiles.${profileName}.passphrase`, baseDir, origin)
  };

  if (!resolved.password && !resolved.privateKey) {
    throw new Error(
      `SSH profile '${profileName}' resolved without password or privateKey (origin: ${origin})`
    );
  }

  return resolved;
}

function resolveTrainingConfig(training: TrainingConfig): TrainingConfig {
  return training;
}

function resolveConfig(source: ConfigSource): ResolvedAppConfig {
  const parsed = AppConfigSchema.parse(source.data);

  const sshProfiles: Record<string, ResolvedSshCredential> = {};
  for (const [name, profile] of Object.entries(parsed.sshProfiles)) {
    sshProfiles[name] = resolveSshCredential(name, profile, source.baseDir, source.origin);
  }

  return {
    sshProfiles,
    training: resolveTrainingConfig(parsed.training),
    raw: parsed
  };
}

export function loadConfig(): ResolvedAppConfig {
  const source = readConfigSource();
  return resolveConfig(source);
}

export function getConfig(): ResolvedAppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }

  return cachedConfig;
}

export function refreshConfig(): ResolvedAppConfig {
  cachedConfig = loadConfig();
  return cachedConfig;
}
