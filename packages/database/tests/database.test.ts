import { describe, it, expect } from "vitest";
import * as databaseModule from "../src/index.js";

describe("Database Module Exports Verification", () => {
  it("exports all connection pool, transaction, uuid, and migration functions", () => {
    expect(databaseModule.getPool).toBeDefined();
    expect(databaseModule.closePool).toBeDefined();
    expect(databaseModule.query).toBeDefined();
    expect(databaseModule.checkConnection).toBeDefined();
    expect(databaseModule.withTransaction).toBeDefined();
    expect(databaseModule.uuidv7).toBeDefined();
    expect(databaseModule.uuidv7Bytes).toBeDefined();
    expect(databaseModule.isValidUuidv7).toBeDefined();
    expect(databaseModule.runMigrations).toBeDefined();
    expect(databaseModule.ensureMigrationTable).toBeDefined();
    expect(databaseModule.getAppliedMigrations).toBeDefined();
  });
});
