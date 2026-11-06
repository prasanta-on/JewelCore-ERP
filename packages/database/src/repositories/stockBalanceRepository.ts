import type { Pool, PoolClient } from "pg";
import {
  type StockBalanceRecord,
  type CreateStockBalanceInput,
  type UpdateStockBalanceInput,
  type ListStockBalancesQuery,
  NotFoundError,
  UnprocessableEntityError,
  ConflictError,
  BadRequestError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

interface StockBalanceRow {
  id: string;
  organization_id: string;
  store_id: string;
  product_sku_id: string;
  compartment_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  total_weight_grams: string | number;
  average_cost_unit_cad: string | number | null;
  last_movement_at: Date;
  version: number;
  created_at: Date;
  updated_at: Date;
}

function mapRowToStockBalance(row: StockBalanceRow): StockBalanceRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    productSkuId: row.product_sku_id,
    compartmentId: row.compartment_id,
    quantityOnHand: Number(row.quantity_on_hand),
    quantityReserved: Number(row.quantity_reserved),
    quantityAvailable: Number(row.quantity_available),
    totalWeightGrams: Number(row.total_weight_grams),
    averageCostUnitCad:
      row.average_cost_unit_cad !== null &&
      row.average_cost_unit_cad !== undefined
        ? Number(row.average_cost_unit_cad)
        : null,
    lastMovementAt: row.last_movement_at,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates or upserts a bulk stock balance record (Entity 29 - FEAT-INV-02 / BIZ-Q02).
 *
 * Enforces:
 * - SKU must have tracking_type = 'QUANTITY_BATCH' (INV-06)
 * - Compartment must belong to the same store (INV-11)
 * - Non-negative stock balances and available quantity check (quantity_on_hand >= quantity_reserved)
 */
export async function upsertStockBalance(
  input: CreateStockBalanceInput & { storeId?: string },
  _context?: { userId: string },
  clientOverride?: Queryable,
): Promise<StockBalanceRecord> {
  const executeUpsert = async (
    client: Queryable,
  ): Promise<StockBalanceRecord> => {
    // 1. Validate SKU & tracking type (INV-06)
    const skuRes = await client.query<{
      id: string;
      organization_id: string;
      sku_code: string;
      tracking_type: string;
    }>(
      `SELECT id, organization_id, sku_code, tracking_type FROM product_skus WHERE id = $1`,
      [input.productSkuId],
    );

    const sku = skuRes.rows[0];
    if (!sku) {
      throw new NotFoundError(
        `Product SKU with ID '${input.productSkuId}' not found`,
        "ERR_SKU_NOT_FOUND",
      );
    }

    if (sku.tracking_type !== "QUANTITY_BATCH") {
      throw new UnprocessableEntityError(
        `Stock balances are restricted to QUANTITY_BATCH SKUs (INV-06). SKU '${sku.sku_code}' has tracking type '${sku.tracking_type}'`,
        "ERR_INVALID_TRACKING_TYPE",
      );
    }

    // 2. Validate Compartment & Store Boundary (INV-11)
    const compRes = await client.query<{
      id: string;
      store_id: string;
      code: string;
    }>(`SELECT id, store_id, code FROM compartments WHERE id = $1`, [
      input.compartmentId,
    ]);

    const comp = compRes.rows[0];
    if (!comp) {
      throw new NotFoundError(
        `Compartment with ID '${input.compartmentId}' not found`,
        "ERR_COMPARTMENT_NOT_FOUND",
      );
    }

    const effectiveStoreId = input.storeId ?? comp.store_id;
    if (comp.store_id !== effectiveStoreId) {
      throw new UnprocessableEntityError(
        `Compartment '${comp.code}' belongs to store '${comp.store_id}', which does not match target store '${effectiveStoreId}' (INV-11)`,
        "ERR_COMPARTMENT_STORE_MISMATCH",
      );
    }

    const qtyReserved = input.quantityReserved ?? 0;

    // 3. Validate Non-Negative Quantities
    if (input.quantityOnHand < 0 || qtyReserved < 0) {
      throw new BadRequestError(
        "Quantity on hand and quantity reserved must be non-negative",
        "ERR_NEGATIVE_STOCK_BALANCE",
      );
    }

    if (input.quantityOnHand < qtyReserved) {
      throw new UnprocessableEntityError(
        `Quantity on hand (${input.quantityOnHand}) cannot be less than quantity reserved (${qtyReserved})`,
        "ERR_INSUFFICIENT_AVAILABLE_STOCK",
      );
    }

    const newId = uuidv7();

    // 4. Upsert stock balance record
    const upsertRes = await client.query<StockBalanceRow>(
      `
      INSERT INTO inventory_stock_balances (
        id,
        organization_id,
        store_id,
        product_sku_id,
        compartment_id,
        quantity_on_hand,
        quantity_reserved,
        total_weight_grams,
        average_cost_unit_cad,
        last_movement_at,
        version,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        clock_timestamp(), 1, clock_timestamp(), clock_timestamp()
      )
      ON CONFLICT (store_id, product_sku_id, compartment_id) DO UPDATE SET
        quantity_on_hand = EXCLUDED.quantity_on_hand,
        quantity_reserved = EXCLUDED.quantity_reserved,
        total_weight_grams = EXCLUDED.total_weight_grams,
        average_cost_unit_cad = COALESCE(EXCLUDED.average_cost_unit_cad, inventory_stock_balances.average_cost_unit_cad),
        last_movement_at = clock_timestamp(),
        version = inventory_stock_balances.version + 1,
        updated_at = clock_timestamp()
      RETURNING *
      `,
      [
        newId,
        sku.organization_id,
        effectiveStoreId,
        input.productSkuId,
        input.compartmentId,
        input.quantityOnHand,
        qtyReserved,
        input.totalWeightGrams ?? 0,
        input.averageCostUnitCad ?? null,
      ],
    );

    const row = upsertRes.rows[0];
    if (!row) {
      throw new Error("Failed to persist stock balance record");
    }

    return mapRowToStockBalance(row);
  };

  if (clientOverride) {
    return executeUpsert(clientOverride);
  }
  return withTransaction((tx) => executeUpsert(tx.rawClient));
}

/**
 * Retrieves a stock balance record by UUID.
 */
export async function getStockBalanceById(
  id: string,
  clientOverride?: Queryable,
): Promise<StockBalanceRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<StockBalanceRow>(
    `SELECT * FROM inventory_stock_balances WHERE id = $1`,
    [id],
  );

  return res.rows[0] ? mapRowToStockBalance(res.rows[0]) : null;
}

