import type { MigrationDefinition } from "../migrator.js";

export const migration00033CreatePriceSnapshots: MigrationDefinition = {
  name: "00033_create_price_snapshots",
  up: `
    -- 1. Seed Pricing Revaluation and Snapshot Permissions (FEAT-PRICE-04)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000087', 'pricing:revalue', 'PRICING', 'Batch revalue store inventory and snapshot piece valuations', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000088', 'pricing:snapshot:view', 'PRICING', 'View immutable historical price snapshots and breakdowns', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant pricing:revalue to SYSTEM_ADMIN and STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code = 'pricing:revalue'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant pricing:snapshot:view to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER', 'SALES_ASSOCIATE')
      AND p.code = 'pricing:snapshot:view'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Price Snapshots Table (Entity 47 - FEAT-PRICE-04)
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      market_rate_id UUID REFERENCES daily_market_rates(id) ON DELETE RESTRICT,
      pricing_policy_id UUID REFERENCES pricing_policies(id) ON DELETE RESTRICT,
      metal_component_cad NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (metal_component_cad >= 0),
      gemstone_component_cad NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (gemstone_component_cad >= 0),
      making_charge_cad NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (making_charge_cad >= 0),
      wastage_component_cad NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (wastage_component_cad >= 0),
      ancillary_fees_cad NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (ancillary_fees_cad >= 0),
      cost_price_cad NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_price_cad >= 0),
      margin_component_cad NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (margin_component_cad >= 0),
      selling_price_cad NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (selling_price_cad >= 0),
      price_breakdown_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      currency VARCHAR(10) NOT NULL DEFAULT 'CAD',
      triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_price_snapshots_org ON price_snapshots(organization_id);
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_item ON price_snapshots(inventory_item_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_store ON price_snapshots(store_id);

    -- 3. Immutability Trigger (Historical Financial Audit Ledger Guarantee)
    CREATE OR REPLACE FUNCTION fn_prevent_price_snapshots_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'price_snapshots records are strictly immutable financial ledger history'
        USING ERRCODE = '23514';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_price_snapshots_immutability ON price_snapshots;
    CREATE TRIGGER trg_price_snapshots_immutability
      BEFORE UPDATE OR DELETE ON price_snapshots
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_price_snapshots_mutation();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_price_snapshots_immutability ON price_snapshots;
    DROP FUNCTION IF EXISTS fn_prevent_price_snapshots_mutation();
    DROP TABLE IF EXISTS price_snapshots CASCADE;
    DELETE FROM permissions WHERE code IN ('pricing:revalue', 'pricing:snapshot:view');
  `,
};
