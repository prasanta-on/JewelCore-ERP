import type { MigrationDefinition } from "../migrator.js";

export const migration00036CreateSalesPayments: MigrationDefinition = {
  name: "00036_create_sales_payments",
  up: `
    -- 1. Seed Multi-Mode Payment Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000095', 'sales:payment:record', 'SALES', 'Record customer payments and split-tender settlements', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000096', 'sales:payment:view', 'SALES', 'View payment receipts, tender breakdowns, and settlement history', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant payment permissions to roles: SYSTEM_ADMIN, STORE_MANAGER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'SALES_ASSOCIATE')
      AND p.code IN ('sales:payment:record', 'sales:payment:view')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Sales Payments Table (Entity 51 - FEAT-SALES-03)
    CREATE TABLE IF NOT EXISTS sales_payments (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      sales_invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
      received_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'CHEQUE', 'STORE_CREDIT', 'GIFT_CARD')),
      amount_cad NUMERIC(14, 4) NOT NULL CHECK (amount_cad > 0),
      currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
      status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'PENDING', 'FAILED', 'REFUNDED')),
      reference_number VARCHAR(100),
      card_last4 VARCHAR(4),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sales_payments_invoice ON sales_payments(sales_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_sales_payments_org_created ON sales_payments(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_payments_store ON sales_payments(store_id);

    -- 3. Immutability Trigger (INV-09 Financial Audit Trail Guarantee)
    CREATE OR REPLACE FUNCTION fn_prevent_sales_payments_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'sales_payments records are strictly immutable financial ledger history (INV-09)'
        USING ERRCODE = '23514';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_sales_payments_immutability ON sales_payments;
    CREATE TRIGGER trg_sales_payments_immutability
      BEFORE UPDATE OR DELETE ON sales_payments
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_sales_payments_mutation();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_sales_payments_immutability ON sales_payments;
    DROP FUNCTION IF EXISTS fn_prevent_sales_payments_mutation();
    DROP TABLE IF EXISTS sales_payments CASCADE;
    DELETE FROM permissions WHERE code IN ('sales:payment:record', 'sales:payment:view');
  `,
};
