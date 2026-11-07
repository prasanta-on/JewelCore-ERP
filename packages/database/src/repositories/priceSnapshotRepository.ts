import type { Pool, PoolClient } from "pg";
import {
  type PriceSnapshotRecord,
  type PriceBreakdownDetails,
  type PriceBreakdownGemstoneItem,
  type CalculatePriceRequest,
  type MetalType,
  MakingChargeType,
  type InventoryItemRecord,
  NotFoundError,
  UnprocessableEntityError,
  ConflictError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";
import { getLatestEffectiveRate } from "./pricingRateRepository.js";
import { resolvePricingPolicy } from "./pricingPolicyRepository.js";
import { resolveGemstoneRate } from "./gemstonePriceMatrixRepository.js";
import {
  mapRowToInventoryItem,
  type InventoryItemRow,
} from "./inventoryRepository.js";

type Queryable = Pool | PoolClient;

export interface PriceSnapshotRow {
  id: string;
  organization_id: string;
  store_id: string;
  inventory_item_id: string;
  market_rate_id: string | null;
  pricing_policy_id: string | null;
  metal_component_cad: string | number;
  gemstone_component_cad: string | number;
  making_charge_cad: string | number;
  wastage_component_cad: string | number;
  ancillary_fees_cad: string | number;
  cost_price_cad: string | number;
  margin_component_cad: string | number;
  selling_price_cad: string | number;
  price_breakdown_json: PriceBreakdownDetails | string;
  currency: string;
  triggered_by_user_id: string | null;
  created_at: Date | string;
}

export function mapRowToPriceSnapshot(
  row: PriceSnapshotRow,
): PriceSnapshotRecord {
  const breakdown: PriceBreakdownDetails =
    typeof row.price_breakdown_json === "string"
      ? JSON.parse(row.price_breakdown_json)
      : row.price_breakdown_json;

  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    inventoryItemId: row.inventory_item_id,
    marketRateId: row.market_rate_id,
    pricingPolicyId: row.pricing_policy_id,
    metalComponentCad: parseFloat(Number(row.metal_component_cad).toFixed(2)),
    gemstoneComponentCad: parseFloat(
      Number(row.gemstone_component_cad).toFixed(2),
    ),
    makingChargeCad: parseFloat(Number(row.making_charge_cad).toFixed(2)),
    wastageComponentCad: parseFloat(
      Number(row.wastage_component_cad).toFixed(2),
    ),
    ancillaryFeesCad: parseFloat(Number(row.ancillary_fees_cad).toFixed(2)),
    costPriceCad: parseFloat(Number(row.cost_price_cad).toFixed(2)),
    marginComponentCad: parseFloat(Number(row.margin_component_cad).toFixed(2)),
    sellingPriceCad: parseFloat(Number(row.selling_price_cad).toFixed(2)),
    priceBreakdownJson: breakdown,
    currency: row.currency,
    triggeredByUserId: row.triggered_by_user_id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
  };
}

export interface CalculationResult {
  marketRateId: string | null;
  pricingPolicyId: string | null;
  metalComponentCad: number;
  gemstoneComponentCad: number;
  makingChargeCad: number;
  wastageComponentCad: number;
  ancillaryFeesCad: number;
  costPriceCad: number;
  marginComponentCad: number;
  sellingPriceCad: number;
  priceBreakdown: PriceBreakdownDetails;
}

/**
 * Calculates dynamic valuation for an existing serialized jewellery inventory item.
 */
