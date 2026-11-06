import type { MigrationDefinition } from "../migrator.js";

export const migration00021CreateInventoryItems: MigrationDefinition = {
  name: "00021_create_inventory_items",
  up: `
    -- 1. Seed Serialized Piece Birth Permission (inventory:create)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000051', 'inventory:create', 'INVENTORY', 'Birth and register serialized jewellery inventory items into physical vault custody', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant inventory:create to SYSTEM_ADMIN
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000001',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'inventory:create'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant inventory:create to STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000002',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'inventory:create'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant inventory:create to INVENTORY_CONTROLLER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000003',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'inventory:create'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Inventory Items Table (Entity 28 - FEAT-INV-01 / INV-02, INV-06, INV-11, INV-14)
    CREATE TABLE IF NOT EXISTS inventory_items (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      product_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
      quality_check_item_id UUID NOT NULL UNIQUE REFERENCES quality_check_items(id) ON DELETE RESTRICT,
      serial_number VARCHAR(100) NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      gross_weight_grams NUMERIC(10, 4) NOT NULL CHECK (gross_weight_grams > 0),
      net_weight_grams NUMERIC(10, 4) NOT NULL CHECK (net_weight_grams > 0),
      purity_id UUID NOT NULL REFERENCES purities(id) ON DELETE RESTRICT,
      quality_state VARCHAR(30) NOT NULL DEFAULT 'QC_APPROVED' CHECK (quality_state IN ('QC_APPROVED', 'RE_INSPECTION', 'QC_REJECTED')),
      approval_state VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (approval_state IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
      custody_state VARCHAR(30) NOT NULL DEFAULT 'IN_VAULT' CHECK (custody_state IN ('INTAKE_STAGING', 'IN_VAULT', 'IN_TRANSIT', 'IN_DISPLAY', 'MISSING', 'RELEASED')),
      commercial_state VARCHAR(30) NOT NULL DEFAULT 'UNREADY' CHECK (commercial_state IN ('UNREADY', 'AVAILABLE_FOR_SALE', 'RESERVED', 'SOLD', 'ON_CONSIGNMENT')),
      current_compartment_id UUID REFERENCES compartments(id) ON DELETE RESTRICT,
      cost_price_cad NUMERIC(14, 2),
      selling_price_cad NUMERIC(14, 2),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_inventory_items_org_serial UNIQUE (organization_id, serial_number),
      CONSTRAINT chk_inventory_items_weight_physics CHECK (gross_weight_grams >= net_weight_grams)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_items_org ON inventory_items(organization_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_store ON inventory_items(store_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(product_sku_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_qc_item ON inventory_items(quality_check_item_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_custody_state ON inventory_items(custody_state);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_commercial_state ON inventory_items(commercial_state);
    CREATE INDEX IF NOT EXISTS idx_inventory_items_compartment ON inventory_items(current_compartment_id);

    -- 3. Birth Lineage Immutability Trigger (INV-14 Guarantee)
    CREATE OR REPLACE FUNCTION fn_prevent_inventory_birth_lineage_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.quality_check_item_id IS DISTINCT FROM OLD.quality_check_item_id THEN
        RAISE EXCEPTION 'inventory_items.quality_check_item_id is immutable birth lineage certificate (INV-14)'
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_inventory_items_birth_lineage ON inventory_items;
    CREATE TRIGGER trg_inventory_items_birth_lineage
      BEFORE UPDATE ON inventory_items
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_inventory_birth_lineage_mutation();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_inventory_items_birth_lineage ON inventory_items;
    DROP FUNCTION IF EXISTS fn_prevent_inventory_birth_lineage_mutation();
    DROP TABLE IF EXISTS inventory_items CASCADE;
    DELETE FROM permissions WHERE code = 'inventory:create';
  `,
};
