import type { MigrationDefinition } from "../migrator.js";

export const migration00041CreateTransferOrders: MigrationDefinition = {
  name: "00041_create_transfer_orders",
  up: `
    -- 1. Seed Transfer Order Permissions (FEAT-XFR-01)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e401-0001-7000-8000-000000000105', 'transfer:order:create', 'TRANSFERS', 'Create inter-store transfer orders and request stock movements', CURRENT_TIMESTAMP),
      ('0192e401-0001-7000-8000-000000000106', 'transfer:order:view', 'TRANSFERS', 'View inter-store transfer orders and item manifests', CURRENT_TIMESTAMP),
      ('0192e401-0001-7000-8000-000000000107', 'transfer:order:approve', 'TRANSFERS', 'Approve or reject inter-store transfer requests', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant transfer:order:view to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER', 'SALES_ASSOCIATE')
      AND p.code = 'transfer:order:view'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant transfer:order:create to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER')
      AND p.code = 'transfer:order:create'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant transfer:order:approve to SYSTEM_ADMIN, STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code = 'transfer:order:approve'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Transfer Orders Table (Entity 58 - FEAT-XFR-01)
    CREATE TABLE IF NOT EXISTS transfer_orders (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      order_number VARCHAR(50) NOT NULL,
      source_store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      destination_store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REQUESTED', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'DISPUTED')),
      priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
      requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      approved_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      rejection_reason TEXT,
      notes TEXT,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_transfer_orders_org_number UNIQUE (organization_id, order_number),
      CONSTRAINT chk_transfer_orders_diff_stores CHECK (source_store_id <> destination_store_id)
    );

    CREATE INDEX IF NOT EXISTS idx_transfer_orders_org_status ON transfer_orders(organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_transfer_orders_source_store ON transfer_orders(source_store_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_orders_dest_store ON transfer_orders(destination_store_id);

    -- 3. Transfer Order Items Table (Entity 59 - FEAT-XFR-01)
    CREATE TABLE IF NOT EXISTS transfer_order_items (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      transfer_order_id UUID NOT NULL REFERENCES transfer_orders(id) ON DELETE CASCADE,
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      product_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISPATCHED', 'RECEIVED', 'DISPUTED', 'CANCELLED')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_transfer_order_items_order_item UNIQUE (transfer_order_id, inventory_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_transfer_order_items_order ON transfer_order_items(transfer_order_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_order_items_inventory ON transfer_order_items(inventory_item_id);
  `,
  down: `
    DROP TABLE IF EXISTS transfer_order_items CASCADE;
    DROP TABLE IF EXISTS transfer_orders CASCADE;
    DELETE FROM permissions WHERE code IN ('transfer:order:create', 'transfer:order:view', 'transfer:order:approve');
  `,
};