/**
 * Retrieves a stock balance record by composite key (store_id, product_sku_id, compartment_id).
 */
export async function getStockBalanceBySkuAndCompartment(
  storeId: string,
  productSkuId: string,
  compartmentId: string,
  clientOverride?: Queryable,
): Promise<StockBalanceRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<StockBalanceRow>(
    `
    SELECT *
    FROM inventory_stock_balances
    WHERE store_id = $1 AND product_sku_id = $2 AND compartment_id = $3
    `,
    [storeId, productSkuId, compartmentId],
  );

  return res.rows[0] ? mapRowToStockBalance(res.rows[0]) : null;
}

/**
 * Updates a stock balance record by ID with OCC version verification.
 */
export async function updateStockBalance(
  id: string,
  input: UpdateStockBalanceInput,
  _context?: { userId: string },
  clientOverride?: Queryable,
): Promise<StockBalanceRecord> {
  const executeUpdate = async (
    client: Queryable,
  ): Promise<StockBalanceRecord> => {
    // Lock row for update
    const currentRes = await client.query<StockBalanceRow>(
      `SELECT * FROM inventory_stock_balances WHERE id = $1 FOR UPDATE`,
      [id],
    );

    const current = currentRes.rows[0];
    if (!current) {
      throw new NotFoundError(
        `Stock balance record with ID '${id}' not found`,
        "ERR_STOCK_BALANCE_NOT_FOUND",
      );
    }

    // Optimistic Concurrency Control (OCC) Check
    if (
      input.expectedVersion !== undefined &&
      current.version !== input.expectedVersion
    ) {
      throw new ConflictError(
        `OCC version mismatch: expected version ${input.expectedVersion}, but current version is ${current.version}`,
        "ERR_OCC_VERSION_MISMATCH",
      );
    }

    const newOnHand = input.quantityOnHand ?? current.quantity_on_hand;
    const newReserved = input.quantityReserved ?? current.quantity_reserved;
    const newWeight = input.totalWeightGrams ?? current.total_weight_grams;
    const newCost =
      input.averageCostUnitCad !== undefined
        ? input.averageCostUnitCad
        : current.average_cost_unit_cad;

    if (newOnHand < 0 || newReserved < 0) {
      throw new BadRequestError(
        "Quantity on hand and quantity reserved must be non-negative",
        "ERR_NEGATIVE_STOCK_BALANCE",
      );
    }

    if (newOnHand < newReserved) {
      throw new UnprocessableEntityError(
        `Quantity on hand (${newOnHand}) cannot be less than quantity reserved (${newReserved})`,
        "ERR_INSUFFICIENT_AVAILABLE_STOCK",
      );
    }

    const updateRes = await client.query<StockBalanceRow>(
      `
      UPDATE inventory_stock_balances SET
        quantity_on_hand = $2,
        quantity_reserved = $3,
        total_weight_grams = $4,
        average_cost_unit_cad = $5,
        last_movement_at = clock_timestamp(),
        version = version + 1,
        updated_at = clock_timestamp()
      WHERE id = $1
      RETURNING *
      `,
      [id, newOnHand, newReserved, newWeight, newCost],
    );

    const updated = updateRes.rows[0];
    if (!updated) {
      throw new Error("Failed to update stock balance record");
    }

    return mapRowToStockBalance(updated);
  };

  if (clientOverride) {
    return executeUpdate(clientOverride);
  }
  return withTransaction((tx) => executeUpdate(tx.rawClient));
}

/**
 * Lists stock balance records matching query criteria.
 */
export async function listStockBalances(
  filters: ListStockBalancesQuery,
  clientOverride?: Queryable,
): Promise<StockBalanceRecord[]> {
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

  if (filters.compartmentId) {
    conditions.push(`compartment_id = $${paramIndex++}`);
    params.push(filters.compartmentId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(filters.limit);
  const limitIndex = paramIndex++;
  params.push(filters.offset);
  const offsetIndex = paramIndex++;

  const sql = `
    SELECT *
    FROM inventory_stock_balances
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const res = await executor.query<StockBalanceRow>(sql, params);
  return res.rows.map(mapRowToStockBalance);
}
