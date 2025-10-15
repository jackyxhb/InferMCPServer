import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeSshCommand,
  type SshCommandOptions,
  type SshCommandResult
} from "../services/sshService.js";
import { createProgressReporter } from "../utils/progress.js";

const SshExecuteInputSchema = z.object({
  profile: z.string().describe("SSH credential profile to use"),
  command: z.string().min(1).describe("Command to execute"),
  cwd: z.string().optional().describe("Working directory on remote host"),
  env: z.record(z.string(), z.string()).optional().describe("Environment variables for the command"),
  timeoutMs: z.number().int().positive().optional().describe("Execution timeout in milliseconds"),
  maxOutputBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum bytes to capture from stdout/stderr")
});

const SshExecuteOutputShape = {
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.object({ stdout: z.boolean(), stderr: z.boolean() }),
  exitCode: z.number().nullable(),
  signal: z.string().optional(),
  durationMs: z.number().int().nonnegative()
};

export const SshExecuteOutputSchema = z.object(SshExecuteOutputShape);

export function registerSshTool(server: McpServer): void {
  server.registerTool(
    "sshExecute",
    {
      description: "Execute a command on a remote server via SSH using a configured profile",
      inputSchema: SshExecuteInputSchema.shape,
      outputSchema: SshExecuteOutputShape
    },
    async (args, extra) => {
      const progress = createProgressReporter(extra, "sshExecute");
      const total = 1;

      progress?.({ progress: 0, total, message: "Scheduling SSH command" });

      const options: SshCommandOptions = {
        cwd: args.cwd,
        env: args.env,
        timeoutMs: args.timeoutMs,
        maxOutputBytes: args.maxOutputBytes,
        signal: extra.signal,
        onProgress: (update) => {
          progress?.({
            progress: update.progress,
            total,
            message: update.message
          });
        }
      };

      const result: SshCommandResult = await executeSshCommand(
        args.profile,
        args.command,
        options,
        {
          requestId: String(extra.requestId),
          tool: "sshExecute"
        }
      );

      const structuredContent: Record<string, unknown> = {
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
        exitCode: result.exitCode,
        signal: result.signal,
        durationMs: result.durationMs
      };

      return {
        content: [],
        structuredContent
      };
    }
  );
}
