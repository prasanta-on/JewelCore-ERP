import type { Pool, PoolClient } from "pg";
import {
  type Shipment,
  type ShipmentItem,
  type ShipmentWithItems,
  type ShipmentStatus,
  type ShipmentReconciliationStatus,
  type CreateShipmentItemInput,
  ConflictError,
  UnprocessableEntityError,
  NotFoundError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";
import { withTransaction } from "../transaction.js";
import { getGrnById } from "./grnRepository.js";

type Queryable = Pool | PoolClient;

export interface ShipmentRow {
  id: string;
  goods_receipt_note_id: string;
  shipment_number: string;
  carrier_name: string | null;
  tracking_number: string | null;
  declared_package_count: number | string;
  received_package_count: number | string;
  gross_package_weight_grams: string | null;
  status: ShipmentStatus;
  received_at: Date;
  received_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface ShipmentItemRow {
  id: string;
  shipment_id: string;
  product_sku_id: string;
  line_number: number | string;
  supplier_item_code: string | null;
  declared_piece_count: number | string;
  received_piece_count: number | string;
  declared_gross_weight_grams: string | null;
  measured_gross_weight_grams: string | null;
  declared_net_weight_grams: string | null;
  unit_labour_making_cost: string | null;
  line_total_settlement: string | null;
  reconciliation_status: ShipmentReconciliationStatus;
  discrepancy_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToShipment(row: ShipmentRow): Shipment {
  return {
    id: row.id,
    goodsReceiptNoteId: row.goods_receipt_note_id,
    shipmentNumber: row.shipment_number,
    carrierName: row.carrier_name,
    trackingNumber: row.tracking_number,
    declaredPackageCount: Number(row.declared_package_count),
    receivedPackageCount: Number(row.received_package_count),
    grossPackageWeightGrams:
      row.gross_package_weight_grams !== null
        ? parseFloat(row.gross_package_weight_grams)
        : null,
    status: row.status,
    receivedAt: row.received_at,
    receivedByUserId: row.received_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToShipmentItem(row: ShipmentItemRow): ShipmentItem {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    productSkuId: row.product_sku_id,
    lineNumber: Number(row.line_number),
    supplierItemCode: row.supplier_item_code,
    declaredPieceCount: Number(row.declared_piece_count),
    receivedPieceCount: Number(row.received_piece_count),
    declaredGrossWeightGrams:
      row.declared_gross_weight_grams !== null
        ? parseFloat(row.declared_gross_weight_grams)
        : null,
    measuredGrossWeightGrams:
      row.measured_gross_weight_grams !== null
        ? parseFloat(row.measured_gross_weight_grams)
        : null,
    declaredNetWeightGrams:
      row.declared_net_weight_grams !== null
        ? parseFloat(row.declared_net_weight_grams)
        : null,
    unitLabourMakingCost:
      row.unit_labour_making_cost !== null
        ? parseFloat(row.unit_labour_making_cost)
        : null,
    lineTotalSettlement:
      row.line_total_settlement !== null
        ? parseFloat(row.line_total_settlement)
        : null,
    reconciliationStatus: row.reconciliation_status,
    discrepancyReason: row.discrepancy_reason,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateShipmentParams {
  id?: string;
  goodsReceiptNoteId: string;
  shipmentNumber: string;
  carrierName?: string | null;
  trackingNumber?: string | null;
  declaredPackageCount?: number;
  receivedPackageCount?: number;
  grossPackageWeightGrams?: number | null;
  status?: ShipmentStatus;
  receivedAt?: Date;
  receivedByUserId: string;
  items?: CreateShipmentItemInput[];
}

/**
 * Creates a physical shipment package under a GRN and manifests its line items.
 * Enforces parent GRN validation and closed-GRN immutability (INV-06 / INV-19).
 */
export async function createShipment(
  params: CreateShipmentParams,
  clientOverride?: Queryable,
): Promise<ShipmentWithItems> {
  const executeOperation = async (
    client: Queryable,
  ): Promise<ShipmentWithItems> => {
    // 1. Verify parent GRN exists and is not CLOSED
    const parentGrn = await getGrnById(params.goodsReceiptNoteId, client);
    if (!parentGrn) {
      throw new NotFoundError("Goods Receipt Note", params.goodsReceiptNoteId);
    }
    if (parentGrn.status === "CLOSED") {
      throw new UnprocessableEntityError(
        "Cannot add shipment to a closed GRN",
        "ERR_GRN_IMMUTABLE",
      );
    }

    const shipmentId = params.id ?? uuidv7();

    try {
      const result = await client.query<ShipmentRow>(
        `
        INSERT INTO shipments (
          id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number,
          declared_package_count, received_package_count, gross_package_weight_grams,
          status, received_at, received_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number,
                  declared_package_count, received_package_count, gross_package_weight_grams,
                  status, received_at, received_by_user_id, created_at, updated_at;
        `,
        [
          shipmentId,
          params.goodsReceiptNoteId,
          params.shipmentNumber,
          params.carrierName ?? null,
          params.trackingNumber ?? null,
          params.declaredPackageCount ?? 1,
          params.receivedPackageCount ?? 1,
          params.grossPackageWeightGrams ?? null,
          params.status ?? "PENDING",
          params.receivedAt ?? new Date(),
          params.receivedByUserId,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to insert shipment record");
      }
      const shipment = mapRowToShipment(row);
      const createdItems: ShipmentItem[] = [];

      if (params.items && params.items.length > 0) {
        for (const item of params.items) {
          const itemId = uuidv7();
          const itemResult = await client.query<ShipmentItemRow>(
            `
            INSERT INTO shipment_items (
              id, shipment_id, product_sku_id, line_number, supplier_item_code,
              declared_piece_count, received_piece_count, declared_gross_weight_grams,
              measured_gross_weight_grams, declared_net_weight_grams, unit_labour_making_cost,
              line_total_settlement, reconciliation_status, discrepancy_reason, version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1)
            RETURNING id, shipment_id, product_sku_id, line_number, supplier_item_code,
                      declared_piece_count, received_piece_count, declared_gross_weight_grams,
                      measured_gross_weight_grams, declared_net_weight_grams, unit_labour_making_cost,
                      line_total_settlement, reconciliation_status, discrepancy_reason, version,
                      created_at, updated_at;
            `,
            [
              itemId,
              shipmentId,
              item.productSkuId,
              item.lineNumber,
              item.supplierItemCode ?? null,
              item.declaredPieceCount,
              item.receivedPieceCount ?? 0,
              item.declaredGrossWeightGrams ?? null,
              item.measuredGrossWeightGrams ?? null,
              item.declaredNetWeightGrams ?? null,
              item.unitLabourMakingCost ?? null,
              item.lineTotalSettlement ?? null,
              item.reconciliationStatus ?? "PENDING",
              item.discrepancyReason ?? null,
            ],
          );
          const itemRow = itemResult.rows[0];
          if (!itemRow) {
            throw new Error("Failed to insert shipment item record");
          }
          createdItems.push(mapRowToShipmentItem(itemRow));
        }
      }

      return {
        ...shipment,
        items: createdItems,
      };
    } catch (err: any) {
      if (err.constraint === "shipments_shipment_number_key") {
        throw new ConflictError(
          `Shipment with number '${params.shipmentNumber}' already exists`,
          "ERR_DUPLICATE_SHIPMENT_NUMBER",
        );
      }
      if (err.constraint === "uq_shipment_items_line") {
        throw new ConflictError(
          "Duplicate line number manifested for this shipment",
          "ERR_DUPLICATE_LINE_NUMBER",
        );
      }
      if (err.constraint === "shipment_items_product_sku_id_fkey") {
        throw new UnprocessableEntityError(
          "Referenced product SKU does not exist",
          "ERR_SKU_NOT_FOUND",
        );
      }
      if (err.constraint === "shipments_received_by_user_id_fkey") {
        throw new UnprocessableEntityError(
          "Referenced receiver user does not exist",
          "ERR_USER_NOT_FOUND",
        );
      }
      throw err;
    }
  };

  if (clientOverride) {
    return executeOperation(clientOverride);
  }
  return withTransaction((tx) => executeOperation(tx.rawClient));
}

/**
 * Retrieves a shipment header by primary key ID.
 */
export async function getShipmentById(
  id: string,
  clientOverride?: Queryable,
): Promise<Shipment | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<ShipmentRow>(
    `
    SELECT id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number,
           declared_package_count, received_package_count, gross_package_weight_grams,
           status, received_at, received_by_user_id, created_at, updated_at
    FROM shipments
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToShipment(row) : null;
}

/**
 * Retrieves a complete shipment with all manifested line items ordered by line_number ASC.
 */
export async function getShipmentWithItems(
  id: string,
  clientOverride?: Queryable,
): Promise<ShipmentWithItems | null> {
  const executor = clientOverride ?? getPool();
  const shipment = await getShipmentById(id, executor);
  if (!shipment) {
    return null;
  }

  const items = await listShipmentItems(id, executor);
  return {
    ...shipment,
    items,
  };
}

/**
 * Retrieves a shipment by unique shipment document number.
 */
export async function getShipmentByNumber(
  shipmentNumber: string,
  clientOverride?: Queryable,
): Promise<Shipment | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<ShipmentRow>(
    `
    SELECT id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number,
           declared_package_count, received_package_count, gross_package_weight_grams,
           status, received_at, received_by_user_id, created_at, updated_at
    FROM shipments
    WHERE shipment_number = $1;
    `,
    [shipmentNumber],
  );

  const row = result.rows[0];
  return row ? mapRowToShipment(row) : null;
}

/**
 * Lists shipments filtered by GRN or status.
 */
export async function listShipments(
  filter?: {
    goodsReceiptNoteId?: string;
    status?: ShipmentStatus;
  },
  clientOverride?: Queryable,
): Promise<Shipment[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const values: any[] = [];

  if (filter?.goodsReceiptNoteId) {
    values.push(filter.goodsReceiptNoteId);
    conditions.push(`goods_receipt_note_id = $${values.length}`);
  }
  if (filter?.status) {
    values.push(filter.status);
    conditions.push(`status = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const query = `
    SELECT id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number,
           declared_package_count, received_package_count, gross_package_weight_grams,
           status, received_at, received_by_user_id, created_at, updated_at
    FROM shipments
    ${whereClause}
    ORDER BY created_at DESC;
  `;

  const result = await executor.query<ShipmentRow>(query, values);
  return result.rows.map(mapRowToShipment);
}

/**
 * Updates shipment package metadata. Rejects if parent GRN is CLOSED.
 */
export async function updateShipment(
  id: string,
  data: {
    carrierName?: string | null;
    trackingNumber?: string | null;
    declaredPackageCount?: number;
    receivedPackageCount?: number;
    grossPackageWeightGrams?: number | null;
    status?: ShipmentStatus;
  },
  clientOverride?: Queryable,
): Promise<Shipment> {
  const executor = clientOverride ?? getPool();

  const existing = await getShipmentById(id, executor);
  if (!existing) {
    throw new NotFoundError("Shipment", id);
  }

  // Verify parent GRN is not closed
  const parentGrn = await getGrnById(existing.goodsReceiptNoteId, executor);
  if (parentGrn && parentGrn.status === "CLOSED") {
    throw new UnprocessableEntityError(
      "Parent GRN is closed and locked",
      "ERR_GRN_IMMUTABLE",
    );
  }

  const updates: string[] = [];
  const values: any[] = [id];

  if (data.carrierName !== undefined) {
    values.push(data.carrierName);
    updates.push(`carrier_name = $${values.length}`);
  }
  if (data.trackingNumber !== undefined) {
    values.push(data.trackingNumber);
    updates.push(`tracking_number = $${values.length}`);
  }
  if (data.declaredPackageCount !== undefined) {
    values.push(data.declaredPackageCount);
    updates.push(`declared_package_count = $${values.length}`);
  }
  if (data.receivedPackageCount !== undefined) {
    values.push(data.receivedPackageCount);
    updates.push(`received_package_count = $${values.length}`);
  }
  if (data.grossPackageWeightGrams !== undefined) {
    values.push(data.grossPackageWeightGrams);
    updates.push(`gross_package_weight_grams = $${values.length}`);
  }
  if (data.status !== undefined) {
    values.push(data.status);
    updates.push(`status = $${values.length}`);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE shipments
    SET ${updates.join(", ")}
    WHERE id = $1
    RETURNING id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number,
              declared_package_count, received_package_count, gross_package_weight_grams,
              status, received_at, received_by_user_id, created_at, updated_at;
  `;

  const result = await executor.query<ShipmentRow>(query, values);
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("Shipment", id);
  }
  return mapRowToShipment(row);
}

/**
 * Adds an individual line item to an existing shipment.
 */
export async function addShipmentItem(
  shipmentId: string,
  item: CreateShipmentItemInput,
  clientOverride?: Queryable,
): Promise<ShipmentItem> {
  const executor = clientOverride ?? getPool();

  const shipment = await getShipmentById(shipmentId, executor);
  if (!shipment) {
    throw new NotFoundError("Shipment", shipmentId);
  }

  const parentGrn = await getGrnById(shipment.goodsReceiptNoteId, executor);
  if (parentGrn && parentGrn.status === "CLOSED") {
    throw new UnprocessableEntityError(
      "Parent GRN is closed and locked",
      "ERR_GRN_IMMUTABLE",
    );
  }

  const itemId = uuidv7();
  try {
    const result = await executor.query<ShipmentItemRow>(
      `
      INSERT INTO shipment_items (
        id, shipment_id, product_sku_id, line_number, supplier_item_code,
        declared_piece_count, received_piece_count, declared_gross_weight_grams,
        measured_gross_weight_grams, declared_net_weight_grams, unit_labour_making_cost,
        line_total_settlement, reconciliation_status, discrepancy_reason, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1)
      RETURNING id, shipment_id, product_sku_id, line_number, supplier_item_code,
                declared_piece_count, received_piece_count, declared_gross_weight_grams,
                measured_gross_weight_grams, declared_net_weight_grams, unit_labour_making_cost,
                line_total_settlement, reconciliation_status, discrepancy_reason, version,
                created_at, updated_at;
      `,
      [
        itemId,
        shipmentId,
        item.productSkuId,
        item.lineNumber,
        item.supplierItemCode ?? null,
        item.declaredPieceCount,
        item.receivedPieceCount ?? 0,
        item.declaredGrossWeightGrams ?? null,
        item.measuredGrossWeightGrams ?? null,
        item.declaredNetWeightGrams ?? null,
        item.unitLabourMakingCost ?? null,
        item.lineTotalSettlement ?? null,
        item.reconciliationStatus ?? "PENDING",
        item.discrepancyReason ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert shipment item");
    }
    return mapRowToShipmentItem(row);
  } catch (err: any) {
    if (err.constraint === "uq_shipment_items_line") {
      throw new ConflictError(
        `Line number ${item.lineNumber} already exists in this shipment`,
        "ERR_DUPLICATE_LINE_NUMBER",
      );
    }
    if (err.constraint === "shipment_items_product_sku_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced product SKU does not exist",
        "ERR_SKU_NOT_FOUND",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a single shipment line item by primary key ID.
 */
export async function getShipmentItemById(
  itemId: string,
  clientOverride?: Queryable,
): Promise<ShipmentItem | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<ShipmentItemRow>(
    `
    SELECT id, shipment_id, product_sku_id, line_number, supplier_item_code,
           declared_piece_count, received_piece_count, declared_gross_weight_grams,
           measured_gross_weight_grams, declared_net_weight_grams, unit_labour_making_cost,
           line_total_settlement, reconciliation_status, discrepancy_reason, version,
           created_at, updated_at
    FROM shipment_items
    WHERE id = $1;
    `,
    [itemId],
  );

  const row = result.rows[0];
  return row ? mapRowToShipmentItem(row) : null;
}

/**
 * Lists all line items for a given shipment, ordered by line_number.
 */
export async function listShipmentItems(
  shipmentId: string,
  clientOverride?: Queryable,
): Promise<ShipmentItem[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<ShipmentItemRow>(
    `
    SELECT id, shipment_id, product_sku_id, line_number, supplier_item_code,
           declared_piece_count, received_piece_count, declared_gross_weight_grams,
           measured_gross_weight_grams, declared_net_weight_grams, unit_labour_making_cost,
           line_total_settlement, reconciliation_status, discrepancy_reason, version,
           created_at, updated_at
    FROM shipment_items
    WHERE shipment_id = $1
    ORDER BY line_number ASC;
    `,
    [shipmentId],
  );

  return result.rows.map(mapRowToShipmentItem);
}

/**
 * Updates a shipment line item (intake counts, measured weights, reconciliation).
 * Enforces parent GRN lock and increments OCC version.
 */
export async function updateShipmentItem(
  itemId: string,
  data: {
    receivedPieceCount?: number;
    measuredGrossWeightGrams?: number | null;
    reconciliationStatus?: ShipmentReconciliationStatus;
    discrepancyReason?: string | null;
    unitLabourMakingCost?: number | null;
    lineTotalSettlement?: number | null;
  },
  clientOverride?: Queryable,
): Promise<ShipmentItem> {
  const executor = clientOverride ?? getPool();

  const existing = await getShipmentItemById(itemId, executor);
  if (!existing) {
    throw new NotFoundError("Shipment Item", itemId);
  }

  const shipment = await getShipmentById(existing.shipmentId, executor);
  if (shipment) {
    const parentGrn = await getGrnById(shipment.goodsReceiptNoteId, executor);
    if (parentGrn && parentGrn.status === "CLOSED") {
      throw new UnprocessableEntityError(
        "Parent GRN is closed and locked",
        "ERR_GRN_IMMUTABLE",
      );
    }
  }

  const updates: string[] = [];
  const values: any[] = [itemId];

  if (data.receivedPieceCount !== undefined) {
    values.push(data.receivedPieceCount);
    updates.push(`received_piece_count = $${values.length}`);
  }
  if (data.measuredGrossWeightGrams !== undefined) {
    values.push(data.measuredGrossWeightGrams);
    updates.push(`measured_gross_weight_grams = $${values.length}`);
  }
  if (data.reconciliationStatus !== undefined) {
    values.push(data.reconciliationStatus);
    updates.push(`reconciliation_status = $${values.length}`);
  }
  if (data.discrepancyReason !== undefined) {
    values.push(data.discrepancyReason);
    updates.push(`discrepancy_reason = $${values.length}`);
  }
  if (data.unitLabourMakingCost !== undefined) {
    values.push(data.unitLabourMakingCost);
    updates.push(`unit_labour_making_cost = $${values.length}`);
  }
  if (data.lineTotalSettlement !== undefined) {
    values.push(data.lineTotalSettlement);
    updates.push(`line_total_settlement = $${values.length}`);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push(`version = version + 1`);
  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE shipment_items
    SET ${updates.join(", ")}
    WHERE id = $1
    RETURNING id, shipment_id, product_sku_id, line_number, supplier_item_code,
              declared_piece_count, received_piece_count, declared_gross_weight_grams,
              measured_gross_weight_grams, declared_net_weight_grams, unit_labour_making_cost,
              line_total_settlement, reconciliation_status, discrepancy_reason, version,
              created_at, updated_at;
  `;

  const result = await executor.query<ShipmentItemRow>(query, values);
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("Shipment Item", itemId);
  }
  return mapRowToShipmentItem(row);
}
