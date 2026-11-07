import type { MigrationDefinition } from "../migrator.js";

export const migration00042CreateTransferManifests: MigrationDefinition = {
  name: "00042_create_transfer_manifests",
  up: `
    -- 1. Seed Transfer Manifest Permissions (FEAT-XFR-02)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e401-0001-7000-8000-000000000108', 'transfer:manifest:create', 'TRANSFERS', 'Authorize dispatch of transfer orders with tamper-evident seals and dual-custody', CURRENT_TIMESTAMP),
      ('0192e401-0001-7000-8000-000000000109', 'transfer:manifest:view', 'TRANSFERS', 'View transfer manifests and seal numbers', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant transfer:manifest:view to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER', 'SALES_ASSOCIATE')
      AND p.code = 'transfer:manifest:view'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant transfer:manifest:create to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER')
      AND p.code = 'transfer:manifest:create'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Transfer Manifests Table (Entity 60 - FEAT-XFR-02)
    CREATE TABLE IF NOT EXISTS transfer_manifests (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      manifest_number VARCHAR(50) NOT NULL,
      transfer_order_id UUID NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
      dispatcher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      witness_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      carrier_name VARCHAR(100) NOT NULL,
      tracking_number VARCHAR(100),
      estimated_arrival TIMESTAMPTZ,
      dispatched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(30) NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'DISPUTED')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_transfer_manifests_org_number UNIQUE (organization_id, manifest_number),
      CONSTRAINT chk_transfer_manifests_dual_custody CHECK (dispatcher_user_id <> witness_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_transfer_manifests_order ON transfer_manifests(transfer_order_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_manifests_status ON transfer_manifests(organization_id, status);

    -- 3. Security Seals Table (Entity 61 - FEAT-XFR-02)
    CREATE TABLE IF NOT EXISTS security_seals (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      transfer_manifest_id UUID NOT NULL REFERENCES transfer_manifests(id) ON DELETE CASCADE,
      seal_number VARCHAR(50) NOT NULL,
      seal_type VARCHAR(30) NOT NULL DEFAULT 'SECURITY_BAG' CHECK (seal_type IN ('SECURITY_BAG', 'LOCKER_BOX', 'CABLE_SEAL')),
      status VARCHAR(30) NOT NULL DEFAULT 'ATTACHED' CHECK (status IN ('ATTACHED', 'VERIFIED_INTACT', 'BROKEN_TAMPERED', 'DAMAGED')),
      verified_at TIMESTAMPTZ,
      verified_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_security_seals_manifest_number UNIQUE (transfer_manifest_id, seal_number)
    );

    CREATE INDEX IF NOT EXISTS idx_security_seals_manifest ON security_seals(transfer_manifest_id);
    CREATE INDEX IF NOT EXISTS idx_security_seals_number ON security_seals(seal_number);
  `,
  down: `
    DROP TABLE IF EXISTS security_seals CASCADE;
    DROP TABLE IF EXISTS transfer_manifests CASCADE;
    DELETE FROM permissions WHERE code IN ('transfer:manifest:create', 'transfer:manifest:view');
  `,
};
