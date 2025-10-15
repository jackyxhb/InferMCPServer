import { Client as SshClient, type ConnectConfig } from "ssh2";
import { getConfig } from "../config/index.js";

export interface SshCommandOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface SshCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal?: string;
}

export async function executeSshCommand(
  profileName: string,
  command: string,
  options: SshCommandOptions = {}
): Promise<SshCommandResult> {
  const profile = getConfig().sshProfiles[profileName];
  if (!profile) {
    throw new Error(`SSH profile '${profileName}' not found`);
  }

  const connectionConfig: ConnectConfig = {
    host: profile.host,
    port: profile.port,
    username: profile.username,
    readyTimeout: options.timeoutMs
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

  return new Promise((resolve, reject) => {
    const sshClient = new SshClient();
    let timeoutHandle: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      sshClient.end();
    };

    const onTimeout = () => {
      cleanup();
      reject(new Error(`SSH command timed out after ${options.timeoutMs} ms`));
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

          let stdout = "";
          let stderr = "";
          let exitCode: number | null = null;
          let signal: string | undefined;

          stream
            .on("close", (code: number | null, signalName?: string) => {
              exitCode = code;
              signal = signalName ?? undefined;
              cleanup();
              resolve({ stdout, stderr, exitCode, signal });
            })
            .on("data", (chunk: Buffer) => {
              stdout += chunk.toString();
            })
            .stderr.on("data", (chunk: Buffer) => {
              stderr += chunk.toString();
            });
        });
      })
      .on("error", (err) => {
        cleanup();
        reject(err);
      })
      .connect(connectionConfig);

    if (options.timeoutMs) {
      timeoutHandle = setTimeout(onTimeout, options.timeoutMs);
    }
  });
}
