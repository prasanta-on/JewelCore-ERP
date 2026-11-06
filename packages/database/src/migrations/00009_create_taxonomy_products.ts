import type { MigrationDefinition } from "../migrator.js";

export const migration00009CreateTaxonomyProducts: MigrationDefinition = {
  name: "00009_create_taxonomy_products",
  up: `
    -- Products (Master Style Catalog, Entity 15)
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
      material_id UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      default_purity_id UUID NOT NULL REFERENCES purities(id) ON DELETE RESTRICT,
      product_code VARCHAR(50) NOT NULL,
      name VARCHAR(150) NOT NULL,
      description TEXT,
      gender VARCHAR(30),
      collection VARCHAR(100),
      default_tracking_type VARCHAR(30) NOT NULL DEFAULT 'SERIALIZED' CHECK (default_tracking_type IN ('SERIALIZED', 'QUANTITY_BATCH')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_products_org_code UNIQUE (organization_id, product_code)
    );

    CREATE INDEX IF NOT EXISTS idx_products_org_id ON products(organization_id);
    CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_material_id ON products(material_id);
    CREATE INDEX IF NOT EXISTS idx_products_default_purity_id ON products(default_purity_id);
  `,
  down: `
    DROP TABLE IF EXISTS products CASCADE;
  `,
};
