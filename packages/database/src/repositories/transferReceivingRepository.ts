import {
  ValidationError,
  NotFoundError,
  ManifestStatus,
  SealStatus,
  TransferOrderStatus,
  TransferOrderItemStatus,
  DisputeClaimType,
  DisputeSeverity,
  DisputeStatus,
  type ReceiveTransferManifestInput,
  type CreateTransferDisputeInput,
  type ResolveTransferDisputeInput,
  type ListTransferDisputesQuery,
  type TransferDisputeRecord,
  type TransferOrderRecord,
  type TransferManifestRecord,
} from "@jewelcore/shared";
import { query } from "../pool.js";
import { withTransaction, type TransactionClient } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";
import { getTransferOrderById } from "./transferOrderRepository.js";
import { getTransferManifestById } from "./transferDispatchRepository.js";

type DbClient = TransactionClient | { query: typeof query };

interface DisputeRow {
  id: string;
  organization_id: string;
  transfer_order_id: string;
  order_number?: string;
  transfer_manifest_id: string;
  manifest_number?: string;
  claim_type: DisputeClaimType;
  severity: DisputeSeverity;
  status: DisputeStatus;
  reported_by_user_id: string;
  reported_by_user_name?: string;
  witness_user_id: string;
  witness_user_name?: string;
  inventory_item_id: string | null;
  serial_number?: string | null;
  details: string;
  resolution_notes: string | null;
  resolved_by_user_id: string | null;
  resolved_by_user_name?: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapDispute(row: DisputeRow): TransferDisputeRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    transferOrderId: row.transfer_order_id,
    orderNumber: row.order_number,
    transferManifestId: row.transfer_manifest_id,
    manifestNumber: row.manifest_number,
    claimType: row.claim_type,
    severity: row.severity,
    status: row.status,
    reportedByUserId: row.reported_by_user_id,
    reportedByUserName: row.reported_by_user_name,
    witnessUserId: row.witness_user_id,
    witnessUserName: row.witness_user_name,
    inventoryItemId: row.inventory_item_id,
    serialNumber: row.serial_number,
    details: row.details,
    resolutionNotes: row.resolution_notes,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedByUserName: row.resolved_by_user_name,
    resolvedAt: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : (row.resolved_at ? String(row.resolved_at) : null),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export interface ReceiveTransferResult {
  order: TransferOrderRecord;
  manifest: TransferManifestRecord;
  disputes: TransferDisputeRecord[];
}

export async function receiveTransferManifest(
  organizationId: string,
  receiverUserId: string,
  manifestId: string,
  input: ReceiveTransferManifestInput,
): Promise<ReceiveTransferResult> {
  // 1. Dual custody receiving check (INV-13)
  if (receiverUserId === input.witnessUserId) {
    throw new ValidationError("Dual-custody receiving inspection requires distinct receiving and witness users (INV-13)");
  }

  // 2. Witness user verification
  const witnessRes = await query<{ id: string; is_active: boolean }>(
    `SELECT id, is_active FROM users WHERE id = $1 AND organization_id = $2`,
    [input.witnessUserId, organizationId],
  );
  if (!witnessRes.rows[0] || !witnessRes.rows[0].is_active) {
    throw new NotFoundError("Witness user not found or inactive");
  }

  return withTransaction(async (client) => {
    // 3. Manifest and Order verification
    const manifestRes = await client.query<{
      id: string;
      transfer_order_id: string;
      manifest_number: string;
      status: string;
    }>(
      `SELECT id, transfer_order_id, manifest_number, status
       FROM transfer_manifests
       WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [manifestId, organizationId],
    );

    const manifest = manifestRes.rows[0];
    if (!manifest) {
      throw new NotFoundError(`Transfer manifest ${manifestId} not found`);
    }

    if (manifest.status !== ManifestStatus.DISPATCHED && manifest.status !== ManifestStatus.IN_TRANSIT) {
      throw new ValidationError(`Transfer manifest is in ${manifest.status} status and cannot be received`);
    }

    const orderRes = await client.query<{
      id: string;
      source_store_id: string;
      destination_store_id: string;
      status: string;
      order_number: string;
    }>(
      `SELECT id, source_store_id, destination_store_id, status, order_number
       FROM transfer_orders
       WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [manifest.transfer_order_id, organizationId],
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new NotFoundError(`Transfer order ${manifest.transfer_order_id} not found`);
    }

    // 4. Compartment verification (must belong to destination store - INV-11)
    const compRes = await client.query<{ id: string; store_id: string }>(
      `SELECT id, store_id FROM compartments WHERE id = $1`,
      [input.destinationCompartmentId],
    );

    const comp = compRes.rows[0];
    if (!comp) {
      throw new NotFoundError(`Destination compartment ${input.destinationCompartmentId} not found`);
    }

    if (comp.store_id !== order.destination_store_id) {
      throw new ValidationError("Destination compartment does not belong to receiving branch (INV-11)");
    }

    const createdDisputes: TransferDisputeRecord[] = [];

    // 5. Seal Verification
    const existingSealsRes = await client.query<{
      id: string;
      seal_number: string;
      status: string;
    }>(
      `SELECT id, seal_number, status FROM security_seals WHERE transfer_manifest_id = $1 FOR UPDATE`,
      [manifestId],
    );

    for (const seal of existingSealsRes.rows) {
      const ver = input.sealVerifications.find(v => v.sealNumber === seal.seal_number);
      if (!ver) {
        throw new ValidationError(`Verification missing for security seal ${seal.seal_number}`);
      }

      await client.query(
        `UPDATE security_seals
         SET status = $1, verified_at = clock_timestamp(), verified_by_user_id = $2
         WHERE id = $3`,
        [ver.status, receiverUserId, seal.id],
      );

      if (ver.status === SealStatus.BROKEN_TAMPERED || ver.status === SealStatus.DAMAGED) {
        const disputeId = uuidv7();
        const disputeInsert = await client.query<DisputeRow>(
          `INSERT INTO transfer_disputes (
            id, organization_id, transfer_order_id, transfer_manifest_id, claim_type,
            severity, status, reported_by_user_id, witness_user_id, details, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, clock_timestamp(), clock_timestamp())
          RETURNING *`,
          [
            disputeId,
            organizationId,
            order.id,
            manifestId,
            DisputeClaimType.DAMAGED_SEAL,
            DisputeSeverity.CRITICAL,
            DisputeStatus.OPEN,
            receiverUserId,
            input.witnessUserId,
            `Security seal ${seal.seal_number} was verified as ${ver.status}. Notes: ${ver.notes || "None"}`,
          ],
        );
        createdDisputes.push(mapDispute(disputeInsert.rows[0]!));
      }
    }

    // 6. Piece Ingestion and Reconciliation
    const itemsRes = await client.query<{
      id: string;
      inventory_item_id: string;
      product_sku_id: string;
    }>(
      `SELECT id, inventory_item_id, product_sku_id
       FROM transfer_order_items
       WHERE transfer_order_id = $1`,
      [order.id],
    );

    const receivedSet = new Set(input.receivedItemIds);

    for (const item of itemsRes.rows) {
      const pieceRes = await client.query<{
        id: string;
        serial_number: string;
        gross_weight_grams: string | number;
        custody_state: string;
      }>(
        `SELECT id, serial_number, gross_weight_grams, custody_state
         FROM inventory_items
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [item.inventory_item_id, organizationId],
      );

      const piece = pieceRes.rows[0];
      if (!piece) {
        throw new NotFoundError(`Inventory item ${item.inventory_item_id} not found`);
      }

      if (receivedSet.has(piece.id)) {
        // Piece received intact -> Ingest into destination store & compartment
        await client.query(
          `UPDATE inventory_items
           SET store_id = $1, current_compartment_id = $2, custody_state = 'IN_VAULT', updated_at = clock_timestamp()
           WHERE id = $3`,
          [order.destination_store_id, input.destinationCompartmentId, piece.id],
        );

        // Movement record: INTAKE_PLACEMENT
        await client.query(
          `INSERT INTO inventory_movements (
            id, organization_id, store_id, inventory_item_id, product_sku_id, movement_type,
            from_compartment_id, to_compartment_id, from_custody_state, to_custody_state,
            quantity, weight_grams, actor_user_id, reason_code, reference_document_type,
            reference_document_id, moved_at, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'INTAKE_PLACEMENT',
            NULL, $6, 'IN_TRANSIT', 'IN_VAULT',
            1, $7, $8, 'TRANSFER_RECEIPT_INGESTION', 'TRANSFER_ORDER',
            $9, clock_timestamp(), clock_timestamp()
          )`,
          [
            uuidv7(),
            organizationId,
            order.destination_store_id,
            piece.id,
            item.product_sku_id,
            input.destinationCompartmentId,
            piece.gross_weight_grams,
            receiverUserId,
            order.id,
          ],
        );

        // State history: CUSTODY
        await client.query(
          `INSERT INTO inventory_status_history (
            id, organization_id, inventory_item_id, dimension_changed, old_state, new_state,
            actor_user_id, reason, transitioned_at, created_at
          ) VALUES ($1, $2, $3, 'CUSTODY', 'IN_TRANSIT', 'IN_VAULT', $4, $5, clock_timestamp(), clock_timestamp())`,
          [
            uuidv7(),
            organizationId,
            piece.id,
            receiverUserId,
            `Received at store ${order.destination_store_id} via manifest ${manifest.manifest_number}`,
          ],
        );

        // Update line item: RECEIVED
        await client.query(
          `UPDATE transfer_order_items SET status = $1 WHERE id = $2`,
          [TransferOrderItemStatus.RECEIVED, item.id],
        );
      } else {
        // Missing Piece / Transit Loss (Architectural Gap 2)
        await client.query(
          `UPDATE inventory_items
           SET custody_state = 'MISSING', current_compartment_id = NULL, updated_at = clock_timestamp()
           WHERE id = $1`,
          [piece.id],
        );

        // Movement record: AUDIT_ADJUSTMENT to MISSING
        await client.query(
          `INSERT INTO inventory_movements (
            id, organization_id, store_id, inventory_item_id, product_sku_id, movement_type,
            from_compartment_id, to_compartment_id, from_custody_state, to_custody_state,
            quantity, weight_grams, actor_user_id, reason_code, reference_document_type,
            reference_document_id, moved_at, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'AUDIT_ADJUSTMENT',
            NULL, NULL, 'IN_TRANSIT', 'MISSING',
            1, $6, $7, 'TRANSIT_LOSS_DISCREPANCY', 'TRANSFER_DISPUTE',
            $8, clock_timestamp(), clock_timestamp()
          )`,
          [
            uuidv7(),
            organizationId,
            order.destination_store_id,
            piece.id,
            item.product_sku_id,
            piece.gross_weight_grams,
            receiverUserId,
            manifestId,
          ],
        );

        // State history: CUSTODY to MISSING
        await client.query(
          `INSERT INTO inventory_status_history (
            id, organization_id, inventory_item_id, dimension_changed, old_state, new_state,
            actor_user_id, reason, transitioned_at, created_at
          ) VALUES ($1, $2, $3, 'CUSTODY', 'IN_TRANSIT', 'MISSING', $4, $5, clock_timestamp(), clock_timestamp())`,
          [
            uuidv7(),
            organizationId,
            piece.id,
            receiverUserId,
            `Piece missing upon receipt of manifest ${manifest.manifest_number}`,
          ],
        );

        // Update line item: DISPUTED
        await client.query(
          `UPDATE transfer_order_items SET status = $1 WHERE id = $2`,
          [TransferOrderItemStatus.DISPUTED, item.id],
        );

        // Create Dispute
        const disputeId = uuidv7();
        const disputeInsert = await client.query<DisputeRow>(
          `INSERT INTO transfer_disputes (
            id, organization_id, transfer_order_id, transfer_manifest_id, claim_type,
            severity, status, reported_by_user_id, witness_user_id, inventory_item_id,
            details, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, clock_timestamp(), clock_timestamp())
          RETURNING *`,
          [
            disputeId,
            organizationId,
            order.id,
            manifestId,
            DisputeClaimType.MISSING_PIECE,
            DisputeSeverity.CRITICAL,
            DisputeStatus.OPEN,
            receiverUserId,
            input.witnessUserId,
            piece.id,
            `Piece ${piece.serial_number} was missing from manifest parcel ${manifest.manifest_number}`,
          ],
        );
        createdDisputes.push(mapDispute(disputeInsert.rows[0]!));
      }
    }

    // 7. Final status updates
    const hasDisputes = createdDisputes.length > 0;
    const finalOrderStatus = hasDisputes ? TransferOrderStatus.DISPUTED : TransferOrderStatus.COMPLETED;
    const finalManifestStatus = hasDisputes ? ManifestStatus.DISPUTED : ManifestStatus.RECEIVED;

    await client.query(
      `UPDATE transfer_orders SET status = $1, updated_at = clock_timestamp() WHERE id = $2`,
      [finalOrderStatus, order.id],
    );

    await client.query(
      `UPDATE transfer_manifests SET status = $1 WHERE id = $2`,
      [finalManifestStatus, manifestId],
    );

    // Audit event
    await client.query(
      `INSERT INTO audit_events (
        id, organization_id, resource_type, resource_id, action, actor_user_id, payload_after_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
      [
        uuidv7(),
        organizationId,
        "TRANSFER_MANIFEST",
        manifestId,
        hasDisputes ? "TRANSFER_RECEIVED_WITH_DISPUTES" : "TRANSFER_RECEIVED_CLEAN",
        receiverUserId,
        JSON.stringify({
          manifestId,
          orderId: order.id,
          disputesCount: createdDisputes.length,
          receivedPiecesCount: receivedSet.size,
          finalStatus: finalManifestStatus,
        }),
      ],
    );

    const updatedOrder = await getTransferOrderById(organizationId, order.id, client);
    const updatedManifest = await getTransferManifestById(organizationId, manifestId, client);

    return {
      order: updatedOrder!,
      manifest: updatedManifest!,
      disputes: createdDisputes,
    };
  });
}

export async function createTransferDispute(
  organizationId: string,
  reportedByUserId: string,
  input: CreateTransferDisputeInput,
): Promise<TransferDisputeRecord> {
  if (reportedByUserId === input.witnessUserId) {
    throw new ValidationError("Dual-custody dispute reporting requires distinct reporter and witness users (INV-13)");
  }

  const disputeId = uuidv7();
  const insertRes = await query<DisputeRow>(
    `INSERT INTO transfer_disputes (
      id, organization_id, transfer_order_id, transfer_manifest_id, claim_type,
      severity, status, reported_by_user_id, witness_user_id, inventory_item_id,
      details, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, clock_timestamp(), clock_timestamp())
    RETURNING *`,
    [
      disputeId,
      organizationId,
      input.transferOrderId,
      input.transferManifestId,
      input.claimType,
      input.severity,
      DisputeStatus.OPEN,
      reportedByUserId,
      input.witnessUserId,
      input.inventoryItemId || null,
      input.details,
    ],
  );

  return mapDispute(insertRes.rows[0]!);
}

export async function resolveTransferDispute(
  organizationId: string,
  disputeId: string,
  resolvedByUserId: string,
  input: ResolveTransferDisputeInput,
): Promise<TransferDisputeRecord> {
  const disputeRes = await query<DisputeRow>(
    `SELECT * FROM transfer_disputes WHERE id = $1 AND organization_id = $2`,
    [disputeId, organizationId],
  );

  const dispute = disputeRes.rows[0];
  if (!dispute) {
    throw new NotFoundError(`Transfer dispute ${disputeId} not found`);
  }

  if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.WRITTEN_OFF) {
    throw new ValidationError(`Dispute is already closed (current status: ${dispute.status})`);
  }

  const updateRes = await query<DisputeRow>(
    `UPDATE transfer_disputes
     SET status = $1, resolution_notes = $2, resolved_by_user_id = $3, resolved_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE id = $4 AND organization_id = $5
     RETURNING *`,
    [input.resolutionStatus, input.resolutionNotes, resolvedByUserId, disputeId, organizationId],
  );

  await query(
    `INSERT INTO audit_events (
      id, organization_id, resource_type, resource_id, action, actor_user_id, payload_after_json, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`,
    [
      uuidv7(),
      organizationId,
      "TRANSFER_DISPUTE",
      disputeId,
      "TRANSFER_DISPUTE_RESOLVED",
      resolvedByUserId,
      JSON.stringify({ resolutionStatus: input.resolutionStatus, resolutionNotes: input.resolutionNotes }),
    ],
  );

  return mapDispute(updateRes.rows[0]!);
}

export async function getTransferDisputeById(
  organizationId: string,
  disputeId: string,
  dbClient?: DbClient,
): Promise<TransferDisputeRecord | null> {
  const runner = dbClient || { query };

  const res = await runner.query<DisputeRow>(
    `SELECT td.*,
            tro.order_number,
            tm.manifest_number,
            CONCAT(u1.first_name, ' ', u1.last_name) as reported_by_user_name,
            CONCAT(u2.first_name, ' ', u2.last_name) as witness_user_name,
            CASE WHEN u3.id IS NOT NULL THEN CONCAT(u3.first_name, ' ', u3.last_name) ELSE NULL END as resolved_by_user_name,
            ii.serial_number
     FROM transfer_disputes td
     JOIN transfer_orders tro ON td.transfer_order_id = tro.id
     JOIN transfer_manifests tm ON td.transfer_manifest_id = tm.id
     JOIN users u1 ON td.reported_by_user_id = u1.id
     JOIN users u2 ON td.witness_user_id = u2.id
     LEFT JOIN users u3 ON td.resolved_by_user_id = u3.id
     LEFT JOIN inventory_items ii ON td.inventory_item_id = ii.id
     WHERE td.id = $1 AND td.organization_id = $2`,
    [disputeId, organizationId],
  );

  if (res.rows.length === 0) {
    return null;
  }
  return mapDispute(res.rows[0]!);
}

export async function listTransferDisputes(
  organizationId: string,
  queryFilters: ListTransferDisputesQuery,
): Promise<{ disputes: TransferDisputeRecord[]; total: number }> {
  const whereClauses: string[] = ["td.organization_id = $1"];
  const params: unknown[] = [organizationId];
  let paramIdx = 2;

  if (queryFilters.transferOrderId) {
    whereClauses.push(`td.transfer_order_id = $${paramIdx++}`);
    params.push(queryFilters.transferOrderId);
  }

  if (queryFilters.transferManifestId) {
    whereClauses.push(`td.transfer_manifest_id = $${paramIdx++}`);
    params.push(queryFilters.transferManifestId);
  }

  if (queryFilters.claimType) {
    whereClauses.push(`td.claim_type = $${paramIdx++}`);
    params.push(queryFilters.claimType);
  }

  if (queryFilters.severity) {
    whereClauses.push(`td.severity = $${paramIdx++}`);
    params.push(queryFilters.severity);
  }

  if (queryFilters.status) {
    whereClauses.push(`td.status = $${paramIdx++}`);
    params.push(queryFilters.status);
  }

  const whereSql = whereClauses.join(" AND ");

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM transfer_disputes td WHERE ${whereSql}`,
    params,
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  const listParams = [...params, queryFilters.limit, queryFilters.offset];
  const listRes = await query<DisputeRow>(
    `SELECT td.*,
            tro.order_number,
            tm.manifest_number,
            CONCAT(u1.first_name, ' ', u1.last_name) as reported_by_user_name,
            CONCAT(u2.first_name, ' ', u2.last_name) as witness_user_name,
            CASE WHEN u3.id IS NOT NULL THEN CONCAT(u3.first_name, ' ', u3.last_name) ELSE NULL END as resolved_by_user_name,
            ii.serial_number
     FROM transfer_disputes td
     JOIN transfer_orders tro ON td.transfer_order_id = tro.id
     JOIN transfer_manifests tm ON td.transfer_manifest_id = tm.id
     JOIN users u1 ON td.reported_by_user_id = u1.id
     JOIN users u2 ON td.witness_user_id = u2.id
     LEFT JOIN users u3 ON td.resolved_by_user_id = u3.id
     LEFT JOIN inventory_items ii ON td.inventory_item_id = ii.id
     WHERE ${whereSql}
     ORDER BY td.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    listParams,
  );

  const disputes = listRes.rows.map(row => mapDispute(row));
  return { disputes, total };
}
