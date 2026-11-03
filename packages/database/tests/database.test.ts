import { describe, it, expect } from "vitest";
import { DEFAULT_DB_CONFIG } from "../src/index.js";

describe("Database Configuration Baseline", () => {
  it("provides sensible default database configuration", () => {
    expect(DEFAULT_DB_CONFIG.database).toBe("jewelcore_erp");
    expect(DEFAULT_DB_CONFIG.user).toBe("jewelcore");
    expect(DEFAULT_DB_CONFIG.maxConnections).toBe(20);
    expect(DEFAULT_DB_CONFIG.connectionTimeoutMillis).toBe(5000);
  });
});
