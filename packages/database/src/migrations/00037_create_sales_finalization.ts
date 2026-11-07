import type { MigrationDefinition } from "../migrator.js";

export const migration00037CreateSalesFinalization: MigrationDefinition = {
  name: "00037_create_sales_finalization",
  up: `
    -- 1. Seed Custody Release Permission
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000097', 'sales:custody:release', 'SALES', 'Authorize physical custody handover and sale finalization of paid pieces', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant custody release permission to roles: SYSTEM_ADMIN, STORE_MANAGER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'SALES_ASSOCIATE')
      AND p.code = 'sales:custody:release'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Enhance Sales Invoices Table with Physical Custody Release Timestamp & Auditor
    ALTER TABLE sales_invoices
      ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS released_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT;

    CREATE INDEX IF NOT EXISTS idx_sales_invoices_released_at ON sales_invoices(organization_id, released_at);
  `,
  down: `
    DROP INDEX IF EXISTS idx_sales_invoices_released_at;
    ALTER TABLE sales_invoices
      DROP COLUMN IF EXISTS released_by_user_id,
      DROP COLUMN IF EXISTS released_at;
    DELETE FROM permissions WHERE code = 'sales:custody:release';
  `,
};
