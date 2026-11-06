import type { MigrationDefinition } from "../migrator.js";

export const migration00027CreateStockApprovals: MigrationDefinition = {
  name: "00027_create_stock_approvals",
  up: `
    -- 1. Seed Stock Approval Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000071', 'stock:approve', 'GOVERNANCE', 'Authorize managerial stock approval and commercial availability for inventory pieces', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000072', 'stock:view', 'GOVERNANCE', 'View managerial stock approval history', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant stock:approve to SYSTEM_ADMIN, STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code = 'stock:approve'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant stock:view to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER', 'SALES_ASSOCIATE')
      AND p.code = 'stock:view'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Stock Approvals Table (Entity 39 - FEAT-GOV-01)
    CREATE TABLE IF NOT EXISTS stock_approvals (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      approver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      approval_status VARCHAR(20) NOT NULL CHECK (
        approval_status IN ('APPROVED', 'REJECTED')
      ),
      approval_notes TEXT,
      rejection_reason_code VARCHAR(50),
      approved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE INDEX IF NOT EXISTS idx_stock_approvals_org ON stock_approvals(organization_id);
    CREATE INDEX IF NOT EXISTS idx_stock_approvals_store ON stock_approvals(store_id);
    CREATE INDEX IF NOT EXISTS idx_stock_approvals_item ON stock_approvals(inventory_item_id);
    CREATE INDEX IF NOT EXISTS idx_stock_approvals_status ON stock_approvals(approval_status);
    CREATE INDEX IF NOT EXISTS idx_stock_approvals_time ON stock_approvals(approved_at DESC);

    -- 3. Audit Immutability Trigger (INV-09)
    CREATE OR REPLACE FUNCTION fn_prevent_stock_approvals_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Stock approval records are append-only audit ledgers and cannot be updated or deleted (INV-09)'
        USING ERRCODE = '23514';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_stock_approvals_immutability
    BEFORE UPDATE OR DELETE ON stock_approvals
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_stock_approvals_mutation();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_stock_approvals_immutability ON stock_approvals;
    DROP FUNCTION IF EXISTS fn_prevent_stock_approvals_mutation;
    DROP TABLE IF EXISTS stock_approvals CASCADE;

    DELETE FROM role_permissions
    WHERE permission_id IN (
      SELECT id FROM permissions WHERE code IN ('stock:approve', 'stock:view')
    );

    DELETE FROM permissions WHERE code IN ('stock:approve', 'stock:view');
  `,
};
