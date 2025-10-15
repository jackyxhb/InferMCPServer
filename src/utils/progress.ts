import { logger } from "./logger.js";

export interface ProgressUpdate {
  progress: number;
  total?: number;
  message?: string;
}

export type ProgressReporter = (update: ProgressUpdate) => void;

interface ProgressCapableExtra {
  _meta?: {
    progressToken?: string | number;
  };
  sendNotification(notification: { method: string; params?: Record<string, unknown> }): Promise<void>;
}

export function createProgressReporter(
  extra: ProgressCapableExtra,
  tool: string
): ProgressReporter | undefined {
  const token = extra._meta?.progressToken;
  if (!token) {
    return undefined;
  }

  return (update: ProgressUpdate) => {
    void extra
      .sendNotification({
        method: "notifications/progress",
        params: {
          progressToken: token,
          progress: update.progress,
          total: update.total,
          message: update.message
        }
      })
      .catch((error: unknown) => {
        logger.warn("Failed to send progress notification", {
          tool,
          error: error instanceof Error ? error.message : String(error)
        });
      });
  };
}
