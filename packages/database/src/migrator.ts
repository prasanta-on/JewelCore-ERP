import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool.js";
import { withTransaction, type TransactionClient } from "./transaction.js";

type Queryable = Pool | PoolClient;

export interface MigrationDefinition {
  name: string;
  up: string | ((client: TransactionClient) => Promise<void> | string);
  down?: string | ((client: TransactionClient) => Promise<void> | string);
}

export interface AppliedMigration {
  id: number;
  name: string;
  checksum: string;
  appliedAt: Date;
  executionTimeMs: number;
}

export interface MigrationResult {
  name: string;
  checksum: string;
  executionTimeMs: number;
}

export interface MigrationReport {
  status: "SUCCESS" | "FAILED";
  totalMigrations: number;
  alreadyApplied: string[];
  newlyApplied: MigrationResult[];
  error?: string;
  failedMigration?: string;
}

export const MIGRATION_TABLE_NAME = "_jewelcore_migrations";

/**
 * Computes a SHA-256 checksum for a migration action.
 */
export function calculateChecksum(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Ensures the migration tracking infrastructure table exists in the target database.
 * Safely tolerates concurrent PostgreSQL catalog DDL race conditions.
 */
export async function ensureMigrationTable(
  poolOverride?: Queryable,
): Promise<void> {
  const executor = poolOverride ?? getPool();
  try {
    await executor.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE_NAME} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER NOT NULL
      );
    `);
  } catch (err: any) {
    // Gracefully handle concurrent PostgreSQL catalog creation race conditions:
    // - 42P07: duplicate_table / relation already exists
    // - 23505: unique_violation on pg_type_typname_nsp_index
    if (
      err.code === "42P07" ||
      (err.code === "23505" &&
        (err.constraint === "pg_type_typname_nsp_index" ||
          String(err.detail).includes("already exists")))
    ) {
      return;
    }
    throw err;
  }
}

/**
 * Retrieves the complete list of applied migrations ordered by execution sequence.
 */
export async function getAppliedMigrations(
  poolOverride?: Queryable,
): Promise<AppliedMigration[]> {
  const executor = poolOverride ?? getPool();
  await ensureMigrationTable(executor);

  const result = await executor.query<{
    id: number;
    name: string;
    checksum: string;
    applied_at: Date;
    execution_time_ms: number;
  }>(`
    SELECT id, name, checksum, applied_at, execution_time_ms
    FROM ${MIGRATION_TABLE_NAME}
    ORDER BY id ASC;
  `);

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
    executionTimeMs: row.execution_time_ms,
  }));
}

/**
 * Executes a sequence of migration definitions in deterministic order with transaction boundaries.
 *
 * Requirements:
 * - Deterministic ordering by migration name (lexicographical).
 * - Duplicate migration prevention (unique names enforced).
 * - Checksum verification for already applied migrations to detect tampering.
 * - Atomic execution: Each migration runs in an isolated `withTransaction` block.
 * - Failure stopping: Halts on first error, reports failure details, and preserves consistency.
 */
export async function runMigrations(
  migrations: MigrationDefinition[],
  poolOverride?: Pool,
): Promise<MigrationReport> {
  const pool = poolOverride ?? getPool();

  // 1. Verify uniqueness of input migration names
  const nameSet = new Set<string>();
  for (const m of migrations) {
    if (nameSet.has(m.name)) {
      throw new Error(
        `Duplicate migration definition detected in batch: "${m.name}"`,
      );
    }
    nameSet.add(m.name);
  }

  // 2. Sort deterministically by name
  const sortedMigrations = [...migrations].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const client = await pool.connect();
  try {
    // Acquire PostgreSQL session advisory lock to ensure parallel runners (e.g. concurrent Vitest test workers in CI) execute sequentially
    await client.query(
      "SELECT pg_advisory_lock(hashtext('jewelcore_migrations_lock'));",
    );

    try {
      // 3. Ensure tracking infrastructure table exists
      await ensureMigrationTable(client);

      // 4. Retrieve applied migrations
      const applied = await getAppliedMigrations(client);
      const appliedMap = new Map(applied.map((a) => [a.name, a]));

      const alreadyAppliedNames: string[] = [];
      const newlyApplied: MigrationResult[] = [];

      // 5. Verify checksums of already applied migrations
      for (const m of sortedMigrations) {
        const existing = appliedMap.get(m.name);
        if (existing) {
          alreadyAppliedNames.push(m.name);
          // Validate checksum if static SQL is available
          const content = typeof m.up === "string" ? m.up : m.name;
          const expectedChecksum = calculateChecksum(content);
          if (
            existing.checksum !== expectedChecksum &&
            typeof m.up === "string"
          ) {
            throw new Error(
              `Migration checksum mismatch for "${m.name}". Applied checksum: ${existing.checksum}, current checksum: ${expectedChecksum}. Migration history must be immutable.`,
            );
          }
        }
      }

      // 6. Execute pending migrations
      for (const m of sortedMigrations) {
        if (appliedMap.has(m.name)) {
          continue;
        }

        const content = typeof m.up === "string" ? m.up : m.name;
        const checksum = calculateChecksum(content);
        const startTime = Date.now();

        try {
          await withTransaction(async (txClient: TransactionClient) => {
            if (typeof m.up === "string") {
              await txClient.query(m.up);
            } else {
              await m.up(txClient);
            }

            const durationMs = Date.now() - startTime;
            await txClient.query(
              `INSERT INTO ${MIGRATION_TABLE_NAME} (name, checksum, execution_time_ms) VALUES ($1, $2, $3);`,
              [m.name, checksum, durationMs],
            );
          }, pool);

          const durationMs = Date.now() - startTime;
          newlyApplied.push({
            name: m.name,
            checksum,
            executionTimeMs: durationMs,
          });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            status: "FAILED",
            totalMigrations: sortedMigrations.length,
            alreadyApplied: alreadyAppliedNames,
            newlyApplied,
            failedMigration: m.name,
            error: errorMsg,
          };
        }
      }

      return {
        status: "SUCCESS",
        totalMigrations: sortedMigrations.length,
        alreadyApplied: alreadyAppliedNames,
        newlyApplied,
      };
    } finally {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtext('jewelcore_migrations_lock'));",
        );
      } catch {
        // Ignore advisory unlock errors during teardown
      }
    }
  } finally {
    client.release();
  }
}
