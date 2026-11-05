import type { MigrationDefinition } from "../migrator.js";

export const migration00003CreateIamRbac: MigrationDefinition = {
  name: "00003_create_iam_rbac",
  up: `
    -- 1. Roles table
    CREATE TABLE IF NOT EXISTS roles (
      id UUID PRIMARY KEY,
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      scope_level VARCHAR(20) NOT NULL DEFAULT 'STORE' CHECK (scope_level IN ('ORGANIZATION', 'STORE')),
      is_system BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_system_code ON roles(code) WHERE organization_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_org_code ON roles(organization_id, code) WHERE organization_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_roles_org_id ON roles(organization_id);

    -- 2. Permissions table
    CREATE TABLE IF NOT EXISTS permissions (
      id UUID PRIMARY KEY,
      code VARCHAR(100) NOT NULL UNIQUE,
      module VARCHAR(50) NOT NULL,
      description VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
    CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

    -- 3. Role-Permissions junction table
    CREATE TABLE IF NOT EXISTS role_permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_role_permissions UNIQUE (role_id, permission_id)
    );

    CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
    CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

    -- 4. Seed Standard Domain Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000001', 'iam:admin', 'IAM', 'Full administrative access to organizations, stores, roles, and staff', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000002', 'iam:view', 'IAM', 'Read-only access to organizations, branch stores, and user rosters', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000003', 'inventory:transfer', 'INVENTORY', 'Authorize and execute inter-store and vault inventory transfers', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000004', 'inventory:view', 'INVENTORY', 'View jewellery stock, barcoded assets, and trays', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000005', 'qc:approve', 'QC', 'Approve quality control inspections, metal purity, and gemstone assays', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000006', 'qc:inspect', 'QC', 'Conduct physical inspections and log defect attributes on jewellery items', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000007', 'vault:access', 'STORAGE', 'Manage, lock, unlock, and assign vault compartments and lockers', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000008', 'sales:invoice', 'SALES', 'Create point-of-sale customer sales invoices and issue estimates', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- 5. Seed Core Built-In System Roles
    INSERT INTO roles (id, organization_id, code, name, scope_level, is_system, created_at, updated_at)
    VALUES
      ('0192e302-0001-7000-8000-000000000001', NULL, 'SYSTEM_ADMIN', 'System Administrator', 'ORGANIZATION', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('0192e302-0001-7000-8000-000000000002', NULL, 'STORE_MANAGER', 'Store Branch Manager', 'STORE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('0192e302-0001-7000-8000-000000000003', NULL, 'INVENTORY_CONTROLLER', 'Inventory Controller & Custodian', 'STORE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('0192e302-0001-7000-8000-000000000004', NULL, 'SALES_ASSOCIATE', 'Showroom Sales Associate', 'STORE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT DO NOTHING;

    -- 6. Seed System Role Permission Mappings
    -- SYSTEM_ADMIN gets all permissions
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000001',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- STORE_MANAGER mappings (iam:view, inventory:transfer, inventory:view, vault:access, sales:invoice)
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000002',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code IN ('iam:view', 'inventory:transfer', 'inventory:view', 'vault:access', 'sales:invoice')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- INVENTORY_CONTROLLER mappings (inventory:transfer, inventory:view, vault:access)
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000003',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code IN ('inventory:transfer', 'inventory:view', 'vault:access')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- SALES_ASSOCIATE mappings (sales:invoice, inventory:view)
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000004',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code IN ('sales:invoice', 'inventory:view')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 7. User-Roles junction table
    CREATE TABLE IF NOT EXISTS user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_user_roles UNIQUE (user_id, role_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
  `,
  down: `
    DROP TABLE IF EXISTS user_roles CASCADE;
    DROP TABLE IF EXISTS role_permissions CASCADE;
    DROP TABLE IF EXISTS permissions CASCADE;
    DROP TABLE IF EXISTS roles CASCADE;
  `,
};
