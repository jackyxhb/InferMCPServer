import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTrainingJob } from "../services/trainingService.js";
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

export function registerTrainingTool(server: McpServer): void {
  server.registerTool(
    "trainClassifier",
    {
      description: "Run classifier training commands on a remote host via SSH",
      inputSchema: TrainClassifierInputSchema.shape
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    }
  );
}
