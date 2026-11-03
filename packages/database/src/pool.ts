import pg, { type Pool, type QueryResult, type QueryResultRow } from "pg";
import {
  type DatabaseConfig,
  loadDatabaseConfig,
  getSanitizedConfigString,
} from "./config.js";

let poolInstance: Pool | null = null;
let currentConfig: DatabaseConfig | null = null;

/**
 * Initializes or returns the singleton PostgreSQL connection pool.
 */
export function getPool(overrideConfig?: Partial<DatabaseConfig>): Pool {
  if (poolInstance && !overrideConfig) {
    return poolInstance;
  }

  if (poolInstance && overrideConfig) {
    // If override is requested while a pool exists, close the existing one first
    throw new Error(
      "A database pool is already active. Call closePool() before creating a new pool with overrides.",
    );
  }

  const baseConfig = loadDatabaseConfig();
  const config: DatabaseConfig = overrideConfig
    ? { ...baseConfig, ...overrideConfig }
    : baseConfig;

  currentConfig = config;

  poolInstance = new pg.Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: config.maxConnections,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    statement_timeout: config.statementTimeoutMillis,
  });

  // Handle unexpected idle client errors
  poolInstance.on("error", (err: Error) => {
    // Error logged without credentials
    // eslint-disable-next-line no-console
    console.error(
      `[JewelCore DB] Unexpected idle client error on pool: ${err.message}`,
    );
  });

  return poolInstance;
}

/**
 * Safely closes the active PostgreSQL connection pool and releases all idle/active sockets.
 */
export async function closePool(): Promise<void> {
  if (!poolInstance) {
    return;
  }

  const poolToClose = poolInstance;
  poolInstance = null;
  currentConfig = null;

  await poolToClose.end();
}

/**
 * Executes a parameterized query using the active connection pool.
 */
export async function query<R extends QueryResultRow = any>(
  text: string,
  values?: any[],
): Promise<QueryResult<R>> {
  const pool = getPool();
  return values !== undefined
    ? pool.query<R>(text, values)
    : pool.query<R>(text);
}

/**
 * Verifies database reachability, roundtrip latency, and PostgreSQL server version.
 */
export async function checkConnection(): Promise<{
  ok: boolean;
  latencyMs: number;
  version?: string;
  sanitizedUri?: string;
  error?: string;
  poolStats: {
    total: number;
    idle: number;
    waiting: number;
  };
}> {
  const pool = getPool();
  const startTime = Date.now();

  try {
    const result = await pool.query<{ version: string }>(
      "SELECT version() AS version;",
    );
    const latencyMs = Date.now() - startTime;
    const version = result.rows[0]?.version;

    return {
      ok: true,
      latencyMs,
      version,
      sanitizedUri: currentConfig
        ? getSanitizedConfigString(currentConfig)
        : undefined,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    return {
      ok: false,
      latencyMs,
      error: message,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  }
}
