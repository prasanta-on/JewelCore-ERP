import type { Pool, PoolClient } from "pg";
import {
  type CreatePricingPolicyInput,
  type UpdatePricingPolicyInput,
  type ListPricingPoliciesQuery,
  type PricingPolicyRecord,
  type MakingChargeType,
  NotFoundError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface PricingPolicyRow {
  id: string;
  organization_id: string;
  store_id: string | null;
  category_id: string | null;
  product_id: string | null;
  policy_name: string;
  charge_type: string;
  charge_rate: string | number;
  wastage_percentage: string | number;
  hallmarking_fee_cad: string | number;
  certification_fee_cad: string | number;
  default_margin_percentage: string | number;
  min_retail_price_cad: string | number | null;
  is_active: boolean;
  effective_from: Date | string;
  effective_to: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapRowToPricingPolicy(
  row: PricingPolicyRow,
): PricingPolicyRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    categoryId: row.category_id,
    productId: row.product_id,
    policyName: row.policy_name,
    chargeType: row.charge_type as MakingChargeType,
    chargeRate: parseFloat(Number(row.charge_rate).toFixed(4)),
    wastagePercentage: parseFloat(Number(row.wastage_percentage).toFixed(4)),
    hallmarkingFeeCad: parseFloat(Number(row.hallmarking_fee_cad).toFixed(2)),
    certificationFeeCad: parseFloat(
      Number(row.certification_fee_cad).toFixed(2),
    ),
    defaultMarginPercentage: parseFloat(
      Number(row.default_margin_percentage).toFixed(4),
    ),
    minRetailPriceCad:
      row.min_retail_price_cad !== null
        ? parseFloat(Number(row.min_retail_price_cad).toFixed(2))
        : null,
    isActive: row.is_active,
    effectiveFrom: new Date(row.effective_from),
    effectiveTo: row.effective_to ? new Date(row.effective_to) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface CreatePricingPolicyParams extends CreatePricingPolicyInput {
  organizationId: string;
}

/**
 * Creates a new making charge and pricing policy (Entity 45 - FEAT-PRICE-02).
 */
export async function createPricingPolicy(
  params: CreatePricingPolicyParams,
  clientOverride?: Queryable,
): Promise<PricingPolicyRecord> {
  const pool = clientOverride ?? getPool();
  const id = uuidv7();

  const insertQuery = `
    INSERT INTO pricing_policies (
      id,
      organization_id,
      store_id,
      category_id,
      product_id,
      policy_name,
      charge_type,
      charge_rate,
      wastage_percentage,
      hallmarking_fee_cad,
      certification_fee_cad,
      default_margin_percentage,
      min_retail_price_cad,
      is_active,
      effective_from,
      effective_to,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      clock_timestamp(), clock_timestamp()
    )
    RETURNING *;
  `;

  const res = await pool.query<PricingPolicyRow>(insertQuery, [
    id,
    params.organizationId,
    params.storeId ?? null,
    params.categoryId ?? null,
    params.productId ?? null,
    params.policyName,
    params.chargeType,
    params.chargeRate,
    params.wastagePercentage ?? 0,
    params.hallmarkingFeeCad ?? 0,
    params.certificationFeeCad ?? 0,
    params.defaultMarginPercentage ?? 0.2,
    params.minRetailPriceCad ?? null,
    true,
    params.effectiveFrom ?? new Date(),
    params.effectiveTo ?? null,
  ]);

  const row = res.rows[0];
  if (!row) {
    throw new Error("Failed to insert pricing policy");
  }

  return mapRowToPricingPolicy(row);
}

/**
 * Updates an existing pricing policy.
 */
export async function updatePricingPolicy(
  id: string,
  params: UpdatePricingPolicyInput,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<PricingPolicyRecord> {
  const pool = clientOverride ?? getPool();

  const fields: string[] = [];
  const values: unknown[] = [id, organizationId];
  let pIdx = 3;

  if (params.policyName !== undefined) {
    fields.push(`policy_name = $${pIdx++}`);
    values.push(params.policyName);
  }
  if (params.chargeType !== undefined) {
    fields.push(`charge_type = $${pIdx++}`);
    values.push(params.chargeType);
  }
  if (params.chargeRate !== undefined) {
    fields.push(`charge_rate = $${pIdx++}`);
    values.push(params.chargeRate);
  }
  if (params.wastagePercentage !== undefined) {
    fields.push(`wastage_percentage = $${pIdx++}`);
    values.push(params.wastagePercentage);
  }
  if (params.hallmarkingFeeCad !== undefined) {
    fields.push(`hallmarking_fee_cad = $${pIdx++}`);
    values.push(params.hallmarkingFeeCad);
  }
  if (params.certificationFeeCad !== undefined) {
    fields.push(`certification_fee_cad = $${pIdx++}`);
    values.push(params.certificationFeeCad);
  }
  if (params.defaultMarginPercentage !== undefined) {
    fields.push(`default_margin_percentage = $${pIdx++}`);
    values.push(params.defaultMarginPercentage);
  }
  if (params.minRetailPriceCad !== undefined) {
    fields.push(`min_retail_price_cad = $${pIdx++}`);
    values.push(params.minRetailPriceCad);
  }
  if (params.isActive !== undefined) {
    fields.push(`is_active = $${pIdx++}`);
    values.push(params.isActive);
  }
  if (params.effectiveTo !== undefined) {
    fields.push(`effective_to = $${pIdx++}`);
    values.push(params.effectiveTo);
  }

  if (fields.length === 0) {
    const existing = await getPricingPolicyById(
      id,
      organizationId,
      clientOverride,
    );
    if (!existing) {
      throw new NotFoundError("PricingPolicy", id);
    }
    return existing;
  }

  fields.push("updated_at = clock_timestamp()");

  const query = `
    UPDATE pricing_policies
    SET ${fields.join(", ")}
    WHERE id = $1 AND organization_id = $2
    RETURNING *;
  `;

  const res = await pool.query<PricingPolicyRow>(query, values);
  const row = res.rows[0];
  if (!row) {
    throw new NotFoundError("PricingPolicy", id);
  }

  return mapRowToPricingPolicy(row);
}

/**
 * Retrieves a pricing policy by ID, scoped to an organization.
 */
export async function getPricingPolicyById(
  id: string,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<PricingPolicyRecord | null> {
  const pool = clientOverride ?? getPool();
  const query = `
    SELECT * FROM pricing_policies
    WHERE id = $1 AND organization_id = $2;
  `;
  const res = await pool.query<PricingPolicyRow>(query, [id, organizationId]);
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return mapRowToPricingPolicy(row);
}

export interface ListPricingPoliciesParams extends ListPricingPoliciesQuery {
  organizationId: string;
}

/**
 * Lists pricing policies with optional filtering and pagination.
 */
export async function listPricingPolicies(
  params: ListPricingPoliciesParams,
  clientOverride?: Queryable,
): Promise<{ data: PricingPolicyRecord[]; total: number }> {
  const pool = clientOverride ?? getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: unknown[] = [params.organizationId];
  let pIdx = 2;

  if (params.storeId !== undefined) {
    if (params.storeId === null) {
      conditions.push("store_id IS NULL");
    } else {
      conditions.push(`store_id = $${pIdx++}`);
      values.push(params.storeId);
    }
  }

  if (params.categoryId !== undefined) {
    if (params.categoryId === null) {
      conditions.push("category_id IS NULL");
    } else {
      conditions.push(`category_id = $${pIdx++}`);
      values.push(params.categoryId);
    }
  }

  if (params.productId !== undefined) {
    if (params.productId === null) {
      conditions.push("product_id IS NULL");
    } else {
      conditions.push(`product_id = $${pIdx++}`);
      values.push(params.productId);
    }
  }

  if (typeof params.isActive === "boolean") {
    conditions.push(`is_active = $${pIdx++}`);
    values.push(params.isActive);
  }

  const whereClause = conditions.join(" AND ");

  const countQuery = `SELECT COUNT(*) AS total FROM pricing_policies WHERE ${whereClause};`;
  const countRes = await pool.query<{ total: string }>(countQuery, values);
  const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

  const dataQuery = `
    SELECT * FROM pricing_policies
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${pIdx++} OFFSET $${pIdx++};
  `;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const dataRes = await pool.query<PricingPolicyRow>(dataQuery, [
    ...values,
    limit,
    offset,
  ]);

  return {
    data: dataRes.rows.map(mapRowToPricingPolicy),
    total,
  };
}

/**
 * Resolves the highest-priority active pricing policy for a specific product context.
 *
 * Evaluation Waterfall:
 * 1. Product + Store Match
 * 2. Product Corporate Match (store_id IS NULL)
 * 3. Category + Store Match
 * 4. Category Corporate Match (store_id IS NULL)
 * 5. Store Default Match (category_id IS NULL AND product_id IS NULL)
 * 6. Corporate Default Match (store_id IS NULL AND category_id IS NULL AND product_id IS NULL)
 */
export async function resolvePricingPolicy(
  params: {
    organizationId: string;
    storeId?: string | null;
    categoryId?: string | null;
    productId?: string | null;
  },
  clientOverride?: Queryable,
): Promise<PricingPolicyRecord | null> {
  const pool = clientOverride ?? getPool();
  const storeId = params.storeId ?? null;
  const categoryId = params.categoryId ?? null;
  const productId = params.productId ?? null;

  const query = `
    SELECT * FROM pricing_policies
    WHERE organization_id = $1
      AND is_active = true
      AND (effective_to IS NULL OR effective_to > clock_timestamp())
      AND effective_from <= clock_timestamp()
      AND (
        ($2::uuid IS NOT NULL AND $3::uuid IS NOT NULL AND store_id = $2 AND product_id = $3) OR
        ($3::uuid IS NOT NULL AND store_id IS NULL AND product_id = $3) OR
        ($2::uuid IS NOT NULL AND $4::uuid IS NOT NULL AND store_id = $2 AND category_id = $4 AND product_id IS NULL) OR
        ($4::uuid IS NOT NULL AND store_id IS NULL AND category_id = $4 AND product_id IS NULL) OR
        ($2::uuid IS NOT NULL AND store_id = $2 AND category_id IS NULL AND product_id IS NULL) OR
        (store_id IS NULL AND category_id IS NULL AND product_id IS NULL)
      )
    ORDER BY
      CASE
        WHEN $2::uuid IS NOT NULL AND $3::uuid IS NOT NULL AND store_id = $2 AND product_id = $3 THEN 1
        WHEN $3::uuid IS NOT NULL AND store_id IS NULL AND product_id = $3 THEN 2
        WHEN $2::uuid IS NOT NULL AND $4::uuid IS NOT NULL AND store_id = $2 AND category_id = $4 AND product_id IS NULL THEN 3
        WHEN $4::uuid IS NOT NULL AND store_id IS NULL AND category_id = $4 AND product_id IS NULL THEN 4
        WHEN $2::uuid IS NOT NULL AND store_id = $2 AND category_id IS NULL AND product_id IS NULL THEN 5
        ELSE 6
      END ASC,
      created_at DESC
    LIMIT 1;
  `;

  const res = await pool.query<PricingPolicyRow>(query, [
    params.organizationId,
    storeId,
    productId,
    categoryId,
  ]);

  const row = res.rows[0];
  if (!row) {
    return null;
  }

  return mapRowToPricingPolicy(row);
}
