import type { MigrationDefinition } from "../migrator.js";

export const migration00034CreateSalesCustomers: MigrationDefinition = {
  name: "00034_create_sales_customers",
  up: `
    -- 1. Seed Customer Master Permissions (Entity 48 - FEAT-SALES-01)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000089', 'customers:create', 'SALES', 'Register new customer profiles and KYC records', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000090', 'customers:view', 'SALES', 'View customer profiles, contacts, and purchase history', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000091', 'customers:update', 'SALES', 'Update customer contact information, addresses, and tags', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant customer permissions to SYSTEM_ADMIN, STORE_MANAGER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'SALES_ASSOCIATE')
      AND p.code IN ('customers:create', 'customers:view', 'customers:update')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Customers Table (Entity 48 - FEAT-SALES-01)
    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      customer_code VARCHAR(50) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(150),
      phone VARCHAR(50),
      address_line1 VARCHAR(255),
      address_line2 VARCHAR(255),
      city VARCHAR(100),
      state_province VARCHAR(50),
      postal_code VARCHAR(30),
      country VARCHAR(10) NOT NULL DEFAULT 'CA',
      tax_identifier VARCHAR(50),
      tags TEXT[] NOT NULL DEFAULT '{}',
      notes TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_customers_org_code UNIQUE (organization_id, customer_code)
    );

    CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(organization_id, email);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(organization_id, phone);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(organization_id, status);
  `,
  down: `
    DROP TABLE IF EXISTS customers CASCADE;
    DELETE FROM permissions WHERE code IN ('customers:create', 'customers:view', 'customers:update');
  `,
};
