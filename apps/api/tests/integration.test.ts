import { describe, it, expect } from "vitest";
import request from "supertest";
import { Writable } from "node:stream";
import express from "express";
import { ValidationError } from "@jewelcore/shared";
import { correlationIdMiddleware } from "../src/common/correlationId.js";
import { createLogger, createHttpLogger } from "../src/common/logger.js";
import { errorHandler, notFoundHandler } from "../src/common/errorHandler.js";

class MemoryLogStream extends Writable {
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

describe("FEAT-FOUND-03 Complete Vertical Integration Tests", () => {
  it("Scenario 1 & 2: RFC 7807 Problem Details Response and Correlation ID Propagation", async () => {
    const memoryStream = new MemoryLogStream();
    const testLogger = createLogger(
      { level: "info" },
      memoryStream as unknown as import("pino").DestinationStream,
    );

    const app = express();
    app.use(correlationIdMiddleware);
    app.use(createHttpLogger(testLogger));
    app.use(express.json());

    // Controller simulating a business validation failure
    app.post("/api/v1/qc/sessions", () => {
      throw new ValidationError(
        "Inspection session cannot be sealed with unverified balance metrology readings",
        [
          {
            name: "grossWeightReading",
            reason: "Calibration timestamp is expired",
          },
        ],
      );
    });

    app.use(notFoundHandler);
    app.use(errorHandler);

    const testCorrelationId = "req_12345";

    // Execute HTTP request
    const res = await request(app)
      .post("/api/v1/qc/sessions")
      .set("x-request-id", testCorrelationId)
      .send({ sessionId: "QC-SESS-001" });

    // 1. Verify Status & Headers
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.headers["x-request-id"]).toBe(testCorrelationId);

    // 2. Verify RFC 7807 Body Fields
    expect(res.body).toEqual({
      type: "https://jewelcore.com/errors/validation",
      title: "Validation Error",
      status: 400,
      detail:
        "Inspection session cannot be sealed with unverified balance metrology readings",
      instance: "/api/v1/qc/sessions",
      code: "ERR_VALIDATION",
      requestId: testCorrelationId,
      timestamp: expect.any(String),
      invalidParams: [
        {
          name: "grossWeightReading",
          reason: "Calibration timestamp is expired",
        },
      ],
    });

    // 3. Verify Structured Log Entries contain the exact same correlation ID
    const logEntries = memoryStream.getParsedEntries();
    expect(logEntries.length).toBeGreaterThanOrEqual(1);

    const matchingLogs = logEntries.filter(
      (log) => log.requestId === testCorrelationId,
    );
    expect(matchingLogs.length).toBeGreaterThanOrEqual(1);

    const errorLog = matchingLogs.find((log) => log.code === "ERR_VALIDATION");
    expect(errorLog).toBeDefined();
    expect(errorLog?.status).toBe(400);
    expect(errorLog?.requestId).toBe(testCorrelationId);
  });
});