export async function calculateItemValuation(
  params: {
    organizationId: string;
    inventoryItemId: string;
    storeIdOverride?: string | null;
    marginPercentageOverride?: number;
  },
  clientOverride?: Queryable,
): Promise<CalculationResult> {
  const client = clientOverride || getPool();

  // 1. Fetch item with purity, material, SKU, product, and category
  const itemRes = await client.query<{
    id: string;
    organization_id: string;
    store_id: string;
    quality_check_item_id: string;
    net_weight_grams: string | number;
    purity_code: string;
    purity_ratio: string | number;
    base_metal_type: string;
    product_id: string;
    category_id: string;
  }>(
    `
    SELECT
      ii.id,
      ii.organization_id,
      ii.store_id,
      ii.quality_check_item_id,
      ii.net_weight_grams,
      p.code AS purity_code,
      p.purity_ratio,
      m.base_metal_type,
      prod.id AS product_id,
      prod.category_id
    FROM inventory_items ii
    JOIN purities p ON ii.purity_id = p.id
    JOIN materials m ON p.material_id = m.id
    JOIN product_skus ps ON ii.product_sku_id = ps.id
    JOIN products prod ON ps.product_id = prod.id
    WHERE ii.id = $1 AND ii.organization_id = $2
    `,
    [params.inventoryItemId, params.organizationId],
  );

  const item = itemRes.rows[0];
  if (!item) {
    throw new NotFoundError(
      `Inventory item not found: ${params.inventoryItemId}`,
      "ERR_NOT_FOUND",
    );
  }

  const targetStoreId = params.storeIdOverride ?? item.store_id;
  const metalType = item.base_metal_type.toUpperCase() as MetalType;

  // 2. Resolve latest precious metal market rate
  const marketRate = await getLatestEffectiveRate(
    {
      organizationId: params.organizationId,
      storeId: targetStoreId,
      metalType,
    },
    client,
  );

  if (!marketRate) {
    throw new UnprocessableEntityError(
      `No active daily market spot rate available for metal type: ${metalType}`,
      "ERR_MARKET_RATE_MISSING",
    );
  }

  const netWeightGrams = parseFloat(Number(item.net_weight_grams).toFixed(4));
  const purityRatio = parseFloat(Number(item.purity_ratio).toFixed(4));
  const pureMetalWeightGrams = parseFloat(
    (netWeightGrams * purityRatio).toFixed(4),
  );
  const spotRatePerGramCad = marketRate.ratePerGramCad;
  const metalTotalCad = parseFloat(
    (pureMetalWeightGrams * spotRatePerGramCad).toFixed(2),
  );

  // 3. Resolve gemstones attached to this piece
  const gemRes = await client.query<{
    item_gemstone_id: string;
    gemstone_id: string;
    gemstone_name: string;
    carat_weight: string | number;
    stone_count: number;
    cut_grade: string | null;
    color_grade: string | null;
    clarity_grade: string | null;
  }>(
    `
    SELECT
      ig.id AS item_gemstone_id,
      ig.gemstone_id,
      g.name AS gemstone_name,
      ig.carat_weight,
      ig.stone_count,
      ig.cut_grade,
      ig.color_grade,
      ig.clarity_grade
    FROM item_gemstones ig
    JOIN gemstones g ON ig.gemstone_id = g.id
    WHERE ig.quality_check_item_id = $1 OR ig.inventory_item_id = $2
    ORDER BY ig.created_at ASC
    `,
    [item.quality_check_item_id, item.id],
  );

  const evaluatedGemstones: PriceBreakdownGemstoneItem[] = [];
  let gemstoneTotalCad = 0;
  let totalStoneCount = 0;
  let totalCarats = 0;

  for (const stone of gemRes.rows) {
    const caratWeight = parseFloat(Number(stone.carat_weight).toFixed(4));
    const stoneCount = stone.stone_count || 1;
    totalStoneCount += stoneCount;
    totalCarats = parseFloat((totalCarats + caratWeight).toFixed(4));

    const matrixRate = await resolveGemstoneRate(
      {
        organizationId: params.organizationId,
        gemstoneId: stone.gemstone_id,
        caratWeight,
        cutGrade: stone.cut_grade,
        colorGrade: stone.color_grade,
        clarityGrade: stone.clarity_grade,
      },
      client,
    );

    if (!matrixRate) {
      throw new UnprocessableEntityError(
        `No gemstone valuation matrix found for stone: ${stone.gemstone_name} (${caratWeight} ct)`,
        "ERR_GEMSTONE_RATE_MISSING",
      );
    }

    const stoneCostCad = parseFloat(
      (caratWeight * matrixRate.ratePerCaratCad).toFixed(2),
    );
    gemstoneTotalCad = parseFloat((gemstoneTotalCad + stoneCostCad).toFixed(2));

    evaluatedGemstones.push({
      itemGemstoneId: stone.item_gemstone_id,
      gemstoneId: stone.gemstone_id,
      gemstoneName: stone.gemstone_name,
      caratWeight,
      stoneCount,
      cutGrade: stone.cut_grade,
      colorGrade: stone.color_grade,
      clarityGrade: stone.clarity_grade,
      ratePerCaratCad: matrixRate.ratePerCaratCad,
      matrixId: matrixRate.id,
      totalCad: stoneCostCad,
    });
  }

  // 4. Resolve Pricing Policy
  const policy = await resolvePricingPolicy(
    {
      organizationId: params.organizationId,
      storeId: targetStoreId,
      categoryId: item.category_id,
      productId: item.product_id,
    },
    client,
  );

  let makingChargeCad = 0;
  let chargeType: MakingChargeType = MakingChargeType.PER_GRAM;
  let chargeRate = 0;
  let wastagePercentage = 0;
  let wastageCad = 0;
  let hallmarkingCad = 0;
  let certificationCad = 0;
  let marginPercentage =
    params.marginPercentageOverride !== undefined
      ? params.marginPercentageOverride
      : 0.2;
  let minRetailPriceCad: number | null = null;

  if (policy) {
    chargeType = policy.chargeType;
    chargeRate = policy.chargeRate;
    wastagePercentage = policy.wastagePercentage;
    hallmarkingCad = policy.hallmarkingFeeCad;
    certificationCad = policy.certificationFeeCad;
    if (params.marginPercentageOverride === undefined) {
      marginPercentage = policy.defaultMarginPercentage;
    }
    minRetailPriceCad = policy.minRetailPriceCad;

    switch (chargeType) {
      case MakingChargeType.PER_GRAM:
        makingChargeCad = parseFloat((netWeightGrams * chargeRate).toFixed(2));
        break;
      case MakingChargeType.FIXED_PIECE:
        makingChargeCad = parseFloat(chargeRate.toFixed(2));
        break;
      case MakingChargeType.PERCENTAGE_OF_METAL:
        makingChargeCad = parseFloat((metalTotalCad * chargeRate).toFixed(2));
        break;
    }

    wastageCad = parseFloat((metalTotalCad * wastagePercentage).toFixed(2));
  }

  const ancillaryTotalCad = parseFloat(
    (hallmarkingCad + certificationCad).toFixed(2),
  );
  const costPriceCad = parseFloat(
    (
      metalTotalCad +
      gemstoneTotalCad +
      makingChargeCad +
      wastageCad +
      ancillaryTotalCad
    ).toFixed(2),
  );

  let marginCad = parseFloat((costPriceCad * marginPercentage).toFixed(2));
  let calculatedSellingPrice = parseFloat(
    (costPriceCad + marginCad).toFixed(2),
  );

  let sellingPriceCad = calculatedSellingPrice;
  if (
    minRetailPriceCad !== null &&
    calculatedSellingPrice < minRetailPriceCad
  ) {
    sellingPriceCad = minRetailPriceCad;
    marginCad = parseFloat((sellingPriceCad - costPriceCad).toFixed(2));
  }

  const priceBreakdown: PriceBreakdownDetails = {
    metal: {
      metalType,
      netWeightGrams,
      purityCode: item.purity_code,
      purityRatio,
      pureMetalWeightGrams,
      spotRatePerGramCad,
      marketRateId: marketRate.id,
      totalCad: metalTotalCad,
    },
    gemstones: {
      stoneCount: totalStoneCount,
      totalCarats,
      totalCad: gemstoneTotalCad,
      stones: evaluatedGemstones,
    },
    makingCharge: {
      policyId: policy?.id ?? null,
      policyName: policy?.policyName ?? null,
      chargeType,
      chargeRate,
      totalCad: makingChargeCad,
    },
    wastage: {
      percentage: wastagePercentage,
      totalCad: wastageCad,
    },
    ancillary: {
      hallmarkingCad,
      certificationCad,
      totalCad: ancillaryTotalCad,
    },
    summary: {
      costPriceCad,
      marginPercentage,
      marginCad,
      minRetailPriceCad,
      sellingPriceCad,
    },
  };

  return {
    marketRateId: marketRate.id,
    pricingPolicyId: policy?.id ?? null,
    metalComponentCad: metalTotalCad,
    gemstoneComponentCad: gemstoneTotalCad,
    makingChargeCad,
    wastageComponentCad: wastageCad,
    ancillaryFeesCad: ancillaryTotalCad,
    costPriceCad,
    marginComponentCad: marginCad,
    sellingPriceCad,
    priceBreakdown,
  };
}

