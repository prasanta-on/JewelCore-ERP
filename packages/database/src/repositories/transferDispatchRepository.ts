import {
  ValidationError,
  NotFoundError,
  ManifestStatus,
  SealStatus,
  SealType,
  TransferOrderStatus,
  TransferOrderItemStatus,
  type CreateTransferManifestInput,
  type ListTransferManifestsQuery,
  type TransferManifestRecord,
  type SecuritySealRecord,
} from "@jewelcore/shared";
import { query } from "../pool.js";
import { withTransaction, type TransactionClient } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";

type DbClient = TransactionClient | { query: typeof query };

interface ManifestRow {
  id: string;
  organization_id: string;
  manifest_number: string;
  transfer_order_id: string;
  order_number?: string;
  dispatcher_user_id: string;
  dispatcher_user_name?: string;
  witness_user_id: string;
  witness_user_name?: string;
  carrier_name: string;
  tracking_number: string | null;
  estimated_arrival: Date | null;
  dispatched_at: Date;
  status: ManifestStatus;
  notes: string | null;
  created_at: Date;
}

interface SealRow {
  id: string;
  organization_id: string;
  transfer_manifest_id: string;
  seal_number: string;
  seal_type: SealType;
  status: SealStatus;
  verified_at: Date | null;
  verified_by_user_id: string | null;
  created_at: Date;
}

function mapSeal(row: SealRow): SecuritySealRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    transferManifestId: row.transfer_manifest_id,
    sealNumber: row.seal_number,
    sealType: row.seal_type,
    status: row.status,
    verifiedAt: row.verified_at instanceof Date ? row.verified_at.toISOString() : (row.verified_at ? String(row.verified_at) : null),
    verifiedByUserId: row.verified_by_user_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

function mapManifest(row: ManifestRow, seals?: SecuritySealRecord[]): TransferManifestRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    manifestNumber: row.manifest_number,
    transferOrderId: row.transfer_order_id,
    orderNumber: row.order_number,
    dispatcherUserId: row.dispatcher_user_id,
    dispatcherUserName: row.dispatcher_user_name,
    witnessUserId: row.witness_user_id,
    witnessUserName: row.witness_user_name,
    carrierName: row.carrier_name,
    trackingNumber: row.tracking_number,
    estimatedArrival: row.estimated_arrival instanceof Date ? row.estimated_arrival.toISOString() : (row.estimated_arrival ? String(row.estimated_arrival) : null),
    dispatchedAt: row.dispatched_at instanceof Date ? row.dispatched_at.toISOString() : String(row.dispatched_at),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    seals,
  };
}

