import type { MigrationDefinition } from "../migrator.js";

export const migration00007CreateTaxonomyMaterialsAndPurities: MigrationDefinition = {
  name: "00007_create_taxonomy_materials_and_purities",
  up: `
    -- 1. Materials table (Entity 12)
    CREATE TABLE IF NOT EXISTS materials (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code VARCHAR(32) NOT NULL,
      name VARCHAR(100) NOT NULL,
      base_metal_type VARCHAR(32) NOT NULL,
      is_precious BOOLEAN NOT NULL DEFAULT true,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_materials_org_code UNIQUE (organization_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_materials_org_id ON materials(organization_id);

    -- 2. Purities table (Entity 13)
    -- DEC-05: NUMERIC(7, 4) for purity_percentage (0.0000 to 100.0000)
    -- DEC-05: NUMERIC(5, 4) for purity_ratio (0.0000 to 1.0000)
    CREATE TABLE IF NOT EXISTS purities (
      id UUID PRIMARY KEY,
      material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      code VARCHAR(32) NOT NULL,
      name VARCHAR(100) NOT NULL,
      karatage VARCHAR(32),
      purity_percentage NUMERIC(7, 4) NOT NULL,
      purity_ratio NUMERIC(5, 4) NOT NULL,
      hallmark_code VARCHAR(32),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_purities_material_code UNIQUE (material_id, code),
      CONSTRAINT chk_purities_percentage_range CHECK (purity_percentage >= 0.0000 AND purity_percentage <= 100.0000),
      CONSTRAINT chk_purities_ratio_range CHECK (purity_ratio >= 0.0000 AND purity_ratio <= 1.0000)
    );

    CREATE INDEX IF NOT EXISTS idx_purities_material_id ON purities(material_id);
  `,
  down: `
    DROP TABLE IF EXISTS purities CASCADE;
    DROP TABLE IF EXISTS materials CASCADE;
  `,
};
