/**
 * @jewelcore/database
 * Database connectivity, transaction harness, and migration engine.
 * Full implementation provided in FEAT-FOUND-02.
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export const DEFAULT_DB_CONFIG: DatabaseConfig = {
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5434),
  user: process.env.POSTGRES_USER ?? "jewelcore",
  password: process.env.POSTGRES_PASSWORD ?? "jewelcore_dev",
  database: process.env.POSTGRES_DB ?? "jewelcore_erp",
  maxConnections: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};
