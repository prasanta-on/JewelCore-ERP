import {
  ConflictError,
  NotFoundError,
  ValidationError,
  TransferOrderStatus,
  TransferOrderPriority,
  TransferOrderItemStatus,
  type CreateTransferOrderInput,
  type AddTransferOrderItemInput,
  type RejectTransferOrderInput,
  type ListTransferOrdersQuery,
  type TransferOrderRecord,
  type TransferOrderItemRecord,
} from "@jewelcore/shared";
import { query } from "../pool.js";
import { withTransaction, type TransactionClient } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";

type DbClient = TransactionClient | { query: typeof query };

interface TransferOrderRow {
  id: string;
  organization_id: string;
  order_number: string;
  source_store_id: string;
  source_store_name?: string;
  destination_store_id: string;
  destination_store_name?: string;
  status: TransferOrderStatus;
  priority: TransferOrderPriority;
  requested_by_user_id: string;
  requested_by_user_name?: string;
  approved_by_user_id: string | null;
  approved_by_user_name?: string | null;
  rejection_reason: string | null;
  notes: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface TransferOrderItemRow {
  id: string;
  organization_id: string;
  transfer_order_id: string;
  inventory_item_id: string;
  product_sku_id: string;
  sku_code?: string;
  serial_number?: string;
  status: TransferOrderItemStatus;
  notes: string | null;
  created_at: Date;
}

function mapTransferOrderItem(row: TransferOrderItemRow): TransferOrderItemRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    transferOrderId: row.transfer_order_id,
    inventoryItemId: row.inventory_item_id,
    productSkuId: row.product_sku_id,
    skuCode: row.sku_code,
    serialNumber: row.serial_number,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

function mapTransferOrder(row: TransferOrderRow, items?: TransferOrderItemRecord[]): TransferOrderRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    orderNumber: row.order_number,
    sourceStoreId: row.source_store_id,
    sourceStoreName: row.source_store_name,
    destinationStoreId: row.destination_store_id,
    destinationStoreName: row.destination_store_name,
    status: row.status,
    priority: row.priority,
    requestedByUserId: row.requested_by_user_id,
    requestedByUserName: row.requested_by_user_name,
    approvedByUserId: row.approved_by_user_id,
    approvedByUserName: row.approved_by_user_name,
    rejectionReason: row.rejection_reason,
    notes: row.notes,
    approvedAt: row.approved_at instanceof Date ? row.approved_at.toISOString() : (row.approved_at ? String(row.approved_at) : null),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    items,
  };
}

