import type { MigrationDefinition } from "../migrator.js";

export const migration00001CreateIamOrganizationsAndStores: MigrationDefinition =
  {
    name: "00001_create_iam_organizations_and_stores",
    up: `
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
      tax_identifier VARCHAR(100),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_organizations_code ON organizations(code);

    CREATE TABLE IF NOT EXISTS stores (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      store_type VARCHAR(50) NOT NULL,
      address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      phone VARCHAR(50),
      email VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_stores_code UNIQUE (code),
      CONSTRAINT uq_stores_org_code UNIQUE (organization_id, code),
      CONSTRAINT chk_store_type CHECK (
        store_type IN (
          'HEAD_OFFICE',
          'RETAIL_STORE',
          'SHOWROOM',
          'CENTRAL_WAREHOUSE',
          'VAULT_FACILITY',
          'VAULT_HUB',
          'WORKSHOP',
          'REGIONAL_OFFICE'
        )
      )
    );

    CREATE INDEX IF NOT EXISTS idx_stores_org_id ON stores(organization_id);
    CREATE INDEX IF NOT EXISTS idx_stores_code ON stores(code);
  `,
    down: `
    DROP TABLE IF EXISTS stores CASCADE;
    DROP TABLE IF EXISTS organizations CASCADE;
  `,
  };
