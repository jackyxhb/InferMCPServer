import { getConfig } from "../config/index.js";
import {
  executeSshCommand,
  type SshCommandOptions,
  type SshCommandResult
} from "./sshService.js";
import { createAbortError } from "../utils/abort.js";
import type { ProgressUpdate } from "../utils/progress.js";

export interface TrainingJobInput {
  profile: string;
  subclasses: string[];
  datasetPath: string;
  commandTemplate?: string;
  timeoutMs?: number;
  dryRun?: boolean;
  signal?: AbortSignal;
  onProgress?: (update: ProgressUpdate) => void;
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

  const total = input.subclasses.length;
  const abortError = createAbortError("Training job cancelled");
  const report = (update: ProgressUpdate) => {
    if (input.onProgress) {
      input.onProgress(update);
    }
  };

  report({ progress: 0, total, message: "Starting training job" });

  const results: TrainingJobResult[] = [];
  for (let index = 0; index < input.subclasses.length; index += 1) {
    if (input.signal?.aborted) {
      throw abortError;
    }

    const subclass = input.subclasses[index];
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
      report({ progress: index + 1, total, message: `Dry run generated for ${subclass}` });
      continue;
    }

    report({ progress: index, total, message: `Launching training for ${subclass}` });

    const options: SshCommandOptions = {
      timeoutMs: input.timeoutMs ?? config.training.defaultTimeoutMs,
      signal: input.signal,
      onProgress: (update) => {
        const normalized = Math.min(1, Math.max(0, update.progress));
        report({
          progress: index + normalized,
          total,
          message: update.message ? `${subclass}: ${update.message}` : `Running training for ${subclass}`
        });
      }
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

    report({ progress: index + 1, total, message: `Completed training for ${subclass}` });
  }

  report({ progress: total, total, message: "Training job completed" });
  return results;
}
