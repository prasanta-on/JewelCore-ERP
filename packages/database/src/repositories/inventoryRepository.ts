import type { Pool, PoolClient } from "pg";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";

type Queryable = Pool | PoolClient;
import { uuidv7 } from "../uuidv7.js";
import {
  type BirthInventoryItemInput,
  type InventoryItemRecord,
  type ListInventoryItemsQuery,
  QualityState,
  ApprovalState,
  CustodyState,
  CommercialState,
  NotFoundError,
  UnprocessableEntityError,
  ConflictError,
} from "@jewelcore/shared";

export interface InventoryItemRow {
  id: string;
  organization_id: string;
  store_id: string;
  product_sku_id: string;
  quality_check_item_id: string;
  serial_number: string;
  item_name: string;
  gross_weight_grams: string | number;
  net_weight_grams: string | number;
  purity_id: string;
  quality_state: string;
  approval_state: string;
  custody_state: string;
  commercial_state: string;
  current_compartment_id: string | null;
  cost_price_cad: string | number | null;
  selling_price_cad: string | number | null;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
}

export function mapRowToInventoryItem(
  row: InventoryItemRow,
): InventoryItemRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    productSkuId: row.product_sku_id,
    qualityCheckItemId: row.quality_check_item_id,
    serialNumber: row.serial_number,
    itemName: row.item_name,
    grossWeightGrams: parseFloat(Number(row.gross_weight_grams).toFixed(4)),
    netWeightGrams: parseFloat(Number(row.net_weight_grams).toFixed(4)),
    purityId: row.purity_id,
    qualityState: row.quality_state as QualityState,
    approvalState: row.approval_state as ApprovalState,
    custodyState: row.custody_state as CustodyState,
    commercialState: row.commercial_state as CommercialState,
    currentCompartmentId: row.current_compartment_id,
    costPriceCad:
      row.cost_price_cad !== null
        ? parseFloat(Number(row.cost_price_cad).toFixed(2))
        : null,
    sellingPriceCad:
      row.selling_price_cad !== null
        ? parseFloat(Number(row.selling_price_cad).toFixed(2))
        : null,
    version: Number(row.version),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Atomically births a physical serialized inventory item strictly from an approved QC item (FEAT-INV-01 / INV-14).
 *
 * Enforces:
 * - Approved QC item prerequisite (status = 'APPROVED')
 * - Immutable birth lineage constraint (quality_check_item_id UNIQUE)
 * - Single-item duplicate birth rejection (409 Conflict)
 * - Tracking type gate (SKU tracking_type = 'SERIALIZED' / INV-06)
 * - Weight physics invariants (gross_weight >= net_weight > 0 / INV-02)
 * - Store context isolation for compartment placement (INV-11)
 */
