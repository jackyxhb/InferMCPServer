import { z } from "zod";

export const SecretDefinitionSchema = z.union([
  z.string(),
  z.object({ value: z.string() }),
  z.object({ env: z.string(), optional: z.boolean().default(false) }),
  z.object({
    path: z.string(),
    encoding: z.enum(["utf8", "base64"]).default("utf8"),
    optional: z.boolean().default(false)
  })
]);

export const SshCredentialSchema = z
  .object({
    host: z.string(),
    port: z.number().int().positive().default(22),
    username: z.string(),
    password: SecretDefinitionSchema.optional(),
    privateKey: SecretDefinitionSchema.optional(),
    passphrase: SecretDefinitionSchema.optional()
  })
  .refine(
    (value) => Boolean(value.password) || Boolean(value.privateKey),
    "SSH credential must provide either a password or a privateKey"
  );

export const TrainingConfigSchema = z.object({
  defaultCommandTemplate: z.string().optional(),
  defaultTimeoutMs: z.number().int().positive().default(300000)
});

export const AppConfigSchema = z.object({
  sshProfiles: z.record(SshCredentialSchema).default({}),
  training: TrainingConfigSchema.default({})
});

export type SecretDefinition = z.infer<typeof SecretDefinitionSchema>;
export type SshCredential = z.infer<typeof SshCredentialSchema>;
export type TrainingConfig = z.infer<typeof TrainingConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export interface ResolvedSshCredential {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface ResolvedAppConfig {
  sshProfiles: Record<string, ResolvedSshCredential>;
  training: TrainingConfig;
  raw: AppConfig;
}
