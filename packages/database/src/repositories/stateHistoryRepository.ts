import type { Pool, PoolClient } from "pg";
import {
  type InventoryItemRecord,
  type InventoryStatusHistoryRecord,
  type UpdateInventoryItemStateInput,
  type ListStatusHistoryQuery,
  StateDimension,
  QualityState,
  ApprovalState,
  CustodyState,
  CommercialState,
  NotFoundError,
  BadRequestError,
  ConflictError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";
import {
  type InventoryItemRow,
  mapRowToInventoryItem,
} from "./inventoryRepository.js";

type Queryable = Pool | PoolClient;

export interface StatusHistoryRow {
  id: string;
  organization_id: string;
  inventory_item_id: string;
  dimension_changed: StateDimension;
  old_state: string;
  new_state: string;
  actor_user_id: string;
  reason: string | null;
  transitioned_at: Date;
  created_at: Date;
}

export function mapRowToStatusHistory(
  row: StatusHistoryRow,
): InventoryStatusHistoryRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    inventoryItemId: row.inventory_item_id,
    dimensionChanged: row.dimension_changed,
    oldState: row.old_state,
    newState: row.new_state,
    actorUserId: row.actor_user_id,
    reason: row.reason,
    transitionedAt: row.transitioned_at,
    createdAt: row.created_at,
  };
}

/**
 * Updates an inventory item's multi-dimensional state with optimistic concurrency control
 * and appends an immutable transition log to inventory_status_history (Entity 31 - FEAT-INV-04 / INV-08).
 *
 * Guarantees:
 * - Root aggregate exclusive row lock (SELECT ... FOR UPDATE) preventing interleaved race conditions
 * - Optimistic Concurrency Control (OCC) version verification (ERR_OCC_VERSION_MISMATCH / 409)
 * - Version increment (+1) on successful state change
 * - Append-only immutable audit trail in inventory_status_history (INV-09)
 * - Commercial readiness prerequisites gate (ERR_COMMERCIAL_STATE_INVALID_PREREQUISITE / 422)
 */
