import type { Logger } from "pino";
import {
  type DomainEventEnvelope,
  type DomainEventHandler,
  type IdempotencyStoragePort,
  NonRetryableError,
  RetryableError,
} from "@jewelcore/shared";
import { workerLogger, createJobLogger } from "../infrastructure/logger.js";

export interface EventProcessorOptions {
  queueName?: string;
  idempotencyPort: IdempotencyStoragePort;
  logger?: Logger;
  lockTtlMs?: number;
}

export interface JobMetadata {
  jobId?: string;
  attempt?: number;
}

/**
 * Generic Idempotent Event Processor Engine.
 *
 * Enforces:
 * 1. Distributed correlation ID propagation.
 * 2. Idempotency acquisition and duplicate event suppression.
 * 3. Execution duration tracking and structured Pino logging.
 * 4. Error classification (Retryable vs NonRetryable).
 */
export class EventProcessor {
  private readonly handlers = new Map<string, DomainEventHandler[]>();
  private readonly idempotencyPort: IdempotencyStoragePort;
  private readonly logger: Logger;
  private readonly queueName: string;
  private readonly lockTtlMs: number;

  constructor(options: EventProcessorOptions) {
    this.idempotencyPort = options.idempotencyPort;
    this.logger = options.logger ?? workerLogger;
    this.queueName = options.queueName ?? "default";
    this.lockTtlMs = options.lockTtlMs ?? 60000; // 60s default TTL
  }

  /**
   * Registers a domain event handler for a specific event type.
   */
  public registerHandler(handler: DomainEventHandler): void {
    const existing = this.handlers.get(handler.eventType) ?? [];
    existing.push(handler);
    this.handlers.set(handler.eventType, existing);
  }

  /**
   * Processes a single domain event with idempotency, logging, and error categorization.
   */
  public async process(
    event: DomainEventEnvelope,
    jobMeta: JobMetadata = {},
  ): Promise<void> {
    const correlationId = event.correlationId;
    const jobLogger = createJobLogger(this.logger, {
      jobId: jobMeta.jobId,
      queueName: this.queueName,
      correlationId,
      eventId: event.id,
      eventType: event.type,
    });

    const matchingHandlers = this.handlers.get(event.type) ?? [];
    if (matchingHandlers.length === 0) {
      jobLogger.debug(
        "No registered handlers for event type; skipping execution",
      );
      return;
    }

    const idempotencyKey = `event:${event.id}`;

    // 1. Acquire Idempotency Lock
    const acquireResult = await this.idempotencyPort.acquire(
      idempotencyKey,
      this.lockTtlMs,
    );

    if (!acquireResult.acquired) {
      if (acquireResult.state === "COMPLETED") {
        jobLogger.info(
          "Duplicate event detected; execution was already completed. Safely acknowledged.",
        );
        return;
      }

      if (acquireResult.state === "ACQUIRED") {
        jobLogger.warn(
          "Event currently in-flight by another worker instance. Triggering retry.",
        );
        throw new RetryableError(
          `Event '${event.id}' currently in-flight by another worker instance`,
        );
      }
    }

    // 2. Execute Matching Handlers
    const start = Date.now();
    try {
      for (const handler of matchingHandlers) {
        await handler.handle(event, {
          correlationId,
          jobId: jobMeta.jobId,
          attempt: jobMeta.attempt ?? 1,
          timestamp: new Date().toISOString(),
        });
      }

      const durationMs = Date.now() - start;
      jobLogger.info({ durationMs }, "Domain event handled successfully");

      // 3. Mark Idempotency Record Completed
      await this.idempotencyPort.complete(idempotencyKey);
    } catch (err: unknown) {
      const durationMs = Date.now() - start;

      if (err instanceof NonRetryableError) {
        jobLogger.error(
          {
            err: err.message,
            code: err.code,
            durationMs,
          },
          "Non-retryable domain error during event processing; aborting retries",
        );
        await this.idempotencyPort.fail(idempotencyKey, err.message);
        throw err;
      }

      const message = err instanceof Error ? err.message : String(err);
      jobLogger.error(
        {
          err: message,
          durationMs,
        },
        "Retryable failure during event processing; releasing lock for retry",
      );
      await this.idempotencyPort.fail(idempotencyKey, message);
      throw err;
    }
  }
}
