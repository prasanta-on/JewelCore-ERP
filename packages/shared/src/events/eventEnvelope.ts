import { z } from "zod";
import { ValidationError } from "../index.js";

/**
 * Standard correlation ID pattern: alphanumeric with underscores and hyphens, 1-64 characters.
 */
export const correlationIdRegex = /^[a-zA-Z0-9_\-]{1,64}$/;

/**
 * Standard domain event type pattern: dot-separated naming convention (e.g., 'inventory.item.born', 'qc.session.completed').
 */
export const eventTypeRegex = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/;

/**
 * Sensitive field names that are strictly forbidden inside domain event payloads.
 */
const FORBIDDEN_SECRET_KEYS = [
  "password",
  "token",
  "secret",
  "apikey",
  "credential",
  "authorization",
  "refreshtoken",
  "accesstoken",
];

/**
 * Recursively inspects an object for any unmasked credential or secret keys.
 */
export function assertNoSecretsInPayload(
  payload: unknown,
  path: string = "",
): void {
  if (!payload || typeof payload !== "object") {
    return;
  }

  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      assertNoSecretsInPayload(payload[i], `${path}[${i}]`);
    }
    return;
  }

  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const forbidden of FORBIDDEN_SECRET_KEYS) {
      if (normalizedKey.includes(forbidden)) {
        throw new ValidationError(
          `Domain event payload contains prohibited sensitive field: '${key}' at path '${path ? `${path}.${key}` : key}'`,
          [
            {
              name: key,
              reason:
                "Credentials and sensitive secrets must never be embedded in domain events",
            },
          ],
        );
      }
    }
    assertNoSecretsInPayload(record[key], path ? `${path}.${key}` : key);
  }
}

/**
 * Zod schema for Event Metadata.
 */
export const eventMetadataSchema = z
  .object({
    actorId: z.string().uuid().optional(),
    actorType: z.enum(["USER", "SYSTEM", "API_CLIENT"]).default("SYSTEM"),
    clientIp: z.string().ip().optional(),
    userAgent: z.string().max(256).optional(),
    schemaVersion: z.string().default("1.0.0"),
  })
  .passthrough();

export type EventMetadata = z.infer<typeof eventMetadataSchema>;

/**
 * Generic Zod schema for the versioned Domain Event Envelope.
 */
export const domainEventEnvelopeSchema = z.object({
  id: z.string().uuid({ message: "Event ID must be a valid UUIDv7 or UUID" }),
  type: z.string().min(3).max(128).regex(eventTypeRegex, {
    message:
      "Event type must follow dot-separated lowercase format (e.g. 'inventory.item.born')",
  }),
  version: z
    .number()
    .int()
    .positive({ message: "Event version must be a positive integer >= 1" }),
  occurredAt: z.string().datetime({
    message: "occurredAt must be a valid ISO 8601 UTC timestamp string",
  }),
  aggregateType: z
    .string()
    .min(1)
    .max(64, { message: "aggregateType must be between 1 and 64 characters" }),
  aggregateId: z
    .string()
    .min(1)
    .max(64, { message: "aggregateId must be provided" }),
  orgId: z.string().uuid({ message: "orgId must be a valid UUID" }).optional(),
  storeId: z
    .string()
    .uuid({ message: "storeId must be a valid UUID" })
    .optional(),
  correlationId: z.string().regex(correlationIdRegex, {
    message:
      "correlationId must be 1-64 characters matching /^[a-zA-Z0-9_-]+$/",
  }),
  causationId: z.string().max(64).optional(),
  payload: z.record(z.unknown()),
  metadata: eventMetadataSchema.default({
    actorType: "SYSTEM",
    schemaVersion: "1.0.0",
  }),
});

/**
 * Strongly typed interface for a Domain Event Envelope.
 */
export interface DomainEventEnvelope<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata = EventMetadata,
> {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  aggregateType: string;
  aggregateId: string;
  orgId?: string;
  storeId?: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
  metadata: TMetadata;
}

/**
 * Factory helper for creating and strictly validating a domain event envelope.
 */
export function createDomainEvent<
  TPayload extends Record<string, unknown>,
  TMetadata extends EventMetadata = EventMetadata,
>(params: {
  id: string;
  type: string;
  version?: number;
  occurredAt?: string;
  aggregateType: string;
  aggregateId: string;
  orgId?: string;
  storeId?: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
  metadata?: Partial<TMetadata>;
}): DomainEventEnvelope<TPayload, TMetadata> {
  // 1. Assert no credentials or secrets exist in the payload
  assertNoSecretsInPayload(params.payload);

  const event: DomainEventEnvelope<TPayload, TMetadata> = {
    id: params.id,
    type: params.type,
    version: params.version ?? 1,
    occurredAt: params.occurredAt ?? new Date().toISOString(),
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    orgId: params.orgId,
    storeId: params.storeId,
    correlationId: params.correlationId,
    causationId: params.causationId,
    payload: params.payload,
    metadata: {
      actorType: "SYSTEM",
      schemaVersion: "1.0.0",
      ...params.metadata,
    } as TMetadata,
  };

  // 2. Validate envelope schema
  const parseResult = domainEventEnvelopeSchema.safeParse(event);
  if (!parseResult.success) {
    const invalidParams = parseResult.error.issues.map((issue) => ({
      name: issue.path.join("."),
      reason: issue.message,
    }));
    throw new ValidationError(
      "Invalid domain event envelope structure",
      invalidParams,
      parseResult.error,
    );
  }

  return event;
}
