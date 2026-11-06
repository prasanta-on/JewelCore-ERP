import { z } from "zod";

/**
 * Zod schema for validating audit event creation payloads (FEAT-GOV-02, Entity 40).
 */
export const createAuditEventSchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID format").optional(),
  storeId: z.string().uuid("Invalid store ID format").nullable().optional(),
  actorUserId: z.string().uuid("Invalid actor user ID format").optional(),
  actorIpAddress: z.string().max(45).nullable().optional(),
  action: z.string().min(1, "Action cannot be empty").max(100),
  resourceType: z.string().min(1, "Resource type cannot be empty").max(60),
  resourceId: z.string().uuid("Invalid resource ID format"),
  payloadBeforeJson: z.record(z.unknown()).nullable().optional(),
  payloadAfterJson: z.record(z.unknown()).nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
  occurredAt: z.coerce.date().optional(),
});

export type CreateAuditEventInput = z.infer<typeof createAuditEventSchema>;

/**
 * Zod schema for querying and filtering audit events.
 */
export const listAuditEventsQuerySchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID format").optional(),
  storeId: z.string().uuid("Invalid store ID format").optional(),
  actorUserId: z.string().uuid("Invalid actor user ID format").optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().uuid("Invalid resource ID format").optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListAuditEventsQuery = z.infer<typeof listAuditEventsQuerySchema>;

/**
 * Strongly typed interface for immutable compliance audit event records.
 */
export interface AuditEventRecord {
  id: string;
  organizationId: string;
  storeId: string | null;
  actorUserId: string;
  actorIpAddress: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  payloadBeforeJson: Record<string, unknown> | null;
  payloadAfterJson: Record<string, unknown> | null;
  reason: string | null;
  occurredAt: Date;
  createdAt: Date;
}
