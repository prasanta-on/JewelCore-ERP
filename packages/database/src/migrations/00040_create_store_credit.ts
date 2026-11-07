import type { MigrationDefinition } from "../migrator.js";

export const migration00040CreateStoreCredit: MigrationDefinition = {
  name: "00040_create_store_credit",
  up: `
    -- 1. Seed Store Credit Permissions (FEAT-RET-03)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000103', 'store_credit:view', 'SALES', 'View customer store credit balances and transaction ledger history', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000104', 'store_credit:adjust', 'SALES', 'Authorize manual store credit issuance and adjustments', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant store_credit:view to SYSTEM_ADMIN, STORE_MANAGER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'SALES_ASSOCIATE')
      AND p.code = 'store_credit:view'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant store_credit:adjust to SYSTEM_ADMIN and STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code = 'store_credit:adjust'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Store Credit Accounts Table (Entity 56 - FEAT-RET-03)
    CREATE TABLE IF NOT EXISTS store_credit_accounts (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      account_number VARCHAR(50) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
      balance_cad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (balance_cad >= 0),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_store_credit_accounts_org_customer UNIQUE (organization_id, customer_id),
      CONSTRAINT uq_store_credit_accounts_org_number UNIQUE (organization_id, account_number)
    );

    CREATE INDEX IF NOT EXISTS idx_store_credit_accounts_customer ON store_credit_accounts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_store_credit_accounts_org ON store_credit_accounts(organization_id);

    -- 3. Store Credit Transactions Table (Entity 57 - FEAT-RET-03 / INV-09)
    CREATE TABLE IF NOT EXISTS store_credit_transactions (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_credit_account_id UUID NOT NULL REFERENCES store_credit_accounts(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('ISSUE_REFUND', 'ISSUE_BUYBACK', 'ISSUE_PROMOTION', 'REDEEM_PURCHASE', 'MANUAL_ADJUSTMENT', 'EXPIRE_CREDIT')),
      amount_cad NUMERIC(14, 4) NOT NULL CHECK (amount_cad > 0),
      balance_before_cad NUMERIC(14, 4) NOT NULL CHECK (balance_before_cad >= 0),
      balance_after_cad NUMERIC(14, 4) NOT NULL CHECK (balance_after_cad >= 0),
      reference_document_type VARCHAR(50),
      reference_document_id UUID,
      performed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_store_credit_tx_account ON store_credit_transactions(store_credit_account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_store_credit_tx_store ON store_credit_transactions(store_id);
    CREATE INDEX IF NOT EXISTS idx_store_credit_tx_ref ON store_credit_transactions(reference_document_type, reference_document_id);

    -- 4. Append-Only Immutability Enforcement (INV-09)
    CREATE OR REPLACE FUNCTION fn_prevent_store_credit_transactions_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Store credit transactions are strictly append-only; UPDATE and DELETE operations are prohibited (INV-09)';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_store_credit_transactions_immutability ON store_credit_transactions;
    CREATE TRIGGER trg_store_credit_transactions_immutability
      BEFORE UPDATE OR DELETE ON store_credit_transactions
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_store_credit_transactions_mutation();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_store_credit_transactions_immutability ON store_credit_transactions;
    DROP FUNCTION IF EXISTS fn_prevent_store_credit_transactions_mutation;
    DROP TABLE IF EXISTS store_credit_transactions CASCADE;
    DROP TABLE IF EXISTS store_credit_accounts CASCADE;
    DELETE FROM permissions WHERE code IN ('store_credit:view', 'store_credit:adjust');
  `,
};