export async function dispatchTransferOrder(
  organizationId: string,
  dispatcherUserId: string,
  input: CreateTransferManifestInput,
): Promise<TransferManifestRecord> {
  // 1. Dual custody enforcement (INV-13)
  if (dispatcherUserId === input.witnessUserId) {
    throw new ValidationError("Dual-custody sign-off requires distinct dispatcher and witness users (INV-13)");
  }

  // 2. Witness user verification
  const witnessRes = await query<{ id: string; is_active: boolean }>(
    `SELECT id, is_active FROM users WHERE id = $1 AND organization_id = $2`,
    [input.witnessUserId, organizationId],
  );

  const witness = witnessRes.rows[0];
  if (!witness || !witness.is_active) {
    throw new NotFoundError("Witness user not found or inactive");
  }

  // 3. Tamper-evident seal requirement (INV-16)
  if (!input.sealNumbers || input.sealNumbers.length === 0) {
    throw new ValidationError("At least one tamper-evident security seal is required (INV-16)");
  }

  const manifestId = uuidv7();
  const manifestNumber = input.manifestNumber || `MNF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;

  return withTransaction(async (client) => {
    // 4. Verify Transfer Order
    const orderRes = await client.query<{
      id: string;
      status: string;
      source_store_id: string;
      destination_store_id: string;
      order_number: string;
    }>(
      `SELECT id, status, source_store_id, destination_store_id, order_number
       FROM transfer_orders
       WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [input.transferOrderId, organizationId],
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new NotFoundError(`Transfer order ${input.transferOrderId} not found`);
    }

    if (order.status !== TransferOrderStatus.APPROVED) {
      throw new ValidationError(`Transfer order must be in APPROVED state to dispatch (current state: ${order.status})`);
    }

    // 5. Fetch and validate transfer order items
    const itemsRes = await client.query<{
      id: string;
      inventory_item_id: string;
      product_sku_id: string;
      status: string;
    }>(
      `SELECT id, inventory_item_id, product_sku_id, status
       FROM transfer_order_items
       WHERE transfer_order_id = $1`,
      [input.transferOrderId],
    );

    if (itemsRes.rows.length === 0) {
      throw new ValidationError("Cannot dispatch transfer order with zero items");
    }

    // 6. Insert transfer_manifests record
    await client.query(
      `INSERT INTO transfer_manifests (
        id, organization_id, manifest_number, transfer_order_id, dispatcher_user_id,
        witness_user_id, carrier_name, tracking_number, estimated_arrival, dispatched_at,
        status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp(), $10, $11, clock_timestamp())`,
      [
        manifestId,
        organizationId,
        manifestNumber,
        input.transferOrderId,
        dispatcherUserId,
        input.witnessUserId,
        input.carrierName,
        input.trackingNumber || null,
        input.estimatedArrival ? new Date(input.estimatedArrival) : null,
        ManifestStatus.DISPATCHED,
        input.notes || null,
      ],
    );

    // 7. Insert security_seals records (INV-16)
    for (const sealNum of input.sealNumbers) {
      const sealId = uuidv7();
      await client.query(
        `INSERT INTO security_seals (
          id, organization_id, transfer_manifest_id, seal_number, seal_type, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp())`,
        [sealId, organizationId, manifestId, sealNum, SealType.SECURITY_BAG, SealStatus.ATTACHED],
      );
    }

    // 8. Transition items into IN_TRANSIT and log movements
    for (const item of itemsRes.rows) {
      const pieceRes = await client.query<{
        id: string;
        store_id: string;
        current_compartment_id: string | null;
        custody_state: string;
        gross_weight_grams: string | number;
      }>(
        `SELECT id, store_id, current_compartment_id, custody_state, gross_weight_grams
         FROM inventory_items
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [item.inventory_item_id, organizationId],
      );

      const piece = pieceRes.rows[0];
      if (!piece) {
        throw new NotFoundError(`Inventory item ${item.inventory_item_id} not found`);
      }

      if (piece.custody_state !== "IN_VAULT") {
        throw new ValidationError(
          `Inventory item ${piece.id} is not IN_VAULT (current custody: ${piece.custody_state})`,
        );
      }

      // Custody movement ledger record (INV-09, INV-13, INV-16)
      const movementId = uuidv7();
      await client.query(
        `INSERT INTO inventory_movements (
          id, organization_id, store_id, inventory_item_id, product_sku_id, movement_type,
          from_compartment_id, to_compartment_id, from_custody_state, to_custody_state,
          quantity, weight_grams, actor_user_id, reason_code, reference_document_type,
          reference_document_id, moved_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, NULL, $8, $9,
          1, $10, $11, $12, $13,
          $14, clock_timestamp(), clock_timestamp()
        )`,
        [
          movementId,
          organizationId,
          order.source_store_id,
          piece.id,
          item.product_sku_id,
          "CUSTODY_DEPARTURE",
          piece.current_compartment_id,
          "IN_VAULT",
          "IN_TRANSIT",
          piece.gross_weight_grams,
          dispatcherUserId,
          "INTER_STORE_TRANSFER_DISPATCH",
          "TRANSFER_MANIFEST",
          manifestId,
        ],
      );

      // Update inventory_items
      await client.query(
        `UPDATE inventory_items
         SET custody_state = 'IN_TRANSIT', current_compartment_id = NULL, updated_at = clock_timestamp()
         WHERE id = $1`,
        [piece.id],
      );

      // Record state history
      await client.query(
        `INSERT INTO inventory_status_history (
          id, organization_id, inventory_item_id, dimension_changed, old_state, new_state,
          actor_user_id, reason, transitioned_at, created_at
        ) VALUES ($1, $2, $3, 'CUSTODY', $4, $5, $6, $7, clock_timestamp(), clock_timestamp())`,
        [
          uuidv7(),
          organizationId,
          piece.id,
          "IN_VAULT",
          "IN_TRANSIT",
          dispatcherUserId,
          `Dispatched via manifest ${manifestNumber} with seals: ${input.sealNumbers.join(", ")}`,
        ],
      );

      // Update transfer_order_items status
      await client.query(
        `UPDATE transfer_order_items SET status = $1 WHERE id = $2`,
        [TransferOrderItemStatus.DISPATCHED, item.id],
      );
    }

    // 9. Update transfer_orders status to IN_TRANSIT
    await client.query(
      `UPDATE transfer_orders SET status = $1, updated_at = clock_timestamp() WHERE id = $2`,
      [TransferOrderStatus.IN_TRANSIT, input.transferOrderId],
    );

    // 10. Audit event
    await client.query(
      `INSERT INTO audit_events (
        id, organization_id, resource_type, resource_id, action, actor_user_id, payload_after_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
      [
        uuidv7(),
        organizationId,
        "TRANSFER_MANIFEST",
        manifestId,
        "TRANSFER_MANIFEST_DISPATCHED",
        dispatcherUserId,
        JSON.stringify({
          manifestNumber,
          transferOrderId: input.transferOrderId,
          witnessUserId: input.witnessUserId,
          carrierName: input.carrierName,
          sealsCount: input.sealNumbers.length,
        }),
      ],
    );

    const fullManifest = await getTransferManifestById(organizationId, manifestId, client);
    return fullManifest!;
  });
}

