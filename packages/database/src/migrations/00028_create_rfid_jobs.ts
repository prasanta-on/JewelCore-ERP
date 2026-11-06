import type { MigrationDefinition } from "../migrator.js";

export const migration00028CreateRfidJobs: MigrationDefinition = {
  name: "00028_create_rfid_jobs",
  up: `
    -- 1. Seed RFID Batch Job Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000073', 'rfid:encode', 'RFID', 'Dispatch and execute batch RFID print and encoding jobs', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000074', 'rfid:jobs:view', 'RFID', 'View RFID print and encoding jobs and items', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant rfid:encode to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER')
      AND p.code = 'rfid:encode'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant rfid:jobs:view to SYSTEM_ADMIN, STORE_MANAGER, INVENTORY_CONTROLLER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'INVENTORY_CONTROLLER', 'SALES_ASSOCIATE')
      AND p.code = 'rfid:jobs:view'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. RFID Batch Jobs Table (Entity 37 - FEAT-RFID-03)
    CREATE TABLE IF NOT EXISTS rfid_jobs (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      printer_device_id VARCHAR(100) NOT NULL,
      job_name VARCHAR(255),
      status VARCHAR(30) NOT NULL DEFAULT 'QUEUED' CHECK (
        status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')
      ),
      total_items INTEGER NOT NULL CHECK (total_items > 0),
      completed_items INTEGER NOT NULL DEFAULT 0 CHECK (completed_items >= 0),
      failed_items INTEGER NOT NULL DEFAULT 0 CHECK (failed_items >= 0),
      error_message TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_rfid_jobs_org_store ON rfid_jobs (organization_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_rfid_jobs_status ON rfid_jobs (status);
    CREATE INDEX IF NOT EXISTS idx_rfid_jobs_created_at ON rfid_jobs (created_at DESC);

    -- 3. RFID Job Items Table (Entity 38 - FEAT-RFID-03)
    CREATE TABLE IF NOT EXISTS rfid_job_items (
      id UUID PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES rfid_jobs(id) ON DELETE CASCADE,
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      rfid_tag_id UUID REFERENCES rfid_tags(id) ON DELETE SET NULL,
      target_epc VARCHAR(128),
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'ENCODED', 'FAILED')
      ),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      error_message TEXT,
      encoded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_rfid_job_items_job_id ON rfid_job_items (job_id);
    CREATE INDEX IF NOT EXISTS idx_rfid_job_items_item_id ON rfid_job_items (inventory_item_id);
    CREATE INDEX IF NOT EXISTS idx_rfid_job_items_status ON rfid_job_items (status);

    -- 4. Transactional Outbox Events Table (Entity 43 - FEAT-FOUND-04 / FEAT-RFID-03)
    CREATE TABLE IF NOT EXISTS outbox_events (
      id UUID PRIMARY KEY,
      topic VARCHAR(128) NOT NULL,
      payload_json JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
      retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created ON outbox_events (status, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_outbox_events_topic ON outbox_events (topic);
  `,
  down: `
    DROP TABLE IF EXISTS outbox_events CASCADE;
    DROP TABLE IF EXISTS rfid_job_items CASCADE;
    DROP TABLE IF EXISTS rfid_jobs CASCADE;
    DELETE FROM permissions WHERE code IN ('rfid:encode', 'rfid:jobs:view');
  `,
};
