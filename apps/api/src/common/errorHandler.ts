import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import { ZodError } from "zod";
import {
  type ProblemDocument,
  DomainError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "@jewelcore/shared";
import { logger } from "./logger.js";

const ERROR_TYPE_BASE = "https://jewelcore.com/errors";

/**
 * Maps known exceptions and HTTP statuses to RFC 7807 problem types and titles.
 */
function getProblemTypeAndTitle(
  status: number,
  code: string,
): { type: string; title: string } {
  switch (status) {
    case 400:
      return {
        type: `${ERROR_TYPE_BASE}/validation`,
        title: code === "ERR_VALIDATION" ? "Validation Error" : "Bad Request",
      };
    case 401:
      return {
        type: `${ERROR_TYPE_BASE}/unauthorized`,
        title: "Unauthorized",
      };
    case 403:
      return {
        type: `${ERROR_TYPE_BASE}/forbidden`,
        title: "Forbidden",
      };
    case 404:
      return {
        type: `${ERROR_TYPE_BASE}/not-found`,
        title: "Resource Not Found",
      };
    case 409:
      return {
        type: `${ERROR_TYPE_BASE}/conflict`,
        title: "Conflict",
      };
    default:
      return {
        type: `${ERROR_TYPE_BASE}/internal-server-error`,
        title: "Internal Server Error",
      };
  }
}

/**
 * 404 handler for routes that do not match any defined endpoint.
 */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(new NotFoundError("Route", req.originalUrl));
}

/**
 * Centralized Express 5 RFC 7807 Problem Details error handler.
 *
 * Guaranteed Behaviors:
 * 1. Responds with Content-Type: `application/problem+json`.
 * 2. Formats all responses into standardized RFC 7807 Problem Details JSON.
 * 3. Maps DomainError, ValidationError, ZodError, and standard HTTP errors to appropriate status codes.
 * 4. Injects correlation ID (`requestId`) and request URI (`instance`).
 * 5. Masks internal infrastructure/database details and stack traces for 500 errors.
 * 6. Logs internal errors with full metadata using Pino.
 * 7. Safely delegates to Express if headers have already been sent.
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // If response headers have already been transmitted, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const requestId =
    req.requestId ?? (req.headers["x-request-id"] as string) ?? "unknown";
  const instance = req.originalUrl || req.url;
  const timestamp = new Date().toISOString();

  let status = 500;
  let code = "ERR_INTERNAL_SERVER_ERROR";
  let detail =
    "An unexpected internal error occurred. Please contact support with the request ID.";
  let invalidParams: Array<{ name: string; reason: string }> | undefined;

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    status = 400;
    code = "ERR_VALIDATION";
    detail = "The request payload failed schema validation";
    invalidParams = err.issues.map((issue) => ({
      name: issue.path.join("."),
      reason: issue.message,
    }));
  }
  // 2. Express JSON Parsing Syntax Errors
  else if (
    err instanceof SyntaxError &&
    "status" in err &&
    (err as { status: unknown }).status === 400 &&
    "body" in err
  ) {
    status = 400;
    code = "ERR_MALFORMED_JSON";
    detail = "Malformed JSON payload in request body";
  }
  // 3. Known Domain Errors (from @jewelcore/shared)
  else if (err instanceof ValidationError) {
    status = 400;
    code = err.code || "ERR_VALIDATION";
    detail = err.message;
    invalidParams = err.invalidParams;
  } else if (err instanceof UnauthorizedError) {
    status = 401;
    code = err.code || "ERR_UNAUTHORIZED";
    detail = err.message;
  } else if (err instanceof ForbiddenError) {
    status = 403;
    code = err.code || "ERR_FORBIDDEN";
    detail = err.message;
  } else if (err instanceof NotFoundError) {
    status = 404;
    code = err.code || "ERR_NOT_FOUND";
    detail = err.message;
  } else if (err instanceof ConflictError) {
    status = 409;
    code = err.code || "ERR_CONFLICT";
    detail = err.message;
  } else if (err instanceof DomainError) {
    status = err.status || 400;
    code = err.code || "ERR_DOMAIN";
    detail = err.message;
  }
  // 4. Generic or Unknown Internal Errors
  else {
    status = 500;
    code = "ERR_INTERNAL_SERVER_ERROR";
    // In development or test, allow original error message for debugging if explicitly enabled
    if (process.env.NODE_ENV === "development") {
      detail = err instanceof Error ? err.message : String(err);
    } else {
      detail =
        "An unexpected internal error occurred. Please contact support with the request ID.";
    }
  }

  // Structured logging of error
  const reqLogger = (req as Request & { log?: typeof logger }).log ?? logger;
  if (status >= 500) {
    reqLogger.error(
      {
        err,
        requestId,
        status,
        code,
        url: instance,
        method: req.method,
      },
      `Internal Server Error on ${req.method} ${instance}`,
    );
  } else {
    reqLogger.warn(
      {
        requestId,
        status,
        code,
        detail,
        url: instance,
        method: req.method,
      },
      `Client Error (${status}) on ${req.method} ${instance}: ${detail}`,
    );
  }

  const { type, title } = getProblemTypeAndTitle(status, code);

  const problemResponse: ProblemDocument = {
    type,
    title,
    status,
    detail,
    instance,
    code,
    requestId,
    timestamp,
    ...(invalidParams && invalidParams.length > 0 ? { invalidParams } : {}),
  };

  res.setHeader("Content-Type", "application/problem+json");
  res.setHeader("x-request-id", requestId);
  res.status(status).json(problemResponse);
};
