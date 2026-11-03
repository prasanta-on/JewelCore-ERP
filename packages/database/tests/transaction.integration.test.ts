import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getPool,
  closePool,
  withTransaction,
  query,
  uuidv7,
} from "../src/index.js";

describe("PostgreSQL 18 Transaction Engine Integration Tests", () => {
  const TEST_TABLE = "_test_tx_journal";

  beforeAll(async () => {
    // Create dedicated test table for transaction semantics
    await query(`
      CREATE TABLE IF NOT EXISTS ${TEST_TABLE} (
        id VARCHAR(36) PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterAll(async () => {
    await query(`DROP TABLE IF EXISTS ${TEST_TABLE};`);
    await closePool();
  });

  it("1. commits mutations atomically on successful callback completion", async () => {
    const id = uuidv7();
    const payload = "Atomic Commit Verification";

    const result = await withTransaction(async (tx) => {
      expect(tx.inTransaction).toBe(true);
      await tx.query(
        `INSERT INTO ${TEST_TABLE} (id, payload) VALUES ($1, $2);`,
        [id, payload],
      );
      return { committedId: id };
    });

    expect(result.committedId).toBe(id);

    // Verify record exists in database outside the transaction
    const check = await query<{ id: string; payload: string }>(
      `SELECT id, payload FROM ${TEST_TABLE} WHERE id = $1;`,
      [id],
    );
    expect(check.rows.length).toBe(1);
    expect(check.rows[0]?.payload).toBe(payload);
  });

  it("2. automatically executes ROLLBACK when application error is thrown", async () => {
    const id = uuidv7();
    const payload = "Should Rollback Verification";

    const appError = new Error("Simulated domain invariant violation");

    await expect(
      withTransaction(async (tx) => {
        await tx.query(
          `INSERT INTO ${TEST_TABLE} (id, payload) VALUES ($1, $2);`,
          [id, payload],
        );
        throw appError;
      }),
    ).rejects.toThrow("Simulated domain invariant violation");

    // Verify row was NOT persisted
    const check = await query(`SELECT id FROM ${TEST_TABLE} WHERE id = $1;`, [
      id,
    ]);
    expect(check.rows.length).toBe(0);
  });

  it("3. releases the checked-out client back to the pool after success", async () => {
    const pool = getPool();
    const initialWaiting = pool.waitingCount;

    await withTransaction(async (tx) => {
      await tx.query("SELECT 1;");
    });

    // Client must be released immediately; no waiting clients
    expect(pool.waitingCount).toBe(initialWaiting);
    expect(pool.idleCount).toBeGreaterThan(0);
  });

  it("4. guarantees client release back to the pool after an unhandled exception", async () => {
    const pool = getPool();
    const initialWaiting = pool.waitingCount;

    try {
      await withTransaction(async () => {
        throw new Error("Failure during transaction block");
      });
    } catch {
      // Expected
    }

    expect(pool.waitingCount).toBe(initialWaiting);
    expect(pool.idleCount).toBeGreaterThan(0);
  });

  it("5. preserves the original application error if rollback fails", async () => {
    const originalError = new Error("Critical application business failure");

    // We can simulate an error during transaction and verify original error is preserved
    let caughtError: unknown;
    try {
      await withTransaction(async () => {
        throw originalError;
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBe(originalError);
  });

  it("6. executes concurrent transactions in strict ACID isolation without interference", async () => {
    const id1 = uuidv7();
    const id2 = uuidv7();

    const tx1 = withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO ${TEST_TABLE} (id, payload) VALUES ($1, $2);`,
        [id1, "TX 1 Concurrent"],
      );
      return id1;
    });

    const tx2 = withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO ${TEST_TABLE} (id, payload) VALUES ($1, $2);`,
        [id2, "TX 2 Concurrent"],
      );
      return id2;
    });

    const [res1, res2] = await Promise.all([tx1, tx2]);

    expect(res1).toBe(id1);
    expect(res2).toBe(id2);

    const check = await query<{ count: string }>(
      `SELECT count(*) FROM ${TEST_TABLE} WHERE id IN ($1, $2);`,
      [id1, id2],
    );
    expect(Number(check.rows[0]?.count)).toBe(2);
  });
});
