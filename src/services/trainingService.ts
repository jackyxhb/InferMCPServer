import { getConfig } from "../config/index.js";
import {
  executeSshCommand,
  type SshCommandOptions,
  type SshCommandResult
} from "./sshService.js";
import { createAbortError } from "../utils/abort.js";
import type { ProgressUpdate } from "../utils/progress.js";
import { logger } from "../utils/logger.js";

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

export type TrainingTaskStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface TrainingTaskLogEntry {
  level: "info" | "warn" | "error";
  message: string;
  at: string;
  context?: Record<string, unknown>;
}

export interface TrainingTaskReport {
  subclass: string;
  command: string;
  dryRun: boolean;
  status: TrainingTaskStatus;
  startedAt?: string;
  completedAt?: string;
  result?: SshCommandResult;
  error?: string;
  logs: TrainingTaskLogEntry[];
}

export interface TrainingJobReport {
  profile: string;
  datasetPath: string;
  commandTemplate: string;
  status: TrainingTaskStatus;
  startedAt: string;
  completedAt?: string;
  tasks: TrainingTaskReport[];
}

function buildCommand(template: string, subclass: string, datasetPath: string): string {
  return template
    .replaceAll("{{subclass}}", subclass)
    .replaceAll("{{datasetPath}}", datasetPath)
    .replaceAll("{{subclass_slug}}", subclass.replace(/\s+/g, "-").toLowerCase());
}

export async function runTrainingJob(input: TrainingJobInput): Promise<TrainingJobReport> {
  const config = getConfig();
  const template = input.commandTemplate ?? config.training.defaultCommandTemplate;

  if (!template) {
    throw new Error("No command template supplied for training job");
  }

  const total = input.subclasses.length;
  const abortError = createAbortError("Training job cancelled");
  const reportProgress = (update: ProgressUpdate) => {
    if (input.onProgress) {
      input.onProgress(update);
    }
  };

  const startedAt = new Date();
  const tasks: TrainingTaskReport[] = input.subclasses.map((subclass) => ({
    subclass,
    command: buildCommand(template, subclass, input.datasetPath),
    dryRun: Boolean(input.dryRun),
    status: "pending",
    logs: []
  }));

  reportProgress({ progress: 0, total, message: "Starting training job" });

  const appendLog = (
    task: TrainingTaskReport,
    level: "info" | "warn" | "error",
    message: string,
    context?: Record<string, unknown>
  ): void => {
    const at = new Date().toISOString();
    task.logs.push({ level, message, at, context });
    logger[level](message, {
      profile: input.profile,
      subclass: task.subclass,
      datasetPath: input.datasetPath,
      ...context
    });
  };

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];

    if (input.signal?.aborted) {
      appendLog(task, "warn", "Training task cancelled before start");
      task.status = "cancelled";
      continue;
    }

    if (input.dryRun) {
      task.status = "succeeded";
      task.startedAt = new Date().toISOString();
      task.completedAt = new Date().toISOString();
      appendLog(task, "info", "Dry run: command rendered but not executed", { command: task.command });
      reportProgress({ progress: index + 1, total, message: `Dry run prepared for ${task.subclass}` });
      continue;
    }

    task.status = "running";
    task.startedAt = new Date().toISOString();
    appendLog(task, "info", "Starting training command", { command: task.command });
    reportProgress({ progress: index, total, message: `Launching training for ${task.subclass}` });

    const options: SshCommandOptions = {
      timeoutMs: input.timeoutMs ?? config.training.defaultTimeoutMs,
      signal: input.signal,
      onProgress: (update) => {
        const normalized = Math.min(1, Math.max(0, update.progress));
        reportProgress({
          progress: index + normalized,
          total,
          message: update.message ? `${task.subclass}: ${update.message}` : `Running training for ${task.subclass}`
        });
      }
    };

    try {
      const execution = await executeSshCommand(input.profile, task.command, options, {
        tool: "trainClassifier"
      });
      task.result = execution;
      task.status = "succeeded";
      task.completedAt = new Date().toISOString();
      appendLog(task, "info", "Training command completed", {
        exitCode: execution.exitCode,
        signal: execution.signal,
        durationMs: execution.durationMs,
        stdoutBytes: execution.stdout.length,
        stderrBytes: execution.stderr.length,
        stdoutTruncated: execution.truncated.stdout,
        stderrTruncated: execution.truncated.stderr
      });
      reportProgress({ progress: index + 1, total, message: `Completed training for ${task.subclass}` });
    } catch (error) {
      const now = new Date().toISOString();
      task.completedAt = now;
      if (error instanceof Error && error.name === "AbortError") {
        task.status = "cancelled";
        task.error = error.message;
        appendLog(task, "warn", "Training command cancelled", { reason: error.message });
        reportProgress({ progress: index + 1, total, message: `Cancelled training for ${task.subclass}` });
      } else {
        task.status = "failed";
        const message = error instanceof Error ? error.message : String(error);
        task.error = message;
        appendLog(task, "error", "Training command failed", { error: message });
        reportProgress({ progress: index + 1, total, message: `Failed training for ${task.subclass}` });
      }
    }
  }

  const completedAt = new Date().toISOString();
  const overallStatus: TrainingTaskStatus = tasks.every((task) => task.status === "succeeded")
    ? "succeeded"
    : tasks.some((task) => task.status === "failed")
      ? "failed"
      : tasks.some((task) => task.status === "cancelled")
        ? "cancelled"
        : "succeeded";

  reportProgress({ progress: total, total, message: "Training job completed" });

  return {
    profile: input.profile,
    datasetPath: input.datasetPath,
    commandTemplate: template,
    status: overallStatus,
    startedAt: startedAt.toISOString(),
    completedAt,
    tasks
  };
}
