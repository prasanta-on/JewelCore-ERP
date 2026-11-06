import type { Pool, PoolClient } from "pg";
import {
  type Gemstone,
  type GemstoneType,
  ConflictError,
  ValidationError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface GemstoneRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  gemstone_type: GemstoneType;
  default_measurement_unit: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToGemstone(row: GemstoneRow): Gemstone {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    gemstoneType: row.gemstone_type,
    defaultMeasurementUnit: row.default_measurement_unit,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new gemstone classification (Entity 14) under an organization.
 * Enforces candidate business key (organization_id, code).
 */
export async function createGemstone(
  data: {
    id?: string;
    organizationId: string;
    code: string;
    name: string;
    gemstoneType: GemstoneType;
    defaultMeasurementUnit?: string;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Gemstone> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const defaultMeasurementUnit = data.defaultMeasurementUnit ?? "CARAT";
  const isActive = data.isActive ?? true;

  try {
    const result = await executor.query<GemstoneRow>(
      `
      INSERT INTO gemstones (
        id, organization_id, code, name, gemstone_type, default_measurement_unit, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, organization_id, code, name, gemstone_type, default_measurement_unit, is_active, created_at, updated_at;
      `,
      [
        id,
        data.organizationId,
        data.code,
        data.name,
        data.gemstoneType,
        defaultMeasurementUnit,
        isActive,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert gemstone record");
    }

    return mapRowToGemstone(row);
  } catch (err: any) {
    if (err.constraint === "uq_gemstones_org_code" || err.code === "23505") {
      throw new ConflictError(
        `Gemstone with code '${data.code}' already exists in this organization`,
        "ERR_DUPLICATE_GEMSTONE_CODE",
      );
    }
    if (
      err.constraint === "gemstones_gemstone_type_check" ||
      err.code === "23514"
    ) {
      throw new ValidationError(
        "Invalid gemstone type. Must be PRECIOUS, SEMI_PRECIOUS, or ORGANIC_PEARL",
        [{ name: "gemstoneType", reason: "Invalid gemstone type enumeration" }],
      );
    }
    throw err;
  }
}

/**
 * Retrieves a gemstone by its primary key ID.
 */
export async function getGemstoneById(
  id: string,
  clientOverride?: Queryable,
): Promise<Gemstone | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<GemstoneRow>(
    `
    SELECT id, organization_id, code, name, gemstone_type, default_measurement_unit, is_active, created_at, updated_at
    FROM gemstones
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToGemstone(row) : null;
}

/**
 * Retrieves a gemstone by organization ID and code.
 */
export async function getGemstoneByCode(
  organizationId: string,
  code: string,
  clientOverride?: Queryable,
): Promise<Gemstone | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<GemstoneRow>(
    `
    SELECT id, organization_id, code, name, gemstone_type, default_measurement_unit, is_active, created_at, updated_at
    FROM gemstones
    WHERE organization_id = $1 AND code = $2;
    `,
    [organizationId, code],
  );

  const row = result.rows[0];
  return row ? mapRowToGemstone(row) : null;
}

/**
 * Lists gemstones for an organization with optional type and active filters.
 */
export async function listGemstones(
  params: {
    organizationId: string;
    gemstoneType?: GemstoneType;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Gemstone[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.gemstoneType !== undefined) {
    values.push(params.gemstoneType);
    conditions.push(`gemstone_type = $${values.length}`);
  }

  if (params.isActive !== undefined) {
    values.push(params.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const query = `
    SELECT id, organization_id, code, name, gemstone_type, default_measurement_unit, is_active, created_at, updated_at
    FROM gemstones
    WHERE ${conditions.join(" AND ")}
    ORDER BY name ASC;
  `;

  const result = await executor.query<GemstoneRow>(query, values);
  return result.rows.map(mapRowToGemstone);
}
