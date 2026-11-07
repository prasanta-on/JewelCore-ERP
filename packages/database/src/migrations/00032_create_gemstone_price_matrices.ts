import type { MigrationDefinition } from "../migrator.js";

export const migration00032CreateGemstonePriceMatrices: MigrationDefinition = {
  name: "00032_create_gemstone_price_matrices",
  up: `
    -- 1. Seed Gemstone Matrix RBAC Permissions (FEAT-PRICE-03)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000085', 'pricing:matrix:manage', 'PRICING', 'Manage gemstone and diamond valuation matrices', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000086', 'pricing:matrix:view', 'PRICING', 'View gemstone and diamond valuation matrices', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant pricing matrix permissions to SYSTEM_ADMIN and STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code IN ('pricing:matrix:manage', 'pricing:matrix:view')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant pricing:matrix:view to SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code = 'SALES_ASSOCIATE'
      AND p.code = 'pricing:matrix:view'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Gemstone Valuation Matrix Table (Entity 46 - FEAT-PRICE-03)
    CREATE TABLE IF NOT EXISTS gemstone_price_matrices (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      gemstone_id UUID NOT NULL REFERENCES gemstones(id) ON DELETE RESTRICT,
      carat_range_min NUMERIC(8, 4) NOT NULL CHECK (carat_range_min >= 0),
      carat_range_max NUMERIC(8, 4) NOT NULL CHECK (carat_range_max >= carat_range_min),
      cut_grade VARCHAR(30),
      color_grade VARCHAR(30),
      clarity_grade VARCHAR(30),
      rate_per_carat_cad NUMERIC(14, 2) NOT NULL CHECK (rate_per_carat_cad > 0),
      currency VARCHAR(10) NOT NULL DEFAULT 'CAD',
      is_active BOOLEAN NOT NULL DEFAULT true,
      effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      effective_to TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_gemstone_price_matrices_org ON gemstone_price_matrices(organization_id);
    CREATE INDEX IF NOT EXISTS idx_gemstone_price_matrices_gemstone ON gemstone_price_matrices(gemstone_id);
    CREATE INDEX IF NOT EXISTS idx_gemstone_price_matrices_lookup ON gemstone_price_matrices(
      organization_id,
      gemstone_id,
      is_active,
      carat_range_min,
      carat_range_max
    );
  `,
  down: `
    DROP TABLE IF EXISTS gemstone_price_matrices;
    DELETE FROM permissions WHERE code IN ('pricing:matrix:manage', 'pricing:matrix:view');
  `,
};