export async function birthInventoryItem(
  input: BirthInventoryItemInput,
  _userContext?: { userId?: string },
  clientOverride?: Queryable,
): Promise<InventoryItemRecord> {
  const executeBirth = async (client: Queryable) => {
    // 1. Fetch QC item with its session, shipment item, and SKU
    const qcItemRes = await client.query<{
      id: string;
      quality_check_id: string;
      shipment_item_id: string;
      status: string;
      gross_weight_grams: string | number | null;
      net_weight_grams: string | number | null;
      verified_purity_id: string | null;
      session_store_id: string;
      session_status: string;
      shipment_sku_id: string;
      sku_org_id: string;
      sku_tracking_type: string;
      sku_variant_name: string | null;
      sku_code: string;
      sku_purity_id: string;
    }>(
      `
      SELECT
        qci.id,
        qci.quality_check_id,
        qci.shipment_item_id,
        qci.status,
        qci.gross_weight_grams,
        qci.net_weight_grams,
        qci.verified_purity_id,
        qc.store_id AS session_store_id,
        qc.status AS session_status,
        si.product_sku_id AS shipment_sku_id,
        sku.organization_id AS sku_org_id,
        sku.tracking_type AS sku_tracking_type,
        sku.variant_name AS sku_variant_name,
        sku.sku_code AS sku_code,
        sku.target_purity_id AS sku_purity_id
      FROM quality_check_items qci
      JOIN quality_checks qc ON qci.quality_check_id = qc.id
      JOIN shipment_items si ON qci.shipment_item_id = si.id
      JOIN product_skus sku ON si.product_sku_id = sku.id
      WHERE qci.id = $1
      FOR UPDATE OF qci
      `,
      [input.qualityCheckItemId],
    );

    const qci = qcItemRes.rows[0];
    if (!qci) {
      throw new NotFoundError(
        `Quality check item with ID '${input.qualityCheckItemId}' not found`,
        "ERR_QC_ITEM_NOT_FOUND",
      );
    }

    // 2. QC Approval Prerequisite Gate (INV-14)
    if (qci.status !== "APPROVED") {
      throw new UnprocessableEntityError(
        `Cannot birth inventory piece from QC item with status '${qci.status}'. Item must be 'APPROVED' (INV-14)`,
        "ERR_QC_NOT_APPROVED",
      );
    }

    // 3. Tracking Type Gate: Only SERIALIZED SKUs can birth serialized pieces (INV-06)
    if (qci.sku_tracking_type !== "SERIALIZED") {
      throw new UnprocessableEntityError(
        `SKU '${qci.sku_code}' has tracking_type '${qci.sku_tracking_type}'. Serialized inventory piece birth strictly requires 'SERIALIZED' (INV-06)`,
        "ERR_INVALID_TRACKING_TYPE",
      );
    }

    // 4. Duplicate Birth Check (INV-14: 1:0..1 QC birth constraint)
    const existingRes = await client.query<{ id: string }>(
      `SELECT id FROM inventory_items WHERE quality_check_item_id = $1 LIMIT 1`,
      [input.qualityCheckItemId],
    );
    if (existingRes.rows.length > 0) {
      const existingId = existingRes.rows[0]?.id;
      throw new ConflictError(
        `Quality check item '${input.qualityCheckItemId}' has already been birthed into inventory piece '${existingId}' (INV-14)`,
        "ERR_DUPLICATE_ITEM_BIRTH",
      );
    }

    // 5. Compartment Store Isolation Validation (INV-11)
    if (input.currentCompartmentId) {
      const compRes = await client.query<{
        id: string;
        store_id: string;
      }>(
        `
        SELECT c.id, v.store_id
        FROM compartments c
        JOIN lockers l ON c.locker_id = l.id
        JOIN vaults v ON l.vault_id = v.id
        WHERE c.id = $1
        `,
        [input.currentCompartmentId],
      );

      const comp = compRes.rows[0];
      if (!comp) {
        throw new NotFoundError(
          `Storage compartment with ID '${input.currentCompartmentId}' not found`,
          "ERR_COMPARTMENT_NOT_FOUND",
        );
      }

      if (comp.store_id !== qci.session_store_id) {
        throw new UnprocessableEntityError(
          `Storage compartment '${input.currentCompartmentId}' belongs to store '${comp.store_id}', but item is located in store '${qci.session_store_id}' (INV-11)`,
          "ERR_COMPARTMENT_STORE_MISMATCH",
        );
      }
    }

    // 6. Weight physics extraction & validation (INV-02)
    const grossWeight =
      qci.gross_weight_grams !== null ? Number(qci.gross_weight_grams) : null;
    const netWeight =
      qci.net_weight_grams !== null ? Number(qci.net_weight_grams) : null;

    if (!grossWeight || grossWeight <= 0) {
      throw new UnprocessableEntityError(
        "QC item missing positive verified gross weight for birth",
        "ERR_INVALID_WEIGHT",
      );
    }
    if (!netWeight || netWeight <= 0) {
      throw new UnprocessableEntityError(
        "QC item missing positive verified net metal weight for birth",
        "ERR_INVALID_WEIGHT",
      );
    }
    if (netWeight > grossWeight) {
      throw new UnprocessableEntityError(
        "Net metal weight cannot exceed gross weight for inventory piece birth (INV-02)",
        "ERR_INVALID_WEIGHT",
      );
    }

    const purityId = qci.verified_purity_id ?? qci.sku_purity_id;
    if (!purityId) {
      throw new UnprocessableEntityError(
        "QC item missing verified purity reference for birth",
        "ERR_MISSING_PURITY",
      );
    }

    // 7. Generate or validate serial number
    const serialNumber =
      input.serialNumber ??
      `SN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (input.serialNumber) {
      const existingSnRes = await client.query<{ id: string }>(
        `SELECT id FROM inventory_items WHERE organization_id = $1 AND serial_number = $2`,
        [qci.sku_org_id, input.serialNumber],
      );
      if (existingSnRes.rows.length > 0) {
        throw new ConflictError(
          `Inventory item with serial number '${input.serialNumber}' already exists in organization '${qci.sku_org_id}'`,
          "ERR_DUPLICATE_ITEM_BIRTH",
        );
      }
    }

    const itemName =
      input.itemName ?? qci.sku_variant_name ?? `Item ${qci.sku_code}`;

    const itemId = uuidv7();

    // 8. Insert into inventory_items
    let insertRes;
    try {
      insertRes = await client.query<InventoryItemRow>(
        `
        INSERT INTO inventory_items (
          id,
          organization_id,
          store_id,
          product_sku_id,
          quality_check_item_id,
          serial_number,
          item_name,
          gross_weight_grams,
          net_weight_grams,
          purity_id,
          quality_state,
          approval_state,
          custody_state,
          commercial_state,
          current_compartment_id,
          cost_price_cad,
          selling_price_cad,
          version,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          'QC_APPROVED', 'DRAFT', 'IN_VAULT', 'UNREADY',
          $11, $12, $13, 1, clock_timestamp(), clock_timestamp()
        )
        RETURNING *
        `,
        [
          itemId,
          qci.sku_org_id,
          qci.session_store_id,
          qci.shipment_sku_id,
          input.qualityCheckItemId,
          serialNumber,
          itemName,
          grossWeight,
          netWeight,
          purityId,
          input.currentCompartmentId ?? null,
          input.costPriceCad ?? null,
          input.sellingPriceCad ?? null,
        ],
      );
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "23505"
      ) {
        throw new ConflictError(
          `Duplicate inventory item birth constraint violation: ${(err as { detail?: string }).detail || "Unique constraint violated"}`,
          "ERR_DUPLICATE_ITEM_BIRTH",
        );
      }
      throw err;
    }

    const row = insertRes.rows[0];
    if (!row) {
      throw new Error("Failed to persist inventory item");
    }

    return mapRowToInventoryItem(row);
  };

  if (clientOverride) {
    return executeBirth(clientOverride);
  }
  return withTransaction((tx) => executeBirth(tx.rawClient));
}

/**
 * Retrieves a physical serialized inventory item by primary UUID.
 */
export async function getInventoryItemById(
  id: string,
  clientOverride?: Queryable,
): Promise<InventoryItemRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<InventoryItemRow>(
    `SELECT * FROM inventory_items WHERE id = $1`,
    [id],
  );

  return res.rows[0] ? mapRowToInventoryItem(res.rows[0]) : null;
}

/**
 * Retrieves an inventory item by enterprise serial number.
 */
export async function getInventoryItemBySerialNumber(
  organizationId: string,
  serialNumber: string,
  clientOverride?: Queryable,
): Promise<InventoryItemRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<InventoryItemRow>(
    `SELECT * FROM inventory_items WHERE organization_id = $1 AND serial_number = $2`,
    [organizationId, serialNumber],
  );

  return res.rows[0] ? mapRowToInventoryItem(res.rows[0]) : null;
}

/**
 * Retrieves an inventory item by its birth certificate quality check item ID.
 */
export async function getInventoryItemByQualityCheckItemId(
  qcItemId: string,
  clientOverride?: Queryable,
): Promise<InventoryItemRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<InventoryItemRow>(
    `SELECT * FROM inventory_items WHERE quality_check_item_id = $1`,
    [qcItemId],
  );

  return res.rows[0] ? mapRowToInventoryItem(res.rows[0]) : null;
}

/**
 * Lists inventory items matching query criteria with pagination.
 */
export async function listInventoryItems(
  filters: ListInventoryItemsQuery,
  clientOverride?: Queryable,
): Promise<InventoryItemRecord[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.storeId) {
    conditions.push(`store_id = $${paramIndex++}`);
    params.push(filters.storeId);
  }

  if (filters.productSkuId) {
    conditions.push(`product_sku_id = $${paramIndex++}`);
    params.push(filters.productSkuId);
  }

  if (filters.custodyState) {
    conditions.push(`custody_state = $${paramIndex++}`);
    params.push(filters.custodyState);
  }

  if (filters.commercialState) {
    conditions.push(`commercial_state = $${paramIndex++}`);
    params.push(filters.commercialState);
  }

  if (filters.qualityState) {
    conditions.push(`quality_state = $${paramIndex++}`);
    params.push(filters.qualityState);
  }

  if (filters.serialNumber) {
    conditions.push(`serial_number ILIKE $${paramIndex++}`);
    params.push(`%${filters.serialNumber}%`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(filters.limit);
  const limitIndex = paramIndex++;
  params.push(filters.offset);
  const offsetIndex = paramIndex++;

  const sql = `
    SELECT *
    FROM inventory_items
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const res = await executor.query<InventoryItemRow>(sql, params);
  return res.rows.map(mapRowToInventoryItem);
}
