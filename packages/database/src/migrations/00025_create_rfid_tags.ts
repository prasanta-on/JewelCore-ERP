import type { MigrationDefinition } from "../migrator.js";

export const migration00025CreateRfidTags: MigrationDefinition = {
  name: "00025_create_rfid_tags",
  up: `
    -- 1. Seed RFID Domain Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000061', 'rfid:write', 'RFID', 'Register, encode, and retire physical RFID transponder tags', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000062', 'rfid:view', 'RFID', 'View RFID transponder tag inventory and encoding status', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant rfid:write to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER')
      AND p.code = 'rfid:write'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant rfid:view to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER', 'SALES_ASSOCIATE')
      AND p.code = 'rfid:view'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. RFID Tags Master Registry Table (Entity 35 - FEAT-RFID-01)
    CREATE TABLE IF NOT EXISTS rfid_tags (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      epc VARCHAR(128) NOT NULL,
      tid VARCHAR(128),
      status VARCHAR(30) NOT NULL DEFAULT 'UNENCODED' CHECK (
        status IN ('UNENCODED', 'ACTIVE', 'RETIRED', 'DAMAGED')
      ),
      frequency_band VARCHAR(30) NOT NULL DEFAULT 'UHF_860_960_MHZ' CHECK (
        frequency_band IN ('UHF_860_960_MHZ', 'HF_13_56_MHZ', 'NFC')
      ),
      encoded_at TIMESTAMPTZ,
      retired_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_rfid_tags_org_epc UNIQUE (organization_id, epc)
    );

    CREATE INDEX IF NOT EXISTS idx_rfid_tags_org ON rfid_tags(organization_id);
    CREATE INDEX IF NOT EXISTS idx_rfid_tags_epc ON rfid_tags(epc);
    CREATE INDEX IF NOT EXISTS idx_rfid_tags_status ON rfid_tags(status);
    CREATE INDEX IF NOT EXISTS idx_rfid_tags_tid ON rfid_tags(tid) WHERE tid IS NOT NULL;
  `,
  down: `
    DROP TABLE IF EXISTS rfid_tags CASCADE;

    DELETE FROM role_permissions
    WHERE permission_id IN (
      SELECT id FROM permissions WHERE code IN ('rfid:write', 'rfid:view')
    );

    DELETE FROM permissions WHERE code IN ('rfid:write', 'rfid:view');
  `,
};
