import type { MigrationDefinition } from "../migrator.js";

export const migration00030CreatePricingMetalRates: MigrationDefinition = {
  name: "00030_create_pricing_metal_rates",
  up: `
    -- 1. Seed Pricing Domain Permissions (FEAT-PRICE-01)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000080', 'pricing:rate:create', 'PRICING', 'Record and publish precious metal market spot rates', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000081', 'pricing:rate:view', 'PRICING', 'View precious metal market spot rate boards and historical fixes', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000082', 'pricing:policy:manage', 'PRICING', 'Configure making charges and pricing policies', CURRENT_TIMESTAMP),
      ('0192e301-0001-7000-8000-000000000083', 'pricing:calculate', 'PRICING', 'Calculate piece pricing and generate price snapshots', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant pricing permissions to SYSTEM_ADMIN and STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code IN ('SYSTEM_ADMIN', 'STORE_MANAGER')
      AND p.code IN ('pricing:rate:create', 'pricing:rate:view', 'pricing:policy:manage', 'pricing:calculate')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant viewing and calculation permissions to SALES_ASSOCIATE
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      r.id,
      p.id,
      CURRENT_TIMESTAMP
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code = 'SALES_ASSOCIATE'
      AND p.code IN ('pricing:rate:view', 'pricing:calculate')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Precious Metal Daily Market Rates Table (Entity 44 - FEAT-PRICE-01)
    CREATE TABLE IF NOT EXISTS daily_market_rates (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID REFERENCES stores(id) ON DELETE RESTRICT,
      metal_type VARCHAR(20) NOT NULL CHECK (metal_type IN ('GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM')),
      rate_per_gram_cad NUMERIC(14, 4) NOT NULL CHECK (rate_per_gram_cad > 0),
      currency VARCHAR(10) NOT NULL DEFAULT 'CAD',
      effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      effective_to TIMESTAMPTZ,
      rate_source VARCHAR(30) NOT NULL DEFAULT 'MANUAL_OVERRIDE' CHECK (
        rate_source IN ('MANUAL_OVERRIDE', 'LBMA_FEED', 'SIMULATED_FEED', 'API_FEED')
      ),
      is_active BOOLEAN NOT NULL DEFAULT true,
      recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_daily_market_rates_org ON daily_market_rates (organization_id, metal_type, effective_from DESC);
    CREATE INDEX IF NOT EXISTS idx_daily_market_rates_store ON daily_market_rates (store_id, metal_type, effective_from DESC);

    -- Partial unique index ensuring at most one active rate per org/store/metal/currency
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_daily_market_rate
    ON daily_market_rates (organization_id, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid), metal_type, currency)
    WHERE is_active = true AND effective_to IS NULL;

    -- 3. Rate Immutability Enforcement Trigger (INV-09)
    CREATE OR REPLACE FUNCTION fn_enforce_daily_market_rates_immutability()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'daily_market_rates records are append-only and cannot be deleted (INV-09)';
      END IF;

      IF TG_OP = 'UPDATE' THEN
        IF OLD.id != NEW.id OR
           OLD.organization_id != NEW.organization_id OR
           OLD.store_id IS DISTINCT FROM NEW.store_id OR
           OLD.metal_type != NEW.metal_type OR
           OLD.rate_per_gram_cad != NEW.rate_per_gram_cad OR
           OLD.currency != NEW.currency OR
           OLD.effective_from != NEW.effective_from OR
           OLD.recorded_by_user_id != NEW.recorded_by_user_id OR
           OLD.created_at != NEW.created_at THEN
          RAISE EXCEPTION 'daily_market_rates historical rate values are strictly immutable (INV-09); only effective_to, is_active, and notes may be updated';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_daily_market_rates_immutability ON daily_market_rates;
    CREATE TRIGGER trg_daily_market_rates_immutability
    BEFORE UPDATE OR DELETE ON daily_market_rates
    FOR EACH ROW
    EXECUTE FUNCTION fn_enforce_daily_market_rates_immutability();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_daily_market_rates_immutability ON daily_market_rates;
    DROP FUNCTION IF EXISTS fn_enforce_daily_market_rates_immutability();
    DROP TABLE IF EXISTS daily_market_rates;
    DELETE FROM permissions WHERE code IN ('pricing:rate:create', 'pricing:rate:view', 'pricing:policy:manage', 'pricing:calculate');
  `,
};
