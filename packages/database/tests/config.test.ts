import { describe, it, expect } from "vitest";
import {
  DatabaseConfigSchema,
  loadDatabaseConfig,
  getSanitizedConfigString,
  type DatabaseConfig,
} from "../src/config.js";

describe("Database Configuration Unit Tests", () => {
  it("loads valid default database configuration", () => {
    const config = loadDatabaseConfig({});
    expect(config.host).toBe("localhost");
    expect(config.port).toBe(5434);
    expect(config.user).toBe("jewelcore");
    expect(config.password).toBe("jewelcore_dev");
    expect(config.database).toBe("jewelcore_erp");
    expect(config.maxConnections).toBe(20);
    expect(config.idleTimeoutMillis).toBe(30000);
    expect(config.connectionTimeoutMillis).toBe(5000);
    expect(config.statementTimeoutMillis).toBe(10000);
  });

  it("overrides defaults with provided environment variables", () => {
    const customEnv = {
      POSTGRES_HOST: "db.prod.internal",
      POSTGRES_PORT: "5432",
      POSTGRES_USER: "prod_admin",
      POSTGRES_PASSWORD: "super_secure_secret",
      POSTGRES_DB: "jewelcore_production",
      POSTGRES_MAX_CONNECTIONS: "50",
      POSTGRES_IDLE_TIMEOUT_MS: "15000",
      POSTGRES_CONNECTION_TIMEOUT_MS: "3000",
      POSTGRES_STATEMENT_TIMEOUT_MS: "8000",
    };

    const config = loadDatabaseConfig(customEnv);
    expect(config.host).toBe("db.prod.internal");
    expect(config.port).toBe(5432);
    expect(config.user).toBe("prod_admin");
    expect(config.password).toBe("super_secure_secret");
    expect(config.database).toBe("jewelcore_production");
    expect(config.maxConnections).toBe(50);
    expect(config.idleTimeoutMillis).toBe(15000);
    expect(config.connectionTimeoutMillis).toBe(3000);
    expect(config.statementTimeoutMillis).toBe(8000);
  });

  it("parses connection parameters from DATABASE_URL if present", () => {
    const config = loadDatabaseConfig({
      DATABASE_URL: "postgres://custom_user:custom_pass@db.example.com:5439/custom_db",
    });
    expect(config.host).toBe("db.example.com");
    expect(config.port).toBe(5439);
    expect(config.user).toBe("custom_user");
    expect(config.password).toBe("custom_pass");
    expect(config.database).toBe("custom_db");
  });

  it("rejects invalid port numbers", () => {
    expect(() =>
      DatabaseConfigSchema.parse({
        host: "localhost",
        port: 70000, // Invalid port > 65535
        user: "jewelcore",
        password: "pwd",
        database: "db",
      }),
    ).toThrow();
  });

  it("sanitizes connection string and redacts password", () => {
    const config: DatabaseConfig = {
      host: "localhost",
      port: 5434,
      user: "jewelcore",
      password: "super_secret_password_never_log",
      database: "jewelcore_erp",
      maxConnections: 25,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statementTimeoutMillis: 10000,
    };

    const sanitized = getSanitizedConfigString(config);
    expect(sanitized).not.toContain("super_secret_password_never_log");
    expect(sanitized).toContain("jewelcore:****@localhost:5434/jewelcore_erp");
  });
});