/**
 * Calculates dynamic valuation for ad-hoc custom specifications (simulation tool).
 */
export async function calculateCustomValuation(
  organizationId: string,
  req: CalculatePriceRequest,
  clientOverride?: Queryable,
): Promise<CalculationResult> {
  const client = clientOverride || getPool();

  if (req.inventoryItemId) {
    return calculateItemValuation(
      {
        organizationId,
        inventoryItemId: req.inventoryItemId,
        storeIdOverride: req.storeId,
        marginPercentageOverride: req.marginPercentageOverride,
      },
      client,
    );
  }

  const metalType = req.metalType!;
  const netWeightGrams = req.netWeightGrams!;
  const purityRatio = req.purityRatio!;

  // Resolve market spot rate
  const marketRate = await getLatestEffectiveRate(
    {
      organizationId,
      storeId: req.storeId ?? undefined,
      metalType,
    },
    client,
  );

  if (!marketRate) {
    throw new UnprocessableEntityError(
      `No active daily market spot rate available for metal type: ${metalType}`,
      "ERR_MARKET_RATE_MISSING",
    );
  }

  const pureMetalWeightGrams = parseFloat(
    (netWeightGrams * purityRatio).toFixed(4),
  );
  const spotRatePerGramCad = marketRate.ratePerGramCad;
  const metalTotalCad = parseFloat(
    (pureMetalWeightGrams * spotRatePerGramCad).toFixed(2),
  );

  // Resolve Gemstones
  const evaluatedGemstones: PriceBreakdownGemstoneItem[] = [];
  let gemstoneTotalCad = 0;
  let totalStoneCount = 0;
  let totalCarats = 0;

  if (req.gemstones && req.gemstones.length > 0) {
    for (const stone of req.gemstones) {
      const caratWeight = parseFloat(Number(stone.caratWeight).toFixed(4));
      const stoneCount = stone.stoneCount || 1;
      totalStoneCount += stoneCount;
      totalCarats = parseFloat((totalCarats + caratWeight).toFixed(4));

      const matrixRate = await resolveGemstoneRate(
        {
          organizationId,
          gemstoneId: stone.gemstoneId,
          caratWeight,
          cutGrade: stone.cutGrade,
          colorGrade: stone.colorGrade,
          clarityGrade: stone.clarityGrade,
        },
        client,
      );

      if (!matrixRate) {
        throw new UnprocessableEntityError(
          `No gemstone valuation matrix found for gemstone: ${stone.gemstoneId} (${caratWeight} ct)`,
          "ERR_GEMSTONE_RATE_MISSING",
        );
      }

      const stoneCostCad = parseFloat(
        (caratWeight * matrixRate.ratePerCaratCad).toFixed(2),
      );
      gemstoneTotalCad = parseFloat(
        (gemstoneTotalCad + stoneCostCad).toFixed(2),
      );

      evaluatedGemstones.push({
        gemstoneId: stone.gemstoneId,
        caratWeight,
        stoneCount,
        cutGrade: stone.cutGrade,
        colorGrade: stone.colorGrade,
        clarityGrade: stone.clarityGrade,
        ratePerCaratCad: matrixRate.ratePerCaratCad,
        matrixId: matrixRate.id,
        totalCad: stoneCostCad,
      });
    }
  }

  // Resolve Pricing Policy
  const policy = await resolvePricingPolicy(
    {
      organizationId,
      storeId: req.storeId ?? undefined,
      categoryId: req.categoryId ?? undefined,
      productId: req.productId ?? undefined,
    },
    client,
  );

  let makingChargeCad = 0;
  let chargeType: MakingChargeType = MakingChargeType.PER_GRAM;
  let chargeRate = 0;
  let wastagePercentage = 0;
  let wastageCad = 0;
  let hallmarkingCad = 0;
  let certificationCad = 0;
  let marginPercentage =
    req.marginPercentageOverride !== undefined
      ? req.marginPercentageOverride
      : 0.2;
  let minRetailPriceCad: number | null = null;

  if (policy) {
    chargeType = policy.chargeType;
    chargeRate = policy.chargeRate;
    wastagePercentage = policy.wastagePercentage;
    hallmarkingCad = policy.hallmarkingFeeCad;
    certificationCad = policy.certificationFeeCad;
    if (req.marginPercentageOverride === undefined) {
      marginPercentage = policy.defaultMarginPercentage;
    }
    minRetailPriceCad = policy.minRetailPriceCad;

    switch (chargeType) {
      case MakingChargeType.PER_GRAM:
        makingChargeCad = parseFloat((netWeightGrams * chargeRate).toFixed(2));
        break;
      case MakingChargeType.FIXED_PIECE:
        makingChargeCad = parseFloat(chargeRate.toFixed(2));
        break;
      case MakingChargeType.PERCENTAGE_OF_METAL:
        makingChargeCad = parseFloat((metalTotalCad * chargeRate).toFixed(2));
        break;
    }

    wastageCad = parseFloat((metalTotalCad * wastagePercentage).toFixed(2));
  }

  const ancillaryTotalCad = parseFloat(
    (hallmarkingCad + certificationCad).toFixed(2),
  );
  const costPriceCad = parseFloat(
    (
      metalTotalCad +
      gemstoneTotalCad +
      makingChargeCad +
      wastageCad +
      ancillaryTotalCad
    ).toFixed(2),
  );

  let marginCad = parseFloat((costPriceCad * marginPercentage).toFixed(2));
  let calculatedSellingPrice = parseFloat(
    (costPriceCad + marginCad).toFixed(2),
  );

  let sellingPriceCad = calculatedSellingPrice;
  if (
    minRetailPriceCad !== null &&
    calculatedSellingPrice < minRetailPriceCad
  ) {
    sellingPriceCad = minRetailPriceCad;
    marginCad = parseFloat((sellingPriceCad - costPriceCad).toFixed(2));
  }

  const priceBreakdown: PriceBreakdownDetails = {
    metal: {
      metalType,
      netWeightGrams,
      purityRatio,
      pureMetalWeightGrams,
      spotRatePerGramCad,
      marketRateId: marketRate.id,
      totalCad: metalTotalCad,
    },
    gemstones: {
      stoneCount: totalStoneCount,
      totalCarats,
      totalCad: gemstoneTotalCad,
      stones: evaluatedGemstones,
    },
    makingCharge: {
      policyId: policy?.id ?? null,
      policyName: policy?.policyName ?? null,
      chargeType,
      chargeRate,
      totalCad: makingChargeCad,
    },
    wastage: {
      percentage: wastagePercentage,
      totalCad: wastageCad,
    },
    ancillary: {
      hallmarkingCad,
      certificationCad,
      totalCad: ancillaryTotalCad,
    },
    summary: {
      costPriceCad,
      marginPercentage,
      marginCad,
      minRetailPriceCad,
      sellingPriceCad,
    },
  };

  return {
    marketRateId: marketRate.id,
    pricingPolicyId: policy?.id ?? null,
    metalComponentCad: metalTotalCad,
    gemstoneComponentCad: gemstoneTotalCad,
    makingChargeCad,
    wastageComponentCad: wastageCad,
    ancillaryFeesCad: ancillaryTotalCad,
    costPriceCad,
    marginComponentCad: marginCad,
    sellingPriceCad,
    priceBreakdown,
  };
}

