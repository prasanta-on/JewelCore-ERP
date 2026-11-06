import type { Pool, PoolClient } from "pg";
import {
  type Material,
  type Purity,
  type MaterialWithPurities,
  ConflictError,
  ValidationError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface MaterialRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  base_metal_type: string;
  is_precious: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PurityRow {
  id: string;
  material_id: string;
  code: string;
  name: string;
  karatage: string | null;
  purity_percentage: string;
  purity_ratio: string;
  hallmark_code: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    baseMetalType: row.base_metal_type,
    isPrecious: row.is_precious,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToPurity(row: PurityRow): Purity {
  return {
    id: row.id,
    materialId: row.material_id,
    code: row.code,
    name: row.name,
    karatage: row.karatage,
    purityPercentage: Number(row.purity_percentage),
    purityRatio: Number(row.purity_ratio),
    hallmarkCode: row.hallmark_code,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new precious/base metal material (Entity 12) under an organization.
 * Enforces unique material code per organization.
 */
export async function createMaterial(
  data: {
    id?: string;
    organizationId: string;
    code: string;
    name: string;
    baseMetalType: string;
    isPrecious?: boolean;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Material> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const isPrecious = data.isPrecious ?? true;
  const isActive = data.isActive ?? true;

  try {
    const result = await executor.query<MaterialRow>(
      `
      INSERT INTO materials (
        id, organization_id, code, name, base_metal_type, is_precious, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, organization_id, code, name, base_metal_type, is_precious, is_active, created_at, updated_at;
      `,
      [
        id,
        data.organizationId,
        data.code,
        data.name,
        data.baseMetalType,
        isPrecious,
        isActive,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert material record");
    }

    return mapRowToMaterial(row);
  } catch (err: any) {
    if (err.constraint === "uq_materials_org_code" || err.code === "23505") {
      throw new ConflictError(
        `Material with code '${data.code}' already exists in this organization`,
        "ERR_DUPLICATE_MATERIAL_CODE",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a material by its primary key ID.
 */
export async function getMaterialById(
  id: string,
  clientOverride?: Queryable,
): Promise<Material | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<MaterialRow>(
    `
    SELECT id, organization_id, code, name, base_metal_type, is_precious, is_active, created_at, updated_at
    FROM materials
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToMaterial(row) : null;
}

/**
 * Retrieves a material by organization ID and code.
 */
export async function getMaterialByCode(
  organizationId: string,
  code: string,
  clientOverride?: Queryable,
): Promise<Material | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<MaterialRow>(
    `
    SELECT id, organization_id, code, name, base_metal_type, is_precious, is_active, created_at, updated_at
    FROM materials
    WHERE organization_id = $1 AND code = $2;
    `,
    [organizationId, code],
  );

  const row = result.rows[0];
  return row ? mapRowToMaterial(row) : null;
}

/**
 * Lists materials for an organization with optional active filter.
 */
export async function listMaterials(
  params: {
    organizationId: string;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Material[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.isActive !== undefined) {
    values.push(params.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const query = `
    SELECT id, organization_id, code, name, base_metal_type, is_precious, is_active, created_at, updated_at
    FROM materials
    WHERE ${conditions.join(" AND ")}
    ORDER BY name ASC;
  `;

  const result = await executor.query<MaterialRow>(query, values);
  return result.rows.map(mapRowToMaterial);
}

/**
 * Creates a new purity standard (Entity 13) under a material.
 * Enforces DEC-05 scales and unique purity code per material.
 */
export async function createPurity(
  data: {
    id?: string;
    materialId: string;
    code: string;
    name: string;
    karatage?: string | null;
    purityPercentage: number;
    purityRatio?: number;
    hallmarkCode?: string | null;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Purity> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const isActive = data.isActive ?? true;
  const purityRatio =
    data.purityRatio !== undefined
      ? data.purityRatio
      : Number((data.purityPercentage / 100).toFixed(4));

  try {
    const result = await executor.query<PurityRow>(
      `
      INSERT INTO purities (
        id, material_id, code, name, karatage, purity_percentage, purity_ratio, hallmark_code, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, material_id, code, name, karatage, purity_percentage, purity_ratio, hallmark_code, is_active, created_at, updated_at;
      `,
      [
        id,
        data.materialId,
        data.code,
        data.name,
        data.karatage ?? null,
        data.purityPercentage,
        purityRatio,
        data.hallmarkCode ?? null,
        isActive,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert purity record");
    }

    return mapRowToPurity(row);
  } catch (err: any) {
    if (
      err.constraint === "uq_purities_material_code" ||
      err.code === "23505"
    ) {
      throw new ConflictError(
        `Purity with code '${data.code}' already exists for this material`,
        "ERR_DUPLICATE_PURITY_CODE",
      );
    }
    if (
      err.constraint === "chk_purities_percentage_range" ||
      err.constraint === "chk_purities_ratio_range"
    ) {
      throw new ValidationError(
        "Purity percentage must be between 0.0000 and 100.0000",
        [
          {
            name: "purityPercentage",
            reason: "Value must be between 0.0000 and 100.0000",
          },
        ],
      );
    }
    throw err;
  }
}

/**
 * Retrieves a purity standard by its primary key ID.
 */
export async function getPurityById(
  id: string,
  clientOverride?: Queryable,
): Promise<Purity | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<PurityRow>(
    `
    SELECT id, material_id, code, name, karatage, purity_percentage, purity_ratio, hallmark_code, is_active, created_at, updated_at
    FROM purities
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToPurity(row) : null;
}

/**
 * Retrieves a purity standard with raw NUMERIC string precision for metrological tests.
 */
export async function getPurityRaw(
  id: string,
  clientOverride?: Queryable,
): Promise<PurityRow | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<PurityRow>(
    `
    SELECT id, material_id, code, name, karatage, purity_percentage::text, purity_ratio::text, hallmark_code, is_active, created_at, updated_at
    FROM purities
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ?? null;
}

/**
 * Lists purities filtered by material or across organization.
 */
export async function listPurities(
  params: {
    materialId?: string;
    organizationId?: string;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Purity[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.materialId) {
    values.push(params.materialId);
    conditions.push(`p.material_id = $${values.length}`);
  }

  if (params.organizationId) {
    values.push(params.organizationId);
    conditions.push(`m.organization_id = $${values.length}`);
  }

  if (params.isActive !== undefined) {
    values.push(params.isActive);
    conditions.push(`p.is_active = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT p.id, p.material_id, p.code, p.name, p.karatage, p.purity_percentage, p.purity_ratio, p.hallmark_code, p.is_active, p.created_at, p.updated_at
    FROM purities p
    INNER JOIN materials m ON p.material_id = m.id
    ${whereClause}
    ORDER BY p.purity_percentage DESC, p.name ASC;
  `;

  const result = await executor.query<PurityRow>(query, values);
  return result.rows.map(mapRowToPurity);
}

/**
 * Retrieves a material and all its child purities.
 */
export async function getMaterialWithPurities(
  materialId: string,
  clientOverride?: Queryable,
): Promise<MaterialWithPurities | null> {
  const material = await getMaterialById(materialId, clientOverride);
  if (!material) {
    return null;
  }

  const purities = await listPurities({ materialId }, clientOverride);

  return {
    ...material,
    purities,
  };
}
