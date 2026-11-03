import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// Extend Express Request interface with correlation ID properties
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      id: string;
    }
  }
}

export const CORRELATION_ID_HEADER = "x-request-id";

// Valid correlation ID: alphanumeric, underscores, hyphens, between 1 and 64 characters
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_\-]{1,64}$/;

/**
 * Validates whether an incoming correlation ID matches safe character set and length constraints.
 * Protects against log injection, HTTP header injection, and buffer overruns.
 */
export function isValidCorrelationId(id: unknown): id is string {
  if (typeof id !== "string") {
    return false;
  }
  return VALID_REQUEST_ID_REGEX.test(id);
}

/**
 * Generates a cryptographically secure, unique request identifier.
 */
export function generateCorrelationId(): string {
  const hex = crypto.randomUUID().replace(/-/g, "");
  return `req_${hex}`;
}

/**
 * Express middleware for request correlation ID lifecycle management.
 *
 * 1. Checks incoming `x-request-id` header.
 * 2. If valid, retains it. If missing or invalid, generates a safe cryptographically secure replacement.
 * 3. Binds the correlation ID to `req.requestId` and `req.id`.
 * 4. Sets outgoing response header `x-request-id`.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incomingId = req.headers[CORRELATION_ID_HEADER];

  let requestId: string;
  if (isValidCorrelationId(incomingId)) {
    requestId = incomingId;
  } else {
    requestId = generateCorrelationId();
  }

  req.requestId = requestId;
  req.id = requestId;

  res.setHeader(CORRELATION_ID_HEADER, requestId);

  next();
}
