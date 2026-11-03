import { describe, it, expect } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { z } from "zod";
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  DomainError,
} from "@jewelcore/shared";
import { correlationIdMiddleware } from "../src/common/correlationId.js";
import { errorHandler, notFoundHandler } from "../src/common/errorHandler.js";

function createTestErrorApp(): Express {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(express.json());

  // Test endpoints throwing various domain and system errors
  app.get("/test/validation-error", () => {
    throw new ValidationError("SKU format is invalid", [
      { name: "skuCode", reason: "Must match pattern SKU-[A-Z0-9]+" },
    ]);
  });

  app.post("/test/zod-validation", (req) => {
    const schema = z.object({
      weightGrams: z.number().positive(),
      storeId: z.string().uuid(),
    });
    schema.parse(req.body);
  });

  app.get("/test/unauthorized-error", () => {
    throw new UnauthorizedError("JWT bearer token expired");
  });

  app.get("/test/forbidden-error", () => {
    throw new ForbiddenError(
      "Supervisory permission required to waive QC discrepancy",
    );
  });

  app.get("/test/not-found-error", () => {
    throw new NotFoundError("InventoryItem", "ITM-999");
  });

  app.get("/test/conflict-error", () => {
    throw new ConflictError(
      "Active RFID tag already assigned to another piece",
      "ERR_TAG_ALREADY_ACTIVE",
    );
  });

  app.get("/test/domain-error", () => {
    throw new DomainError(
      "Weight measurement exceeds balance tolerance threshold",
      "ERR_WEIGHT_OUT_OF_TOLERANCE",
      422,
    );
  });

  app.get("/test/unexpected-500", () => {
    throw new Error(
      "Database pool connection terminated unexpectedly: password=secret_db_pass",
    );
  });

  app.get("/test/headers-sent", (_req, res, next) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write("Partial chunk sent");
    next(new Error("Error after headers sent"));
  });

  // Catch unmatched routes
  app.use(notFoundHandler);

  // RFC 7807 Error Handler
  app.use(errorHandler);

  return app;
}

describe("RFC 7807 Problem Details Error Handler", () => {
  const app = createTestErrorApp();

  it("maps ValidationError to RFC 7807 400 Bad Request with invalidParams", async () => {
    const res = await request(app)
      .get("/test/validation-error")
      .set("x-request-id", "req_val_01");

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.headers["x-request-id"]).toBe("req_val_01");

    expect(res.body).toMatchObject({
      type: "https://jewelcore.com/errors/validation",
      title: "Validation Error",
      status: 400,
      detail: "SKU format is invalid",
      instance: "/test/validation-error",
      code: "ERR_VALIDATION",
      requestId: "req_val_01",
    });

    expect(res.body.invalidParams).toEqual([
      { name: "skuCode", reason: "Must match pattern SKU-[A-Z0-9]+" },
    ]);
    expect(res.body.timestamp).toBeDefined();
  });

  it("maps ZodError to RFC 7807 400 Bad Request with formatted invalidParams", async () => {
    const res = await request(app)
      .post("/test/zod-validation")
      .set("x-request-id", "req_zod_02")
      .send({ weightGrams: -5, storeId: "not-a-uuid" });

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.code).toBe("ERR_VALIDATION");
    expect(res.body.invalidParams.length).toBe(2);
    expect(
      res.body.invalidParams.some(
        (p: { name: string }) => p.name === "weightGrams",
      ),
    ).toBe(true);
    expect(
      res.body.invalidParams.some(
        (p: { name: string }) => p.name === "storeId",
      ),
    ).toBe(true);
  });

  it("maps malformed JSON request body to 400 ERR_MALFORMED_JSON", async () => {
    const res = await request(app)
      .post("/test/zod-validation")
      .set("Content-Type", "application/json")
      .send('{"invalid json: true');

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.code).toBe("ERR_MALFORMED_JSON");
    expect(res.body.title).toBe("Bad Request");
  });

  it("maps UnauthorizedError to RFC 7807 401 Unauthorized", async () => {
    const res = await request(app).get("/test/unauthorized-error");

    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({
      type: "https://jewelcore.com/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
      detail: "JWT bearer token expired",
      code: "ERR_UNAUTHORIZED",
    });
  });

  it("maps ForbiddenError to RFC 7807 403 Forbidden", async () => {
    const res = await request(app).get("/test/forbidden-error");

    expect(res.status).toBe(403);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({
      type: "https://jewelcore.com/errors/forbidden",
      title: "Forbidden",
      status: 403,
      detail: "Supervisory permission required to waive QC discrepancy",
      code: "ERR_FORBIDDEN",
    });
  });

  it("maps NotFoundError to RFC 7807 404 Not Found", async () => {
    const res = await request(app).get("/test/not-found-error");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({
      type: "https://jewelcore.com/errors/not-found",
      title: "Resource Not Found",
      status: 404,
      detail: "InventoryItem with identifier 'ITM-999' not found",
      code: "ERR_NOT_FOUND",
    });
  });

  it("maps ConflictError to RFC 7807 409 Conflict", async () => {
    const res = await request(app).get("/test/conflict-error");

    expect(res.status).toBe(409);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({
      type: "https://jewelcore.com/errors/conflict",
      title: "Conflict",
      status: 409,
      detail: "Active RFID tag already assigned to another piece",
      code: "ERR_TAG_ALREADY_ACTIVE",
    });
  });

  it("maps generic DomainError with custom status code", async () => {
    const res = await request(app).get("/test/domain-error");

    expect(res.status).toBe(422);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.code).toBe("ERR_WEIGHT_OUT_OF_TOLERANCE");
  });

  it("maps unhandled 500 error with masked generic detail and no leaked stack traces", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const res = await request(app).get("/test/unexpected-500");

      expect(res.status).toBe(500);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      expect(res.body).toMatchObject({
        type: "https://jewelcore.com/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail:
          "An unexpected internal error occurred. Please contact support with the request ID.",
        code: "ERR_INTERNAL_SERVER_ERROR",
      });

      // Crucial security checks: internal database credentials and stack traces NEVER returned
      expect(JSON.stringify(res.body)).not.toContain("password");
      expect(JSON.stringify(res.body)).not.toContain("secret_db_pass");
      expect(res.body.stack).toBeUndefined();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("handles unmatched routes with 404 RFC 7807 Problem Document", async () => {
    const res = await request(app).get("/api/v1/non-existent-endpoint");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.code).toBe("ERR_NOT_FOUND");
    expect(res.body.instance).toBe("/api/v1/non-existent-endpoint");
  });
});
