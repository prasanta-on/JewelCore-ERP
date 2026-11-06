import type { MigrationDefinition } from "../migrator.js";

export const migration00019CreateQcTolerancePermissions: MigrationDefinition = {
  name: "00019_create_qc_tolerance_permissions",
  up: `
    -- 1. Seed Intake Weight Tolerance Admin Permission (qc:tolerance:admin)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000046', 'qc:tolerance:admin', 'QC', 'Configure intake weight discrepancy tolerance limits and authorize out-of-tolerance overrides', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant qc:tolerance:admin to SYSTEM_ADMIN
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000001',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'qc:tolerance:admin'
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  `,
  down: `
    DELETE FROM permissions WHERE code = 'qc:tolerance:admin';
  `,
};
