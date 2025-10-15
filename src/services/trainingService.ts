import { getConfig } from "../config/index.js";
import {
  executeSshCommand,
  type SshCommandOptions,
  type SshCommandResult
} from "./sshService.js";

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
    if (input.dryRun) {
      results.push({
        subclass,
        command,
        dryRun: true,
        stdout: "",
        stderr: "",
        exitCode: null,
        signal: undefined,
        truncated: { stdout: false, stderr: false },
        durationMs: 0
      });
      continue;
    }

    const options: SshCommandOptions = {
      timeoutMs: input.timeoutMs ?? config.training.defaultTimeoutMs
    };

    const execution = await executeSshCommand(input.profile, command, options, {
      tool: "trainClassifier"
    });

    results.push({
      subclass,
      command,
      dryRun: false,
      ...execution
    });
  }

  return results;
}
