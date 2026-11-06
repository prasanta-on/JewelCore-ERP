import type { Pool, PoolClient } from "pg";
import {
  type RfidTagRecord,
  type CreateRfidTagInput,
  type UpdateRfidTagStatusInput,
  type ListRfidTagsQuery,
  RfidTagStatus,
  RfidFrequencyBand,
  NotFoundError,
  ConflictError,
  BadRequestError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface RfidTagRow {
  id: string;
  organization_id: string;
  epc: string;
  tid: string | null;
  status: RfidTagStatus;
  frequency_band: RfidFrequencyBand;
  encoded_at: Date | null;
  retired_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToRfidTag(row: RfidTagRow): RfidTagRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    epc: row.epc,
    tid: row.tid,
    status: row.status,
    frequencyBand: row.frequency_band,
    encodedAt: row.encoded_at,
    retiredAt: row.retired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Registers a new RFID hardware transponder tag into the master registry (Entity 35 - FEAT-RFID-01).
 *
 * Enforces:
 * - Organization-scoped EPC uniqueness (ERR_DUPLICATE_EPC / 409)
 * - Initial status initialized to UNENCODED
 * - Default frequency band UHF 860-960 MHz
 */
export async function createRfidTag(
  input: CreateRfidTagInput & { organizationId: string },
  _context?: { userId?: string },
  clientOverride?: Queryable,
): Promise<RfidTagRecord> {
  const executor = clientOverride ?? getPool();

  // 1. Check for duplicate EPC within the organization
  const existingRes = await executor.query<{ id: string }>(
    `SELECT id FROM rfid_tags WHERE organization_id = $1 AND epc = $2`,
    [input.organizationId, input.epc],
  );

  if (existingRes.rows.length > 0) {
    throw new ConflictError(
      `RFID tag with EPC '${input.epc}' already exists in this organization`,
      "ERR_DUPLICATE_EPC",
    );
  }

  const id = uuidv7();
  const status = RfidTagStatus.UNENCODED;
  const frequencyBand =
    input.frequencyBand ?? RfidFrequencyBand.UHF_860_960_MHZ;

  try {
    const res = await executor.query<RfidTagRow>(
      `
      INSERT INTO rfid_tags (
        id,
        organization_id,
        epc,
        tid,
        status,
        frequency_band,
        encoded_at,
        retired_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NULL, NULL,
        clock_timestamp(), clock_timestamp()
      )
      RETURNING *;
      `,
      [
        id,
        input.organizationId,
        input.epc,
        input.tid ?? null,
        status,
        frequencyBand,
      ],
    );

    const row = res.rows[0];
    if (!row) {
      throw new Error("Failed to register RFID tag");
    }

    return mapRowToRfidTag(row);
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new ConflictError(
        `RFID tag with EPC '${input.epc}' already exists in this organization`,
        "ERR_DUPLICATE_EPC",
      );
    }
    throw err;
  }
}

/**
 * Retrieves an RFID tag by surrogate primary UUID.
 */
export async function getRfidTagById(
  id: string,
  clientOverride?: Queryable,
): Promise<RfidTagRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<RfidTagRow>(
    `SELECT * FROM rfid_tags WHERE id = $1`,
    [id],
  );

  return res.rows[0] ? mapRowToRfidTag(res.rows[0]) : null;
}

/**
 * Retrieves an RFID tag by organization ID and EPC identifier.
 */
export async function getRfidTagByEpc(
  organizationId: string,
  epc: string,
  clientOverride?: Queryable,
): Promise<RfidTagRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<RfidTagRow>(
    `SELECT * FROM rfid_tags WHERE organization_id = $1 AND epc = $2`,
    [organizationId, epc],
  );

  return res.rows[0] ? mapRowToRfidTag(res.rows[0]) : null;
}

/**
 * Updates an RFID tag's lifecycle status with state machine transition rules (FEAT-RFID-01).
 *
 * Rules:
 * - Prohibits transitions out of terminal states (RETIRED, DAMAGED) -> 422 ERR_INVALID_TAG_LIFECYCLE_STATE
 * - Prohibits no-op transitions -> 400 ERR_NOOP_STATE_TRANSITION
 * - Sets encoded_at when progressing to ACTIVE
 * - Sets retired_at when progressing to RETIRED
 */
export async function updateRfidTagStatus(
  id: string,
  input: UpdateRfidTagStatusInput,
  _context?: { userId?: string },
  clientOverride?: Queryable,
): Promise<RfidTagRecord> {
  const executor = clientOverride ?? getPool();

  const existingRes = await executor.query<RfidTagRow>(
    `SELECT * FROM rfid_tags WHERE id = $1 FOR UPDATE`,
    [id],
  );

  const tag = existingRes.rows[0];
  if (!tag) {
    throw new NotFoundError(
      `RFID tag with ID '${id}' not found`,
      "ERR_RFID_TAG_NOT_FOUND",
    );
  }

  // 1. No-op validation
  if (tag.status === input.status) {
    throw new BadRequestError(
      `RFID tag is already in status '${input.status}'`,
      "ERR_NOOP_STATE_TRANSITION",
    );
  }

  // 2. Terminal state transition prohibition
  if (
    tag.status === RfidTagStatus.RETIRED ||
    tag.status === RfidTagStatus.DAMAGED
  ) {
    throw new UnprocessableEntityError(
      `Cannot transition RFID tag from terminal status '${tag.status}' to '${input.status}'`,
      "ERR_INVALID_TAG_LIFECYCLE_STATE",
    );
  }

  // 3. Resolve lifecycle timestamp progression
  const shouldSetEncodedAt =
    input.status === RfidTagStatus.ACTIVE && !tag.encoded_at;
  const shouldSetRetiredAt = input.status === RfidTagStatus.RETIRED;

  const res = await executor.query<RfidTagRow>(
    `
    UPDATE rfid_tags
    SET status = $1,
        encoded_at = CASE WHEN $2::boolean THEN clock_timestamp() ELSE encoded_at END,
        retired_at = CASE WHEN $3::boolean THEN clock_timestamp() ELSE retired_at END,
        updated_at = clock_timestamp()
    WHERE id = $4
    RETURNING *;
    `,
    [input.status, shouldSetEncodedAt, shouldSetRetiredAt, id],
  );

  const updatedRow = res.rows[0];
  if (!updatedRow) {
    throw new Error(`Failed to update status for RFID tag '${id}'`);
  }

  return mapRowToRfidTag(updatedRow);
}

/**
 * Lists RFID tags matching query filters with pagination.
 */
export async function listRfidTags(
  filters: ListRfidTagsQuery,
  clientOverride?: Queryable,
): Promise<RfidTagRecord[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.organizationId) {
    conditions.push(`organization_id = $${paramIndex++}`);
    params.push(filters.organizationId);
  }

  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  if (filters.epc) {
    conditions.push(`epc ILIKE $${paramIndex++}`);
    params.push(`%${filters.epc}%`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(filters.limit);
  const limitIndex = paramIndex++;
  params.push(filters.offset);
  const offsetIndex = paramIndex++;

  const sql = `
    SELECT *
    FROM rfid_tags
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const res = await executor.query<RfidTagRow>(sql, params);
  return res.rows.map(mapRowToRfidTag);
}
