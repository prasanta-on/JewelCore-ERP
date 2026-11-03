import { describe, it, expect } from "vitest";
import {
  DomainError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  uuidSchema,
  GemstoneType,
  MeasurementUnit,
} from "../src/index.js";

describe("Shared Domain Types and RFC 7807 Errors", () => {
  it("instantiates DomainError with default status 400", () => {
    const error = new DomainError("Business rule violated", "ERR_RULE");
    expect(error.message).toBe("Business rule violated");
    expect(error.code).toBe("ERR_RULE");
    expect(error.status).toBe(400);
  });

  it("instantiates ValidationError with invalidParams", () => {
    const invalidParams = [{ name: "sku", reason: "SKU is required" }];
    const error = new ValidationError("Invalid input payload", invalidParams);
    expect(error.name).toBe("ValidationError");
    expect(error.status).toBe(400);
    expect(error.code).toBe("ERR_VALIDATION");
    expect(error.invalidParams).toEqual(invalidParams);
  });

  it("instantiates UnauthorizedError and ForbiddenError with correct 401/403 status codes", () => {
    const unauth = new UnauthorizedError();
    expect(unauth.status).toBe(401);
    expect(unauth.code).toBe("ERR_UNAUTHORIZED");

    const forbidden = new ForbiddenError("Cross-store access denied");
    expect(forbidden.status).toBe(403);
    expect(forbidden.code).toBe("ERR_FORBIDDEN");
  });

  it("validates UUIDs using uuidSchema", () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";
    const invalidUuid = "not-a-uuid";

    expect(uuidSchema.safeParse(validUuid).success).toBe(true);
    expect(uuidSchema.safeParse(invalidUuid).success).toBe(false);
  });

  it("exports gemstone and measurement unit domain enums", () => {
    expect(GemstoneType.PRECIOUS).toBe("PRECIOUS");
    expect(GemstoneType.SEMI_PRECIOUS).toBe("SEMI_PRECIOUS");
    expect(GemstoneType.ORGANIC_PEARL).toBe("ORGANIC_PEARL");
    expect(MeasurementUnit.CARAT).toBe("CARAT");
    expect(MeasurementUnit.GRAM).toBe("GRAM");
  });
});
