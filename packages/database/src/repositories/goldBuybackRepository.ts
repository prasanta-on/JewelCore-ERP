import type { Pool, PoolClient } from "pg";
import {
  type GoldBuybackOrderRecord,
  type GoldBuybackItemRecord,
  type CreateGoldBuybackOrderInput,
  type SettleGoldBuybackOrderInput,
  type ListGoldBuybackOrdersQuery,
  type BuybackStatus,
  type BuybackPayoutMethod,
  type BuybackItemType,
  NotFoundError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";
import { adjustStoreCredit } from "./storeCreditRepository.js";

type Queryable = Pool | PoolClient;

export interface GoldBuybackOrderRow {
  id: string;
  organization_id: string;
  store_id: string;
  customer_id: string;
  created_by_user_id: string;
  settled_by_user_id: string | null;
  order_number: string;
  status: string;
  payout_method: string;
  total_gross_weight_grams: string | number;
  total_net_weight_grams: string | number;
  total_melt_value_cad: string | number;
  total_smelting_fee_cad: string | number;
  net_payout_amount_cad: string | number;
  payout_reference: string | null;
  notes: string | null;
  settled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  customer_name?: string | null;
  store_name?: string | null;
}

export interface GoldBuybackItemRow {
  id: string;
  organization_id: string;
  gold_buyback_order_id: string;
  item_type: string;
  description: string;
  purity_id: string;
  purity_percentage: string | number;
  gross_weight_grams: string | number;
  net_weight_grams: string | number;
  market_rate_per_gram_cad: string | number;
  melt_value_cad: string | number;
  smelting_fee_cad: string | number;
  net_payout_cad: string | number;
  target_compartment_id: string | null;
  notes: string | null;
  created_at: Date | string;
  purity_code?: string | null;
}

function mapRowToGoldBuybackOrder(
  row: GoldBuybackOrderRow,
  items?: GoldBuybackItemRecord[],
): GoldBuybackOrderRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    customerId: row.customer_id,
    createdByUserId: row.created_by_user_id,
    settledByUserId: row.settled_by_user_id ?? null,
    orderNumber: row.order_number,
    status: row.status as BuybackStatus,
    payoutMethod: row.payout_method as BuybackPayoutMethod,
    totalGrossWeightGrams: Number(row.total_gross_weight_grams),
    totalNetWeightGrams: Number(row.total_net_weight_grams),
    totalMeltValueCad: Number(row.total_melt_value_cad),
    totalSmeltingFeeCad: Number(row.total_smelting_fee_cad),
    netPayoutAmountCad: Number(row.net_payout_amount_cad),
    payoutReference: row.payout_reference ?? null,
    notes: row.notes ?? null,
    settledAt: row.settled_at
      ? row.settled_at instanceof Date
        ? row.settled_at
        : new Date(row.settled_at)
      : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at
        : new Date(row.updated_at),
    customerName: row.customer_name ?? undefined,
    storeName: row.store_name ?? undefined,
    items,
  };
}

function mapRowToGoldBuybackItem(
  row: GoldBuybackItemRow,
): GoldBuybackItemRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    goldBuybackOrderId: row.gold_buyback_order_id,
    itemType: row.item_type as BuybackItemType,
    description: row.description,
    purityId: row.purity_id,
    purityCode: row.purity_code ?? undefined,
    purityPercentage: Number(row.purity_percentage),
    grossWeightGrams: Number(row.gross_weight_grams),
    netWeightGrams: Number(row.net_weight_grams),
    marketRatePerGramCad: Number(row.market_rate_per_gram_cad),
    meltValueCad: Number(row.melt_value_cad),
    smeltingFeeCad: Number(row.smelting_fee_cad),
    netPayoutCad: Number(row.net_payout_cad),
    targetCompartmentId: row.target_compartment_id ?? null,
    notes: row.notes ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
  };
}

/**
 * Creates and appraises an old gold or scrap buyback order (FEAT-RET-02).
 * Formulates valuation using active daily spot market rates (daily_market_rates)
 * and fineness percentages from purities.
 */
