import type { Pool, PoolClient } from "pg";
import {
  type RfidAssignmentRecord,
  type CreateRfidAssignmentInput,
  type RetireRfidAssignmentInput,
  type ListRfidAssignmentsQuery,
  RfidAssignmentStatus,
  RfidRetirementReason,
  RfidTagStatus,
  CommercialState,
  StateDimension,
  NotFoundError,
  ConflictError,
  BadRequestError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";
import { type InventoryItemRow } from "./inventoryRepository.js";
import { type RfidTagRow } from "./rfidRepository.js";

type Queryable = Pool | PoolClient;

export interface RfidAssignmentRow {
  id: string;
  organization_id: string;
  inventory_item_id: string;
  rfid_tag_id: string;
  status: RfidAssignmentStatus;
  assigned_at: Date;
  assigned_by_user_id: string;
  retired_at: Date | null;
  retired_by_user_id: string | null;
  retirement_reason: RfidRetirementReason | null;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToRfidAssignment(
  row: RfidAssignmentRow,
): RfidAssignmentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    inventoryItemId: row.inventory_item_id,
    rfidTagId: row.rfid_tag_id,
    status: row.status,
    assignedAt: row.assigned_at,
    assignedByUserId: row.assigned_by_user_id,
    retiredAt: row.retired_at,
    retiredByUserId: row.retired_by_user_id,
    retirementReason: row.retirement_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Binds an active RFID transponder tag to a physical serialized piece (Entity 36 - FEAT-RFID-02).
 *
 * Enforces:
 * - Root aggregate locking on parent inventory item (INV-08)
 * - Single active tag per item constraint (INV-03, 409 Conflict)
 * - Single active item per tag transponder constraint (INV-04, 409 Conflict)
 * - Rejection of retired or damaged tags (422 Unprocessable Entity)
 * - Automatic activation and encoding timestamp for UNENCODED tags
 */
export async function assignRfidTag(
  input: CreateRfidAssignmentInput & { organizationId: string },
  context: { userId: string },
  clientOverride?: Queryable,
): Promise<RfidAssignmentRecord> {
  const executeAssignment = async (client: Queryable) => {
    // 1. Root Aggregate Row Lock on parent piece (INV-08)
    const itemRes = await client.query<InventoryItemRow>(
      `SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE`,
      [input.inventoryItemId],
    );

    const item = itemRes.rows[0];
    if (!item || item.organization_id !== input.organizationId) {
      throw new NotFoundError(
        `Inventory item with ID '${input.inventoryItemId}' not found`,
        "ERR_INVENTORY_ITEM_NOT_FOUND",
      );
    }

    // 2. Fetch and lock target RFID transponder
    const tagRes = await client.query<RfidTagRow>(
      `SELECT * FROM rfid_tags WHERE id = $1 FOR UPDATE`,
      [input.rfidTagId],
    );

    const tag = tagRes.rows[0];
    if (!tag || tag.organization_id !== input.organizationId) {
      throw new NotFoundError(
        `RFID tag with ID '${input.rfidTagId}' not found`,
        "ERR_RFID_TAG_NOT_FOUND",
      );
    }

    // 3. Prohibit binding terminal tags (RETIRED or DAMAGED)
    if (
      tag.status === RfidTagStatus.RETIRED ||
      tag.status === RfidTagStatus.DAMAGED
    ) {
      throw new UnprocessableEntityError(
        `RFID tag transponder '${tag.epc}' is in terminal status '${tag.status}' and cannot be assigned`,
        "ERR_TAG_TERMINAL_STATUS",
      );
    }

    // 4. INV-03: Verify item does not already have an active tag assignment
    const existingItemAssignmentRes = await client.query<{ id: string }>(
      `SELECT id FROM rfid_tag_assignments WHERE inventory_item_id = $1 AND status = 'ACTIVE'`,
      [input.inventoryItemId],
    );

    if (existingItemAssignmentRes.rows.length > 0) {
      throw new ConflictError(
        `Inventory item '${input.inventoryItemId}' already has an active RFID tag assigned`,
        "ERR_ITEM_ALREADY_TAGGED",
      );
    }

    // 5. INV-04: Verify tag transponder is not already assigned to another active item
    const existingTagAssignmentRes = await client.query<{ id: string }>(
      `SELECT id FROM rfid_tag_assignments WHERE rfid_tag_id = $1 AND status = 'ACTIVE'`,
      [input.rfidTagId],
    );

    if (existingTagAssignmentRes.rows.length > 0) {
      throw new ConflictError(
        `RFID tag '${tag.epc}' is already actively assigned to an inventory item`,
        "ERR_TAG_ALREADY_ASSIGNED",
      );
    }

    // 6. Transition UNENCODED tags to ACTIVE and record encoded_at
    if (tag.status === RfidTagStatus.UNENCODED) {
      await client.query(
        `UPDATE rfid_tags
         SET status = 'ACTIVE', encoded_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE id = $1`,
        [tag.id],
      );
    }

    // 7. Insert active assignment record
    const assignmentId = uuidv7();
    const insertRes = await client.query<RfidAssignmentRow>(
      `INSERT INTO rfid_tag_assignments (
        id,
        organization_id,
        inventory_item_id,
        rfid_tag_id,
        status,
        assigned_at,
        assigned_by_user_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, 'ACTIVE', clock_timestamp(), $5, clock_timestamp(), clock_timestamp())
      RETURNING *`,
      [
        assignmentId,
        input.organizationId,
        input.inventoryItemId,
        input.rfidTagId,
        context.userId,
      ],
    );

    return mapRowToRfidAssignment(insertRes.rows[0]!);
  };

  if (clientOverride) {
    return executeAssignment(clientOverride);
  }

  return withTransaction((tx) => executeAssignment(tx.rawClient));
}

/**
 * Retires or detaches an active RFID tag assignment (Entity 36 - FEAT-RFID-02).
 *
 * Enforces:
 * - Root aggregate locking on parent inventory item (INV-08)
 * - Transponder lifecycle update (sets retired_at or marks DAMAGED in rfid_tags)
 * - Automatic Commercial Availability Reversion (INV-07): If item was AVAILABLE_FOR_SALE,
 *   reverts commercial_state to UNREADY, increments OCC version, and appends to status history.
 */
export async function retireRfidTagAssignment(
  id: string,
  input: RetireRfidAssignmentInput,
  organizationId: string,
  context: { userId: string },
  clientOverride?: Queryable,
): Promise<RfidAssignmentRecord> {
  const executeRetirement = async (client: Queryable) => {
    // 1. Fetch assignment record
    const assignRes = await client.query<RfidAssignmentRow>(
      `SELECT * FROM rfid_tag_assignments WHERE id = $1 FOR UPDATE`,
      [id],
    );

    const assignment = assignRes.rows[0];
    if (!assignment || assignment.organization_id !== organizationId) {
      throw new NotFoundError(
        `RFID tag assignment with ID '${id}' not found`,
        "ERR_RFID_ASSIGNMENT_NOT_FOUND",
      );
    }

    // 2. Reject retirement if not active
    if (assignment.status !== RfidAssignmentStatus.ACTIVE) {
      throw new BadRequestError(
        `RFID tag assignment is currently in status '${assignment.status}' and cannot be retired`,
        "ERR_ASSIGNMENT_NOT_ACTIVE",
      );
    }

    // 3. Lock parent inventory item (INV-08)
    const itemRes = await client.query<InventoryItemRow>(
      `SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE`,
      [assignment.inventory_item_id],
    );

    const item = itemRes.rows[0];
    if (!item) {
      throw new NotFoundError(
        `Inventory item with ID '${assignment.inventory_item_id}' not found`,
        "ERR_INVENTORY_ITEM_NOT_FOUND",
      );
    }

    // 4. Update assignment status to RETIRED or VOIDED
    const targetAssignmentStatus = input.status ?? RfidAssignmentStatus.RETIRED;

    const updatedAssignRes = await client.query<RfidAssignmentRow>(
      `UPDATE rfid_tag_assignments
       SET status = $1,
           retired_at = clock_timestamp(),
           retired_by_user_id = $2,
           retirement_reason = $3,
           updated_at = clock_timestamp()
       WHERE id = $4
       RETURNING *`,
      [
        targetAssignmentStatus,
        context.userId,
        input.retirementReason,
        assignment.id,
      ],
    );

    // 5. Update transponder tag status in rfid_tags
    const tagStatus =
      input.retirementReason === RfidRetirementReason.DAMAGED
        ? RfidTagStatus.DAMAGED
        : RfidTagStatus.RETIRED;

    await client.query(
      `UPDATE rfid_tags
       SET status = $1,
           retired_at = clock_timestamp(),
           updated_at = clock_timestamp()
       WHERE id = $2`,
      [tagStatus, assignment.rfid_tag_id],
    );

    // 6. INV-07: Automatic Commercial Availability Reversion
    if (item.commercial_state === CommercialState.AVAILABLE_FOR_SALE) {
      await client.query(
        `UPDATE inventory_items
         SET commercial_state = 'UNREADY',
             version = version + 1,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [item.id],
      );

      const historyId = uuidv7();
      const reasonText = `RFID tag detached/retired: ${input.retirementReason}${
        input.notes ? ` (${input.notes})` : ""
      }`;

      await client.query(
        `INSERT INTO inventory_status_history (
          id,
          organization_id,
          inventory_item_id,
          dimension_changed,
          old_state,
          new_state,
          actor_user_id,
          reason,
          transitioned_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp(), clock_timestamp())`,
        [
          historyId,
          organizationId,
          item.id,
          StateDimension.COMMERCIAL,
          CommercialState.AVAILABLE_FOR_SALE,
          CommercialState.UNREADY,
          context.userId,
          reasonText,
        ],
      );
    }

    return mapRowToRfidAssignment(updatedAssignRes.rows[0]!);
  };

  if (clientOverride) {
    return executeRetirement(clientOverride);
  }

  return withTransaction((tx) => executeRetirement(tx.rawClient));
}

/**
 * Retrieves the single active RFID tag assignment for an inventory piece (INV-03).
 */
export async function getActiveAssignmentByItemId(
  inventoryItemId: string,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<RfidAssignmentRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<RfidAssignmentRow>(
    `SELECT * FROM rfid_tag_assignments
     WHERE organization_id = $1 AND inventory_item_id = $2 AND status = 'ACTIVE'`,
    [organizationId, inventoryItemId],
  );

  return res.rows[0] ? mapRowToRfidAssignment(res.rows[0]) : null;
}

/**
 * Retrieves an RFID tag assignment record by ID with organization boundary.
 */
export async function getRfidAssignmentById(
  id: string,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<RfidAssignmentRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<RfidAssignmentRow>(
    `SELECT * FROM rfid_tag_assignments
     WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );

  return res.rows[0] ? mapRowToRfidAssignment(res.rows[0]) : null;
}

/**
 * Lists RFID tag assignments matching query filters with pagination.
 */
export async function listRfidAssignments(
  filters: ListRfidAssignmentsQuery,
  clientOverride?: Queryable,
): Promise<RfidAssignmentRecord[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.organizationId) {
    conditions.push(`organization_id = $${paramIndex++}`);
    params.push(filters.organizationId);
  }

  if (filters.inventoryItemId) {
    conditions.push(`inventory_item_id = $${paramIndex++}`);
    params.push(filters.inventoryItemId);
  }

  if (filters.rfidTagId) {
    conditions.push(`rfid_tag_id = $${paramIndex++}`);
    params.push(filters.rfidTagId);
  }

  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(filters.limit);
  const limitIndex = paramIndex++;
  params.push(filters.offset);
  const offsetIndex = paramIndex++;

  const sql = `
    SELECT *
    FROM rfid_tag_assignments
    ${whereClause}
    ORDER BY assigned_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const res = await executor.query<RfidAssignmentRow>(sql, params);
  return res.rows.map(mapRowToRfidAssignment);
}