export async function updateInventoryItemState(
  itemId: string,
  input: UpdateInventoryItemStateInput,
  context: { userId: string },
  clientOverride?: Queryable,
): Promise<{
  item: InventoryItemRecord;
  history: InventoryStatusHistoryRecord;
}> {
  const executeUpdate = async (
    client: Queryable,
  ): Promise<{
    item: InventoryItemRecord;
    history: InventoryStatusHistoryRecord;
  }> => {
    // 1. Root aggregate exclusive lock (SELECT ... FOR UPDATE)
    const itemRes = await client.query<InventoryItemRow>(
      `SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE`,
      [itemId],
    );

    const item = itemRes.rows[0];
    if (!item) {
      throw new NotFoundError(
        `Inventory item with ID '${itemId}' not found`,
        "ERR_INVENTORY_ITEM_NOT_FOUND",
      );
    }

    // 2. OCC Version Verification (INV-08)
    if (
      input.expectedVersion !== undefined &&
      item.version !== input.expectedVersion
    ) {
      throw new ConflictError(
        `OCC version mismatch: expected item version ${input.expectedVersion}, but current version is ${item.version}`,
        "ERR_OCC_VERSION_MISMATCH",
      );
    }

    // 3. Resolve dimension column and old state
    let stateColumn: string;
    let oldState: string;

    switch (input.dimension) {
      case StateDimension.QUALITY:
        stateColumn = "quality_state";
        oldState = item.quality_state;
        break;
      case StateDimension.APPROVAL:
        stateColumn = "approval_state";
        oldState = item.approval_state;
        break;
      case StateDimension.CUSTODY:
        stateColumn = "custody_state";
        oldState = item.custody_state;
        break;
      case StateDimension.COMMERCIAL:
        stateColumn = "commercial_state";
        oldState = item.commercial_state;
        break;
      default:
        throw new BadRequestError(
          `Invalid state dimension: '${input.dimension}'`,
        );
    }

    // 4. No-op validation
    if (oldState === input.newState) {
      throw new BadRequestError(
        `Item is already in state '${input.newState}' for dimension '${input.dimension}'`,
        "ERR_NOOP_STATE_TRANSITION",
      );
    }

    // 5. Commercial Readiness Gate
    if (
      input.dimension === StateDimension.COMMERCIAL &&
      input.newState === CommercialState.AVAILABLE_FOR_SALE
    ) {
      if (item.quality_state !== QualityState.QC_APPROVED) {
        throw new UnprocessableEntityError(
          `Cannot transition commercial state to AVAILABLE_FOR_SALE: quality state must be QC_APPROVED, but is '${item.quality_state}'`,
          "ERR_COMMERCIAL_STATE_INVALID_PREREQUISITE",
        );
      }
      if (item.approval_state !== ApprovalState.APPROVED) {
        throw new UnprocessableEntityError(
          `Cannot transition commercial state to AVAILABLE_FOR_SALE: approval state must be APPROVED, but is '${item.approval_state}'`,
          "ERR_COMMERCIAL_STATE_INVALID_PREREQUISITE",
        );
      }
      if (
        item.custody_state !== CustodyState.IN_VAULT &&
        item.custody_state !== CustodyState.IN_DISPLAY
      ) {
        throw new UnprocessableEntityError(
          `Cannot transition commercial state to AVAILABLE_FOR_SALE: custody state must be IN_VAULT or IN_DISPLAY, but is '${item.custody_state}'`,
          "ERR_COMMERCIAL_STATE_INVALID_PREREQUISITE",
        );
      }
    }

    // 6. Update inventory item (increment OCC version)
    const updateRes = await client.query<InventoryItemRow>(
      `
      UPDATE inventory_items
      SET ${stateColumn} = $1,
          version = version + 1,
          updated_at = clock_timestamp()
      WHERE id = $2
      RETURNING *;
      `,
      [input.newState, itemId],
    );

    const updatedItemRow = updateRes.rows[0];
    if (!updatedItemRow) {
      throw new Error(`Failed to update state for item '${itemId}'`);
    }

    // 7. Append immutable status history audit record
    const historyId = uuidv7();
    const historyRes = await client.query<StatusHistoryRow>(
      `
      INSERT INTO inventory_status_history (
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
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        clock_timestamp(), clock_timestamp()
      )
      RETURNING *;
      `,
      [
        historyId,
        item.organization_id,
        itemId,
        input.dimension,
        oldState,
        input.newState,
        context.userId,
        input.reason ?? null,
      ],
    );

    const historyRow = historyRes.rows[0];
    if (!historyRow) {
      throw new Error(`Failed to append status history for item '${itemId}'`);
    }

    return {
      item: mapRowToInventoryItem(updatedItemRow),
      history: mapRowToStatusHistory(historyRow),
    };
  };

  if (clientOverride) {
    return executeUpdate(clientOverride);
  }

  return withTransaction((tx) => executeUpdate(tx.rawClient));
}

/**
 * Retrieves the full transition history for a specific inventory piece.
 */
export async function getInventoryItemHistory(
  inventoryItemId: string,
  clientOverride?: Queryable,
): Promise<InventoryStatusHistoryRecord[]> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<StatusHistoryRow>(
    `
    SELECT *
    FROM inventory_status_history
    WHERE inventory_item_id = $1
    ORDER BY transitioned_at DESC, created_at DESC
    `,
    [inventoryItemId],
  );

  return res.rows.map(mapRowToStatusHistory);
}

/**
 * Lists inventory status history records with query filters and pagination.
 */
export async function listStatusHistory(
  filters: ListStatusHistoryQuery,
  clientOverride?: Queryable,
): Promise<InventoryStatusHistoryRecord[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.inventoryItemId) {
    conditions.push(`inventory_item_id = $${paramIndex++}`);
    params.push(filters.inventoryItemId);
  }

  if (filters.dimensionChanged) {
    conditions.push(`dimension_changed = $${paramIndex++}`);
    params.push(filters.dimensionChanged);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(filters.limit);
  const limitIndex = paramIndex++;
  params.push(filters.offset);
  const offsetIndex = paramIndex++;

  const sql = `
    SELECT *
    FROM inventory_status_history
    ${whereClause}
    ORDER BY transitioned_at DESC, created_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const res = await executor.query<StatusHistoryRow>(sql, params);
  return res.rows.map(mapRowToStatusHistory);
}