export async function createTransferOrder(
  organizationId: string,
  requestedByUserId: string,
  data: CreateTransferOrderInput,
): Promise<TransferOrderRecord> {
  if (data.sourceStoreId === data.destinationStoreId) {
    throw new ValidationError("Source store and destination store must be different");
  }

  // Validate stores exist and belong to organization
  const storesResult = await query<{ id: string }>(
    `SELECT id FROM stores WHERE id IN ($1, $2) AND organization_id = $3`,
    [data.sourceStoreId, data.destinationStoreId, organizationId],
  );

  if (storesResult.rows.length !== 2) {
    throw new NotFoundError("Source or destination store not found in organization");
  }

  const orderId = uuidv7();
  const orderNumber = data.orderNumber || `XFR-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;

  return withTransaction(async (client) => {
    // Insert Transfer Order
    await client.query(
      `INSERT INTO transfer_orders (
        id, organization_id, order_number, source_store_id, destination_store_id,
        status, priority, requested_by_user_id, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp(), clock_timestamp())`,
      [
        orderId,
        organizationId,
        orderNumber,
        data.sourceStoreId,
        data.destinationStoreId,
        TransferOrderStatus.DRAFT,
        data.priority,
        requestedByUserId,
        data.notes || null,
      ],
    );

    // If initial items provided, validate and attach
    if (data.itemIds && data.itemIds.length > 0) {
      for (const itemId of data.itemIds) {
        // Validate inventory piece
        const itemRes = await client.query<{
          id: string;
          store_id: string;
          product_sku_id: string;
          custody_state: string;
          commercial_state: string;
        }>(
          `SELECT id, store_id, product_sku_id, custody_state, commercial_state
           FROM inventory_items
           WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [itemId, organizationId],
        );

        const piece = itemRes.rows[0];
        if (!piece) {
          throw new NotFoundError(`Inventory item ${itemId} not found`);
        }

        if (piece.store_id !== data.sourceStoreId) {
          throw new ValidationError(`Inventory item ${itemId} does not belong to source store`);
        }

        if (piece.custody_state !== "IN_VAULT") {
          throw new ValidationError(
            `Inventory item ${itemId} cannot be transferred (current custody state: ${piece.custody_state})`,
          );
        }

        if (piece.commercial_state !== "AVAILABLE_FOR_SALE") {
          throw new ValidationError(
            `Inventory item ${itemId} cannot be transferred (current commercial state: ${piece.commercial_state})`,
          );
        }

        // Check if piece already in an active transfer order
        const activeXfrRes = await client.query<{ id: string }>(
          `SELECT toi.id
           FROM transfer_order_items toi
           JOIN transfer_orders tro ON toi.transfer_order_id = tro.id
           WHERE toi.inventory_item_id = $1
             AND tro.status IN ('REQUESTED', 'APPROVED', 'IN_TRANSIT')
             AND toi.status IN ('PENDING', 'DISPATCHED')`,
          [itemId],
        );

        if (activeXfrRes.rows.length > 0) {
          throw new ConflictError(`Inventory item ${itemId} is already part of an active transfer order`);
        }

        const lineId = uuidv7();
        await client.query(
          `INSERT INTO transfer_order_items (
            id, organization_id, transfer_order_id, inventory_item_id, product_sku_id, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp())`,
          [lineId, organizationId, orderId, itemId, piece.product_sku_id, TransferOrderItemStatus.PENDING],
        );
      }
    }

    // Insert Audit Event
    await client.query(
      `INSERT INTO audit_events (
        id, organization_id, resource_type, resource_id, action, actor_user_id, payload_after_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
      [
        uuidv7(),
        organizationId,
        "TRANSFER_ORDER",
        orderId,
        "TRANSFER_ORDER_CREATED",
        requestedByUserId,
        JSON.stringify({ orderNumber, sourceStoreId: data.sourceStoreId, destinationStoreId: data.destinationStoreId }),
      ],
    );

    const fullOrder = await getTransferOrderById(organizationId, orderId, client);
    if (!fullOrder) {
      throw new Error("Failed to retrieve created transfer order");
    }
    return fullOrder;
  });
}

export async function addTransferOrderItem(
  organizationId: string,
  transferOrderId: string,
  data: AddTransferOrderItemInput,
): Promise<TransferOrderItemRecord> {
  return withTransaction(async (client) => {
    // Check order
    const orderRes = await client.query<{ id: string; status: string; source_store_id: string }>(
      `SELECT id, status, source_store_id FROM transfer_orders WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [transferOrderId, organizationId],
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new NotFoundError(`Transfer order ${transferOrderId} not found`);
    }

    if (order.status !== TransferOrderStatus.DRAFT) {
      throw new ValidationError(`Cannot add items to transfer order in ${order.status} state`);
    }

    // Validate inventory item
    const itemRes = await client.query<{
      id: string;
      store_id: string;
      product_sku_id: string;
      custody_state: string;
      commercial_state: string;
      serial_number: string;
    }>(
      `SELECT id, store_id, product_sku_id, custody_state, commercial_state, serial_number
       FROM inventory_items
       WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [data.inventoryItemId, organizationId],
    );

    const piece = itemRes.rows[0];
    if (!piece) {
      throw new NotFoundError(`Inventory item ${data.inventoryItemId} not found`);
    }

    if (piece.store_id !== order.source_store_id) {
      throw new ValidationError(`Inventory item does not belong to source store`);
    }

    if (piece.custody_state !== "IN_VAULT") {
      throw new ValidationError(
        `Inventory item cannot be transferred (current custody state: ${piece.custody_state})`,
      );
    }

    if (piece.commercial_state !== "AVAILABLE_FOR_SALE") {
      throw new ValidationError(
        `Inventory item cannot be transferred (current commercial state: ${piece.commercial_state})`,
      );
    }

    // Check if item already exists in this order
    const existingInOrder = await client.query<{ id: string }>(
      `SELECT id FROM transfer_order_items WHERE transfer_order_id = $1 AND inventory_item_id = $2`,
      [transferOrderId, data.inventoryItemId],
    );

    if (existingInOrder.rows.length > 0) {
      throw new ConflictError(`Inventory item already added to this transfer order`);
    }

    // Check if in another active order
    const activeXfrRes = await client.query<{ id: string }>(
      `SELECT toi.id
       FROM transfer_order_items toi
       JOIN transfer_orders tro ON toi.transfer_order_id = tro.id
       WHERE toi.inventory_item_id = $1
         AND tro.status IN ('REQUESTED', 'APPROVED', 'IN_TRANSIT')
         AND toi.status IN ('PENDING', 'DISPATCHED')`,
      [data.inventoryItemId],
    );

    if (activeXfrRes.rows.length > 0) {
      throw new ConflictError(`Inventory item is already part of an active transfer order`);
    }

    const lineId = uuidv7();
    const insertRes = await client.query<TransferOrderItemRow>(
      `INSERT INTO transfer_order_items (
        id, organization_id, transfer_order_id, inventory_item_id, product_sku_id, status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())
      RETURNING *`,
      [lineId, organizationId, transferOrderId, data.inventoryItemId, piece.product_sku_id, TransferOrderItemStatus.PENDING, data.notes || null],
    );

    const insertedRow = insertRes.rows[0];
    if (!insertedRow) {
      throw new Error("Failed to insert transfer order item");
    }
    insertedRow.serial_number = piece.serial_number;

    return mapTransferOrderItem(insertedRow);
  });
}

export async function removeTransferOrderItem(
  organizationId: string,
  transferOrderId: string,
  transferOrderItemId: string,
): Promise<void> {
  const orderRes = await query<{ status: string }>(
    `SELECT status FROM transfer_orders WHERE id = $1 AND organization_id = $2`,
    [transferOrderId, organizationId],
  );

  const order = orderRes.rows[0];
  if (!order) {
    throw new NotFoundError(`Transfer order ${transferOrderId} not found`);
  }

  if (order.status !== TransferOrderStatus.DRAFT) {
    throw new ValidationError(`Cannot remove items from transfer order in ${order.status} state`);
  }

  const deleteRes = await query(
    `DELETE FROM transfer_order_items WHERE id = $1 AND transfer_order_id = $2 AND organization_id = $3`,
    [transferOrderItemId, transferOrderId, organizationId],
  );

  if (deleteRes.rowCount === 0) {
    throw new NotFoundError(`Transfer order item ${transferOrderItemId} not found`);
  }
}

export async function submitTransferOrder(
  organizationId: string,
  transferOrderId: string,
  userId: string,
): Promise<TransferOrderRecord> {
  return withTransaction(async (client) => {
    const orderRes = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM transfer_orders WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [transferOrderId, organizationId],
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new NotFoundError(`Transfer order ${transferOrderId} not found`);
    }

    if (order.status !== TransferOrderStatus.DRAFT) {
      throw new ValidationError(`Transfer order is in ${order.status} state, only DRAFT can be submitted`);
    }

    // Must have at least 1 item
    const itemsCountRes = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM transfer_order_items WHERE transfer_order_id = $1`,
      [transferOrderId],
    );

    const countRow = itemsCountRes.rows[0];
    if (!countRow || parseInt(countRow.count, 10) === 0) {
      throw new ValidationError(`Transfer order must have at least one item before submission`);
    }

    await client.query(
      `UPDATE transfer_orders SET status = $1, updated_at = clock_timestamp() WHERE id = $2`,
      [TransferOrderStatus.REQUESTED, transferOrderId],
    );

    await client.query(
      `INSERT INTO audit_events (
        id, organization_id, resource_type, resource_id, action, actor_user_id, payload_after_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
      [
        uuidv7(),
        organizationId,
        "TRANSFER_ORDER",
        transferOrderId,
        "TRANSFER_ORDER_SUBMITTED",
        userId,
        JSON.stringify({ newStatus: TransferOrderStatus.REQUESTED }),
      ],
    );

    const updated = await getTransferOrderById(organizationId, transferOrderId, client);
    return updated!;
  });
}

export async function approveTransferOrder(
  organizationId: string,
  transferOrderId: string,
  approvedByUserId: string,
): Promise<TransferOrderRecord> {
  return withTransaction(async (client) => {
    const orderRes = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM transfer_orders WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [transferOrderId, organizationId],
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new NotFoundError(`Transfer order ${transferOrderId} not found`);
    }

    if (order.status !== TransferOrderStatus.REQUESTED) {
      throw new ValidationError(`Transfer order is in ${order.status} state, only REQUESTED can be approved`);
    }

    await client.query(
      `UPDATE transfer_orders
       SET status = $1, approved_by_user_id = $2, approved_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE id = $3`,
      [TransferOrderStatus.APPROVED, approvedByUserId, transferOrderId],
    );

    await client.query(
      `INSERT INTO audit_events (
        id, organization_id, resource_type, resource_id, action, actor_user_id, payload_after_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
      [
        uuidv7(),
        organizationId,
        "TRANSFER_ORDER",
        transferOrderId,
        "TRANSFER_ORDER_APPROVED",
        approvedByUserId,
        JSON.stringify({ newStatus: TransferOrderStatus.APPROVED }),
      ],
    );

    const updated = await getTransferOrderById(organizationId, transferOrderId, client);
    return updated!;
  });
}

