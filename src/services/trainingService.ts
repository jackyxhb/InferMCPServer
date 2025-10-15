import { getConfig } from "../config/index.js";
import { executeSshCommand, type SshCommandOptions, type SshCommandResult } from "./sshService.js";

export interface TrainingJobInput {
  profile: string;
  subclasses: string[];
  datasetPath: string;
  commandTemplate?: string;
  timeoutMs?: number;
  dryRun?: boolean;
}

export interface TrainingJobResult extends SshCommandResult {
  subclass: string;
  command: string;
  durationMs: number;
  dryRun: boolean;
}

function buildCommand(template: string, subclass: string, datasetPath: string): string {
  return template
    .replaceAll("{{subclass}}", subclass)
    .replaceAll("{{datasetPath}}", datasetPath)
    .replaceAll("{{subclass_slug}}", subclass.replace(/\s+/g, "-").toLowerCase());
}

export async function runTrainingJob(input: TrainingJobInput): Promise<TrainingJobResult[]> {
  const config = getConfig();
  const template = input.commandTemplate ?? config.training.defaultCommandTemplate;

  if (!template) {
    throw new Error("No command template supplied for training job");
  }

  const results: TrainingJobResult[] = [];
  for (const subclass of input.subclasses) {
    const command = buildCommand(template, subclass, input.datasetPath);
    const start = Date.now();

    if (input.dryRun) {
      results.push({
        subclass,
        command,
        durationMs: 0,
        dryRun: true,
        stdout: "",
        stderr: "",
        exitCode: null,
        signal: undefined
      });
      continue;
    }

    const options: SshCommandOptions = {
      timeoutMs: input.timeoutMs ?? config.training.defaultTimeoutMs
    };

    const execution = await executeSshCommand(input.profile, command, options);
    const durationMs = Date.now() - start;

    results.push({
      subclass,
      command,
      durationMs,
      dryRun: false,
      stdout: execution.stdout,
      stderr: execution.stderr,
      exitCode: execution.exitCode,
      signal: execution.signal
    });
  }

  return results;
}
