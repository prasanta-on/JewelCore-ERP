import type { MigrationDefinition } from "../migrator.js";

export const migration00010CreateTaxonomySkusAndSpecs: MigrationDefinition = {
  name: "00010_create_taxonomy_skus_and_specs",
  up: `
    -- Commercial SKUs (Entity 16)
    CREATE TABLE IF NOT EXISTS product_skus (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      sku_code VARCHAR(50) NOT NULL,
      variant_name VARCHAR(150) NOT NULL,
      target_purity_id UUID NOT NULL REFERENCES purities(id) ON DELETE RESTRICT,
      target_gross_weight_grams NUMERIC(10, 4) NOT NULL,
      target_metal_weight_grams NUMERIC(10, 4) NOT NULL,
      tracking_type VARCHAR(30) NOT NULL CHECK (tracking_type IN ('SERIALIZED', 'QUANTITY_BATCH')),
      attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_product_skus_org_sku_code UNIQUE (organization_id, sku_code),
      CONSTRAINT chk_product_skus_weights CHECK (target_gross_weight_grams >= target_metal_weight_grams AND target_metal_weight_grams > 0)
    );

    CREATE INDEX IF NOT EXISTS idx_product_skus_org_id ON product_skus(organization_id);
    CREATE INDEX IF NOT EXISTS idx_product_skus_product_id ON product_skus(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_skus_purity_id ON product_skus(target_purity_id);

    -- Product Gemstone Specifications (Entity 17)
    CREATE TABLE IF NOT EXISTS product_gemstone_specs (
      id UUID PRIMARY KEY,
      product_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      gemstone_id UUID NOT NULL REFERENCES gemstones(id) ON DELETE RESTRICT,
      expected_stone_count INTEGER NOT NULL CHECK (expected_stone_count > 0),
      target_total_carat_weight NUMERIC(8, 4) NOT NULL CHECK (target_total_carat_weight > 0),
      shape VARCHAR(50),
      cut_grade VARCHAR(50),
      color_grade VARCHAR(50),
      clarity_grade VARCHAR(50),
      setting_type VARCHAR(50),
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_sku_gemstone_shape UNIQUE (product_sku_id, gemstone_id, shape)
    );

    CREATE INDEX IF NOT EXISTS idx_gemstone_specs_sku_id ON product_gemstone_specs(product_sku_id);
    CREATE INDEX IF NOT EXISTS idx_gemstone_specs_gemstone_id ON product_gemstone_specs(gemstone_id);
  `,
  down: `
    DROP TABLE IF EXISTS product_gemstone_specs CASCADE;
    DROP TABLE IF EXISTS product_skus CASCADE;
  `,
};
