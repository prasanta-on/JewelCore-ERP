import type { Pool, PoolClient } from "pg";
import {
  type CreateDailyMarketRateInput,
  type ListDailyMarketRatesQuery,
  type DailyMarketRateRecord,
  type MetalType,
  type RateSource,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

interface DailyMarketRateRow {
  id: string;
  organization_id: string;
  store_id: string | null;
  metal_type: string;
  rate_per_gram_cad: string | number;
  currency: string;
  effective_from: Date | string;
  effective_to: Date | string | null;
  rate_source: string;
  is_active: boolean;
  recorded_by_user_id: string;
  notes: string | null;
  created_at: Date | string;
}

export function mapRowToDailyMarketRate(
  row: DailyMarketRateRow,
): DailyMarketRateRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    metalType: row.metal_type as MetalType,
    ratePerGramCad: parseFloat(Number(row.rate_per_gram_cad).toFixed(4)),
    currency: row.currency,
    effectiveFrom: new Date(row.effective_from),
    effectiveTo: row.effective_to ? new Date(row.effective_to) : null,
    rateSource: row.rate_source as RateSource,
    isActive: row.is_active,
    recordedByUserId: row.recorded_by_user_id,
    notes: row.notes,
    createdAt: new Date(row.created_at),
  };
}

export interface RecordDailyMarketRateParams extends CreateDailyMarketRateInput {
  organizationId: string;
  recordedByUserId: string;
}

/**
 * Records a new daily market spot rate for a precious metal (Entity 44 - FEAT-PRICE-01).
 *
 * Guarantees:
 * - Atomic superseding of currently active spot rate for the same (org, store, metal, currency)
 * - Immutability of superseded rates (effective_to stamped, historical values frozen / INV-09)
 * - Multi-store and corporate default fallback support (storeId = null)
 */
