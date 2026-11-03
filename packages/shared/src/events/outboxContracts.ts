import { z } from "zod";
import type { DomainEventEnvelope } from "./eventEnvelope.js";

/**
 * Outbox Event Status states aligned with Logical Data Model Entity 43 (`outbox_events`).
 */
export const OutboxStatus = {
  PENDING: "PENDING",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
} as const;

export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus];

export const outboxStatusSchema = z.enum(["PENDING", "PUBLISHED", "FAILED"]);

/**
 * Represents a persisted or staged Outbox record (Entity 43).
 */
export interface OutboxEventRecord {
  id: string; // UUIDv7
  topic: string; // Event topic / routing key (e.g., 'INVENTORY.ITEM_APPROVED')
  payloadJson: Record<string, unknown>; // Serialized DomainEventEnvelope JSON
  status: OutboxStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: string; // ISO 8601 UTC
  publishedAt: string | null; // ISO 8601 UTC or null
}

export const outboxEventRecordSchema = z.object({
  id: z.string().uuid(),
  topic: z.string().min(1).max(128),
  payloadJson: z.record(z.unknown()),
  status: outboxStatusSchema,
  retryCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
});

/**
 * Minimal interface defining an active transactional database connection context.
 * Compliant with TransactionClient in @jewelcore/database without circular dependencies.
 */
export interface TransactionContext {
  readonly inTransaction: true;
  query<R = any>(
    text: string,
    values?: any[],
  ): Promise<{ rows: R[]; rowCount?: number | null }>;
}

/**
 * Storage Port for persisting and transitioning Outbox records in PostgreSQL.
 * Implementation remains an abstraction pending Milestone 0.4 physical schema approval.
 */
export interface OutboxStoragePort {
  /**
   * Staged insert of an outbox event within the calling transaction.
   * Invariant: Must execute within the exact same database transaction as the business mutation.
   */
  save(event: OutboxEventRecord, tx?: TransactionContext): Promise<void>;

  /**
   * Fetches pending records for dispatch (used by background relay worker).
   */
  fetchPending(limit: number): Promise<OutboxEventRecord[]>;

  /**
   * Updates status to PUBLISHED upon successful acknowledgment by BullMQ.
   */
  markDispatched(id: string, publishedAt?: string): Promise<void>;

  /**
   * Records failure attempt and error diagnostics.
   */
  markFailed(
    id: string,
    errorReason: string,
    retryCount: number,
  ): Promise<void>;
}

/**
 * Service port for registering domain events to the outbox during a business operation.
 */
export interface OutboxService {
  /**
   * Wraps domain event into an outbox record and persists it to the storage port.
   */
  registerEvent<TPayload extends Record<string, unknown>>(
    event: DomainEventEnvelope<TPayload>,
    tx?: TransactionContext,
  ): Promise<OutboxEventRecord>;
}

/**
 * Port for the outbox relay runner that polls PostgreSQL and dispatches to BullMQ.
 */
export interface OutboxRelayPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  dispatchPending(batchSize?: number): Promise<number>;
}

/**
 * Port for publishing events to the messaging transport (e.g. BullMQ / Redis).
 */
export interface EventPublisherPort {
  publish(
    topic: string,
    event: DomainEventEnvelope,
  ): Promise<{ messageId: string }>;
}
