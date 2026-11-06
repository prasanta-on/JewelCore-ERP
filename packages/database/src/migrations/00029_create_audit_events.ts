import type { MigrationDefinition } from "../migrator.js";

export const migration00029CreateAuditEvents: MigrationDefinition = {
  name: "00029_create_audit_events",
  up: `
    -- 1. Seed Compliance Audit Trail Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000075', 'audit:read', 'GOVERNANCE', 'Permission to inspect tamper-evident compliance audit trail events', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant audit:read to SYSTEM_ADMIN and STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code = 'audit:read'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Compliance Audit Events Table (Entity 40 - FEAT-GOV-02)
    CREATE TABLE IF NOT EXISTS audit_events (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID REFERENCES stores(id) ON DELETE RESTRICT,
      actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      actor_ip_address VARCHAR(45),
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(60) NOT NULL,
      resource_id UUID NOT NULL,
      payload_before_json JSONB,
      payload_after_json JSONB,
      reason TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_events_org_occurred ON audit_events (organization_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events (organization_id, resource_type, resource_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (organization_id, actor_user_id, occurred_at DESC);

    -- 3. Immutability Enforcement Trigger (INV-09)
    CREATE OR REPLACE FUNCTION fn_prevent_audit_events_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Audit events are strictly append-only; UPDATE and DELETE operations are prohibited (INV-09)';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_audit_events_immutability ON audit_events;
    CREATE TRIGGER trg_audit_events_immutability
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_audit_events_mutation();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_audit_events_immutability ON audit_events;
    DROP FUNCTION IF EXISTS fn_prevent_audit_events_mutation();
    DROP TABLE IF EXISTS audit_events;
    DELETE FROM permissions WHERE code = 'audit:read';
  `,
};
