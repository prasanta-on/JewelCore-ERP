import { z } from "zod";

/**
 * RFC 7807 Problem Details Specification Interface
 */
export interface ProblemDocument {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  requestId?: string;
  timestamp: string;
  invalidParams?: Array<{
    name: string;
    reason: string;
  }>;
}

/**
 * Base Domain Error class representing known application failures
 */
export class DomainError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: string = "ERR_DOMAIN",
    status: number = 400,
    details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DomainError {
  public readonly invalidParams?: Array<{ name: string; reason: string }>;

  constructor(
    message: string,
    invalidParams?: Array<{ name: string; reason: string }>,
    details?: unknown,
  ) {
    super(message, "ERR_VALIDATION", 400, details);
    this.name = "ValidationError";
    this.invalidParams = invalidParams;
  }
}

export class BadRequestError extends DomainError {
  constructor(
    message: string,
    code: string = "ERR_BAD_REQUEST",
    details?: unknown,
  ) {
    super(message, code, 400, details);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends DomainError {
  constructor(
    message: string = "Authentication credentials missing or invalid",
    code: string = "ERR_UNAUTHORIZED",
  ) {
    super(message, code, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(
    message: string = "Insufficient permissions or store context violation",
    code: string = "ERR_FORBIDDEN",
  ) {
    super(message, code, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, identifier?: string) {
    const detail = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(detail, "ERR_NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, code: string = "ERR_CONFLICT") {
    super(message, code, 409);
    this.name = "ConflictError";
  }
}

export class UnprocessableEntityError extends DomainError {
  constructor(
    message: string,
    code: string = "ERR_UNPROCESSABLE_ENTITY",
    details?: unknown,
  ) {
    super(message, code, 422, details);
    this.name = "UnprocessableEntityError";
  }
}

/**
 * Common Zod Schemas
 */
export const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * JewelCore Master Domain Enums (aligned with Logical Data Model v0.3.3)
 */
export const GemstoneType = {
  PRECIOUS: "PRECIOUS",
  SEMI_PRECIOUS: "SEMI_PRECIOUS",
  ORGANIC_PEARL: "ORGANIC_PEARL",
} as const;

export type GemstoneType = (typeof GemstoneType)[keyof typeof GemstoneType];

export const MeasurementUnit = {
  CARAT: "CARAT",
  GRAM: "GRAM",
} as const;

export type MeasurementUnit =
  (typeof MeasurementUnit)[keyof typeof MeasurementUnit];

/**
 * Event Architecture & Transactional Outbox Exports (FEAT-FOUND-04)
 */
export * from "./events/errorContracts.js";
export * from "./events/eventEnvelope.js";
export * from "./events/outboxContracts.js";
export * from "./events/idempotencyContracts.js";

/**
 * Identity & Access Management Domain Exports (FEAT-IAM-01)
 */
export * from "./iam/index.js";
export * from "./storage/index.js";
export * from "./taxonomy/index.js";
export * from "./procurement/index.js";
export * from "./governance/index.js";
export * from "./qc/index.js";