export async function recordDailyMarketRate(
  params: RecordDailyMarketRateParams,
  clientOverride?: Queryable,
): Promise<DailyMarketRateRecord> {
  const runner = async (client: Queryable) => {
    const rateId = uuidv7();
    const effectiveFrom = params.effectiveFrom ?? new Date();
    const currency = params.currency ?? "CAD";

    // 1. Supersede any existing active rate for the exact same org/store/metal/currency scope
    const supersedeQuery = `
      UPDATE daily_market_rates
      SET effective_to = $1,
          is_active = false
      WHERE organization_id = $2
        AND store_id IS NOT DISTINCT FROM $3
        AND metal_type = $4
        AND currency = $5
        AND is_active = true
        AND effective_to IS NULL;
    `;
    await client.query(supersedeQuery, [
      effectiveFrom,
      params.organizationId,
      params.storeId ?? null,
      params.metalType,
      currency,
    ]);

    // 2. Insert the new active spot rate
    const insertQuery = `
      INSERT INTO daily_market_rates (
        id,
        organization_id,
        store_id,
        metal_type,
        rate_per_gram_cad,
        currency,
        effective_from,
        effective_to,
        rate_source,
        is_active,
        recorded_by_user_id,
        notes,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp())
      RETURNING *;
    `;
    const res = await client.query<DailyMarketRateRow>(insertQuery, [
      rateId,
      params.organizationId,
      params.storeId ?? null,
      params.metalType,
      params.ratePerGramCad,
      currency,
      effectiveFrom,
      params.effectiveTo ?? null,
      params.rateSource ?? "MANUAL_OVERRIDE",
      true,
      params.recordedByUserId,
      params.notes ?? null,
    ]);

    const row = res.rows[0];
    if (!row) {
      throw new Error("Failed to insert daily market rate record");
    }

    return mapRowToDailyMarketRate(row);
  };

  if (clientOverride) {
    return runner(clientOverride);
  }

  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Retrieves the latest active market spot rate for a metal.
 * If storeId is provided and a store-specific rate exists, it takes precedence.
 * Otherwise, falls back to the organization-wide corporate default rate (store_id IS NULL).
 */
export async function getLatestEffectiveRate(params: {
  organizationId: string;
  metalType: MetalType;
  storeId?: string | null;
  currency?: string;
  atDate?: Date;
}): Promise<DailyMarketRateRecord | null> {
  const pool = getPool();
  const currency = params.currency ?? "CAD";
  const targetDate = params.atDate ?? new Date();

  // 1. If storeId provided, check for store-level active rate
  if (params.storeId) {
    const storeQuery = `
      SELECT * FROM daily_market_rates
      WHERE organization_id = $1
        AND store_id = $2
        AND metal_type = $3
        AND currency = $4
        AND is_active = true
        AND effective_from <= $5
        AND (effective_to IS NULL OR effective_to > $5)
      ORDER BY effective_from DESC
      LIMIT 1;
    `;
    const storeRes = await pool.query<DailyMarketRateRow>(storeQuery, [
      params.organizationId,
      params.storeId,
      params.metalType,
      currency,
      targetDate,
    ]);

    const storeRow = storeRes.rows[0];
    if (storeRow) {
      return mapRowToDailyMarketRate(storeRow);
    }
  }

  // 2. Fall back to organization-wide rate (store_id IS NULL)
  const orgQuery = `
    SELECT * FROM daily_market_rates
    WHERE organization_id = $1
      AND store_id IS NULL
      AND metal_type = $2
      AND currency = $3
      AND is_active = true
      AND effective_from <= $4
      AND (effective_to IS NULL OR effective_to > $4)
    ORDER BY effective_from DESC
    LIMIT 1;
  `;
  const orgRes = await pool.query<DailyMarketRateRow>(orgQuery, [
    params.organizationId,
    params.metalType,
    currency,
    targetDate,
  ]);

  const orgRow = orgRes.rows[0];
  if (orgRow) {
    return mapRowToDailyMarketRate(orgRow);
  }

  return null;
}

/**
 * Retrieves a daily market rate by its ID, enforcing tenant isolation.
 */
export async function getDailyMarketRateById(
  id: string,
  organizationId: string,
): Promise<DailyMarketRateRecord | null> {
  const pool = getPool();
  const query = `
    SELECT * FROM daily_market_rates
    WHERE id = $1 AND organization_id = $2;
  `;
  const res = await pool.query<DailyMarketRateRow>(query, [id, organizationId]);
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return mapRowToDailyMarketRate(row);
}

export interface ListDailyMarketRatesParams extends ListDailyMarketRatesQuery {
  organizationId: string;
}

/**
 * Lists historical and current daily market spot rates with optional filters and pagination.
 */
export async function listDailyMarketRates(
  params: ListDailyMarketRatesParams,
): Promise<{ data: DailyMarketRateRecord[]; total: number }> {
  const pool = getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: unknown[] = [params.organizationId];
  let pIdx = 2;

  if (params.storeId) {
    conditions.push(`store_id = $${pIdx++}`);
    values.push(params.storeId);
  }

  if (params.metalType) {
    conditions.push(`metal_type = $${pIdx++}`);
    values.push(params.metalType);
  }

  if (params.currency) {
    conditions.push(`currency = $${pIdx++}`);
    values.push(params.currency);
  }

  if (typeof params.isActive === "boolean") {
    conditions.push(`is_active = $${pIdx++}`);
    values.push(params.isActive);
  }

  if (params.effectiveAt) {
    conditions.push(`effective_from <= $${pIdx}`);
    conditions.push(`(effective_to IS NULL OR effective_to > $${pIdx})`);
    values.push(params.effectiveAt);
    pIdx++;
  }

  const whereClause = conditions.join(" AND ");

  const countQuery = `SELECT COUNT(*) AS total FROM daily_market_rates WHERE ${whereClause};`;
  const countRes = await pool.query<{ total: string }>(countQuery, values);
  const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

  const dataQuery = `
    SELECT * FROM daily_market_rates
    WHERE ${whereClause}
    ORDER BY effective_from DESC, created_at DESC
    LIMIT $${pIdx++} OFFSET $${pIdx++};
  `;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const dataRes = await pool.query<DailyMarketRateRow>(dataQuery, [
    ...values,
    limit,
    offset,
  ]);

  return {
    data: dataRes.rows.map(mapRowToDailyMarketRate),
    total,
  };
}
