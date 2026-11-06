import { describe, it, expect, afterAll } from "vitest";
import { getPool, closePool, checkConnection, query } from "../src/index.js";

describe("PostgreSQL 18 Connection Pool Integration Tests", () => {
  afterAll(async () => {
    await closePool();
  });

  it("successfully establishes a live connection and verifies PostgreSQL 18", async () => {
    const health = await checkConnection();

    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.version).toMatch(/PostgreSQL (16|17|18)/);
    expect(health.sanitizedUri).toContain(
      "jewelcore:****@localhost:5434/jewelcore_erp",
    );
    expect(health.poolStats.total).toBeGreaterThanOrEqual(1);
  });

  it("executes parameterized queries with typed parameters", async () => {
    const testString = "JewelCore Platform Test";
    const testInt = 999;

    const result = await query<{ text_val: string; int_val: number }>(
      "SELECT $1::text AS text_val, $2::integer AS int_val;",
      [testString, testInt],
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.text_val).toBe(testString);
    expect(result.rows[0]?.int_val).toBe(testInt);
  });

  it("safely handles syntax errors without corrupting the connection pool", async () => {
    await expect(
      query("SELECT * FROM non_existent_table_error_test;"),
    ).rejects.toThrow();

    // Verify subsequent queries continue to work normally
    const recoveryCheck = await query<{ one: number }>("SELECT 1 AS one;");
    expect(recoveryCheck.rows[0]?.one).toBe(1);
  });
});
