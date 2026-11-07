import type { MigrationDefinition } from "../migrator.js";

export const migration00038CreateSalesReturns: MigrationDefinition = {
  name: "00038_create_sales_returns",
  up: `
    -- 1. Seed Customer Returns Permissions
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000098', 'sales:return:create', 'SALES', 'Authorize and process customer returns, piece restocking and refund calculations', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000099', 'sales:return:view', 'SALES', 'View customer sales returns, piece inspection condition and restock records', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant permissions to roles: SYSTEM_ADMIN, STORE_MANAGER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'SALES_ASSOCIATE')
      AND p.code IN ('sales:return:create', 'sales:return:view')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Sales Returns Table (Entity 52 - FEAT-RET-01)
    CREATE TABLE IF NOT EXISTS sales_returns (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      sales_invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      processed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      return_number VARCHAR(50) NOT NULL,
      return_reason VARCHAR(50) NOT NULL CHECK (return_reason IN ('CUSTOMER_CHANGED_MIND', 'DEFECTIVE', 'INCORRECT_SIZE', 'UNWANTED_GIFT', 'OTHER')),
      status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING_INSPECTION', 'COMPLETED', 'REJECTED')),
      refund_method VARCHAR(30) NOT NULL CHECK (refund_method IN ('STORE_CREDIT', 'ORIGINAL_PAYMENT_METHOD', 'CASH', 'BANK_TRANSFER')),
      total_refund_amount_cad NUMERIC(14, 4) NOT NULL CHECK (total_refund_amount_cad >= 0),
      restocking_fee_cad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (restocking_fee_cad >= 0),
      net_refund_amount_cad NUMERIC(14, 4) NOT NULL CHECK (net_refund_amount_cad >= 0),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_sales_returns_org_number UNIQUE (organization_id, return_number)
    );

    CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns(sales_invoice_id);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_store ON sales_returns(store_id);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_created ON sales_returns(organization_id, created_at DESC);

    -- 3. Sales Return Items Table (Entity 53 - FEAT-RET-01)
    CREATE TABLE IF NOT EXISTS sales_return_items (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      sales_return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
      sales_invoice_item_id UUID NOT NULL REFERENCES sales_invoice_items(id) ON DELETE RESTRICT,
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      condition VARCHAR(30) NOT NULL CHECK (condition IN ('NEW_CONDITION', 'MINOR_WEAR', 'DAMAGED')),
      disposition VARCHAR(30) NOT NULL CHECK (disposition IN ('RESTOCK_AS_NEW', 'SEND_TO_REPAIR', 'SEND_TO_MELT')),
      target_compartment_id UUID REFERENCES compartments(id) ON DELETE RESTRICT,
      refund_amount_cad NUMERIC(14, 4) NOT NULL CHECK (refund_amount_cad >= 0),
      restocking_fee_cad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (restocking_fee_cad >= 0),
      net_refund_amount_cad NUMERIC(14, 4) NOT NULL CHECK (net_refund_amount_cad >= 0),
      inspection_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_sales_return_items_invoice_item UNIQUE (sales_invoice_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items(sales_return_id);
    CREATE INDEX IF NOT EXISTS idx_sales_return_items_piece ON sales_return_items(inventory_item_id);
  `,
  down: `
    DROP TABLE IF EXISTS sales_return_items CASCADE;
    DROP TABLE IF EXISTS sales_returns CASCADE;
    DELETE FROM permissions WHERE code IN ('sales:return:create', 'sales:return:view');
  `,
};