export async function createGoldBuybackOrder(
  input: CreateGoldBuybackOrderInput & {
    organizationId: string;
    createdByUserId: string;
  },
  clientOverride?: Queryable,
): Promise<GoldBuybackOrderRecord> {
  const runner = async (
    client: Queryable,
  ): Promise<GoldBuybackOrderRecord> => {
    // 1. Verify customer
    const custRes = await client.query<{ id: string; name: string }>(
      `SELECT id, first_name || ' ' || last_name AS name FROM customers WHERE id = $1 AND organization_id = $2`,
      [input.customerId, input.organizationId],
    );
    const customer = custRes.rows[0];
    if (!customer) {
      throw new NotFoundError("Customer", input.customerId);
    }

    // 2. Verify store
    const storeRes = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM stores WHERE id = $1 AND organization_id = $2`,
      [input.storeId, input.organizationId],
    );
    const store = storeRes.rows[0];
    if (!store) {
      throw new NotFoundError("Store", input.storeId);
    }

    // 3. Evaluate each item against active daily spot rate
    const evaluatedItems: Array<{
      itemType: BuybackItemType;
      description: string;
      purityId: string;
      purityCode: string;
      purityPercentage: number;
      grossWeightGrams: number;
      netWeightGrams: number;
      ratePerGramCad: number;
      meltValueCad: number;
      smeltingFeeCad: number;
      netPayoutCad: number;
      targetCompartmentId: string | null;
      notes: string | null;
    }> = [];

    let totalGrossWeight = 0;
    let totalNetWeight = 0;
    let totalMeltValue = 0;
    let totalSmeltingFee = 0;
    let totalNetPayout = 0;

    for (const item of input.items) {
      // Fetch purity and metal type
      const purRes = await client.query<{
        id: string;
        code: string;
        purity_percentage: string | number;
        base_metal_type: string;
      }>(
        `
        SELECT p.id, p.code, p.purity_percentage, m.base_metal_type
        FROM purities p
        JOIN materials m ON m.id = p.material_id
        WHERE p.id = $1
        `,
        [item.purityId],
      );

      const purity = purRes.rows[0];
      if (!purity) {
        throw new NotFoundError("Purity", item.purityId);
      }

      const purityPercentage = Number(purity.purity_percentage);
      const metalType = purity.base_metal_type;

      // Fetch active market spot rate
      const rateRes = await client.query<{ rate_per_gram_cad: string | number }>(
        `
        SELECT rate_per_gram_cad
        FROM daily_market_rates
        WHERE organization_id = $1
          AND metal_type = $2
          AND is_active = true
          AND (store_id = $3 OR store_id IS NULL)
        ORDER BY store_id NULLS LAST, effective_from DESC
        LIMIT 1
        `,
        [input.organizationId, metalType, input.storeId],
      );

      const rateRow = rateRes.rows[0];
      if (!rateRow) {
        throw new UnprocessableEntityError(
          `No active precious metal market rate found for metal type '${metalType}'`,
          "ERR_NO_MARKET_RATE",
        );
      }

      const ratePerGramCad = Number(rateRow.rate_per_gram_cad);
      const fineMetalWeightGrams = item.netWeightGrams * (purityPercentage / 100);
      const meltValueCad = fineMetalWeightGrams * ratePerGramCad;
      const smeltingFeeCad = Number(item.smeltingFeeCad ?? 0);

      if (smeltingFeeCad > meltValueCad) {
        throw new UnprocessableEntityError(
          `Smelting fee (${smeltingFeeCad}) cannot exceed melt value (${meltValueCad.toFixed(2)}) for item '${item.description}'`,
          "ERR_INVALID_SMELTING_FEE",
        );
      }

      const netPayoutCad = meltValueCad - smeltingFeeCad;

      // Validate target compartment if provided
      let targetCompId = item.targetCompartmentId ?? null;
      if (targetCompId) {
        const compRes = await client.query<{ id: string }>(
          `SELECT id FROM compartments WHERE id = $1 AND store_id = $2`,
          [targetCompId, input.storeId],
        );
        if (compRes.rows.length === 0) {
          throw new UnprocessableEntityError(
            `Target compartment ${targetCompId} does not belong to store ${input.storeId}`,
            "ERR_INVALID_COMPARTMENT",
          );
        }
      } else {
        const fallbackRes = await client.query<{ id: string }>(
          `SELECT id FROM compartments WHERE store_id = $1 ORDER BY created_at ASC LIMIT 1`,
          [input.storeId],
        );
        const fallbackComp = fallbackRes.rows[0];
        if (fallbackComp) {
          targetCompId = fallbackComp.id;
        }
      }

      totalGrossWeight += item.grossWeightGrams;
      totalNetWeight += item.netWeightGrams;
      totalMeltValue += meltValueCad;
      totalSmeltingFee += smeltingFeeCad;
      totalNetPayout += netPayoutCad;

      evaluatedItems.push({
        itemType: item.itemType,
        description: item.description,
        purityId: purity.id,
        purityCode: purity.code,
        purityPercentage,
        grossWeightGrams: item.grossWeightGrams,
        netWeightGrams: item.netWeightGrams,
        ratePerGramCad,
        meltValueCad,
        smeltingFeeCad,
        netPayoutCad,
        targetCompartmentId: targetCompId,
        notes: item.notes ?? null,
      });
    }

    // 4. Insert buyback order
    const orderId = uuidv7();
    const orderNumber =
      input.orderNumber ??
      `BB-${Date.now()}-${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0")}`;

    const orderInsertRes = await client.query<GoldBuybackOrderRow>(
      `
      INSERT INTO gold_buyback_orders (
        id,
        organization_id,
        store_id,
        customer_id,
        created_by_user_id,
        order_number,
        status,
        payout_method,
        total_gross_weight_grams,
        total_net_weight_grams,
        total_melt_value_cad,
        total_smelting_fee_cad,
        net_payout_amount_cad,
        notes,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, 'APPRAISED', $7,
        $8, $9, $10, $11, $12, $13, clock_timestamp(), clock_timestamp()
      )
      RETURNING *
      `,
      [
        orderId,
        input.organizationId,
        input.storeId,
        input.customerId,
        input.createdByUserId,
        orderNumber,
        input.payoutMethod,
        totalGrossWeight.toFixed(4),
        totalNetWeight.toFixed(4),
        totalMeltValue.toFixed(4),
        totalSmeltingFee.toFixed(4),
        totalNetPayout.toFixed(4),
        input.notes ?? null,
      ],
    );

    const createdOrderRow = orderInsertRes.rows[0];
    if (!createdOrderRow) {
      throw new Error("Failed to create gold buyback order record");
    }

    // 5. Insert buyback line items
    const createdItemRecords: GoldBuybackItemRecord[] = [];

    for (const itemData of evaluatedItems) {
      const itemId = uuidv7();

      const itemInsertRes = await client.query<GoldBuybackItemRow>(
        `
        INSERT INTO gold_buyback_items (
          id,
          organization_id,
          gold_buyback_order_id,
          item_type,
          description,
          purity_id,
          purity_percentage,
          gross_weight_grams,
          net_weight_grams,
          market_rate_per_gram_cad,
          melt_value_cad,
          smelting_fee_cad,
          net_payout_cad,
          target_compartment_id,
          notes,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, clock_timestamp()
        )
        RETURNING *
        `,
        [
          itemId,
          input.organizationId,
          orderId,
          itemData.itemType,
          itemData.description,
          itemData.purityId,
          itemData.purityPercentage.toFixed(4),
          itemData.grossWeightGrams.toFixed(4),
          itemData.netWeightGrams.toFixed(4),
          itemData.ratePerGramCad.toFixed(4),
          itemData.meltValueCad.toFixed(4),
          itemData.smeltingFeeCad.toFixed(4),
          itemData.netPayoutCad.toFixed(4),
          itemData.targetCompartmentId,
          itemData.notes,
        ],
      );

      const createdItemRow = itemInsertRes.rows[0];
      if (!createdItemRow) {
        throw new Error("Failed to create gold buyback item record");
      }
      createdItemRow.purity_code = itemData.purityCode;
      createdItemRecords.push(mapRowToGoldBuybackItem(createdItemRow));
    }

    // 6. Append audit event (Entity 36 - FEAT-GOV-02)
    await client.query(
      `
      INSERT INTO audit_events (
        id,
        organization_id,
        store_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        payload_before_json,
        payload_after_json,
        occurred_at,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, 'GOLD_BUYBACK_APPRAISED', 'GOLD_BUYBACK_ORDER',
        $5, NULL, $6, clock_timestamp(), clock_timestamp()
      )
      `,
      [
        uuidv7(),
        input.organizationId,
        input.storeId,
        input.createdByUserId,
        orderId,
        JSON.stringify({
          orderId,
          orderNumber,
          totalGrossWeight,
          totalNetWeight,
          totalMeltValue,
          totalSmeltingFee,
          totalNetPayout,
          payoutMethod: input.payoutMethod,
          itemsCount: evaluatedItems.length,
        }),
      ],
    );

    createdOrderRow.customer_name = customer.name;
    createdOrderRow.store_name = store.name;

    return mapRowToGoldBuybackOrder(createdOrderRow, createdItemRecords);
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Settles and finalizes payout of an evaluated gold buyback order (FEAT-RET-02).
 */
export async function settleGoldBuybackOrder(
  params: {
    id: string;
    organizationId: string;
    settledByUserId: string;
    input?: SettleGoldBuybackOrderInput;
  },
  clientOverride?: Queryable,
): Promise<GoldBuybackOrderRecord> {
  const runner = async (
    client: Queryable,
  ): Promise<GoldBuybackOrderRecord> => {
    // 1. Lock buyback order
    const orderRes = await client.query<GoldBuybackOrderRow>(
      `
      SELECT
        gbo.*,
        c.first_name || ' ' || c.last_name AS customer_name,
        s.name AS store_name
      FROM gold_buyback_orders gbo
      JOIN customers c ON c.id = gbo.customer_id
      JOIN stores s ON s.id = gbo.store_id
      WHERE gbo.id = $1 AND gbo.organization_id = $2
      FOR UPDATE
      `,
      [params.id, params.organizationId],
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new NotFoundError("GoldBuybackOrder", params.id);
    }

    if (order.status === "SETTLED") {
      throw new UnprocessableEntityError(
        "Gold buyback order has already been settled",
        "ERR_ORDER_ALREADY_SETTLED",
      );
    }

    if (order.status === "REJECTED" || order.status === "CANCELLED") {
      throw new UnprocessableEntityError(
        `Cannot settle a buyback order in '${order.status}' status`,
        "ERR_INVALID_ORDER_STATUS",
      );
    }

    const newPayoutMethod = params.input?.payoutMethod ?? order.payout_method;
    const payoutRef =
      params.input?.payoutReference ?? order.payout_reference ?? null;
    const additionalNotes = params.input?.notes;
    const updatedNotes = additionalNotes
      ? order.notes
        ? `${order.notes}\nSettlement: ${additionalNotes}`
        : `Settlement: ${additionalNotes}`
      : order.notes;

    // 2. Update status to SETTLED
    const updateRes = await client.query<GoldBuybackOrderRow>(
      `
      UPDATE gold_buyback_orders
      SET
        status = 'SETTLED',
        settled_at = clock_timestamp(),
        settled_by_user_id = $1,
        payout_method = $2,
        payout_reference = $3,
        notes = $4,
        updated_at = clock_timestamp()
      WHERE id = $5 AND organization_id = $6
      RETURNING *
      `,
      [
        params.settledByUserId,
        newPayoutMethod,
        payoutRef,
        updatedNotes,
        params.id,
        params.organizationId,
      ],
    );

    const updatedRow = updateRes.rows[0];
    if (!updatedRow) {
      throw new Error("Failed to update gold buyback order to settled");
    }

    // 3. If payout method is STORE_CREDIT or TRADE_IN_EXCHANGE, credit customer account
    if (
      newPayoutMethod === "STORE_CREDIT" ||
      newPayoutMethod === "TRADE_IN_EXCHANGE"
    ) {
      await adjustStoreCredit(
        {
          customerId: order.customer_id,
          storeId: order.store_id,
          organizationId: params.organizationId,
          performedByUserId: params.settledByUserId,
          transactionType: "ISSUE_BUYBACK",
          amountCad: Number(order.net_payout_amount_cad),
          referenceDocumentType: "GOLD_BUYBACK_ORDER",
          referenceDocumentId: order.id,
          notes: `Old gold buyback payout for order ${order.order_number}`,
        },
        client,
      );
    }

    // 4. Append audit event
    await client.query(
      `
      INSERT INTO audit_events (
        id,
        organization_id,
        store_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        payload_before_json,
        payload_after_json,
        occurred_at,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, 'GOLD_BUYBACK_SETTLED', 'GOLD_BUYBACK_ORDER',
        $5, $6, $7, clock_timestamp(), clock_timestamp()
      )
      `,
      [
        uuidv7(),
        params.organizationId,
        order.store_id,
        params.settledByUserId,
        order.id,
        JSON.stringify({ status: order.status }),
        JSON.stringify({
          status: "SETTLED",
          settledAt: new Date().toISOString(),
          payoutMethod: newPayoutMethod,
          payoutReference: payoutRef,
          netPayoutAmountCad: order.net_payout_amount_cad,
        }),
      ],
    );

    // 4. Fetch line items
    const itemsRes = await client.query<GoldBuybackItemRow>(
      `
      SELECT gbi.*, p.code AS purity_code
      FROM gold_buyback_items gbi
      JOIN purities p ON p.id = gbi.purity_id
      WHERE gbi.gold_buyback_order_id = $1
      ORDER BY gbi.created_at ASC
      `,
      [params.id],
    );

    const items = itemsRes.rows.map(mapRowToGoldBuybackItem);
    updatedRow.customer_name = order.customer_name;
    updatedRow.store_name = order.store_name;

    return mapRowToGoldBuybackOrder(updatedRow, items);
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Retrieves a single buyback order by ID with all evaluated pieces (FEAT-RET-02).
 */
export async function getGoldBuybackOrderById(
  params: { id: string; organizationId: string },
  clientOverride?: Queryable,
): Promise<GoldBuybackOrderRecord> {
  const client = clientOverride ?? getPool();

  const orderRes = await client.query<GoldBuybackOrderRow>(
    `
    SELECT
      gbo.*,
      c.first_name || ' ' || c.last_name AS customer_name,
      s.name AS store_name
    FROM gold_buyback_orders gbo
    JOIN customers c ON c.id = gbo.customer_id
    JOIN stores s ON s.id = gbo.store_id
    WHERE gbo.id = $1 AND gbo.organization_id = $2
    `,
    [params.id, params.organizationId],
  );

  const row = orderRes.rows[0];
  if (!row) {
    throw new NotFoundError("GoldBuybackOrder", params.id);
  }

  const itemsRes = await client.query<GoldBuybackItemRow>(
    `
    SELECT gbi.*, p.code AS purity_code
    FROM gold_buyback_items gbi
    JOIN purities p ON p.id = gbi.purity_id
    WHERE gbi.gold_buyback_order_id = $1
    ORDER BY gbi.created_at ASC
    `,
    [params.id],
  );

  const items = itemsRes.rows.map(mapRowToGoldBuybackItem);
  return mapRowToGoldBuybackOrder(row, items);
}

/**
 * Lists gold buyback orders with multi-criteria filtering and pagination (FEAT-RET-02).
 */
export async function listGoldBuybackOrders(
  params: ListGoldBuybackOrdersQuery & { organizationId: string },
  clientOverride?: Queryable,
): Promise<{
  data: GoldBuybackOrderRecord[];
  total: number;
  limit: number;
  offset: number;
}> {
  const client = clientOverride ?? getPool();
  const conditions: string[] = ["gbo.organization_id = $1"];
  const values: unknown[] = [params.organizationId];
  let paramIdx = 2;

  if (params.storeId) {
    conditions.push(`gbo.store_id = $${paramIdx++}`);
    values.push(params.storeId);
  }

  if (params.customerId) {
    conditions.push(`gbo.customer_id = $${paramIdx++}`);
    values.push(params.customerId);
  }

  if (params.status) {
    conditions.push(`gbo.status = $${paramIdx++}`);
    values.push(params.status);
  }

  if (params.search) {
    conditions.push(
      `(gbo.order_number ILIKE $${paramIdx} OR c.first_name ILIKE $${paramIdx} OR c.last_name ILIKE $${paramIdx})`,
    );
    values.push(`%${params.search}%`);
    paramIdx++;
  }

  const whereClause = conditions.join(" AND ");

  // Count total
  const countRes = await client.query<{ total: string }>(
    `
    SELECT COUNT(*)::text AS total
    FROM gold_buyback_orders gbo
    JOIN customers c ON c.id = gbo.customer_id
    WHERE ${whereClause}
    `,
    values,
  );
  const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

  // Fetch page
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const pageValues = [...values, limit, offset];

  const dataRes = await client.query<GoldBuybackOrderRow>(
    `
    SELECT
      gbo.*,
      c.first_name || ' ' || c.last_name AS customer_name,
      s.name AS store_name
    FROM gold_buyback_orders gbo
    JOIN customers c ON c.id = gbo.customer_id
    JOIN stores s ON s.id = gbo.store_id
    WHERE ${whereClause}
    ORDER BY gbo.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `,
    pageValues,
  );

  const data = dataRes.rows.map((row) => mapRowToGoldBuybackOrder(row));

  return {
    data,
    total,
    limit,
    offset,
  };
}
