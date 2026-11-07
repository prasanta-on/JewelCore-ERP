import type { MigrationDefinition } from "../migrator.js";

export const migration00031CreatePricingPolicies: MigrationDefinition = {
  name: "00031_create_pricing_policies",
  up: `
    -- 1. Seed Pricing Policy View Permission
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000084', 'pricing:policy:view', 'PRICING', 'View making charge and pricing policies', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant pricing:policy:view to SYSTEM_ADMIN, STORE_MANAGER, and SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'SALES_ASSOCIATE')
      AND p.code = 'pricing:policy:view'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Making Charges & Pricing Policies Table (Entity 45 - FEAT-PRICE-02)
    CREATE TABLE IF NOT EXISTS pricing_policies (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID REFERENCES stores(id) ON DELETE RESTRICT,
      category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
      product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
      policy_name VARCHAR(150) NOT NULL,
      charge_type VARCHAR(30) NOT NULL CHECK (
        charge_type IN ('PER_GRAM', 'FIXED_PIECE', 'PERCENTAGE_OF_METAL')
      ),
      charge_rate NUMERIC(12, 4) NOT NULL CHECK (charge_rate >= 0),
      wastage_percentage NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (
        wastage_percentage >= 0 AND wastage_percentage <= 1
      ),
      hallmarking_fee_cad NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (hallmarking_fee_cad >= 0),
      certification_fee_cad NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (certification_fee_cad >= 0),
      default_margin_percentage NUMERIC(5, 4) NOT NULL DEFAULT 0.20 CHECK (
        default_margin_percentage >= 0 AND default_margin_percentage <= 10
      ),
      min_retail_price_cad NUMERIC(12, 2) CHECK (
        min_retail_price_cad IS NULL OR min_retail_price_cad >= 0
      ),
      is_active BOOLEAN NOT NULL DEFAULT true,
      effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      effective_to TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_pricing_policies_org ON pricing_policies(organization_id);
    CREATE INDEX IF NOT EXISTS idx_pricing_policies_store ON pricing_policies(store_id);
    CREATE INDEX IF NOT EXISTS idx_pricing_policies_category ON pricing_policies(category_id);
    CREATE INDEX IF NOT EXISTS idx_pricing_policies_product ON pricing_policies(product_id);
    CREATE INDEX IF NOT EXISTS idx_pricing_policies_resolution ON pricing_policies(
      organization_id,
      store_id,
      category_id,
      product_id,
      is_active
    );
  `,
  down: `
    DROP TABLE IF EXISTS pricing_policies;
    DELETE FROM permissions WHERE code = 'pricing:policy:view';
  `,
};
