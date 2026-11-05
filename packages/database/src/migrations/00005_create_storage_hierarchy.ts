import type { MigrationDefinition } from "../migrator.js";

export const migration00005CreateStorageHierarchy: MigrationDefinition = {
  name: "00005_create_storage_hierarchy",
  up: `
    -- 1. Vaults table (Entity 32)
    CREATE TABLE IF NOT EXISTS vaults (
      id UUID PRIMARY KEY,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      vault_type VARCHAR(30) NOT NULL DEFAULT 'MAIN_VAULT' CHECK (vault_type IN ('MAIN_VAULT', 'SHOWROOM_SAFE', 'INTAKE_HOLDING')),
      access_level_required VARCHAR(50) NOT NULL DEFAULT 'STORE_MANAGER',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_vaults_store_code UNIQUE (store_id, code),
      CONSTRAINT uq_vaults_id_store UNIQUE (id, store_id)
    );

    CREATE INDEX IF NOT EXISTS idx_vaults_store_id ON vaults(store_id);

    -- 2. Lockers table (Entity 33)
    -- Enforces INV-05 via composite foreign key referencing (vault_id, store_id)
    CREATE TABLE IF NOT EXISTS lockers (
      id UUID PRIMARY KEY,
      vault_id UUID NOT NULL,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      locker_number VARCHAR(50) NOT NULL,
      capacity_rating VARCHAR(50),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_lockers_vault_code UNIQUE (vault_id, code),
      CONSTRAINT uq_lockers_id_store UNIQUE (id, store_id),
      CONSTRAINT fk_lockers_vault_store FOREIGN KEY (vault_id, store_id)
        REFERENCES vaults(id, store_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_lockers_vault_id ON lockers(vault_id);
    CREATE INDEX IF NOT EXISTS idx_lockers_store_id ON lockers(store_id);

    -- 3. Compartments table (Entity 34)
    -- Enforces INV-05 via composite foreign key referencing (locker_id, store_id)
    CREATE TABLE IF NOT EXISTS compartments (
      id UUID PRIMARY KEY,
      locker_id UUID NOT NULL,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      compartment_number VARCHAR(50) NOT NULL,
      max_weight_capacity_grams NUMERIC(10, 3),
      max_item_capacity INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_compartments_locker_code UNIQUE (locker_id, code),
      CONSTRAINT fk_compartments_locker_store FOREIGN KEY (locker_id, store_id)
        REFERENCES lockers(id, store_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_compartments_locker_id ON compartments(locker_id);
    CREATE INDEX IF NOT EXISTS idx_compartments_store_id ON compartments(store_id);

    -- 4. Seed Storage Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000009', 'storage:write', 'STORAGE', 'Create, update, and manage vaults, lockers, and compartments', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000010', 'storage:read', 'STORAGE', 'View physical storage vaults, lockers, and compartment capacities', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- 5. Grant Storage Permissions to SYSTEM_ADMIN and STORE_MANAGER roles
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code IN ('storage:write', 'storage:read')
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  `,
  down: `
    DROP TABLE IF EXISTS compartments CASCADE;
    DROP TABLE IF EXISTS lockers CASCADE;
    DROP TABLE IF EXISTS vaults CASCADE;
  `,
};
