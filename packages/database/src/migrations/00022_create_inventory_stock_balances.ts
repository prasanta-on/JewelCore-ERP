import type { MigrationDefinition } from "../migrator.js";

export const migration00022CreateInventoryStockBalances: MigrationDefinition = {
  name: "00022_create_inventory_stock_balances",
  up: `
    -- 1. Seed Bulk Stock Balance Management Permission (inventory:write)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000052', 'inventory:write', 'INVENTORY', 'Manage and adjust bulk quantity-batch stock balances and allocations', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant inventory:write to SYSTEM_ADMIN
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000001',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'inventory:write'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant inventory:write to STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000002',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'inventory:write'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant inventory:write to INVENTORY_CONTROLLER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000003',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'inventory:write'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Inventory Stock Balances Table (Entity 29 - FEAT-INV-02 / BIZ-Q02)
    CREATE TABLE IF NOT EXISTS inventory_stock_balances (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      product_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
      compartment_id UUID NOT NULL REFERENCES compartments(id) ON DELETE RESTRICT,
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      quantity_reserved INTEGER NOT NULL DEFAULT 0,
      quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
      total_weight_grams NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
      average_cost_unit_cad NUMERIC(14, 2),
      last_movement_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_stock_balances_store_sku_comp UNIQUE (store_id, product_sku_id, compartment_id),
      CONSTRAINT chk_stock_balances_qty_non_negative CHECK (quantity_on_hand >= 0 AND quantity_reserved >= 0),
      CONSTRAINT chk_stock_balances_qty_available CHECK (quantity_on_hand >= quantity_reserved),
      CONSTRAINT chk_stock_balances_weight CHECK (total_weight_grams >= 0),
      CONSTRAINT chk_stock_balances_version CHECK (version >= 1)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_balances_org ON inventory_stock_balances(organization_id);
    CREATE INDEX IF NOT EXISTS idx_stock_balances_store ON inventory_stock_balances(store_id);
    CREATE INDEX IF NOT EXISTS idx_stock_balances_sku ON inventory_stock_balances(product_sku_id);
    CREATE INDEX IF NOT EXISTS idx_stock_balances_comp ON inventory_stock_balances(compartment_id);
  `,
  down: `
    DROP TABLE IF EXISTS inventory_stock_balances CASCADE;
    DELETE FROM role_permissions WHERE permission_id IN (
      SELECT id FROM permissions WHERE code = 'inventory:write'
    );
    DELETE FROM permissions WHERE code = 'inventory:write';
  `,
};
