import type { MigrationDefinition } from "../migrator.js";

export const migration00008CreateTaxonomyGemstones: MigrationDefinition = {
  name: "00008_create_taxonomy_gemstones",
  up: `
    -- Gemstones classification master table (Entity 14)
    CREATE TABLE IF NOT EXISTS gemstones (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(100) NOT NULL,
      gemstone_type VARCHAR(30) NOT NULL CHECK (gemstone_type IN ('PRECIOUS', 'SEMI_PRECIOUS', 'ORGANIC_PEARL')),
      default_measurement_unit VARCHAR(20) NOT NULL DEFAULT 'CARAT',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_gemstones_org_code UNIQUE (organization_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_gemstones_org_id ON gemstones(organization_id);
    CREATE INDEX IF NOT EXISTS idx_gemstones_type ON gemstones(gemstone_type);
  `,
  down: `
    DROP TABLE IF EXISTS gemstones CASCADE;
  `,
};
