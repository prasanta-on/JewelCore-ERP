import { describe, it, expect, vi } from "vitest";
import {
  type DomainEventEnvelope,
  type DomainEventHandler,
  type IdempotencyStoragePort,
  type IdempotencyAcquireResult,
  NonRetryableError,
  RetryableError,
} from "@jewelcore/shared";
import { EventProcessor } from "../src/engine/eventProcessor.js";
import { pino } from "pino";

// Silent logger for tests
const silentLogger = pino({ level: "silent" });

class MockIdempotencyPort implements IdempotencyStoragePort {
  public records = new Map<
    string,
    { state: "ACQUIRED" | "COMPLETED" | "FAILED"; result?: unknown }
  >();

  async acquire(key: string): Promise<IdempotencyAcquireResult> {
    const existing = this.records.get(key);
    if (!existing) {
      this.records.set(key, { state: "ACQUIRED" });
      return { acquired: true, state: "ACQUIRED" };
    }
    return {
      acquired: false,
      state: existing.state,
      cachedResult: existing.result,
    };
  }

  async complete(key: string, result?: unknown): Promise<void> {
    this.records.set(key, { state: "COMPLETED", result });
  }

  async fail(key: string): Promise<void> {
    this.records.set(key, { state: "FAILED" });
  }
}

describe("EventProcessor & Idempotent Handling (Component D & E)", () => {
  const sampleEvent: DomainEventEnvelope = {
    id: "018f3a2b-7c3d-789a-bcde-f0123456789a",
    type: "inventory.item.born",
    version: 1,
    occurredAt: "2026-11-03T12:00:00.000Z",
    aggregateType: "InventoryItem",
    aggregateId: "018f3a2b-7c3d-789a-bcde-f0123456789b",
    correlationId: "req_test_correlation_456",
    payload: { sku: "SKU-TEST-001" },
    metadata: { actorType: "SYSTEM", schemaVersion: "1.0.0" },
  };

  it("processes domain event successfully and marks idempotency completed", async () => {
    const mockPort = new MockIdempotencyPort();
    const processor = new EventProcessor({
      idempotencyPort: mockPort,
      logger: silentLogger,
    });

    const handlerFn = vi.fn().mockResolvedValue(undefined);
    const handler: DomainEventHandler = {
      eventType: "inventory.item.born",
      handle: handlerFn,
    };

    processor.registerHandler(handler);

    await processor.process(sampleEvent, { jobId: "bullmq_job_1", attempt: 1 });

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(handlerFn).toHaveBeenCalledWith(
      sampleEvent,
      expect.objectContaining({
        correlationId: "req_test_correlation_456",
        jobId: "bullmq_job_1",
        attempt: 1,
      }),
    );

    const record = mockPort.records.get(`event:${sampleEvent.id}`);
    expect(record?.state).toBe("COMPLETED");
  });

  it("suppresses execution when duplicate event has already completed", async () => {
    const mockPort = new MockIdempotencyPort();
    mockPort.records.set(`event:${sampleEvent.id}`, { state: "COMPLETED" });

    const processor = new EventProcessor({
      idempotencyPort: mockPort,
      logger: silentLogger,
    });

    const handlerFn = vi.fn().mockResolvedValue(undefined);
    processor.registerHandler({
      eventType: "inventory.item.born",
      handle: handlerFn,
    });

    await processor.process(sampleEvent, { jobId: "bullmq_job_2", attempt: 1 });

    // Handler must NOT be invoked on duplicate completed events
    expect(handlerFn).not.toHaveBeenCalled();
  });

  it("throws RetryableError when event is currently in-flight by another instance", async () => {
    const mockPort = new MockIdempotencyPort();
    mockPort.records.set(`event:${sampleEvent.id}`, { state: "ACQUIRED" });

    const processor = new EventProcessor({
      idempotencyPort: mockPort,
      logger: silentLogger,
    });

    const handlerFn = vi.fn();
    processor.registerHandler({
      eventType: "inventory.item.born",
      handle: handlerFn,
    });

    await expect(
      processor.process(sampleEvent, { jobId: "bullmq_job_3", attempt: 1 }),
    ).rejects.toThrow(RetryableError);

    expect(handlerFn).not.toHaveBeenCalled();
  });

  it("propagates NonRetryableError and marks idempotency record failed", async () => {
    const mockPort = new MockIdempotencyPort();
    const processor = new EventProcessor({
      idempotencyPort: mockPort,
      logger: silentLogger,
    });

    const permanentError = new NonRetryableError("Corrupt payload detected");
    processor.registerHandler({
      eventType: "inventory.item.born",
      handle: vi.fn().mockRejectedValue(permanentError),
    });

    await expect(
      processor.process(sampleEvent, { jobId: "bullmq_job_4", attempt: 1 }),
    ).rejects.toThrow(NonRetryableError);

    const record = mockPort.records.get(`event:${sampleEvent.id}`);
    expect(record?.state).toBe("FAILED");
  });

  it("propagates transient error and marks idempotency record failed for retry", async () => {
    const mockPort = new MockIdempotencyPort();
    const processor = new EventProcessor({
      idempotencyPort: mockPort,
      logger: silentLogger,
    });

    const transientError = new RetryableError(
      "Database lock acquisition timeout",
    );
    processor.registerHandler({
      eventType: "inventory.item.born",
      handle: vi.fn().mockRejectedValue(transientError),
    });

    await expect(
      processor.process(sampleEvent, { jobId: "bullmq_job_5", attempt: 1 }),
    ).rejects.toThrow(RetryableError);

    const record = mockPort.records.get(`event:${sampleEvent.id}`);
    expect(record?.state).toBe("FAILED");
  });
});
