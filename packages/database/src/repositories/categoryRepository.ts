import type { Pool, PoolClient } from "pg";
import {
  type Category,
  type Subcategory,
  type CategoryWithSubcategories,
  ConflictError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

interface CategoryRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface SubcategoryRow {
  id: string;
  category_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToSubcategory(row: SubcategoryRow): Subcategory {
  return {
    id: row.id,
    categoryId: row.category_id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new product category (Entity 10) under an organization.
 * Enforces unique category code per organization.
 */
export async function createCategory(
  data: {
    id?: string;
    organizationId: string;
    code: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Category> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const isActive = data.isActive ?? true;

  try {
    const result = await executor.query<CategoryRow>(
      `
      INSERT INTO categories (
        id, organization_id, code, name, description, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, organization_id, code, name, description, is_active, created_at, updated_at;
      `,
      [id, data.organizationId, data.code, data.name, data.description ?? null, isActive],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert category record");
    }

    return mapRowToCategory(row);
  } catch (err: any) {
    if (err.constraint === "uq_categories_org_code" || err.code === "23505") {
      throw new ConflictError(
        `Category with code '${data.code}' already exists in this organization`,
        "ERR_DUPLICATE_CATEGORY_CODE",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a category by its primary key ID.
 */
export async function getCategoryById(
  id: string,
  clientOverride?: Queryable,
): Promise<Category | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<CategoryRow>(
    `
    SELECT id, organization_id, code, name, description, is_active, created_at, updated_at
    FROM categories
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToCategory(row) : null;
}

/**
 * Retrieves a category by organization ID and code.
 */
export async function getCategoryByCode(
  organizationId: string,
  code: string,
  clientOverride?: Queryable,
): Promise<Category | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<CategoryRow>(
    `
    SELECT id, organization_id, code, name, description, is_active, created_at, updated_at
    FROM categories
    WHERE organization_id = $1 AND code = $2;
    `,
    [organizationId, code],
  );

  const row = result.rows[0];
  return row ? mapRowToCategory(row) : null;
}

/**
 * Lists all categories under an organization.
 */
export async function listCategoriesByOrg(
  organizationId: string,
  clientOverride?: Queryable,
): Promise<Category[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<CategoryRow>(
    `
    SELECT id, organization_id, code, name, description, is_active, created_at, updated_at
    FROM categories
    WHERE organization_id = $1
    ORDER BY name ASC;
    `,
    [organizationId],
  );

  return result.rows.map(mapRowToCategory);
}

/**
 * Creates a new subcategory (Entity 11) within a parent category.
 * Enforces unique subcategory code per category.
 */
export async function createSubcategory(
  data: {
    id?: string;
    categoryId: string;
    code: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Subcategory> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const isActive = data.isActive ?? true;

  try {
    const result = await executor.query<SubcategoryRow>(
      `
      INSERT INTO subcategories (
        id, category_id, code, name, description, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, category_id, code, name, description, is_active, created_at, updated_at;
      `,
      [id, data.categoryId, data.code, data.name, data.description ?? null, isActive],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert subcategory record");
    }

    return mapRowToSubcategory(row);
  } catch (err: any) {
    if (err.constraint === "uq_subcategories_cat_code" || err.code === "23505") {
      throw new ConflictError(
        `Subcategory with code '${data.code}' already exists in this category`,
        "ERR_DUPLICATE_SUBCATEGORY_CODE",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a subcategory by its primary key ID.
 */
export async function getSubcategoryById(
  id: string,
  clientOverride?: Queryable,
): Promise<Subcategory | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<SubcategoryRow>(
    `
    SELECT id, category_id, code, name, description, is_active, created_at, updated_at
    FROM subcategories
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToSubcategory(row) : null;
}

/**
 * Retrieves a subcategory by parent category ID and code.
 */
export async function getSubcategoryByCode(
  categoryId: string,
  code: string,
  clientOverride?: Queryable,
): Promise<Subcategory | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<SubcategoryRow>(
    `
    SELECT id, category_id, code, name, description, is_active, created_at, updated_at
    FROM subcategories
    WHERE category_id = $1 AND code = $2;
    `,
    [categoryId, code],
  );

  const row = result.rows[0];
  return row ? mapRowToSubcategory(row) : null;
}

/**
 * Lists all subcategories belonging to a parent category.
 */
export async function listSubcategoriesByCategory(
  categoryId: string,
  clientOverride?: Queryable,
): Promise<Subcategory[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<SubcategoryRow>(
    `
    SELECT id, category_id, code, name, description, is_active, created_at, updated_at
    FROM subcategories
    WHERE category_id = $1
    ORDER BY name ASC;
    `,
    [categoryId],
  );

  return result.rows.map(mapRowToSubcategory);
}

/**
 * Retrieves the complete recursive Taxonomy tree for an organization:
 * Categories with nested Subcategories.
 */
export async function getTaxonomyTree(
  organizationId: string,
  clientOverride?: Queryable,
): Promise<CategoryWithSubcategories[]> {
  const executor = clientOverride ?? getPool();

  const categories = await listCategoriesByOrg(organizationId, executor);
  if (categories.length === 0) {
    return [];
  }

  const result = await executor.query<SubcategoryRow>(
    `
    SELECT s.id, s.category_id, s.code, s.name, s.description, s.is_active, s.created_at, s.updated_at
    FROM subcategories s
    JOIN categories c ON s.category_id = c.id
    WHERE c.organization_id = $1
    ORDER BY s.name ASC;
    `,
    [organizationId],
  );

  const subcategoriesByCategory = new Map<string, Subcategory[]>();
  for (const row of result.rows) {
    const subcat = mapRowToSubcategory(row);
    const list = subcategoriesByCategory.get(subcat.categoryId) ?? [];
    list.push(subcat);
    subcategoriesByCategory.set(subcat.categoryId, list);
  }

  return categories.map((cat) => ({
    ...cat,
    subcategories: subcategoriesByCategory.get(cat.id) ?? [],
  }));
}
