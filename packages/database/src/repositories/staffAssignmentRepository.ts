import type { Pool, PoolClient } from "pg";
import {
  type StaffAssignment,
  type StaffAssignmentRole,
  type CreateStaffAssignmentInput,
  ConflictError,
  UnprocessableEntityError,
  NotFoundError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";
import { getGrnById } from "./grnRepository.js";
import { getShipmentById } from "./shipmentRepository.js";

type Queryable = Pool | PoolClient;

export interface StaffAssignmentRow {
  id: string;
  goods_receipt_note_id: string;
  shipment_id: string | null;
  assigned_user_id: string;
  assigned_role: StaffAssignmentRole;
  assigned_at: Date;
  created_at: Date;
}

export function mapRowToStaffAssignment(
  row: StaffAssignmentRow,
): StaffAssignment {
  return {
    id: row.id,
    goodsReceiptNoteId: row.goods_receipt_note_id,
    shipmentId: row.shipment_id,
    assignedUserId: row.assigned_user_id,
    assignedRole: row.assigned_role,
    assignedAt: row.assigned_at,
    createdAt: row.created_at,
  };
}

/**
 * Assigns an operational staff member to intake, inspection, or approval duties.
 * Enforces INV-19 cross-entity parent GRN consistency and closed-GRN immutability.
 */
export async function createStaffAssignment(
  data: CreateStaffAssignmentInput,
  clientOverride?: Queryable,
): Promise<StaffAssignment> {
  const executor = clientOverride ?? getPool();

  // 1. Verify parent GRN exists and is not CLOSED
  const grn = await getGrnById(data.goodsReceiptNoteId, executor);
  if (!grn) {
    throw new NotFoundError("Goods Receipt Note", data.goodsReceiptNoteId);
  }
  if (grn.status === "CLOSED") {
    throw new UnprocessableEntityError(
      "Cannot assign staff to a closed GRN",
      "ERR_GRN_IMMUTABLE",
    );
  }

  // 2. If shipmentId is specified, verify existence and cross-parent match (INV-19)
  if (data.shipmentId) {
    const shipment = await getShipmentById(data.shipmentId, executor);
    if (!shipment) {
      throw new NotFoundError("Shipment", data.shipmentId);
    }
    if (shipment.goodsReceiptNoteId !== data.goodsReceiptNoteId) {
      throw new UnprocessableEntityError(
        "Referenced shipment does not belong to the referenced Goods Receipt Note",
        "ERR_ASSIGNMENT_GRN_MISMATCH",
      );
    }
  }

  const id = uuidv7();

  try {
    const result = await executor.query<StaffAssignmentRow>(
      `
      INSERT INTO staff_assignments (
        id, goods_receipt_note_id, shipment_id, assigned_user_id, assigned_role, assigned_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, goods_receipt_note_id, shipment_id, assigned_user_id, assigned_role, assigned_at, created_at;
      `,
      [
        id,
        data.goodsReceiptNoteId,
        data.shipmentId ?? null,
        data.assignedUserId,
        data.assignedRole,
        data.assignedAt ?? new Date(),
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert staff assignment");
    }

    return mapRowToStaffAssignment(row);
  } catch (err: any) {
    if (
      err.constraint === "idx_staff_assignments_unique_shipment" ||
      err.constraint === "idx_staff_assignments_unique_grn"
    ) {
      throw new ConflictError(
        "Staff member is already assigned to this role for this receiving task",
        "ERR_DUPLICATE_STAFF_ASSIGNMENT",
      );
    }
    if (err.constraint === "staff_assignments_assigned_user_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced staff member does not exist",
        "ERR_USER_NOT_FOUND",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a staff assignment by primary key ID.
 */
export async function getStaffAssignmentById(
  id: string,
  clientOverride?: Queryable,
): Promise<StaffAssignment | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<StaffAssignmentRow>(
    `
    SELECT id, goods_receipt_note_id, shipment_id, assigned_user_id, assigned_role, assigned_at, created_at
    FROM staff_assignments
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToStaffAssignment(row) : null;
}

/**
 * Lists staff assignments with optional filtering by GRN, shipment, user, or role.
 */
export async function listStaffAssignments(
  filter?: {
    goodsReceiptNoteId?: string;
    shipmentId?: string;
    assignedUserId?: string;
    assignedRole?: StaffAssignmentRole;
  },
  clientOverride?: Queryable,
): Promise<StaffAssignment[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const values: any[] = [];

  if (filter?.goodsReceiptNoteId) {
    values.push(filter.goodsReceiptNoteId);
    conditions.push(`goods_receipt_note_id = $${values.length}`);
  }
  if (filter?.shipmentId) {
    values.push(filter.shipmentId);
    conditions.push(`shipment_id = $${values.length}`);
  }
  if (filter?.assignedUserId) {
    values.push(filter.assignedUserId);
    conditions.push(`assigned_user_id = $${values.length}`);
  }
  if (filter?.assignedRole) {
    values.push(filter.assignedRole);
    conditions.push(`assigned_role = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const query = `
    SELECT id, goods_receipt_note_id, shipment_id, assigned_user_id, assigned_role, assigned_at, created_at
    FROM staff_assignments
    ${whereClause}
    ORDER BY assigned_at DESC;
  `;

  const result = await executor.query<StaffAssignmentRow>(query, values);
  return result.rows.map(mapRowToStaffAssignment);
}

/**
 * Removes a staff assignment. Rejects if parent GRN is CLOSED.
 */
export async function deleteStaffAssignment(
  id: string,
  clientOverride?: Queryable,
): Promise<void> {
  const executor = clientOverride ?? getPool();

  const existing = await getStaffAssignmentById(id, executor);
  if (!existing) {
    throw new NotFoundError("Staff Assignment", id);
  }

  const grn = await getGrnById(existing.goodsReceiptNoteId, executor);
  if (grn && grn.status === "CLOSED") {
    throw new UnprocessableEntityError(
      "Cannot remove staff assignment from a closed GRN",
      "ERR_GRN_IMMUTABLE",
    );
  }

  await executor.query(`DELETE FROM staff_assignments WHERE id = $1;`, [id]);
}
