import type { MigrationDefinition } from "../migrator.js";

export const migration00043CreateTransferDisputes: MigrationDefinition = {
  name: "00043_create_transfer_disputes",
  up: `
    -- 1. Seed Transfer Receiving & Dispute Permissions (FEAT-XFR-03)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e401-0001-7000-8000-000000000110', 'transfer:receive', 'TRANSFERS', 'Receive inter-store transfer shipments, verify security seals and ingest inventory pieces', CURRENT_TIMESTAMP),
      ('0192e401-0001-7000-8000-000000000111', 'transfer:dispute:create', 'TRANSFERS', 'Raise transfer dispute claims for missing, damaged or tampered shipments', CURRENT_TIMESTAMP),
      ('0192e401-0001-7000-8000-000000000112', 'transfer:dispute:resolve', 'TRANSFERS', 'Authorize and resolve inter-store transfer dispute claims', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant transfer:receive and transfer:dispute:create to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER')
      AND p.code IN ('transfer:receive', 'transfer:dispute:create')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant transfer:dispute:resolve to SYSTEM_ADMIN, STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code = 'transfer:dispute:resolve'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Transfer Disputes Table (Entity 62 - FEAT-XFR-03, Architectural Gap 2)
    CREATE TABLE IF NOT EXISTS transfer_disputes (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      transfer_order_id UUID NOT NULL REFERENCES transfer_orders(id) ON DELETE RESTRICT,
      transfer_manifest_id UUID NOT NULL REFERENCES transfer_manifests(id) ON DELETE RESTRICT,
      claim_type VARCHAR(50) NOT NULL CHECK (claim_type IN ('MISSING_PIECE', 'DAMAGED_SEAL', 'WEIGHT_DISCREPANCY', 'DAMAGED_ITEM', 'INCORRECT_ITEM')),
      severity VARCHAR(20) NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'WRITTEN_OFF')),
      reported_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      witness_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
      details TEXT NOT NULL,
      resolution_notes TEXT,
      resolved_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_transfer_disputes_dual_custody CHECK (reported_by_user_id <> witness_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_transfer_disputes_order ON transfer_disputes(transfer_order_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_disputes_manifest ON transfer_disputes(transfer_manifest_id);
    CREATE INDEX IF NOT EXISTS idx_transfer_disputes_status ON transfer_disputes(organization_id, status);
  `,
  down: `
    DROP TABLE IF EXISTS transfer_disputes CASCADE;
    DELETE FROM permissions WHERE code IN ('transfer:receive', 'transfer:dispute:create', 'transfer:dispute:resolve');
  `,
};