/**
 * Snapshots the dynamic price of a serialized inventory piece, writing to price_snapshots
 * and atomically updating inventory_items (cost_price_cad, selling_price_cad, version).
 */
export async function snapshotPiecePrice(
  params: {
    organizationId: string;
    inventoryItemId: string;
    marginPercentageOverride?: number;
    triggeredByUserId?: string | null;
  },
  clientOverride?: Queryable,
): Promise<{
  snapshot: PriceSnapshotRecord;
  inventoryItem: InventoryItemRecord;
  breakdown: PriceBreakdownDetails;
}> {
  const runner = async (client: Queryable) => {
    // 1. Lock inventory item row FOR UPDATE to prevent concurrency race conditions
    const itemLockRes = await client.query<InventoryItemRow>(
      `
      SELECT *
      FROM inventory_items
      WHERE id = $1 AND organization_id = $2
      FOR UPDATE
      `,
      [params.inventoryItemId, params.organizationId],
    );

    const currentItem = itemLockRes.rows[0];
    if (!currentItem) {
      throw new NotFoundError(
        `Inventory item not found: ${params.inventoryItemId}`,
        "ERR_NOT_FOUND",
      );
    }

    // 2. Perform dynamic calculation
    const calc = await calculateItemValuation(
      {
        organizationId: params.organizationId,
        inventoryItemId: params.inventoryItemId,
        marginPercentageOverride: params.marginPercentageOverride,
      },
      client,
    );

    // 3. Insert immutable price snapshot record (Entity 47)
    const snapshotId = uuidv7();
    const insertRes = await client.query<PriceSnapshotRow>(
      `
      INSERT INTO price_snapshots (
        id,
        organization_id,
        store_id,
        inventory_item_id,
        market_rate_id,
        pricing_policy_id,
        metal_component_cad,
        gemstone_component_cad,
        making_charge_cad,
        wastage_component_cad,
        ancillary_fees_cad,
        cost_price_cad,
        margin_component_cad,
        selling_price_cad,
        price_breakdown_json,
        currency,
        triggered_by_user_id,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'CAD', $16, CURRENT_TIMESTAMP
      )
      RETURNING *
      `,
      [
        snapshotId,
        params.organizationId,
        currentItem.store_id,
        currentItem.id,
        calc.marketRateId,
        calc.pricingPolicyId,
        calc.metalComponentCad,
        calc.gemstoneComponentCad,
        calc.makingChargeCad,
        calc.wastageComponentCad,
        calc.ancillaryFeesCad,
        calc.costPriceCad,
        calc.marginComponentCad,
        calc.sellingPriceCad,
        JSON.stringify(calc.priceBreakdown),
        params.triggeredByUserId ?? null,
      ],
    );

    // 4. Update inventory_items atomically with OCC version check
    const updateRes = await client.query<InventoryItemRow>(
      `
      UPDATE inventory_items
      SET
        cost_price_cad = $1,
        selling_price_cad = $2,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND version = $4
      RETURNING *
      `,
      [
        calc.costPriceCad,
        calc.sellingPriceCad,
        currentItem.id,
        currentItem.version,
      ],
    );

    if (updateRes.rowCount === 0) {
      throw new ConflictError(
        "Inventory item version conflict during price snapshot (OCC)",
        "ERR_OCC_CONFLICT",
      );
    }

    const insertedRow = insertRes.rows[0];
    if (!insertedRow) {
      throw new Error("Failed to insert price snapshot");
    }
    const updatedRow = updateRes.rows[0];
    if (!updatedRow) {
      throw new Error("Failed to update inventory item price");
    }

    const snapshot = mapRowToPriceSnapshot(insertedRow);
    const inventoryItem = mapRowToInventoryItem(updatedRow);

    return {
      snapshot,
      inventoryItem,
      breakdown: calc.priceBreakdown,
    };
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Batch revalues all sellable inventory items in a store branch.
 */
export async function revalueStoreInventory(
  params: {
    organizationId: string;
    storeId: string;
    categoryId?: string | null;
    triggeredByUserId?: string | null;
  },
  clientOverride?: Queryable,
): Promise<{
  storeId: string;
  itemsRevalued: number;
  totalCostPriceCad: number;
  totalSellingPriceCad: number;
  snapshots: PriceSnapshotRecord[];
}> {
  const runner = async (client: Queryable) => {
    // Query all eligible items in store
    const itemsRes = await client.query<{ id: string }>(
      `
      SELECT ii.id
      FROM inventory_items ii
      JOIN product_skus ps ON ii.product_sku_id = ps.id
      JOIN products p ON ps.product_id = p.id
      WHERE ii.organization_id = $1
        AND ii.store_id = $2
        AND ii.custody_state != 'RELEASED'
        AND ii.commercial_state != 'SOLD'
        AND ($3::uuid IS NULL OR p.category_id = $3::uuid)
      ORDER BY ii.created_at ASC
      FOR UPDATE OF ii
      `,
      [params.organizationId, params.storeId, params.categoryId ?? null],
    );

    let itemsRevalued = 0;
    let totalCostPriceCad = 0;
    let totalSellingPriceCad = 0;
    const snapshots: PriceSnapshotRecord[] = [];

    for (const row of itemsRes.rows) {
      const res = await snapshotPiecePrice(
        {
          organizationId: params.organizationId,
          inventoryItemId: row.id,
          triggeredByUserId: params.triggeredByUserId,
        },
        client,
      );

      itemsRevalued += 1;
      totalCostPriceCad = parseFloat(
        (totalCostPriceCad + res.snapshot.costPriceCad).toFixed(2),
      );
      totalSellingPriceCad = parseFloat(
        (totalSellingPriceCad + res.snapshot.sellingPriceCad).toFixed(2),
      );
      snapshots.push(res.snapshot);
    }

    return {
      storeId: params.storeId,
      itemsRevalued,
      totalCostPriceCad,
      totalSellingPriceCad,
      snapshots,
    };
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Lists price snapshots for an item or store with pagination.
 */
export async function listPriceSnapshots(
  params: {
    organizationId: string;
    inventoryItemId?: string;
    storeId?: string;
    limit?: number;
    offset?: number;
  },
  clientOverride?: Queryable,
): Promise<{ data: PriceSnapshotRecord[]; total: number }> {
  const client = clientOverride || getPool();
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const conditions: string[] = ["organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.inventoryItemId) {
    values.push(params.inventoryItemId);
    conditions.push(`inventory_item_id = $${values.length}`);
  }

  if (params.storeId) {
    values.push(params.storeId);
    conditions.push(`store_id = $${values.length}`);
  }

  const whereClause = conditions.join(" AND ");

  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM price_snapshots WHERE ${whereClause}`,
    values,
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  values.push(limit, offset);
  const dataRes = await client.query<PriceSnapshotRow>(
    `
    SELECT *
    FROM price_snapshots
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values,
  );

  return {
    data: dataRes.rows.map(mapRowToPriceSnapshot),
    total,
  };
}

/**
 * Gets a price snapshot by ID.
 */
export async function getPriceSnapshotById(
  params: { organizationId: string; id: string },
  clientOverride?: Queryable,
): Promise<PriceSnapshotRecord | null> {
  const client = clientOverride || getPool();

  const res = await client.query<PriceSnapshotRow>(
    `
    SELECT *
    FROM price_snapshots
    WHERE organization_id = $1 AND id = $2
    `,
    [params.organizationId, params.id],
  );

  const row = res.rows[0];
  if (!row) return null;
  return mapRowToPriceSnapshot(row);
}
