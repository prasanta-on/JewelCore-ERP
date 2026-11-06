import { DomainError } from "../errors.js";

/**
 * Error indicating a transient failure that should be retried by the worker queue
 * (e.g., database deadlock, Redis disconnect, downstream rate-limit).
 */
export class RetryableError extends DomainError {
  constructor(
    message: string,
    code: string = "ERR_RETRYABLE",
    details?: unknown,
  ) {
    super(message, code, 503, details);
    this.name = "RetryableError";
  }
}

/**
 * Error indicating a fatal or permanent failure that should NOT be retried
 * (e.g., malformed payload, schema validation violation, invariant corruption).
 * When thrown, the worker should immediately abort retries and route the job to DLQ.
 */
export class NonRetryableError extends DomainError {
  constructor(
    message: string,
    code: string = "ERR_NON_RETRYABLE",
    details?: unknown,
  ) {
    super(message, code, 422, details);
    this.name = "NonRetryableError";
  }
}

/**
 * Type guard to determine if an error is considered transient/retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NonRetryableError) {
    return false;
  }
  if (error instanceof RetryableError) {
    return true;
  }
  // Default: unclassified errors are treated as retryable by BullMQ unless explicitly NonRetryable
  return true;
}
