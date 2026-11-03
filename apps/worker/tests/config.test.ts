import { describe, it, expect, beforeEach } from "vitest";
import { getWorkerConfig, resetWorkerConfig } from "../src/config.js";

describe("Worker Environment & Queue Configuration (Component C)", () => {
  beforeEach(() => {
    resetWorkerConfig();
  });

  it("loads default configuration with safe local values", () => {
    const config = getWorkerConfig({});

    expect(config.NODE_ENV).toBe("development");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.REDIS_HOST).toBe("127.0.0.1");
    expect(config.REDIS_PORT).toBe(6380);
    expect(config.REDIS_DB).toBe(0);
    expect(config.REDIS_TLS).toBe(false);
    expect(config.WORKER_CONCURRENCY).toBe(5);
  });

  it("applies environment overrides correctly", () => {
    const config = getWorkerConfig({
      NODE_ENV: "production",
      LOG_LEVEL: "warn",
      REDIS_HOST: "redis.internal.cluster",
      REDIS_PORT: "6379",
      REDIS_PASSWORD: "secure_redis_pwd",
      REDIS_DB: "2",
      REDIS_TLS: "true",
      WORKER_CONCURRENCY: "10",
    });

    expect(config.NODE_ENV).toBe("production");
    expect(config.LOG_LEVEL).toBe("warn");
    expect(config.REDIS_HOST).toBe("redis.internal.cluster");
    expect(config.REDIS_PORT).toBe(6379);
    expect(config.REDIS_PASSWORD).toBe("secure_redis_pwd");
    expect(config.REDIS_DB).toBe(2);
    expect(config.REDIS_TLS).toBe(true);
    expect(config.WORKER_CONCURRENCY).toBe(10);
  });

  it("rejects invalid Redis port with validation error", () => {
    expect(() =>
      getWorkerConfig({
        REDIS_PORT: "99999",
      }),
    ).toThrow("Worker configuration validation failed");
  });

  it("rejects non-positive worker concurrency", () => {
    expect(() =>
      getWorkerConfig({
        WORKER_CONCURRENCY: "0",
      }),
    ).toThrow("Worker configuration validation failed");
  });
});