export async function getTransferManifestById(
  organizationId: string,
  manifestId: string,
  dbClient?: DbClient,
): Promise<TransferManifestRecord | null> {
  const runner = dbClient || { query };

  const manifestRes = await runner.query<ManifestRow>(
    `SELECT tm.*,
            tro.order_number,
            CONCAT(u1.first_name, ' ', u1.last_name) as dispatcher_user_name,
            CONCAT(u2.first_name, ' ', u2.last_name) as witness_user_name
     FROM transfer_manifests tm
     JOIN transfer_orders tro ON tm.transfer_order_id = tro.id
     JOIN users u1 ON tm.dispatcher_user_id = u1.id
     JOIN users u2 ON tm.witness_user_id = u2.id
     WHERE tm.id = $1 AND tm.organization_id = $2`,
    [manifestId, organizationId],
  );

  const manifestRow = manifestRes.rows[0];
  if (!manifestRow) {
    return null;
  }

  const sealsRes = await runner.query<SealRow>(
    `SELECT * FROM security_seals WHERE transfer_manifest_id = $1 ORDER BY created_at ASC`,
    [manifestId],
  );

  const seals = sealsRes.rows.map(mapSeal);
  return mapManifest(manifestRow, seals);
}

export async function getTransferManifestByOrderId(
  organizationId: string,
  transferOrderId: string,
  dbClient?: DbClient,
): Promise<TransferManifestRecord | null> {
  const runner = dbClient || { query };

  const manifestRes = await runner.query<ManifestRow>(
    `SELECT tm.*,
            tro.order_number,
            CONCAT(u1.first_name, ' ', u1.last_name) as dispatcher_user_name,
            CONCAT(u2.first_name, ' ', u2.last_name) as witness_user_name
     FROM transfer_manifests tm
     JOIN transfer_orders tro ON tm.transfer_order_id = tro.id
     JOIN users u1 ON tm.dispatcher_user_id = u1.id
     JOIN users u2 ON tm.witness_user_id = u2.id
     WHERE tm.transfer_order_id = $1 AND tm.organization_id = $2`,
    [transferOrderId, organizationId],
  );

  const manifestRow = manifestRes.rows[0];
  if (!manifestRow) {
    return null;
  }

  const sealsRes = await runner.query<SealRow>(
    `SELECT * FROM security_seals WHERE transfer_manifest_id = $1 ORDER BY created_at ASC`,
    [manifestRow.id],
  );

  const seals = sealsRes.rows.map(mapSeal);
  return mapManifest(manifestRow, seals);
}

export async function listTransferManifests(
  organizationId: string,
  queryFilters: ListTransferManifestsQuery,
): Promise<{ manifests: TransferManifestRecord[]; total: number }> {
  const whereClauses: string[] = ["tm.organization_id = $1"];
  const params: unknown[] = [organizationId];
  let paramIdx = 2;

  if (queryFilters.transferOrderId) {
    whereClauses.push(`tm.transfer_order_id = $${paramIdx++}`);
    params.push(queryFilters.transferOrderId);
  }

  if (queryFilters.status) {
    whereClauses.push(`tm.status = $${paramIdx++}`);
    params.push(queryFilters.status);
  }

  const whereSql = whereClauses.join(" AND ");

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM transfer_manifests tm WHERE ${whereSql}`,
    params,
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  const listParams = [...params, queryFilters.limit, queryFilters.offset];
  const listRes = await query<ManifestRow>(
    `SELECT tm.*,
            tro.order_number,
            CONCAT(u1.first_name, ' ', u1.last_name) as dispatcher_user_name,
            CONCAT(u2.first_name, ' ', u2.last_name) as witness_user_name
     FROM transfer_manifests tm
     JOIN transfer_orders tro ON tm.transfer_order_id = tro.id
     JOIN users u1 ON tm.dispatcher_user_id = u1.id
     JOIN users u2 ON tm.witness_user_id = u2.id
     WHERE ${whereSql}
     ORDER BY tm.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    listParams,
  );

  const manifests = listRes.rows.map(row => mapManifest(row));
  return { manifests, total };
}
