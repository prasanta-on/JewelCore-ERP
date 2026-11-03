import type { DomainEventEnvelope } from "./eventEnvelope.js";

/**
 * Processing states for an idempotent operation.
 */
export const IdempotencyState = {
  ACQUIRED: "ACQUIRED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export type IdempotencyState =
  (typeof IdempotencyState)[keyof typeof IdempotencyState];

/**
 * Result returned when attempting to acquire an idempotency lock/record.
 */
export interface IdempotencyAcquireResult {
  /**
   * True if this is the first execution and the caller has acquired the lock to process.
   * False if the operation is already in-flight or was previously processed.
   */
  acquired: boolean;

  /**
   * Current known state if acquired is false.
   */
  state?: IdempotencyState;

  /**
   * Cached result if previously completed.
   */
  cachedResult?: unknown;
}

/**
 * Injectable Storage Port for Idempotent Execution Guards.
 *
 * NOTE: Production implementations MUST use a durable store (PostgreSQL or Redis SETNX with TTL).
 * In-memory Map/Set structures are strictly prohibited in multi-node/production deployments.
 */
export interface IdempotencyStoragePort {
  /**
   * Attempts to acquire an atomic processing lock for a specific key.
   * @param key Unique idempotency key (e.g. event ID or 'queue:jobId')
   * @param ttlMs Time-to-live in milliseconds to protect against abandoned locks
   */
  acquire(key: string, ttlMs?: number): Promise<IdempotencyAcquireResult>;

  /**
   * Marks the operation as successfully completed, optionally storing cached execution results.
   */
  complete(key: string, result?: unknown): Promise<void>;

  /**
   * Marks the operation as failed or releases the lock so retries can re-attempt.
   */
  fail(key: string, reason: string): Promise<void>;
}

/**
 * Contextual metadata provided to domain event handlers during execution.
 */
export interface EventHandlingContext {
  correlationId: string;
  jobId?: string;
  attempt: number;
  timestamp: string;
}

/**
 * Reusable contract for asynchronous domain event handlers in worker processes.
 */
export interface DomainEventHandler<
  TEvent extends DomainEventEnvelope = DomainEventEnvelope,
> {
  /**
   * Dot-separated event type pattern this handler subscribes to (e.g. 'inventory.item.born', 'qc.session.*').
   */
  readonly eventType: string;

  /**
   * Executes the business side-effect or integration action.
   * Must be idempotent and safe against repeated delivery.
   */
  handle(event: TEvent, context: EventHandlingContext): Promise<void>;
}
