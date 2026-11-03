import { describe, it, expect } from "vitest";
import {
  createDomainEvent,
  domainEventEnvelopeSchema,
  assertNoSecretsInPayload,
  ValidationError,
  RetryableError,
  NonRetryableError,
  isRetryableError,
  outboxEventRecordSchema,
  OutboxStatus,
} from "../src/index.js";

describe("Domain Event Architecture Contracts (Component A)", () => {
  const validEventParams = {
    id: "018f3a2b-7c3d-789a-bcde-f0123456789a",
    type: "inventory.item.born",
    version: 1,
    occurredAt: "2026-11-03T12:00:00.000Z",
    aggregateType: "InventoryItem",
    aggregateId: "018f3a2b-7c3d-789a-bcde-f0123456789b",
    orgId: "018f3a2b-7c3d-789a-bcde-f0123456789c",
    storeId: "018f3a2b-7c3d-789a-bcde-f0123456789d",
    correlationId: "req_test_correlation_12345",
    causationId: "cmd_qc_approval_987",
    payload: {
      sku: "SKU-RING-001",
      grossWeightGrams: 4.521,
      metalCode: "AU750",
    },
  };

  it("successfully creates and validates a valid domain event envelope", () => {
    const event = createDomainEvent(validEventParams);

    expect(event.id).toBe(validEventParams.id);
    expect(event.type).toBe("inventory.item.born");
    expect(event.version).toBe(1);
    expect(event.correlationId).toBe("req_test_correlation_12345");
    expect(event.payload.sku).toBe("SKU-RING-001");
    expect(event.metadata.actorType).toBe("SYSTEM");

    const validated = domainEventEnvelopeSchema.safeParse(event);
    expect(validated.success).toBe(true);
  });

  it("rejects event creation when correlationId contains illegal characters", () => {
    expect(() =>
      createDomainEvent({
        ...validEventParams,
        correlationId: "invalid correlation with spaces!",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects event creation when event type format is invalid", () => {
    expect(() =>
      createDomainEvent({
        ...validEventParams,
        type: "INVALID_UPPERCASE_TOPIC",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects event creation when version is zero or negative", () => {
    expect(() =>
      createDomainEvent({
        ...validEventParams,
        version: 0,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects event creation when aggregateId is empty", () => {
    expect(() =>
      createDomainEvent({
        ...validEventParams,
        aggregateId: "",
      }),
    ).toThrow(ValidationError);
  });

  it("detects and rejects passwords and secret credentials in event payloads", () => {
    expect(() =>
      assertNoSecretsInPayload({
        userId: "user-123",
        password: "SuperSecretPassword123!",
      }),
    ).toThrow(ValidationError);

    expect(() =>
      assertNoSecretsInPayload({
        apiKey: "sk_live_1234567890",
      }),
    ).toThrow(ValidationError);

    expect(() =>
      createDomainEvent({
        ...validEventParams,
        payload: {
          token: "jwt.token.here",
        },
      }),
    ).toThrow(ValidationError);
  });

  it("allows safe payload attributes without false-positive credential rejection", () => {
    expect(() =>
      assertNoSecretsInPayload({
        sku: "GOLD-RING-18K",
        weight: 12.5,
        hallmark: "BIS-916",
        description: "Diamond engagement ring with secret compartment style",
      }),
    ).not.toThrow();
  });
});

describe("Outbox Contracts & Error Classification (Component B & E)", () => {
  it("validates an OutboxEventRecord matching Logical Entity 43", () => {
    const record = {
      id: "018f3a2b-7c3d-789a-bcde-f0123456789a",
      topic: "INVENTORY.ITEM_BORN",
      payloadJson: { sku: "SKU-RING-001" },
      status: OutboxStatus.PENDING,
      retryCount: 0,
      lastError: null,
      createdAt: "2026-11-03T12:00:00.000Z",
      publishedAt: null,
    };

    const parseResult = outboxEventRecordSchema.safeParse(record);
    expect(parseResult.success).toBe(true);
  });

  it("classifies RetryableError and NonRetryableError accurately", () => {
    const transientErr = new RetryableError("Connection reset by peer");
    const permanentErr = new NonRetryableError(
      "Payload schema validation failure",
    );
    const standardErr = new Error("Generic unexpected error");

    expect(isRetryableError(transientErr)).toBe(true);
    expect(isRetryableError(permanentErr)).toBe(false);
    expect(isRetryableError(standardErr)).toBe(true);

    expect(transientErr.status).toBe(503);
    expect(permanentErr.status).toBe(422);
  });
});
