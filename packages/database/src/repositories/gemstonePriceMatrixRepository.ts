import type { Pool, PoolClient } from "pg";
import {
  type CreateGemstonePriceMatrixInput,
  type UpdateGemstonePriceMatrixInput,
  type ListGemstonePriceMatricesQuery,
  type GemstonePriceMatrixRecord,
  NotFoundError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface GemstonePriceMatrixRow {
  id: string;
  organization_id: string;
  gemstone_id: string;
  carat_range_min: string | number;
  carat_range_max: string | number;
  cut_grade: string | null;
  color_grade: string | null;
  clarity_grade: string | null;
  rate_per_carat_cad: string | number;
  currency: string;
  is_active: boolean;
  effective_from: Date | string;
  effective_to: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapRowToGemstonePriceMatrix(
  row: GemstonePriceMatrixRow,
): GemstonePriceMatrixRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    gemstoneId: row.gemstone_id,
    caratRangeMin: parseFloat(Number(row.carat_range_min).toFixed(4)),
    caratRangeMax: parseFloat(Number(row.carat_range_max).toFixed(4)),
    cutGrade: row.cut_grade,
    colorGrade: row.color_grade,
    clarityGrade: row.clarity_grade,
    ratePerCaratCad: parseFloat(Number(row.rate_per_carat_cad).toFixed(2)),
    currency: row.currency,
    isActive: row.is_active,
    effectiveFrom: new Date(row.effective_from),
    effectiveTo: row.effective_to ? new Date(row.effective_to) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface CreateGemstonePriceMatrixParams extends CreateGemstonePriceMatrixInput {
  organizationId: string;
}

/**
 * Creates a new gemstone valuation matrix record (Entity 46 - FEAT-PRICE-03).
 */
export async function createGemstonePriceMatrix(
  params: CreateGemstonePriceMatrixParams,
  clientOverride?: Queryable,
): Promise<GemstonePriceMatrixRecord> {
  const pool = clientOverride ?? getPool();
  const id = uuidv7();

  const insertQuery = `
    INSERT INTO gemstone_price_matrices (
      id,
      organization_id,
      gemstone_id,
      carat_range_min,
      carat_range_max,
      cut_grade,
      color_grade,
      clarity_grade,
      rate_per_carat_cad,
      currency,
      is_active,
      effective_from,
      effective_to,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      clock_timestamp(), clock_timestamp()
    )
    RETURNING *;
  `;

  const res = await pool.query<GemstonePriceMatrixRow>(insertQuery, [
    id,
    params.organizationId,
    params.gemstoneId,
    params.caratRangeMin,
    params.caratRangeMax,
    params.cutGrade ?? null,
    params.colorGrade ?? null,
    params.clarityGrade ?? null,
    params.ratePerCaratCad,
    params.currency ?? "CAD",
    true,
    params.effectiveFrom ?? new Date(),
    params.effectiveTo ?? null,
  ]);

  const row = res.rows[0];
  if (!row) {
    throw new Error("Failed to insert gemstone price matrix entry");
  }

  return mapRowToGemstonePriceMatrix(row);
}

/**
 * Updates an existing gemstone price matrix entry.
 */
export async function updateGemstonePriceMatrix(
  id: string,
  params: UpdateGemstonePriceMatrixInput,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<GemstonePriceMatrixRecord> {
  const pool = clientOverride ?? getPool();

  const fields: string[] = [];
  const values: unknown[] = [id, organizationId];
  let pIdx = 3;

  if (params.cutGrade !== undefined) {
    fields.push(`cut_grade = $${pIdx++}`);
    values.push(params.cutGrade);
  }
  if (params.colorGrade !== undefined) {
    fields.push(`color_grade = $${pIdx++}`);
    values.push(params.colorGrade);
  }
  if (params.clarityGrade !== undefined) {
    fields.push(`clarity_grade = $${pIdx++}`);
    values.push(params.clarityGrade);
  }
  if (params.ratePerCaratCad !== undefined) {
    fields.push(`rate_per_carat_cad = $${pIdx++}`);
    values.push(params.ratePerCaratCad);
  }
  if (params.currency !== undefined) {
    fields.push(`currency = $${pIdx++}`);
    values.push(params.currency);
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
    const existing = await getGemstonePriceMatrixById(
      id,
      organizationId,
      clientOverride,
    );
    if (!existing) {
      throw new NotFoundError("GemstonePriceMatrix", id);
    }
    return existing;
  }

  fields.push("updated_at = clock_timestamp()");

  const query = `
    UPDATE gemstone_price_matrices
    SET ${fields.join(", ")}
    WHERE id = $1 AND organization_id = $2
    RETURNING *;
  `;

  const res = await pool.query<GemstonePriceMatrixRow>(query, values);
  const row = res.rows[0];
  if (!row) {
    throw new NotFoundError("GemstonePriceMatrix", id);
  }

  return mapRowToGemstonePriceMatrix(row);
}

/**
 * Retrieves a gemstone price matrix record by ID.
 */
export async function getGemstonePriceMatrixById(
  id: string,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<GemstonePriceMatrixRecord | null> {
  const pool = clientOverride ?? getPool();
  const query = `
    SELECT * FROM gemstone_price_matrices
    WHERE id = $1 AND organization_id = $2;
  `;
  const res = await pool.query<GemstonePriceMatrixRow>(query, [
    id,
    organizationId,
  ]);
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return mapRowToGemstonePriceMatrix(row);
}

export interface ListGemstonePriceMatricesParams extends ListGemstonePriceMatricesQuery {
  organizationId: string;
}

/**
 * Lists gemstone price matrices with optional filtering and pagination.
 */
export async function listGemstonePriceMatrices(
  params: ListGemstonePriceMatricesParams,
  clientOverride?: Queryable,
): Promise<{ data: GemstonePriceMatrixRecord[]; total: number }> {
  const pool = clientOverride ?? getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: unknown[] = [params.organizationId];
  let pIdx = 2;

  if (params.gemstoneId) {
    conditions.push(`gemstone_id = $${pIdx++}`);
    values.push(params.gemstoneId);
  }

  if (typeof params.isActive === "boolean") {
    conditions.push(`is_active = $${pIdx++}`);
    values.push(params.isActive);
  }

  const whereClause = conditions.join(" AND ");

  const countQuery = `SELECT COUNT(*) AS total FROM gemstone_price_matrices WHERE ${whereClause};`;
  const countRes = await pool.query<{ total: string }>(countQuery, values);
  const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

  const dataQuery = `
    SELECT * FROM gemstone_price_matrices
    WHERE ${whereClause}
    ORDER BY carat_range_min ASC, rate_per_carat_cad DESC
    LIMIT $${pIdx++} OFFSET $${pIdx++};
  `;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const dataRes = await pool.query<GemstonePriceMatrixRow>(dataQuery, [
    ...values,
    limit,
    offset,
  ]);

  return {
    data: dataRes.rows.map(mapRowToGemstonePriceMatrix),
    total,
  };
}

/**
 * Resolves the best-matching rate per carat for a gemstone based on carat bracket and quality grades.
 *
 * Specificity Ranking:
 * 1. Exact match on Cut + Color + Clarity
 * 2. Match on Color + Clarity (Cut is NULL in matrix)
 * 3. Match on Clarity only (Cut & Color are NULL in matrix)
 * 4. General Carat Range Baseline (Cut, Color, Clarity all NULL in matrix)
 */
export async function resolveGemstoneRate(
  params: {
    organizationId: string;
    gemstoneId: string;
    caratWeight: number;
    cutGrade?: string | null;
    colorGrade?: string | null;
    clarityGrade?: string | null;
    currency?: string;
  },
  clientOverride?: Queryable,
): Promise<GemstonePriceMatrixRecord | null> {
  const pool = clientOverride ?? getPool();
  const currency = params.currency ?? "CAD";

  const query = `
    SELECT * FROM gemstone_price_matrices
    WHERE organization_id = $1
      AND gemstone_id = $2
      AND currency = $3
      AND is_active = true
      AND (effective_to IS NULL OR effective_to > clock_timestamp())
      AND effective_from <= clock_timestamp()
      AND carat_range_min <= $4
      AND carat_range_max >= $4
      AND (
        ($5::varchar IS NOT NULL AND $6::varchar IS NOT NULL AND $7::varchar IS NOT NULL AND cut_grade = $5 AND color_grade = $6 AND clarity_grade = $7) OR
        ($6::varchar IS NOT NULL AND $7::varchar IS NOT NULL AND cut_grade IS NULL AND color_grade = $6 AND clarity_grade = $7) OR
        ($7::varchar IS NOT NULL AND cut_grade IS NULL AND color_grade IS NULL AND clarity_grade = $7) OR
        (cut_grade IS NULL AND color_grade IS NULL AND clarity_grade IS NULL)
      )
    ORDER BY
      CASE
        WHEN $5::varchar IS NOT NULL AND $6::varchar IS NOT NULL AND $7::varchar IS NOT NULL AND cut_grade = $5 AND color_grade = $6 AND clarity_grade = $7 THEN 1
        WHEN $6::varchar IS NOT NULL AND $7::varchar IS NOT NULL AND cut_grade IS NULL AND color_grade = $6 AND clarity_grade = $7 THEN 2
        WHEN $7::varchar IS NOT NULL AND cut_grade IS NULL AND color_grade IS NULL AND clarity_grade = $7 THEN 3
        ELSE 4
      END ASC,
      created_at DESC
    LIMIT 1;
  `;

  const res = await pool.query<GemstonePriceMatrixRow>(query, [
    params.organizationId,
    params.gemstoneId,
    currency,
    params.caratWeight,
    params.cutGrade ?? null,
    params.colorGrade ?? null,
    params.clarityGrade ?? null,
  ]);

  const row = res.rows[0];
  if (!row) {
    return null;
  }

  return mapRowToGemstonePriceMatrix(row);
}
