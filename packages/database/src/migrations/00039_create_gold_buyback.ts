import type { MigrationDefinition } from "../migrator.js";

export const migration00039CreateGoldBuyback: MigrationDefinition = {
  name: "00039_create_gold_buyback",
  up: `
    -- 1. Seed Old Gold & Scrap Buyback Permissions (FEAT-RET-02)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000100', 'buyback:order:create', 'SALES', 'Authorize and create scrap gold buyback orders and item appraisal', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000101', 'buyback:order:view', 'SALES', 'View scrap gold buyback orders, melt calculations and customer payouts', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000102', 'buyback:order:settle', 'SALES', 'Settle buyback payout via cash, bank transfer, store credit, or POS trade-in', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant buyback permissions to roles: SYSTEM_ADMIN, STORE_MANAGER, SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'SALES_ASSOCIATE')
      AND p.code IN ('buyback:order:create', 'buyback:order:view', 'buyback:order:settle')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Gold Buyback Orders Table (Entity 54 - FEAT-RET-02)
    CREATE TABLE IF NOT EXISTS gold_buyback_orders (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      settled_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      order_number VARCHAR(50) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'APPRAISED' CHECK (status IN ('APPRAISED', 'ACCEPTED', 'SETTLED', 'REJECTED', 'CANCELLED')),
      payout_method VARCHAR(30) NOT NULL CHECK (payout_method IN ('CASH', 'BANK_TRANSFER', 'STORE_CREDIT', 'TRADE_IN_EXCHANGE')),
      total_gross_weight_grams NUMERIC(10, 4) NOT NULL CHECK (total_gross_weight_grams > 0),
      total_net_weight_grams NUMERIC(10, 4) NOT NULL CHECK (total_net_weight_grams > 0),
      total_melt_value_cad NUMERIC(14, 4) NOT NULL CHECK (total_melt_value_cad >= 0),
      total_smelting_fee_cad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (total_smelting_fee_cad >= 0),
      net_payout_amount_cad NUMERIC(14, 4) NOT NULL CHECK (net_payout_amount_cad >= 0),
      payout_reference VARCHAR(100),
      notes TEXT,
      settled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_gold_buyback_orders_org_number UNIQUE (organization_id, order_number),
      CONSTRAINT chk_buyback_orders_weight_physics CHECK (total_gross_weight_grams >= total_net_weight_grams)
    );

    CREATE INDEX IF NOT EXISTS idx_gold_buyback_orders_store ON gold_buyback_orders(store_id);
    CREATE INDEX IF NOT EXISTS idx_gold_buyback_orders_customer ON gold_buyback_orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_gold_buyback_orders_status ON gold_buyback_orders(organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_gold_buyback_orders_created ON gold_buyback_orders(organization_id, created_at DESC);

    -- 3. Gold Buyback Items Table (Entity 55 - FEAT-RET-02)
    CREATE TABLE IF NOT EXISTS gold_buyback_items (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      gold_buyback_order_id UUID NOT NULL REFERENCES gold_buyback_orders(id) ON DELETE CASCADE,
      item_type VARCHAR(40) NOT NULL CHECK (item_type IN ('SCRAP_JEWELLERY', 'OLD_GOLD_BAR', 'COIN', 'DENTAL_GOLD', 'WATCH_CASE', 'OTHER')),
      description VARCHAR(255) NOT NULL,
      purity_id UUID NOT NULL REFERENCES purities(id) ON DELETE RESTRICT,
      purity_percentage NUMERIC(6, 4) NOT NULL CHECK (purity_percentage > 0 AND purity_percentage <= 100),
      gross_weight_grams NUMERIC(10, 4) NOT NULL CHECK (gross_weight_grams > 0),
      net_weight_grams NUMERIC(10, 4) NOT NULL CHECK (net_weight_grams > 0),
      market_rate_per_gram_cad NUMERIC(14, 4) NOT NULL CHECK (market_rate_per_gram_cad > 0),
      melt_value_cad NUMERIC(14, 4) NOT NULL CHECK (melt_value_cad >= 0),
      smelting_fee_cad NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (smelting_fee_cad >= 0),
      net_payout_cad NUMERIC(14, 4) NOT NULL CHECK (net_payout_cad >= 0),
      target_compartment_id UUID REFERENCES compartments(id) ON DELETE RESTRICT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_buyback_items_weight_physics CHECK (gross_weight_grams >= net_weight_grams)
    );

    CREATE INDEX IF NOT EXISTS idx_gold_buyback_items_order ON gold_buyback_items(gold_buyback_order_id);
    CREATE INDEX IF NOT EXISTS idx_gold_buyback_items_purity ON gold_buyback_items(purity_id);
  `,
  down: `
    DROP TABLE IF EXISTS gold_buyback_items CASCADE;
    DROP TABLE IF EXISTS gold_buyback_orders CASCADE;
    DELETE FROM permissions WHERE code IN ('buyback:order:create', 'buyback:order:view', 'buyback:order:settle');
  `,
};
