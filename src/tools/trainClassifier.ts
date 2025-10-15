import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTrainingJob, type TrainingTaskStatus } from "../services/trainingService.js";
import { SshExecuteOutputSchema } from "./sshExecute.js";
import { createProgressReporter } from "../utils/progress.js";

const TrainClassifierInputSchema = z.object({
  profile: z.string().describe("Credential profile for SSH access"),
  subclasses: z.array(z.string()).nonempty().describe("List of subclasses to train"),
  datasetPath: z.string().describe("Remote dataset path"),
  commandTemplate: z
    .string()
    .optional()
    .describe("Command template to run on the remote host; overrides configuration if provided"),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional timeout per subclass execution in milliseconds"),
  dryRun: z.boolean().optional().describe("If true, render commands without executing them")
});

type TrainClassifierInput = z.infer<typeof TrainClassifierInputSchema>;

const TrainingStatusValues = ["pending", "running", "succeeded", "failed", "cancelled"] as const satisfies TrainingTaskStatus[];
const TrainingStatusSchema = z.enum(TrainingStatusValues);

const TrainingTaskLogSchema = z.object({
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  at: z.string(),
  context: z.record(z.string(), z.unknown()).optional()
});

const TrainingTaskReportSchema = z.object({
  subclass: z.string(),
  command: z.string(),
  dryRun: z.boolean(),
  status: TrainingStatusSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  result: SshExecuteOutputSchema.optional(),
  error: z.string().optional(),
  logs: z.array(TrainingTaskLogSchema)
});

const TrainingJobReportSchema = z.object({
  profile: z.string(),
  datasetPath: z.string(),
  commandTemplate: z.string(),
  status: TrainingStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
  tasks: z.array(TrainingTaskReportSchema)
});

const TrainingJobOutputShape = {
  job: TrainingJobReportSchema
};

export function registerTrainingTool(server: McpServer): void {
  server.registerTool(
    "trainClassifier",
    {
      description: "Run classifier training commands on a remote host via SSH",
      inputSchema: TrainClassifierInputSchema.shape,
      outputSchema: TrainingJobOutputShape
    },
    async (args, extra) => {
      const input = TrainClassifierInputSchema.parse(args);
      const total = input.subclasses.length;
      const progress = createProgressReporter(extra, "trainClassifier");

      progress?.({ progress: 0, total, message: "Preparing training job" });

      const results = await runTrainingJob({
        profile: input.profile,
        subclasses: input.subclasses,
        datasetPath: input.datasetPath,
        commandTemplate: input.commandTemplate,
        timeoutMs: input.timeoutMs,
        dryRun: input.dryRun ?? false,
        signal: extra.signal,
        onProgress: (update) => {
          progress?.({
            progress: update.progress,
            total,
            message: update.message
          });
        }
      });

      progress?.({ progress: total, total, message: "Training job finished" });

      const summaryLines = results.tasks.map((task) => {
        const status = task.status.toUpperCase();
        const duration = task.result?.durationMs !== undefined ? `${task.result.durationMs}ms` : "n/a";
        return `- ${task.subclass}: ${status} (duration: ${duration})`;
      });

      return {
        content: [
          {
            type: "text",
            text: [`Training job status: ${results.status.toUpperCase()}`, ...summaryLines].join("\n")
          }
        ],
        structuredContent: {
          job: results
        }
      };
    }
  );
}
