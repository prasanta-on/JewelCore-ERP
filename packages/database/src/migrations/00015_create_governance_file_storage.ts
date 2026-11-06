import type { MigrationDefinition } from "../migrator.js";

export const migration00015CreateGovernanceFileStorage: MigrationDefinition = {
  name: "00015_create_governance_file_storage",
  up: `
    -- 1. Seed Governance Document Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000031', 'documents:write', 'GOVERNANCE', 'Upload, associate, and manage binary documents and attachments', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000032', 'documents:read', 'GOVERNANCE', 'Read and download document attachments and certificates', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant documents:write and documents:read to SYSTEM_ADMIN
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000001',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code IN ('documents:write', 'documents:read')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant documents:write and documents:read to STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000002',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code IN ('documents:write', 'documents:read')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. File Objects Registry (Entity 41)
    CREATE TABLE IF NOT EXISTS file_objects (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      storage_bucket VARCHAR(100) NOT NULL,
      storage_key VARCHAR(500) NOT NULL UNIQUE,
      original_filename VARCHAR(255) NOT NULL,
      file_extension VARCHAR(20) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      byte_size BIGINT NOT NULL CHECK (byte_size > 0),
      sha256_checksum CHAR(64) NOT NULL,
      uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE INDEX IF NOT EXISTS idx_file_objects_org_id ON file_objects(organization_id);
    CREATE INDEX IF NOT EXISTS idx_file_objects_checksum ON file_objects(storage_bucket, sha256_checksum);
    CREATE INDEX IF NOT EXISTS idx_file_objects_uploaded_by ON file_objects(uploaded_by_user_id);

    -- 3. Polymorphic File Associations (Entity 42)
    CREATE TABLE IF NOT EXISTS file_associations (
      id UUID PRIMARY KEY,
      file_object_id UUID NOT NULL REFERENCES file_objects(id) ON DELETE CASCADE,
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID NOT NULL,
      association_purpose VARCHAR(100) NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_file_associations_unique_link UNIQUE (file_object_id, entity_type, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_file_associations_file_id ON file_associations(file_object_id);
    CREATE INDEX IF NOT EXISTS idx_file_associations_entity ON file_associations(entity_type, entity_id);
  `,
  down: `
    DROP TABLE IF EXISTS file_associations CASCADE;
    DROP TABLE IF EXISTS file_objects CASCADE;
    DELETE FROM permissions WHERE code IN ('documents:write', 'documents:read');
  `,
};
