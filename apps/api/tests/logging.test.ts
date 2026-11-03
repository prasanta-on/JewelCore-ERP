import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import request from "supertest";
import express, { type Express } from "express";
import { createLogger, createHttpLogger } from "../src/common/logger.js";
import { correlationIdMiddleware } from "../src/common/correlationId.js";

class MemoryStream extends Writable {
  public lines: string[] = [];

  _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.lines.push(chunk.toString());
    callback();
  }

  getParsedEntries(): Record<string, unknown>[] {
    return this.lines
      .map((line) => {
        try {
          return JSON.parse(line.trim());
        } catch {
          return null;
        }
      })
      .filter((entry): entry is Record<string, unknown> => entry !== null);
  }
}

describe("Structured Logging with Pino", () => {
  it("emits structured JSON records with ISO timestamp and configured level", () => {
    const memoryStream = new MemoryStream();
    const testLogger = createLogger(
      { level: "info" },
      memoryStream as unknown as import("pino").DestinationStream,
    );

    testLogger.info(
      { event: "VAULT_OPENED", vaultId: "VLT-01" },
      "Vault access authorized",
    );

    const entries = memoryStream.getParsedEntries();
    expect(entries.length).toBe(1);
    expect(entries[0]?.level).toBe("info");
    expect(entries[0]?.event).toBe("VAULT_OPENED");
    expect(entries[0]?.vaultId).toBe("VLT-01");
    expect(entries[0]?.msg).toBe("Vault access authorized");
    expect(entries[0]?.time).toBeDefined();
  });

  it("respects log level filtering", () => {
    const memoryStream = new MemoryStream();
    const testLogger = createLogger(
      { level: "warn" },
      memoryStream as unknown as import("pino").DestinationStream,
    );

    testLogger.debug("Debug message should not appear");
    testLogger.info("Info message should not appear");
    testLogger.warn("Warning message must appear");

    const entries = memoryStream.getParsedEntries();
    expect(entries.length).toBe(1);
    expect(entries[0]?.level).toBe("warn");
    expect(entries[0]?.msg).toBe("Warning message must appear");
  });

  it("redacts sensitive fields and authorization headers", () => {
    const memoryStream = new MemoryStream();
    const testLogger = createLogger(
      { level: "info" },
      memoryStream as unknown as import("pino").DestinationStream,
    );

    testLogger.info({
      password: "plain_secret_password",
      token: "jwt.token.secret",
      secret: "api_client_secret",
      apiKey: "sec_key_12345",
      req: {
        headers: {
          authorization: "Bearer super_secret_token",
          cookie: "session_id=12345; auth_token=secret",
          "x-api-key": "secret_key",
        },
      },
    });

    const entries = memoryStream.getParsedEntries();
    expect(entries.length).toBe(1);
    const entry = entries[0]!;

    expect(entry.password).toBe("[REDACTED]");
    expect(entry.token).toBe("[REDACTED]");
    expect(entry.secret).toBe("[REDACTED]");
    expect(entry.apiKey).toBe("[REDACTED]");

    const headers = (entry.req as { headers: Record<string, string> }).headers;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers.cookie).toBe("[REDACTED]");
    expect(headers["x-api-key"]).toBe("[REDACTED]");
  });

  it("propagates correlation ID in pino-http request logs and ignores health check noise", async () => {
    const memoryStream = new MemoryStream();
    const testLogger = createLogger(
      { level: "info" },
      memoryStream as unknown as import("pino").DestinationStream,
    );

    const app: Express = express();
    app.use(correlationIdMiddleware);
    app.use(createHttpLogger(testLogger));

    app.get("/health", (_req, res) => {
      res.status(200).json({ status: "UP" });
    });

    app.get("/api/v1/test-log", (_req, res) => {
      res.status(200).json({ success: true });
    });

    // 1. Health check should be ignored (zero log noise)
    await request(app).get("/health");
    const healthEntries = memoryStream.getParsedEntries();
    expect(healthEntries.length).toBe(0);

    // 2. Regular API request should be logged with requestId
    await request(app)
      .get("/api/v1/test-log")
      .set("x-request-id", "req_logged_999");

    const apiEntries = memoryStream.getParsedEntries();
    expect(apiEntries.length).toBeGreaterThanOrEqual(1);
    const reqLog = apiEntries.find((e) => e.requestId === "req_logged_999");
    expect(reqLog).toBeDefined();
    expect(reqLog?.requestId).toBe("req_logged_999");
  });
});
