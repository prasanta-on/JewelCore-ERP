import type { Pool, PoolClient } from "pg";
import {
  type StockApprovalRecord,
  type CreateStockApprovalInput,
  type ListStockApprovalsQuery,
  StockApprovalStatus,
  QualityState,
  CustodyState,
  CommercialState,
  ApprovalState,
  StateDimension,
  NotFoundError,
  ForbiddenError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";
import { type InventoryItemRow } from "./inventoryRepository.js";

type Queryable = Pool | PoolClient;

export interface StockApprovalRow {
  id: string;
  organization_id: string;
  store_id: string;
  inventory_item_id: string;
  approver_user_id: string;
  approval_status: StockApprovalStatus;
  approval_notes: string | null;
  rejection_reason_code: string | null;
  approved_at: Date;
  created_at: Date;
}

export function mapRowToStockApproval(
  row: StockApprovalRow,
): StockApprovalRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    inventoryItemId: row.inventory_item_id,
    approverUserId: row.approver_user_id,
    approvalStatus: row.approval_status,
    approvalNotes: row.approval_notes,
    rejectionReasonCode: row.rejection_reason_code,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

/**
 * Authorizes managerial stock approval for an inventory piece and gates commercial availability (Entity 39 - FEAT-GOV-01).
 *
 * Enforces:
 * - Root aggregate row locking on parent inventory item (INV-08)
 * - Multi-store context isolation (INV-11)
 * - INV-01 Commercial Availability Prerequisites:
 *   1. Must have quality_state = 'QC_APPROVED'
 *   2. Must have physical custody_state IN ('IN_VAULT', 'IN_DISPLAY')
 *   3. Must have an active RFID tag bound (rfid_tag_assignments)
 * - State machine updates (approval_state = APPROVED/REJECTED, commercial_state = AVAILABLE_FOR_SALE/UNREADY)
 * - Dual-dimension append-only audit tracking in inventory_status_history (INV-09)
 */
export async function createStockApproval(
  input: CreateStockApprovalInput & {
    organizationId: string;
    storeId?: string;
  },
  context: { userId: string },
  clientOverride?: Queryable,
): Promise<StockApprovalRecord> {
  const executeApproval = async (client: Queryable) => {
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

    // 2. Multi-Store Context Boundary (INV-11)
    if (input.storeId && item.store_id !== input.storeId) {
      throw new ForbiddenError(
        `Cross-store access denied: item belongs to store '${item.store_id}', but request is scoped to '${input.storeId}'`,
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    const targetStoreId = input.storeId ?? item.store_id;

    // 3. INV-01 Prerequisite 1: Quality State must be QC_APPROVED
    if (item.quality_state !== QualityState.QC_APPROVED) {
      throw new UnprocessableEntityError(
        `Inventory piece cannot receive stock approval because quality state is '${item.quality_state}', expected '${QualityState.QC_APPROVED}' (INV-01)`,
        "ERR_INV_01_QC_NOT_APPROVED",
      );
    }

    // 4. INV-01 Prerequisite 2: Physical custody must be IN_VAULT or IN_DISPLAY
    if (
      item.custody_state !== CustodyState.IN_VAULT &&
      item.custody_state !== CustodyState.IN_DISPLAY
    ) {
      throw new UnprocessableEntityError(
        `Inventory piece cannot receive stock approval because custody state is '${item.custody_state}', expected '${CustodyState.IN_VAULT}' or '${CustodyState.IN_DISPLAY}' (INV-01)`,
        "ERR_INV_01_INVALID_CUSTODY_STATE",
      );
    }

    // 5. INV-01 Prerequisite 3: Active RFID Tag Transponder must be bound
    const activeTagRes = await client.query<{ id: string }>(
      `SELECT id FROM rfid_tag_assignments
       WHERE inventory_item_id = $1 AND status = 'ACTIVE'`,
      [item.id],
    );

    if (activeTagRes.rows.length === 0) {
      throw new UnprocessableEntityError(
        `Inventory piece cannot receive stock approval without an active RFID tag bound (INV-01)`,
        "ERR_INV_01_TAG_REQUIRED",
      );
    }

    // 6. Mutate Item Lifecycle and append Audit History
    if (input.approvalStatus === StockApprovalStatus.APPROVED) {
      await client.query(
        `UPDATE inventory_items
         SET approval_state = 'APPROVED',
             commercial_state = 'AVAILABLE_FOR_SALE',
             version = version + 1,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [item.id],
      );

      // Record APPROVAL state transition
      const approvalHistId = uuidv7();
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
          approvalHistId,
          input.organizationId,
          item.id,
          StateDimension.APPROVAL,
          item.approval_state,
          ApprovalState.APPROVED,
          context.userId,
          input.approvalNotes ?? "Managerial stock approval authorized",
        ],
      );

      // Record COMMERCIAL state transition
      const commercialHistId = uuidv7();
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
          commercialHistId,
          input.organizationId,
          item.id,
          StateDimension.COMMERCIAL,
          item.commercial_state,
          CommercialState.AVAILABLE_FOR_SALE,
          context.userId,
          "Commercial availability released upon managerial stock approval",
        ],
      );
    } else {
      // REJECTED flow
      await client.query(
        `UPDATE inventory_items
         SET approval_state = 'REJECTED',
             commercial_state = 'UNREADY',
             version = version + 1,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [item.id],
      );

      const rejectHistId = uuidv7();
      const rejectReason =
        input.rejectionReasonCode ??
        input.approvalNotes ??
        "Managerial stock approval rejected";

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
          rejectHistId,
          input.organizationId,
          item.id,
          StateDimension.APPROVAL,
          item.approval_state,
          ApprovalState.REJECTED,
          context.userId,
          rejectReason,
        ],
      );
    }

    // 7. Insert append-only stock approval record
    const approvalId = uuidv7();
    const insertRes = await client.query<StockApprovalRow>(
      `INSERT INTO stock_approvals (
        id,
        organization_id,
        store_id,
        inventory_item_id,
        approver_user_id,
        approval_status,
        approval_notes,
        rejection_reason_code,
        approved_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp(), clock_timestamp())
      RETURNING *`,
      [
        approvalId,
        input.organizationId,
        targetStoreId,
        item.id,
        context.userId,
        input.approvalStatus,
        input.approvalNotes ?? null,
        input.rejectionReasonCode ?? null,
      ],
    );

    return mapRowToStockApproval(insertRes.rows[0]!);
  };

  if (clientOverride) {
    return executeApproval(clientOverride);
  }

  return withTransaction((tx) => executeApproval(tx.rawClient));
}

/**
 * Retrieves a stock approval record by ID.
 */
export async function getStockApprovalById(
  id: string,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<StockApprovalRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<StockApprovalRow>(
    `SELECT * FROM stock_approvals
     WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );

  return res.rows[0] ? mapRowToStockApproval(res.rows[0]) : null;
}

/**
 * Retrieves the latest stock approval record for a specific inventory piece.
 */
export async function getLatestApprovalByItemId(
  inventoryItemId: string,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<StockApprovalRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<StockApprovalRow>(
    `SELECT * FROM stock_approvals
     WHERE inventory_item_id = $1 AND organization_id = $2
     ORDER BY approved_at DESC
     LIMIT 1`,
    [inventoryItemId, organizationId],
  );

  return res.rows[0] ? mapRowToStockApproval(res.rows[0]) : null;
}

/**
 * Lists stock approvals matching query filters with pagination.
 */
export async function listStockApprovals(
  filters: ListStockApprovalsQuery,
  clientOverride?: Queryable,
): Promise<StockApprovalRecord[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.organizationId) {
    conditions.push(`organization_id = $${paramIndex++}`);
    params.push(filters.organizationId);
  }

  if (filters.storeId) {
    conditions.push(`store_id = $${paramIndex++}`);
    params.push(filters.storeId);
  }

  if (filters.inventoryItemId) {
    conditions.push(`inventory_item_id = $${paramIndex++}`);
    params.push(filters.inventoryItemId);
  }

  if (filters.approvalStatus) {
    conditions.push(`approval_status = $${paramIndex++}`);
    params.push(filters.approvalStatus);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(filters.limit);
  const limitIndex = paramIndex++;
  params.push(filters.offset);
  const offsetIndex = paramIndex++;

  const sql = `
    SELECT *
    FROM stock_approvals
    ${whereClause}
    ORDER BY approved_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const res = await executor.query<StockApprovalRow>(sql, params);
  return res.rows.map(mapRowToStockApproval);
}
