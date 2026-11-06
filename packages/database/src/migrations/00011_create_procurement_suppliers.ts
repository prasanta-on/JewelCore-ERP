import type { MigrationDefinition } from "../migrator.js";

export const migration00011CreateProcurementSuppliers: MigrationDefinition = {
  name: "00011_create_procurement_suppliers",
  up: `
    -- 1. Suppliers Master Table (Entity 18)
    CREATE TABLE IF NOT EXISTS suppliers (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(150) NOT NULL,
      contact_name VARCHAR(100),
      email VARCHAR(150),
      phone VARCHAR(50),
      tax_identifier VARCHAR(50),
      currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
      payment_terms VARCHAR(50),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_suppliers_org_code UNIQUE (organization_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_suppliers_org_id ON suppliers(organization_id);

    -- 2. Domain Permissions for Procurement
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000021', 'procurement:write', 'PROCUREMENT', 'Create, update, and manage supplier profiles, GRNs, and manifests', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000022', 'procurement:read', 'PROCUREMENT', 'View supplier directory, goods receipt notes, and shipment details', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- 3. Map Permissions to System Roles (SYSTEM_ADMIN and STORE_MANAGER)
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code IN ('procurement:write', 'procurement:read')
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  `,
  down: `
    DROP TABLE IF EXISTS suppliers CASCADE;
    DELETE FROM permissions WHERE code IN ('procurement:write', 'procurement:read');
  `,
};
