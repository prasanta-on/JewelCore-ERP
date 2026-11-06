import type { Pool, PoolClient } from "pg";
import {
  type Product,
  type TrackingType,
  ConflictError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface ProductRow {
  id: string;
  organization_id: string;
  category_id: string;
  subcategory_id: string | null;
  material_id: string;
  default_purity_id: string;
  product_code: string;
  name: string;
  description: string | null;
  gender: string | null;
  collection: string | null;
  default_tracking_type: TrackingType;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    organizationId: row.organization_id,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    materialId: row.material_id,
    defaultPurityId: row.default_purity_id,
    productCode: row.product_code,
    name: row.name,
    description: row.description,
    gender: row.gender,
    collection: row.collection,
    defaultTrackingType: row.default_tracking_type,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new product master style (Entity 15) under an organization.
 * Enforces candidate business key (organization_id, product_code) and foreign key integrity.
 */
export async function createProduct(
  data: {
    id?: string;
    organizationId: string;
    categoryId: string;
    subcategoryId?: string | null;
    materialId: string;
    defaultPurityId: string;
    productCode: string;
    name: string;
    description?: string | null;
    gender?: string | null;
    collection?: string | null;
    defaultTrackingType?: TrackingType;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Product> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const defaultTrackingType = data.defaultTrackingType ?? "SERIALIZED";
  const isActive = data.isActive ?? true;

  try {
    const result = await executor.query<ProductRow>(
      `
      INSERT INTO products (
        id, organization_id, category_id, subcategory_id, material_id, default_purity_id,
        product_code, name, description, gender, collection, default_tracking_type, is_active,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, organization_id, category_id, subcategory_id, material_id, default_purity_id,
                product_code, name, description, gender, collection, default_tracking_type, is_active,
                created_at, updated_at;
      `,
      [
        id,
        data.organizationId,
        data.categoryId,
        data.subcategoryId ?? null,
        data.materialId,
        data.defaultPurityId,
        data.productCode,
        data.name,
        data.description ?? null,
        data.gender ?? null,
        data.collection ?? null,
        defaultTrackingType,
        isActive,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert product record");
    }

    return mapRowToProduct(row);
  } catch (err: any) {
    if (err.constraint === "uq_products_org_code" || err.code === "23505") {
      throw new ConflictError(
        `Product with code '${data.productCode}' already exists in this organization`,
        "ERR_DUPLICATE_PRODUCT_CODE",
      );
    }
    if (err.constraint === "products_category_id_fkey") {
      throw new UnprocessableEntityError("Referenced category does not exist", "ERR_CATEGORY_NOT_FOUND");
    }
    if (err.constraint === "products_subcategory_id_fkey") {
      throw new UnprocessableEntityError("Referenced subcategory does not exist", "ERR_SUBCATEGORY_NOT_FOUND");
    }
    if (err.constraint === "products_material_id_fkey") {
      throw new UnprocessableEntityError("Referenced material does not exist", "ERR_MATERIAL_NOT_FOUND");
    }
    if (err.constraint === "products_default_purity_id_fkey") {
      throw new UnprocessableEntityError("Referenced purity standard does not exist", "ERR_PURITY_NOT_FOUND");
    }
    throw err;
  }
}

/**
 * Retrieves a product by its primary key ID.
 */
export async function getProductById(
  id: string,
  clientOverride?: Queryable,
): Promise<Product | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<ProductRow>(
    `
    SELECT id, organization_id, category_id, subcategory_id, material_id, default_purity_id,
           product_code, name, description, gender, collection, default_tracking_type, is_active,
           created_at, updated_at
    FROM products
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToProduct(row) : null;
}

/**
 * Retrieves a product by organization ID and product code.
 */
export async function getProductByCode(
  organizationId: string,
  productCode: string,
  clientOverride?: Queryable,
): Promise<Product | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<ProductRow>(
    `
    SELECT id, organization_id, category_id, subcategory_id, material_id, default_purity_id,
           product_code, name, description, gender, collection, default_tracking_type, is_active,
           created_at, updated_at
    FROM products
    WHERE organization_id = $1 AND product_code = $2;
    `,
    [organizationId, productCode],
  );

  const row = result.rows[0];
  return row ? mapRowToProduct(row) : null;
}

/**
 * Lists products for an organization with optional category, material, and active filters.
 */
export async function listProducts(
  params: {
    organizationId: string;
    categoryId?: string;
    materialId?: string;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Product[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.categoryId) {
    values.push(params.categoryId);
    conditions.push(`category_id = $${values.length}`);
  }

  if (params.materialId) {
    values.push(params.materialId);
    conditions.push(`material_id = $${values.length}`);
  }

  if (params.isActive !== undefined) {
    values.push(params.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const query = `
    SELECT id, organization_id, category_id, subcategory_id, material_id, default_purity_id,
           product_code, name, description, gender, collection, default_tracking_type, is_active,
           created_at, updated_at
    FROM products
    WHERE ${conditions.join(" AND ")}
    ORDER BY name ASC;
  `;

  const result = await executor.query<ProductRow>(query, values);
  return result.rows.map(mapRowToProduct);
}
