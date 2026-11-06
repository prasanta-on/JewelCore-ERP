import { z } from "zod";

/**
 * Zod validation schema for PostgreSQL configuration
 */
export const DatabaseConfigSchema = z.object({
  host: z.string().min(1, "Database host is required").default("localhost"),
  port: z.coerce.number().int().min(1).max(65535).default(5434),
  user: z.string().min(1, "Database user is required").default("jewelcore"),
  password: z.string().default("jewelcore_dev"),
  database: z
    .string()
    .min(1, "Database name is required")
    .default("jewelcore_erp"),
  maxConnections: z.coerce.number().int().min(1).max(100).default(20),
  idleTimeoutMillis: z.coerce.number().int().min(1000).default(30000),
  connectionTimeoutMillis: z.coerce.number().int().min(1000).default(5000),
  statementTimeoutMillis: z.coerce.number().int().min(1000).default(10000),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/**
 * Loads and validates PostgreSQL connection configuration from environment variables.
 */
export function loadDatabaseConfig(
  env: Record<string, string | undefined> = process.env,
): DatabaseConfig {
  let urlHost: string | undefined;
  let urlPort: number | undefined;
  let urlUser: string | undefined;
  let urlPassword: string | undefined;
  let urlDatabase: string | undefined;

  const dbUrl = env.DATABASE_URL;
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      urlHost = parsed.hostname || undefined;
      if (parsed.port) urlPort = Number(parsed.port);
      if (parsed.username) urlUser = decodeURIComponent(parsed.username);
      if (parsed.password) urlPassword = decodeURIComponent(parsed.password);
      if (parsed.pathname && parsed.pathname.length > 1) {
        urlDatabase = parsed.pathname.slice(1);
      }
    } catch {
      // Fallback to explicit env vars if URL is invalid
    }
  }

  const rawConfig = {
    host: env.POSTGRES_HOST ?? urlHost ?? "localhost",
    port: env.POSTGRES_PORT ?? urlPort ?? 5434,
    user: env.POSTGRES_USER ?? urlUser ?? "jewelcore",
    password: env.POSTGRES_PASSWORD ?? urlPassword ?? "jewelcore_dev",
    database: env.POSTGRES_DB ?? urlDatabase ?? "jewelcore_erp",
    maxConnections: env.POSTGRES_MAX_CONNECTIONS ?? 20,
    idleTimeoutMillis: env.POSTGRES_IDLE_TIMEOUT_MS ?? 30000,
    connectionTimeoutMillis: env.POSTGRES_CONNECTION_TIMEOUT_MS ?? 5000,
    statementTimeoutMillis: env.POSTGRES_STATEMENT_TIMEOUT_MS ?? 10000,
  };

  return DatabaseConfigSchema.parse(rawConfig);
}

/**
 * Produces a diagnostic connection string with password redacted.
 * Safe for structured logging and health checks.
 */
export function getSanitizedConfigString(config: DatabaseConfig): string {
  return `postgresql://${config.user}:****@${config.host}:${config.port}/${config.database}?poolMax=${config.maxConnections}&idleTimeout=${config.idleTimeoutMillis}ms`;
}
