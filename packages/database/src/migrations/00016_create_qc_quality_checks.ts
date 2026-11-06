import type { MigrationDefinition } from "../migrator.js";

export const migration00016CreateQcQualityChecks: MigrationDefinition = {
  name: "00016_create_qc_quality_checks",
  up: `
    -- 1. Seed Quality Control Domain Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000041', 'qc:create', 'QC', 'Initiate quality inspection sessions on received shipments', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000042', 'qc:view', 'QC', 'View quality inspection sessions, piece metrics, and decisions', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000043', 'qc:update', 'QC', 'Update inspection session notes, metrics, and parameters', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000044', 'qc:measure', 'QC', 'Capture analytical scale weight readings and gemstone assays', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant QC permissions to SYSTEM_ADMIN
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000001',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code IN ('qc:create', 'qc:view', 'qc:update', 'qc:measure')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant QC permissions to STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000002',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code IN ('qc:create', 'qc:view', 'qc:update', 'qc:measure')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Quality Checks Table (Entity 23 - FEAT-QC-01)
    CREATE TABLE IF NOT EXISTS quality_checks (
      id UUID PRIMARY KEY,
      shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      inspector_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      session_sequence_number INTEGER NOT NULL CHECK (session_sequence_number >= 1),
      status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'PENDING', 'APPROVED', 'REJECTED', 'FINALIZED')),
      inspection_type VARCHAR(20) NOT NULL DEFAULT 'INITIAL_INTAKE' CHECK (inspection_type IN ('INITIAL_INTAKE', 'REINSPECTION')),
      started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      completed_at TIMESTAMPTZ,
      rejection_reason_code VARCHAR(50),
      rejection_notes TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_quality_checks_shipment_session UNIQUE (shipment_id, session_sequence_number)
    );

    CREATE INDEX IF NOT EXISTS idx_quality_checks_shipment_id ON quality_checks(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_quality_checks_store_id ON quality_checks(store_id);
    CREATE INDEX IF NOT EXISTS idx_quality_checks_inspector_id ON quality_checks(inspector_user_id);
    CREATE INDEX IF NOT EXISTS idx_quality_checks_status ON quality_checks(status);
  `,
  down: `
    DROP TABLE IF EXISTS quality_checks CASCADE;
    DELETE FROM permissions WHERE code IN ('qc:create', 'qc:view', 'qc:update', 'qc:measure');
  `,
};
