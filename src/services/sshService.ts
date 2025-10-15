import { Client as SshClient, type ConnectConfig } from "ssh2";
import { getConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";

export interface SshCommandOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
  maxOutputBytes?: number;
}

export interface SshExecutionMetadata {
  requestId?: string;
  tool?: string;
}

export interface SshCommandResult {
  stdout: string;
  stderr: string;
  truncated: {
    stdout: boolean;
    stderr: boolean;
  };
  exitCode: number | null;
  signal?: string;
  durationMs: number;
}

interface TruncatingBuffer {
  push(chunk: Buffer): void;
  toString(): string;
  isTruncated(): boolean;
  size(): number;
}

function createTruncatingBuffer(limit: number): TruncatingBuffer {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  let truncated = false;

  return {
    push(chunk: Buffer) {
      if (truncated || limit <= 0) {
        truncated = limit <= 0 ? true : truncated;
        return;
      }

      const available = limit - byteLength;
      if (available <= 0) {
        truncated = true;
        return;
      }

      if (chunk.length > available) {
        chunks.push(chunk.subarray(0, available));
        byteLength += available;
        truncated = true;
      } else {
        chunks.push(chunk);
        byteLength += chunk.length;
      }
    },
    toString() {
      if (chunks.length === 0) {
        return "";
      }
      return Buffer.concat(chunks, byteLength).toString();
    },
    isTruncated() {
      return truncated;
    },
    size() {
      return byteLength;
    }
  };
}

function ensureCommandAllowed(command: string, patterns?: RegExp[]): void {
  if (!patterns || patterns.length === 0) {
    return;
  }

  const allowed = patterns.some((regex) => regex.test(command));
  if (!allowed) {
    throw new Error("Command is not permitted by policy");
  }
}

export async function executeSshCommand(
  profileName: string,
  command: string,
  options: SshCommandOptions = {},
  metadata: SshExecutionMetadata = {}
): Promise<SshCommandResult> {
  const config = getConfig();
  const profile = config.sshProfiles[profileName];
  if (!profile) {
    throw new Error(`SSH profile '${profileName}' not found`);
  }

  ensureCommandAllowed(command, profile.policy.allowedCommandPatterns);

  const timeoutLimit = Math.min(options.timeoutMs ?? profile.policy.maxExecutionMs, profile.policy.maxExecutionMs);
  const outputLimit = Math.min(options.maxOutputBytes ?? profile.policy.maxOutputBytes, profile.policy.maxOutputBytes);

  const connectionConfig: ConnectConfig = {
    host: profile.host,
    port: profile.port,
    username: profile.username,
    readyTimeout: timeoutLimit
  };

  if (profile.privateKey) {
    connectionConfig.privateKey = profile.privateKey;
    if (profile.passphrase) {
      connectionConfig.passphrase = profile.passphrase;
    }
  } else if (profile.password) {
    connectionConfig.password = profile.password;
  } else {
    throw new Error(`SSH profile '${profileName}' is missing authentication details`);
  }

  const start = Date.now();
  logger.info("Executing SSH command", {
    profile: profileName,
    requestId: metadata.requestId,
    tool: metadata.tool,
    command
  });

  return new Promise((resolve, reject) => {
    const sshClient = new SshClient();
    let timeoutHandle: NodeJS.Timeout | undefined;

    const stdoutBuffer = createTruncatingBuffer(outputLimit);
    const stderrBuffer = createTruncatingBuffer(outputLimit);

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      sshClient.end();
    };

    const onTimeout = () => {
      cleanup();
      logger.warn("SSH command timed out", {
        profile: profileName,
        requestId: metadata.requestId,
        tool: metadata.tool,
        timeoutMs: timeoutLimit
      });
      reject(new Error(`SSH command timed out after ${timeoutLimit} ms`));
    };

    sshClient
      .on("ready", () => {
        const execOptions = {
          cwd: options.cwd,
          env: options.env
        };

        sshClient.exec(command, execOptions, (err, stream) => {
          if (err) {
            cleanup();
            reject(err);
            return;
          }

          let exitCode: number | null = null;
          let signal: string | undefined;

          stream
            .on("close", (code: number | null, signalName?: string) => {
              exitCode = code;
              signal = signalName ?? undefined;
              cleanup();

              const durationMs = Date.now() - start;
              const result: SshCommandResult = {
                stdout: stdoutBuffer.toString(),
                stderr: stderrBuffer.toString(),
                truncated: {
                  stdout: stdoutBuffer.isTruncated(),
                  stderr: stderrBuffer.isTruncated()
                },
                exitCode,
                signal,
                durationMs
              };

              logger.info("SSH command completed", {
                profile: profileName,
                requestId: metadata.requestId,
                tool: metadata.tool,
                exitCode,
                signal,
                durationMs,
                stdoutBytes: stdoutBuffer.size(),
                stderrBytes: stderrBuffer.size(),
                stdoutTruncated: result.truncated.stdout,
                stderrTruncated: result.truncated.stderr
              });

              resolve(result);
            })
            .on("data", (chunk: Buffer) => {
              stdoutBuffer.push(chunk);
            })
            .stderr.on("data", (chunk: Buffer) => {
              stderrBuffer.push(chunk);
            });
        });
      })
      .on("error", (err) => {
        cleanup();
        logger.error("SSH command failed", {
          profile: profileName,
          requestId: metadata.requestId,
          tool: metadata.tool,
          error: err.message
        });
        reject(err);
      })
      .connect(connectionConfig);

    timeoutHandle = setTimeout(onTimeout, timeoutLimit);
  });
}
