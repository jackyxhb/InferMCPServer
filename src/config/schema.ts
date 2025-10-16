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

const CommandPatternSchema = z.object({
  pattern: z.string(),
  description: z.string().optional()
});

export const SshPolicySchema = z.object({
  allowedCommands: z.array(z.union([z.string(), CommandPatternSchema])).optional(),
  maxExecutionMs: z.number().int().positive().optional(),
  maxOutputBytes: z.number().int().positive().optional(),
  maxConcurrent: z.number().int().positive().optional()
});

export const SshCredentialSchema = z
  .object({
    host: z.string(),
    port: z.number().int().positive().default(22),
    username: z.string(),
    password: SecretDefinitionSchema.optional(),
    privateKey: SecretDefinitionSchema.optional(),
    passphrase: SecretDefinitionSchema.optional(),
    policy: SshPolicySchema.optional()
  })
  .refine(
    (value) => Boolean(value.password) || Boolean(value.privateKey),
    "SSH credential must provide either a password or a privateKey"
  );

export const TrainingConfigSchema = z.object({
  defaultCommandTemplate: z.string().optional(),
  defaultTimeoutMs: z.number().int().positive().default(300000)
});

export const DatabaseProfileSchema = z.object({
  connectionString: SecretDefinitionSchema,
  allowedStatements: z.array(z.string()).optional(),
  maxRows: z.number().int().positive().default(500),
  maxExecutionMs: z.number().int().positive().default(30000),
  maxConcurrent: z.number().int().positive().default(1)
});

export const AppConfigSchema = z.object({
  sshProfiles: z.record(SshCredentialSchema).default({}),
  databaseProfiles: z.record(DatabaseProfileSchema).default({}),
  training: TrainingConfigSchema.default({})
});

export type SecretDefinition = z.infer<typeof SecretDefinitionSchema>;
export type SshPolicy = z.infer<typeof SshPolicySchema>;
export type SshCredential = z.infer<typeof SshCredentialSchema>;
export type TrainingConfig = z.infer<typeof TrainingConfigSchema>;
export type DatabaseProfile = z.infer<typeof DatabaseProfileSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export interface ResolvedSshPolicy {
  allowedCommandPatterns?: RegExp[];
  maxExecutionMs: number;
  maxOutputBytes: number;
  maxConcurrent: number;
}

export interface ResolvedSshCredential {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  policy: ResolvedSshPolicy;
}

export interface ResolvedDatabaseProfile {
  connectionString: string;
  allowedStatementPatterns?: RegExp[];
  maxRows: number;
  maxExecutionMs: number;
  maxConcurrent: number;
}

export interface ResolvedAppConfig {
  sshProfiles: Record<string, ResolvedSshCredential>;
  databaseProfiles: Record<string, ResolvedDatabaseProfile>;
  training: TrainingConfig;
  localTestMode: boolean;
  raw: AppConfig;
}