export async function rejectTransferOrder(
  organizationId: string,
  transferOrderId: string,
  rejectedByUserId: string,
  data: RejectTransferOrderInput,
): Promise<TransferOrderRecord> {
  return withTransaction(async (client) => {
    const orderRes = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM transfer_orders WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [transferOrderId, organizationId],
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new NotFoundError(`Transfer order ${transferOrderId} not found`);
    }

    if (order.status !== TransferOrderStatus.REQUESTED) {
      throw new ValidationError(`Transfer order is in ${order.status} state, only REQUESTED can be rejected`);
    }

    await client.query(
      `UPDATE transfer_orders
       SET status = $1, approved_by_user_id = $2, rejection_reason = $3, updated_at = clock_timestamp()
       WHERE id = $4`,
      [TransferOrderStatus.REJECTED, rejectedByUserId, data.rejectionReason, transferOrderId],
    );

    await client.query(
      `INSERT INTO audit_events (
        id, organization_id, resource_type, resource_id, action, actor_user_id, payload_after_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
      [
        uuidv7(),
        organizationId,
        "TRANSFER_ORDER",
        transferOrderId,
        "TRANSFER_ORDER_REJECTED",
        rejectedByUserId,
        JSON.stringify({ newStatus: TransferOrderStatus.REJECTED, rejectionReason: data.rejectionReason }),
      ],
    );

    const updated = await getTransferOrderById(organizationId, transferOrderId, client);
    return updated!;
  });
}

export async function cancelTransferOrder(
  organizationId: string,
  transferOrderId: string,
  cancelledByUserId: string,
  reason?: string,
): Promise<TransferOrderRecord> {
  return withTransaction(async (client) => {
    const orderRes = await client.query<{ id: string; status: string; notes: string | null }>(
      `SELECT id, status, notes FROM transfer_orders WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [transferOrderId, organizationId],
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new NotFoundError(`Transfer order ${transferOrderId} not found`);
    }

    const currentStatus = order.status;
    if (currentStatus !== TransferOrderStatus.DRAFT && currentStatus !== TransferOrderStatus.REQUESTED) {
      throw new ValidationError(`Transfer order is in ${currentStatus} state and cannot be cancelled`);
    }

    const updatedNotes = reason
      ? (order.notes ? `${order.notes}\nCancellation reason: ${reason}` : `Cancellation reason: ${reason}`)
      : order.notes;

    await client.query(
      `UPDATE transfer_orders
       SET status = $1, notes = $2, updated_at = clock_timestamp()
       WHERE id = $3`,
      [TransferOrderStatus.CANCELLED, updatedNotes, transferOrderId],
    );

    await client.query(
      `UPDATE transfer_order_items
       SET status = $1
       WHERE transfer_order_id = $2`,
      [TransferOrderItemStatus.CANCELLED, transferOrderId],
    );

    await client.query(
      `INSERT INTO audit_events (
        id, organization_id, resource_type, resource_id, action, actor_user_id, payload_after_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
      [
        uuidv7(),
        organizationId,
        "TRANSFER_ORDER",
        transferOrderId,
        "TRANSFER_ORDER_CANCELLED",
        cancelledByUserId,
        JSON.stringify({ newStatus: TransferOrderStatus.CANCELLED, reason }),
      ],
    );

    const updated = await getTransferOrderById(organizationId, transferOrderId, client);
    return updated!;
  });
}

export async function getTransferOrderById(
  organizationId: string,
  transferOrderId: string,
  dbClient?: DbClient,
): Promise<TransferOrderRecord | null> {
  const runner = dbClient || { query };

  const orderRes = await runner.query<TransferOrderRow>(
    `SELECT tro.*,
            s1.name as source_store_name,
            s2.name as destination_store_name,
            CONCAT(u1.first_name, ' ', u1.last_name) as requested_by_user_name,
            CASE WHEN u2.id IS NOT NULL THEN CONCAT(u2.first_name, ' ', u2.last_name) ELSE NULL END as approved_by_user_name
     FROM transfer_orders tro
     JOIN stores s1 ON tro.source_store_id = s1.id
     JOIN stores s2 ON tro.destination_store_id = s2.id
     JOIN users u1 ON tro.requested_by_user_id = u1.id
     LEFT JOIN users u2 ON tro.approved_by_user_id = u2.id
     WHERE tro.id = $1 AND tro.organization_id = $2`,
    [transferOrderId, organizationId],
  );

  const orderRow = orderRes.rows[0];
  if (!orderRow) {
    return null;
  }

  const itemsRes = await runner.query<TransferOrderItemRow>(
    `SELECT toi.*,
            sk.sku_code,
            ii.serial_number
     FROM transfer_order_items toi
     JOIN product_skus sk ON toi.product_sku_id = sk.id
     JOIN inventory_items ii ON toi.inventory_item_id = ii.id
     WHERE toi.transfer_order_id = $1
     ORDER BY toi.created_at ASC`,
    [transferOrderId],
  );

  const items = itemsRes.rows.map(mapTransferOrderItem);
  return mapTransferOrder(orderRow, items);
}

export async function listTransferOrders(
  organizationId: string,
  queryFilters: ListTransferOrdersQuery,
): Promise<{ orders: TransferOrderRecord[]; total: number }> {
  const whereClauses: string[] = ["tro.organization_id = $1"];
  const params: unknown[] = [organizationId];
  let paramIdx = 2;

  if (queryFilters.sourceStoreId) {
    whereClauses.push(`tro.source_store_id = $${paramIdx++}`);
    params.push(queryFilters.sourceStoreId);
  }

  if (queryFilters.destinationStoreId) {
    whereClauses.push(`tro.destination_store_id = $${paramIdx++}`);
    params.push(queryFilters.destinationStoreId);
  }

  if (queryFilters.status) {
    whereClauses.push(`tro.status = $${paramIdx++}`);
    params.push(queryFilters.status);
  }

  if (queryFilters.priority) {
    whereClauses.push(`tro.priority = $${paramIdx++}`);
    params.push(queryFilters.priority);
  }

  const whereSql = whereClauses.join(" AND ");

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM transfer_orders tro WHERE ${whereSql}`,
    params,
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  const listParams = [...params, queryFilters.limit, queryFilters.offset];
  const listRes = await query<TransferOrderRow>(
    `SELECT tro.*,
            s1.name as source_store_name,
            s2.name as destination_store_name,
            CONCAT(u1.first_name, ' ', u1.last_name) as requested_by_user_name,
            CASE WHEN u2.id IS NOT NULL THEN CONCAT(u2.first_name, ' ', u2.last_name) ELSE NULL END as approved_by_user_name
     FROM transfer_orders tro
     JOIN stores s1 ON tro.source_store_id = s1.id
     JOIN stores s2 ON tro.destination_store_id = s2.id
     JOIN users u1 ON tro.requested_by_user_id = u1.id
     LEFT JOIN users u2 ON tro.approved_by_user_id = u2.id
     WHERE ${whereSql}
     ORDER BY tro.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    listParams,
  );

  const orders = listRes.rows.map(row => mapTransferOrder(row));
  return { orders, total };
}
