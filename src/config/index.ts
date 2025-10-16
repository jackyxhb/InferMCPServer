import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import {
  AppConfigSchema,
  type AppConfig,
  type ResolvedAppConfig,
  type ResolvedDatabaseProfile,
  type ResolvedSshCredential,
  type ResolvedSshPolicy,
  type SecretDefinition,
  type SshCredential,
  type TrainingConfig
} from "./schema.js";

interface ConfigSource {
  data: unknown;
  baseDir: string;
  origin: string;
}

const DEFAULT_SSH_MAX_EXECUTION_MS = 5 * 60 * 1000;
const DEFAULT_SSH_MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB

let cachedConfig: ResolvedAppConfig | null = null;

export function isLocalTestMode(): boolean {
  const mode = (process.env.INFER_MCP_MODE ?? "local").toLowerCase();
  return mode !== "production";
}

const BUILT_IN_DEFAULT_CONFIG: AppConfig = {
  sshProfiles: {
    "local-test": {
      host: "127.0.0.1",
      port: 22,
      username: "tester",
      password: { value: "changeme" },
      policy: {
        allowedCommands: ["^echo\\b", "^python\\b", "^ls\\b"],
        maxExecutionMs: 5 * 60 * 1000,
        maxOutputBytes: 256 * 1024,
        maxConcurrent: 1
      }
    }
  },
  databaseProfiles: {},
  training: {
    defaultTimeoutMs: 300000
  }
};

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
    if (!existsSync(resolvedPath)) {
      if (definition.optional) {
        return undefined;
      }

      throw new Error(`Secret file not found for ${label}: ${resolvedPath}`);
    }

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
    passphrase: resolveSecret(credential.passphrase, `sshProfiles.${profileName}.passphrase`, baseDir, origin),
    policy: resolveSshPolicy(profileName, credential, origin)
  };

  if (!resolved.password && !resolved.privateKey) {
    throw new Error(
      `SSH profile '${profileName}' resolved without password or privateKey (origin: ${origin})`
    );
  }

  return resolved;
}

function resolveSshPolicy(profileName: string, credential: SshCredential, origin: string): ResolvedSshPolicy {
  const policy = credential.policy ?? {};
  const allowedCommandPatterns = policy.allowedCommands?.map((entry, index) => {
    const pattern = typeof entry === "string" ? entry : entry.pattern;
    try {
      return new RegExp(pattern);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid regex '${pattern}' in sshProfiles.${profileName}.policy.allowedCommands[${index}] (origin: ${origin}): ${message}`
      );
    }
  });

  return {
    allowedCommandPatterns,
    maxExecutionMs: policy.maxExecutionMs ?? DEFAULT_SSH_MAX_EXECUTION_MS,
    maxOutputBytes: policy.maxOutputBytes ?? DEFAULT_SSH_MAX_OUTPUT_BYTES,
    maxConcurrent: policy.maxConcurrent ?? 1
  };
}

function resolveDatabaseProfile(
  profileName: string,
  profile: AppConfig["databaseProfiles"][string],
  baseDir: string,
  origin: string
): ResolvedDatabaseProfile {
  const connectionString = resolveSecret(
    profile.connectionString,
    `databaseProfiles.${profileName}.connectionString`,
    baseDir,
    origin
  );

  if (!connectionString) {
    throw new Error(
      `Database profile '${profileName}' resolved without a connection string (origin: ${origin})`
    );
  }

  const allowedStatementPatterns = profile.allowedStatements?.map((pattern, index) => {
    try {
      return new RegExp(pattern, "i");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid regex '${pattern}' in databaseProfiles.${profileName}.allowedStatements[${index}] (origin: ${origin}): ${message}`
      );
    }
  });

  return {
    connectionString,
    allowedStatementPatterns,
    maxRows: profile.maxRows,
    maxExecutionMs: profile.maxExecutionMs,
    maxConcurrent: profile.maxConcurrent ?? 1
  };
}

function resolveTrainingConfig(training: TrainingConfig): TrainingConfig {
  return training;
}

function mergeAppConfig(base: AppConfig, override: AppConfig): AppConfig {
  return {
    sshProfiles: { ...base.sshProfiles, ...override.sshProfiles },
    databaseProfiles: { ...base.databaseProfiles, ...override.databaseProfiles },
    training: { ...base.training, ...override.training }
  };
}

function resolveConfig(source: ConfigSource): ResolvedAppConfig {
  const parsed = AppConfigSchema.parse(source.data);
  const merged = mergeAppConfig(BUILT_IN_DEFAULT_CONFIG, parsed);
  const localTestMode = isLocalTestMode();

  const sshProfiles: Record<string, ResolvedSshCredential> = {};
  for (const [name, profile] of Object.entries(merged.sshProfiles)) {
    sshProfiles[name] = resolveSshCredential(name, profile, source.baseDir, source.origin);
  }

  const databaseProfiles: Record<string, ResolvedDatabaseProfile> = {};
  for (const [name, profile] of Object.entries(merged.databaseProfiles)) {
    databaseProfiles[name] = resolveDatabaseProfile(name, profile, source.baseDir, source.origin);
  }

  return {
    sshProfiles,
    databaseProfiles,
    training: resolveTrainingConfig(merged.training),
    localTestMode,
    raw: merged
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
