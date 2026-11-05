import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getPool,
  closePool,
  query,
  runMigrations,
  getAppliedMigrations,
  ensureMigrationTable,
  MIGRATION_TABLE_NAME,
  type MigrationDefinition,
} from "../src/index.js";

describe("PostgreSQL 18 Migration Runner Harness Integration Tests", () => {
  beforeAll(async () => {
    // Clean migration tracking table and test artifacts
    await ensureMigrationTable();
    await query(
      `DELETE FROM ${MIGRATION_TABLE_NAME} WHERE name LIKE '000%_create_test_%' OR name LIKE '000%_failing_%';`,
    );
    await query("DROP TABLE IF EXISTS _test_migration_alpha;");
    await query("DROP TABLE IF EXISTS _test_migration_beta;");
  });

  afterAll(async () => {
    await query(
      `DELETE FROM ${MIGRATION_TABLE_NAME} WHERE name LIKE '000%_create_test_%' OR name LIKE '000%_failing_%';`,
    );
    await query("DROP TABLE IF EXISTS _test_migration_alpha;");
    await query("DROP TABLE IF EXISTS _test_migration_beta;");
    await closePool();
  });

  it("initializes the _jewelcore_migrations infrastructure table", async () => {
    await ensureMigrationTable();

    const tableCheck = await query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '${MIGRATION_TABLE_NAME}'
      ) AS exists;
    `);

    expect(tableCheck.rows[0]?.exists).toBe(true);
  });

  it("executes migrations in deterministic alphabetical order regardless of input array order", async () => {
    const executionOrder: string[] = [];

    const migrations: MigrationDefinition[] = [
      {
        name: "0002_create_test_beta",
        up: async (tx) => {
          executionOrder.push("0002_create_test_beta");
          await tx.query(
            "CREATE TABLE IF NOT EXISTS _test_migration_beta (id INT PRIMARY KEY);",
          );
        },
      },
      {
        name: "0001_create_test_alpha",
        up: async (tx) => {
          executionOrder.push("0001_create_test_alpha");
          await tx.query(
            "CREATE TABLE IF NOT EXISTS _test_migration_alpha (id INT PRIMARY KEY);",
          );
        },
      },
    ];

    const report = await runMigrations(migrations);

    expect(report.status).toBe("SUCCESS");
    expect(report.newlyApplied.length).toBe(2);
    expect(executionOrder).toEqual([
      "0001_create_test_alpha",
      "0002_create_test_beta",
    ]);

    // Verify records in tracking table
    const applied = await getAppliedMigrations();
    const testApplied = applied.filter(
      (m) =>
        m.name === "0001_create_test_alpha" ||
        m.name === "0002_create_test_beta",
    );
    expect(testApplied.length).toBe(2);
    expect(testApplied[0]?.name).toBe("0001_create_test_alpha");
    expect(testApplied[1]?.name).toBe("0002_create_test_beta");
  });

  it("skips already applied migrations idempotently on subsequent runs", async () => {
    const migrations: MigrationDefinition[] = [
      {
        name: "0001_create_test_alpha",
        up: async (tx) => {
          await tx.query("SELECT 1;");
        },
      },
      {
        name: "0002_create_test_beta",
        up: async (tx) => {
          await tx.query("SELECT 1;");
        },
      },
    ];

    const report = await runMigrations(migrations);

    expect(report.status).toBe("SUCCESS");
    expect(report.newlyApplied.length).toBe(0);
    expect(report.alreadyApplied).toEqual([
      "0001_create_test_alpha",
      "0002_create_test_beta",
    ]);
  });

  it("rejects batches containing duplicate migration names", async () => {
    const duplicateBatch: MigrationDefinition[] = [
      { name: "0003_duplicate_name", up: async () => {} },
      { name: "0003_duplicate_name", up: async () => {} },
    ];

    await expect(runMigrations(duplicateBatch)).rejects.toThrow(
      'Duplicate migration definition detected in batch: "0003_duplicate_name"',
    );
  });

  it("rolls back database mutations and does not record migration if execution fails", async () => {
    const failingMigration: MigrationDefinition = {
      name: "0004_failing_migration",
      up: async (tx) => {
        await tx.query(
          "CREATE TABLE _test_migration_fail (id INT PRIMARY KEY);",
        );
        // Cause intentional SQL error
        await tx.query(
          "SELECT * FROM non_existent_table_for_intentional_failure;",
        );
      },
    };

    const report = await runMigrations([failingMigration]);

    expect(report.status).toBe("FAILED");
    expect(report.failedMigration).toBe("0004_failing_migration");
    expect(report.error).toBeDefined();

    // Verify table was NOT created (rolled back atomically)
    const tableCheck = await query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '_test_migration_fail'
      ) AS exists;
    `);
    expect(tableCheck.rows[0]?.exists).toBe(false);

    // Verify failing migration is NOT recorded in _jewelcore_migrations
    const applied = await getAppliedMigrations();
    expect(applied.some((m) => m.name === "0004_failing_migration")).toBe(
      false,
    );
  });
});
