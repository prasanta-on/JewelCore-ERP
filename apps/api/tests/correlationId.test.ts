import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { isValidCorrelationId } from "../src/common/correlationId.js";

describe("Correlation ID Middleware (x-request-id)", () => {
  const app = createApp();

  it("generates a new valid correlation ID when x-request-id is missing", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);

    const requestId = res.headers["x-request-id"];
    expect(requestId).toBeDefined();
    expect(typeof requestId).toBe("string");
    expect(requestId.startsWith("req_")).toBe(true);
    expect(isValidCorrelationId(requestId)).toBe(true);
  });

  it("preserves and propagates a valid incoming x-request-id", async () => {
    const incomingId = "req_trace_abc123_jewelcore";
    const res = await request(app)
      .get("/health")
      .set("x-request-id", incomingId);

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe(incomingId);
  });

  it("replaces an invalid or dangerous incoming correlation ID with a safe generated ID", async () => {
    // Unit validation checks on dangerous inputs
    expect(isValidCorrelationId("id\nwith\nnewlines")).toBe(false);
    expect(isValidCorrelationId("id\r\ninjection")).toBe(false);
    expect(isValidCorrelationId("")).toBe(false);

    const invalidHeaderValues = [
      "id with spaces",
      '<script>alert("xss")</script>',
      "a".repeat(65), // Exceeds max length of 64
      "id/with/slashes",
      "id;injection",
    ];

    for (const invalidId of invalidHeaderValues) {
      const res = await request(app)
        .get("/health")
        .set("x-request-id", invalidId);

      expect(res.status).toBe(200);
      const outputId = res.headers["x-request-id"];
      expect(outputId).toBeDefined();
      expect(outputId).not.toBe(invalidId);
      expect(outputId.startsWith("req_")).toBe(true);
      expect(isValidCorrelationId(outputId)).toBe(true);
    }
  });

  it("returns the same correlation ID on error responses", async () => {
    const incomingId = "req_error_trace_404";
    const res = await request(app)
      .get("/non-existent-route")
      .set("x-request-id", incomingId);

    expect(res.status).toBe(404);
    expect(res.headers["x-request-id"]).toBe(incomingId);
    expect(res.body.requestId).toBe(incomingId);
  });
});
