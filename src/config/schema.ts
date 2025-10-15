import { z } from "zod";

export const SshCredentialSchema = z.object({
  host: z.string(),
  port: z.number().int().positive().default(22),
  username: z.string(),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  passphrase: z.string().optional()
});

export const TrainingConfigSchema = z.object({
  defaultCommandTemplate: z.string().optional(),
  defaultTimeoutMs: z.number().int().positive().default(300000)
});

export const AppConfigSchema = z.object({
  sshProfiles: z.record(SshCredentialSchema).default({}),
  training: TrainingConfigSchema.default({})
});

export type SshCredential = z.infer<typeof SshCredentialSchema>;
export type TrainingConfig = z.infer<typeof TrainingConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
