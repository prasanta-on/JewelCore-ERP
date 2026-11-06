import type { MigrationDefinition } from "../migrator.js";

export const migration00020CreateQcDecisions: MigrationDefinition = {
  name: "00020_create_qc_decisions",
  up: `
    -- 1. Seed Supervisor Damage Waiver Permission (qc:waiver - Gap 3)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000047', 'qc:waiver', 'QC', 'Authorize supervisor damage waivers and exceptions on defective jewellery pieces', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant qc:waiver to SYSTEM_ADMIN
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000001',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'qc:waiver'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant qc:waiver and qc:approve to STORE_MANAGER (Operational Supervisor Gap 3)
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000002',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code IN ('qc:waiver', 'qc:approve')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Quality Decisions Table (Entity 27 - FEAT-QC-06)
    CREATE TABLE IF NOT EXISTS quality_decisions (
      id UUID PRIMARY KEY,
      quality_check_id UUID NOT NULL REFERENCES quality_checks(id) ON DELETE RESTRICT,
      quality_check_item_id UUID REFERENCES quality_check_items(id) ON DELETE RESTRICT,
      decision VARCHAR(40) NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'ESCALATED_FOR_REINSPECTION')),
      decided_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      decided_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      reason_code VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE INDEX IF NOT EXISTS idx_quality_decisions_qc_id ON quality_decisions(quality_check_id);
    CREATE INDEX IF NOT EXISTS idx_quality_decisions_qc_item_id ON quality_decisions(quality_check_item_id);
    CREATE INDEX IF NOT EXISTS idx_quality_decisions_decision ON quality_decisions(decision);
    CREATE INDEX IF NOT EXISTS idx_quality_decisions_decided_by ON quality_decisions(decided_by_user_id);

    -- 3. Immutability Trigger (INV-09 Append-Only Guarantee)
    CREATE OR REPLACE FUNCTION fn_prevent_quality_decisions_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'quality_decisions records are strictly immutable and append-only (INV-09)'
        USING ERRCODE = '23514';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_quality_decisions_immutability ON quality_decisions;
    CREATE TRIGGER trg_quality_decisions_immutability
      BEFORE UPDATE OR DELETE ON quality_decisions
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_quality_decisions_mutation();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_quality_decisions_immutability ON quality_decisions;
    DROP FUNCTION IF EXISTS fn_prevent_quality_decisions_mutation();
    DROP TABLE IF EXISTS quality_decisions CASCADE;
    DELETE FROM permissions WHERE code = 'qc:waiver';
  `,
};
