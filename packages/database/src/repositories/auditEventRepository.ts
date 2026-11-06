import {
  type CreateAuditEventInput,
  type ListAuditEventsQuery,
  type AuditEventRecord,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = {
  query: <T = any>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

interface AuditEventRow {
  id: string;
  organization_id: string;
  store_id: string | null;
  actor_user_id: string;
  actor_ip_address: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  payload_before_json: Record<string, unknown> | null;
  payload_after_json: Record<string, unknown> | null;
  reason: string | null;
  occurred_at: Date;
  created_at: Date;
}

export function mapRowToAuditEvent(row: AuditEventRow): AuditEventRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    actorUserId: row.actor_user_id,
    actorIpAddress: row.actor_ip_address,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    payloadBeforeJson: row.payload_before_json,
    payloadAfterJson: row.payload_after_json,
    reason: row.reason,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

/**
 * Persists an immutable compliance audit event record (FEAT-GOV-02, Entity 40 / INV-09).
 */
export async function recordAuditEvent(
  input: CreateAuditEventInput & {
    organizationId: string;
    actorUserId: string;
  },
  clientOverride?: Queryable,
): Promise<AuditEventRecord> {
  const executor = clientOverride ?? getPool();
  const id = uuidv7();

  const query = `
    INSERT INTO audit_events (
      id,
      organization_id,
      store_id,
      actor_user_id,
      actor_ip_address,
      action,
      resource_type,
      resource_id,
      payload_before_json,
      payload_after_json,
      reason,
      occurred_at,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, clock_timestamp()), clock_timestamp())
    RETURNING *;
  `;

  const values = [
    id,
    input.organizationId,
    input.storeId ?? null,
    input.actorUserId,
    input.actorIpAddress ?? null,
    input.action,
    input.resourceType,
    input.resourceId,
    input.payloadBeforeJson ? JSON.stringify(input.payloadBeforeJson) : null,
    input.payloadAfterJson ? JSON.stringify(input.payloadAfterJson) : null,
    input.reason ?? null,
    input.occurredAt ?? null,
  ];

  const result = await executor.query<AuditEventRow>(query, values);
  return mapRowToAuditEvent(result.rows[0]!);
}

/**
 * Retrieves a compliance audit event record by ID with organization boundary enforcement.
 */
export async function getAuditEventById(
  id: string,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<AuditEventRecord | null> {
  const executor = clientOverride ?? getPool();
  const query = `
    SELECT * FROM audit_events
    WHERE id = $1 AND organization_id = $2
  `;

  const result = await executor.query<AuditEventRow>(query, [
    id,
    organizationId,
  ]);
  return result.rows[0] ? mapRowToAuditEvent(result.rows[0]) : null;
}

/**
 * Lists compliance audit events matching criteria with filtering, tenant isolation, and pagination.
 */
export async function listAuditEvents(
  filters: ListAuditEventsQuery & { organizationId: string },
  clientOverride?: Queryable,
): Promise<AuditEventRecord[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: unknown[] = [filters.organizationId];
  let paramIdx = 2;

  if (filters.storeId) {
    conditions.push(`store_id = $${paramIdx++}`);
    values.push(filters.storeId);
  }

  if (filters.actorUserId) {
    conditions.push(`actor_user_id = $${paramIdx++}`);
    values.push(filters.actorUserId);
  }

  if (filters.action) {
    conditions.push(`action = $${paramIdx++}`);
    values.push(filters.action);
  }

  if (filters.resourceType) {
    conditions.push(`resource_type = $${paramIdx++}`);
    values.push(filters.resourceType);
  }

  if (filters.resourceId) {
    conditions.push(`resource_id = $${paramIdx++}`);
    values.push(filters.resourceId);
  }

  if (filters.fromDate) {
    conditions.push(`occurred_at >= $${paramIdx++}`);
    values.push(filters.fromDate);
  }

  if (filters.toDate) {
    conditions.push(`occurred_at <= $${paramIdx++}`);
    values.push(filters.toDate);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const query = `
    SELECT * FROM audit_events
    WHERE ${conditions.join(" AND ")}
    ORDER BY occurred_at DESC, id DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;

  values.push(limit, offset);

  const result = await executor.query<AuditEventRow>(query, values);
  return result.rows.map(mapRowToAuditEvent);
}
