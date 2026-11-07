import type { MigrationDefinition } from "../migrator.js";

export const migration00035CreateSalesInvoices: MigrationDefinition = {
  name: "00035_create_sales_invoices",
  up: `
    -- 1. Seed POS & Sales Invoicing Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000092', 'sales:invoice:create', 'SALES', 'Create and generate sales invoices and line item charges', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000093', 'sales:invoice:view', 'SALES', 'View sales invoices, customer receipts, and line item breakdowns', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000094', 'sales:invoice:cancel', 'SALES', 'Void or cancel pending/draft sales invoices and unreserve pieces', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant sales permissions to roles: SYSTEM_ADMIN, STORE_MANAGER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'SALES_ASSOCIATE')
      AND p.code IN ('sales:invoice:create', 'sales:invoice:view', 'sales:invoice:cancel')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Sales Invoices Table (Entity 49 - FEAT-SALES-02)
    CREATE TABLE IF NOT EXISTS sales_invoices (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      invoice_number VARCHAR(50) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
      currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
      subtotal_cad NUMERIC(14, 4) NOT NULL CHECK (subtotal_cad >= 0),
      tax_amount_cad NUMERIC(14, 4) NOT NULL CHECK (tax_amount_cad >= 0),
      discount_amount_cad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (discount_amount_cad >= 0),
      total_amount_cad NUMERIC(14, 4) NOT NULL CHECK (total_amount_cad >= 0),
      paid_amount_cad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (paid_amount_cad >= 0),
      balance_due_cad NUMERIC(14, 4) NOT NULL CHECK (balance_due_cad >= 0),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_sales_invoices_org_number UNIQUE (organization_id, invoice_number)
    );

    CREATE INDEX IF NOT EXISTS idx_sales_invoices_org_store ON sales_invoices(organization_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer ON sales_invoices(organization_id, customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_created ON sales_invoices(organization_id, created_at DESC);

    -- 3. Sales Invoice Items Table (Entity 50 - FEAT-SALES-02)
    CREATE TABLE IF NOT EXISTS sales_invoice_items (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      sales_invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      price_snapshot_id UUID REFERENCES price_snapshots(id) ON DELETE SET NULL,
      unit_price_cad NUMERIC(14, 4) NOT NULL CHECK (unit_price_cad >= 0),
      discount_amount_cad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (discount_amount_cad >= 0),
      final_price_cad NUMERIC(14, 4) NOT NULL CHECK (final_price_cad >= 0),
      tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.0000 CHECK (tax_rate >= 0 AND tax_rate <= 1),
      tax_amount_cad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (tax_amount_cad >= 0),
      line_total_cad NUMERIC(14, 4) NOT NULL CHECK (line_total_cad >= 0),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice ON sales_invoice_items(sales_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_inventory_item ON sales_invoice_items(inventory_item_id);
  `,
  down: `
    DROP TABLE IF EXISTS sales_invoice_items CASCADE;
    DROP TABLE IF EXISTS sales_invoices CASCADE;
    DELETE FROM permissions WHERE code IN ('sales:invoice:create', 'sales:invoice:view', 'sales:invoice:cancel');
  `,
};
