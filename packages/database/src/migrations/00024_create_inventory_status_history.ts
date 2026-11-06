import type { MigrationDefinition } from "../migrator.js";

export const migration00024CreateInventoryStatusHistory: MigrationDefinition = {
  name: "00024_create_inventory_status_history",
  up: `
    -- 1. Seed Multi-Dimensional State Update Permission (inventory:state:update)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000053', 'inventory:state:update', 'INVENTORY', 'Update multi-dimensional status and commercial availability for serialized inventory items', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant inventory:state:update to SYSTEM_ADMIN
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000001',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'inventory:state:update'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant inventory:state:update to STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000002',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'inventory:state:update'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant inventory:state:update to INVENTORY_CONTROLLER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000003',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'inventory:state:update'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Multi-Dimensional Inventory Status History Table (Entity 31 - FEAT-INV-04 / INV-08)
    CREATE TABLE IF NOT EXISTS inventory_status_history (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      dimension_changed VARCHAR(30) NOT NULL CHECK (
        dimension_changed IN ('QUALITY', 'APPROVAL', 'CUSTODY', 'COMMERCIAL')
      ),
      old_state VARCHAR(30) NOT NULL,
      new_state VARCHAR(30) NOT NULL,
      actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reason TEXT,
      transitioned_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_status_history_item_dim_time
      ON inventory_status_history(inventory_item_id, dimension_changed, transitioned_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inventory_status_history_org
      ON inventory_status_history(organization_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_status_history_actor
      ON inventory_status_history(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_status_history_time
      ON inventory_status_history(transitioned_at DESC);

    -- 3. Audit Immutability Trigger (INV-09)
    CREATE OR REPLACE FUNCTION fn_prevent_inventory_status_history_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'inventory_status_history ledger is strictly append-only and immutable'
        USING ERRCODE = '23514';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_inventory_status_history_immutability ON inventory_status_history;
    CREATE TRIGGER trg_inventory_status_history_immutability
      BEFORE UPDATE OR DELETE ON inventory_status_history
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_inventory_status_history_mutation();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_inventory_status_history_immutability ON inventory_status_history;
    DROP FUNCTION IF EXISTS fn_prevent_inventory_status_history_mutation();
    DROP TABLE IF EXISTS inventory_status_history CASCADE;

    DELETE FROM role_permissions
    WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'inventory:state:update');

    DELETE FROM permissions WHERE code = 'inventory:state:update';
  `,
};
