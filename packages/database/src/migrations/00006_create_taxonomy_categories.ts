import type { MigrationDefinition } from "../migrator.js";

export const migration00006CreateTaxonomyCategories: MigrationDefinition = {
  name: "00006_create_taxonomy_categories",
  up: `
    -- 1. Categories table (Entity 10)
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_categories_org_code UNIQUE (organization_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_categories_org_id ON categories(organization_id);

    -- 2. Subcategories table (Entity 11)
    CREATE TABLE IF NOT EXISTS subcategories (
      id UUID PRIMARY KEY,
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_subcategories_cat_code UNIQUE (category_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id);

    -- 3. Seed Taxonomy Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000011', 'taxonomy:write', 'TAXONOMY', 'Create, update, and manage product categories, materials, and styles', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000012', 'taxonomy:read', 'TAXONOMY', 'View product taxonomy categories and classification trees', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- 4. Grant Taxonomy Permissions to SYSTEM_ADMIN and STORE_MANAGER roles
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code IN ('taxonomy:write', 'taxonomy:read')
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  `,
  down: `
    DROP TABLE IF EXISTS subcategories CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
  `,
};
