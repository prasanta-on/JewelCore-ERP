import { z } from "zod";

export const workerConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  REDIS_HOST: z.string().min(1).default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6380),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_TLS: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .default("false"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

let cachedConfig: WorkerConfig | null = null;

export function getWorkerConfig(
  envOverride?: Record<string, string | undefined>,
): WorkerConfig {
  if (cachedConfig && !envOverride) {
    return cachedConfig;
  }

  const rawEnv = envOverride ?? process.env;
  const parseResult = workerConfigSchema.safeParse(rawEnv);

  if (!parseResult.success) {
    const formattedErrors = parseResult.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Worker configuration validation failed:\n${formattedErrors}`,
    );
  }

  if (!envOverride) {
    cachedConfig = parseResult.data;
  }

  return parseResult.data;
}

export function resetWorkerConfig(): void {
  cachedConfig = null;
}
