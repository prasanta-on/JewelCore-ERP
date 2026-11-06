import type { Pool, PoolClient } from "pg";
import {
  type ProductSku,
  type ProductGemstoneSpec,
  type ProductSkuWithSpecs,
  type TrackingType,
  ConflictError,
  UnprocessableEntityError,
  NotFoundError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface ProductSkuRow {
  id: string;
  organization_id: string;
  product_id: string;
  sku_code: string;
  variant_name: string;
  target_purity_id: string;
  target_gross_weight_grams: string;
  target_metal_weight_grams: string;
  tracking_type: TrackingType;
  attributes_json: Record<string, any> | string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ProductGemstoneSpecRow {
  id: string;
  product_sku_id: string;
  gemstone_id: string;
  expected_stone_count: number;
  target_total_carat_weight: string;
  shape: string | null;
  cut_grade: string | null;
  color_grade: string | null;
  clarity_grade: string | null;
  setting_type: string | null;
  is_primary: boolean;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToProductSku(row: ProductSkuRow): ProductSku {
  return {
    id: row.id,
    organizationId: row.organization_id,
    productId: row.product_id,
    skuCode: row.sku_code,
    variantName: row.variant_name,
    targetPurityId: row.target_purity_id,
    targetGrossWeightGrams: parseFloat(row.target_gross_weight_grams),
    targetMetalWeightGrams: parseFloat(row.target_metal_weight_grams),
    trackingType: row.tracking_type,
    attributesJson:
      typeof row.attributes_json === "string"
        ? JSON.parse(row.attributes_json)
        : (row.attributes_json ?? {}),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToGemstoneSpec(
  row: ProductGemstoneSpecRow,
): ProductGemstoneSpec {
  return {
    id: row.id,
    productSkuId: row.product_sku_id,
    gemstoneId: row.gemstone_id,
    expectedStoneCount: Number(row.expected_stone_count),
    targetTotalCaratWeight: parseFloat(row.target_total_carat_weight),
    shape: row.shape,
    cutGrade: row.cut_grade,
    colorGrade: row.color_grade,
    clarityGrade: row.clarity_grade,
    settingType: row.setting_type,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new commercial SKU (Entity 16) under an organization.
 * Inherits default tracking type from parent product if not explicitly specified.
 */
export async function createProductSku(
  data: {
    id?: string;
    organizationId: string;
    productId: string;
    skuCode: string;
    variantName: string;
    targetPurityId: string;
    targetGrossWeightGrams: number;
    targetMetalWeightGrams: number;
    trackingType?: TrackingType;
    attributesJson?: Record<string, any>;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<ProductSku> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();

  // If trackingType not supplied, inherit from product style
  let trackingType = data.trackingType;
  if (!trackingType) {
    const prodRes = await executor.query<{
      default_tracking_type: TrackingType;
    }>(`SELECT default_tracking_type FROM products WHERE id = $1;`, [
      data.productId,
    ]);
    const prodRow = prodRes.rows[0];
    if (!prodRow) {
      throw new UnprocessableEntityError(
        "Referenced product style does not exist",
        "ERR_PRODUCT_NOT_FOUND",
      );
    }
    trackingType = prodRow.default_tracking_type;
  }

  const attributesJson = data.attributesJson ?? {};
  const isActive = data.isActive ?? true;

  try {
    const result = await executor.query<ProductSkuRow>(
      `
      INSERT INTO product_skus (
        id, organization_id, product_id, sku_code, variant_name,
        target_purity_id, target_gross_weight_grams, target_metal_weight_grams,
        tracking_type, attributes_json, is_active,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, organization_id, product_id, sku_code, variant_name,
                target_purity_id, target_gross_weight_grams, target_metal_weight_grams,
                tracking_type, attributes_json, is_active,
                created_at, updated_at;
      `,
      [
        id,
        data.organizationId,
        data.productId,
        data.skuCode,
        data.variantName,
        data.targetPurityId,
        data.targetGrossWeightGrams,
        data.targetMetalWeightGrams,
        trackingType,
        JSON.stringify(attributesJson),
        isActive,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert product sku record");
    }

    return mapRowToProductSku(row);
  } catch (err: any) {
    if (
      err.constraint === "uq_product_skus_org_sku_code" ||
      err.code === "23505"
    ) {
      throw new ConflictError(
        `SKU with code '${data.skuCode}' already exists in this organization`,
        "ERR_DUPLICATE_SKU_CODE",
      );
    }
    if (err.constraint === "chk_product_skus_weights") {
      throw new UnprocessableEntityError(
        "Gross weight must be greater than or equal to metal weight",
        "ERR_INVALID_WEIGHTS",
      );
    }
    if (err.constraint === "product_skus_product_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced product style does not exist",
        "ERR_PRODUCT_NOT_FOUND",
      );
    }
    if (err.constraint === "product_skus_target_purity_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced purity standard does not exist",
        "ERR_PURITY_NOT_FOUND",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a product SKU by primary key ID.
 */
export async function getProductSkuById(
  id: string,
  clientOverride?: Queryable,
): Promise<ProductSku | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<ProductSkuRow>(
    `
    SELECT id, organization_id, product_id, sku_code, variant_name,
           target_purity_id, target_gross_weight_grams, target_metal_weight_grams,
           tracking_type, attributes_json, is_active,
           created_at, updated_at
    FROM product_skus
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToProductSku(row) : null;
}

/**
 * Retrieves a product SKU by organization ID and SKU code.
 */
export async function getProductSkuByCode(
  organizationId: string,
  skuCode: string,
  clientOverride?: Queryable,
): Promise<ProductSku | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<ProductSkuRow>(
    `
    SELECT id, organization_id, product_id, sku_code, variant_name,
           target_purity_id, target_gross_weight_grams, target_metal_weight_grams,
           tracking_type, attributes_json, is_active,
           created_at, updated_at
    FROM product_skus
    WHERE organization_id = $1 AND sku_code = $2;
    `,
    [organizationId, skuCode],
  );

  const row = result.rows[0];
  return row ? mapRowToProductSku(row) : null;
}

/**
 * Lists SKUs for an organization with optional product and active filters.
 */
export async function listProductSkus(
  params: {
    organizationId: string;
    productId?: string;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<ProductSku[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.productId) {
    values.push(params.productId);
    conditions.push(`product_id = $${values.length}`);
  }

  if (params.isActive !== undefined) {
    values.push(params.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const query = `
    SELECT id, organization_id, product_id, sku_code, variant_name,
           target_purity_id, target_gross_weight_grams, target_metal_weight_grams,
           tracking_type, attributes_json, is_active,
           created_at, updated_at
    FROM product_skus
    WHERE ${conditions.join(" AND ")}
    ORDER BY sku_code ASC;
  `;

  const result = await executor.query<ProductSkuRow>(query, values);
  return result.rows.map(mapRowToProductSku);
}

/**
 * Updates an existing commercial SKU.
 * Enforces INV-06: tracking_type cannot be modified once set.
 */
export async function updateProductSku(
  id: string,
  data: {
    variantName?: string;
    targetPurityId?: string;
    targetGrossWeightGrams?: number;
    targetMetalWeightGrams?: number;
    trackingType?: string;
    attributesJson?: Record<string, any>;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<ProductSku> {
  const executor = clientOverride ?? getPool();

  const existing = await getProductSkuById(id, executor);
  if (!existing) {
    throw new NotFoundError(
      `Product SKU with ID '${id}' not found`,
      "ERR_SKU_NOT_FOUND",
    );
  }

  // INV-06: Strict immutability check for tracking_type
  if (
    data.trackingType !== undefined &&
    data.trackingType !== existing.trackingType
  ) {
    throw new UnprocessableEntityError(
      "Tracking type is immutable once SKU is created",
      "ERR_TRACKING_TYPE_IMMUTABLE",
    );
  }

  const updatedGross =
    data.targetGrossWeightGrams ?? existing.targetGrossWeightGrams;
  const updatedMetal =
    data.targetMetalWeightGrams ?? existing.targetMetalWeightGrams;

  if (updatedGross < updatedMetal) {
    throw new UnprocessableEntityError(
      "Gross weight must be greater than or equal to metal weight",
      "ERR_INVALID_WEIGHTS",
    );
  }

  const updates: string[] = [];
  const values: any[] = [id];

  if (data.variantName !== undefined) {
    values.push(data.variantName);
    updates.push(`variant_name = $${values.length}`);
  }
  if (data.targetPurityId !== undefined) {
    values.push(data.targetPurityId);
    updates.push(`target_purity_id = $${values.length}`);
  }
  if (data.targetGrossWeightGrams !== undefined) {
    values.push(data.targetGrossWeightGrams);
    updates.push(`target_gross_weight_grams = $${values.length}`);
  }
  if (data.targetMetalWeightGrams !== undefined) {
    values.push(data.targetMetalWeightGrams);
    updates.push(`target_metal_weight_grams = $${values.length}`);
  }
  if (data.attributesJson !== undefined) {
    values.push(JSON.stringify(data.attributesJson));
    updates.push(`attributes_json = $${values.length}`);
  }
  if (data.isActive !== undefined) {
    values.push(data.isActive);
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE product_skus
    SET ${updates.join(", ")}
    WHERE id = $1
    RETURNING id, organization_id, product_id, sku_code, variant_name,
              target_purity_id, target_gross_weight_grams, target_metal_weight_grams,
              tracking_type, attributes_json, is_active,
              created_at, updated_at;
  `;

  try {
    const result = await executor.query<ProductSkuRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(
        `Product SKU with ID '${id}' not found`,
        "ERR_SKU_NOT_FOUND",
      );
    }
    return mapRowToProductSku(row);
  } catch (err: any) {
    if (err.constraint === "chk_product_skus_weights") {
      throw new UnprocessableEntityError(
        "Gross weight must be greater than or equal to metal weight",
        "ERR_INVALID_WEIGHTS",
      );
    }
    if (err.constraint === "product_skus_target_purity_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced purity standard does not exist",
        "ERR_PURITY_NOT_FOUND",
      );
    }
    throw err;
  }
}

/**
 * Creates a gemstone specification (Entity 17) associated with a SKU.
 */
export async function createProductGemstoneSpec(
  data: {
    id?: string;
    productSkuId: string;
    gemstoneId: string;
    expectedStoneCount: number;
    targetTotalCaratWeight: number;
    shape?: string | null;
    cutGrade?: string | null;
    colorGrade?: string | null;
    clarityGrade?: string | null;
    settingType?: string | null;
    isPrimary?: boolean;
  },
  clientOverride?: Queryable,
): Promise<ProductGemstoneSpec> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const isPrimary = data.isPrimary ?? false;

  try {
    const result = await executor.query<ProductGemstoneSpecRow>(
      `
      INSERT INTO product_gemstone_specs (
        id, product_sku_id, gemstone_id, expected_stone_count, target_total_carat_weight,
        shape, cut_grade, color_grade, clarity_grade, setting_type, is_primary,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, product_sku_id, gemstone_id, expected_stone_count, target_total_carat_weight,
                shape, cut_grade, color_grade, clarity_grade, setting_type, is_primary,
                created_at, updated_at;
      `,
      [
        id,
        data.productSkuId,
        data.gemstoneId,
        data.expectedStoneCount,
        data.targetTotalCaratWeight,
        data.shape ?? null,
        data.cutGrade ?? null,
        data.colorGrade ?? null,
        data.clarityGrade ?? null,
        data.settingType ?? null,
        isPrimary,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert gemstone spec record");
    }

    return mapRowToGemstoneSpec(row);
  } catch (err: any) {
    if (err.constraint === "uq_sku_gemstone_shape" || err.code === "23505") {
      throw new ConflictError(
        "Gemstone specification for this stone and shape already exists on this SKU",
        "ERR_DUPLICATE_GEMSTONE_SPEC",
      );
    }
    if (err.constraint === "product_gemstone_specs_product_sku_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced SKU does not exist",
        "ERR_SKU_NOT_FOUND",
      );
    }
    if (err.constraint === "product_gemstone_specs_gemstone_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced gemstone does not exist",
        "ERR_GEMSTONE_NOT_FOUND",
      );
    }
    throw err;
  }
}

/**
 * Lists all gemstone specifications for a given SKU.
 */
export async function listGemstoneSpecsBySku(
  productSkuId: string,
  clientOverride?: Queryable,
): Promise<ProductGemstoneSpec[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<ProductGemstoneSpecRow>(
    `
    SELECT id, product_sku_id, gemstone_id, expected_stone_count, target_total_carat_weight,
           shape, cut_grade, color_grade, clarity_grade, setting_type, is_primary,
           created_at, updated_at
    FROM product_gemstone_specs
    WHERE product_sku_id = $1
    ORDER BY is_primary DESC, created_at ASC;
    `,
    [productSkuId],
  );

  return result.rows.map(mapRowToGemstoneSpec);
}

/**
 * Retrieves a SKU along with its associated gemstone specifications.
 */
export async function getProductSkuWithSpecs(
  id: string,
  clientOverride?: Queryable,
): Promise<ProductSkuWithSpecs | null> {
  const sku = await getProductSkuById(id, clientOverride);
  if (!sku) {
    return null;
  }

  const specs = await listGemstoneSpecsBySku(id, clientOverride);
  return {
    ...sku,
    gemstoneSpecs: specs,
  };
}
