import type { MigrationDefinition } from "../migrator.js";

export const migration00018CreateQcItemsAndGemstones: MigrationDefinition = {
  name: "00018_create_qc_items_and_gemstones",
  up: `
    -- 1. Seed Technical Inspection Permission (qc:inspect)
    INSERT INTO permissions (id, code, module, description, created_at)
    VALUES
      ('0192e301-0001-7000-8000-000000000045', 'qc:inspect', 'QC', 'Perform technical inspection, visual and hallmark checks, and damage assessment on QC items', CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO NOTHING;

    -- Grant qc:inspect to SYSTEM_ADMIN
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000001',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'qc:inspect'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Grant qc:inspect to STORE_MANAGER
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT
      gen_random_uuid(),
      '0192e302-0001-7000-8000-000000000002',
      p.id,
      CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = 'qc:inspect'
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- 2. Quality Check Items Table (Entity 24 - FEAT-QC-04 / INV-02, INV-15, INV-18)
    CREATE TABLE IF NOT EXISTS quality_check_items (
      id UUID PRIMARY KEY,
      quality_check_id UUID NOT NULL REFERENCES quality_checks(id) ON DELETE RESTRICT,
      shipment_item_id UUID NOT NULL REFERENCES shipment_items(id) ON DELETE RESTRICT,
      item_sequence_number INTEGER NOT NULL CHECK (item_sequence_number >= 1),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      verified_material_id UUID REFERENCES materials(id) ON DELETE RESTRICT,
      verified_purity_id UUID REFERENCES purities(id) ON DELETE RESTRICT,
      gross_weight_grams NUMERIC(10, 4) CHECK (gross_weight_grams IS NULL OR gross_weight_grams > 0),
      tare_weight_grams NUMERIC(10, 4) NOT NULL DEFAULT 0.0000 CHECK (tare_weight_grams >= 0),
      net_weight_grams NUMERIC(10, 4) CHECK (net_weight_grams IS NULL OR net_weight_grams > 0),
      stone_weight_carats NUMERIC(8, 4) NOT NULL DEFAULT 0.0000 CHECK (stone_weight_carats >= 0),
      hallmark_verified BOOLEAN,
      visual_inspection_passed BOOLEAN,
      damage_detected BOOLEAN,
      damage_notes TEXT,
      rejection_reason TEXT,
      decision_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      decision_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_qc_items_session_line_item UNIQUE (quality_check_id, shipment_item_id, item_sequence_number),
      CONSTRAINT chk_qc_items_weight_physics CHECK (
        (gross_weight_grams IS NULL AND net_weight_grams IS NULL) OR
        (gross_weight_grams IS NOT NULL AND net_weight_grams IS NULL) OR
        (gross_weight_grams IS NOT NULL AND net_weight_grams IS NOT NULL AND net_weight_grams <= gross_weight_grams)
      ),
      CONSTRAINT chk_qc_items_approval_prerequisites CHECK (
        status != 'APPROVED' OR (
          verified_material_id IS NOT NULL AND
          verified_purity_id IS NOT NULL AND
          gross_weight_grams IS NOT NULL AND
          net_weight_grams IS NOT NULL AND
          gross_weight_grams > 0 AND
          net_weight_grams > 0 AND
          gross_weight_grams >= net_weight_grams AND
          hallmark_verified IS TRUE AND
          visual_inspection_passed IS TRUE AND
          damage_detected IS NOT NULL AND
          (damage_detected IS FALSE OR (damage_detected IS TRUE AND damage_notes IS NOT NULL))
        )
      )
    );

    CREATE INDEX IF NOT EXISTS idx_qc_items_qc_id ON quality_check_items(quality_check_id);
    CREATE INDEX IF NOT EXISTS idx_qc_items_shipment_item_id ON quality_check_items(shipment_item_id);
    CREATE INDEX IF NOT EXISTS idx_qc_items_status ON quality_check_items(status);

    -- 3. Mounted Gemstones and Parcels (Entity 26 - FEAT-QC-03 / DEC-05)
    CREATE TABLE IF NOT EXISTS item_gemstones (
      id UUID PRIMARY KEY,
      quality_check_item_id UUID NOT NULL REFERENCES quality_check_items(id) ON DELETE CASCADE,
      inventory_item_id UUID,
      gemstone_id UUID NOT NULL REFERENCES gemstones(id) ON DELETE RESTRICT,
      stone_type VARCHAR(30) NOT NULL CHECK (stone_type IN ('PRIMARY_SOLITAIRE', 'ACCENT_MELEE', 'PARCEL')),
      stone_count INTEGER NOT NULL CHECK (stone_count >= 1),
      carat_weight NUMERIC(8, 4) NOT NULL CHECK (carat_weight > 0),
      shape VARCHAR(50),
      cut_grade VARCHAR(50),
      color_grade VARCHAR(50),
      clarity_grade VARCHAR(50),
      certificate_number VARCHAR(100),
      certificate_authority VARCHAR(50) CHECK (certificate_authority IS NULL OR certificate_authority IN ('GIA', 'IGI', 'AGS', 'HRD', 'IN_HOUSE')),
      certificate_file_id UUID REFERENCES file_objects(id) ON DELETE SET NULL,
      setting_verified BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT chk_item_gemstones_solitaire CHECK (stone_type != 'PRIMARY_SOLITAIRE' OR stone_count = 1)
    );

    CREATE INDEX IF NOT EXISTS idx_item_gemstones_qc_item_id ON item_gemstones(quality_check_item_id);
    CREATE INDEX IF NOT EXISTS idx_item_gemstones_gemstone_id ON item_gemstones(gemstone_id);
    CREATE INDEX IF NOT EXISTS idx_item_gemstones_stone_type ON item_gemstones(stone_type);

    -- 4. Link weight_measurements to quality_check_items
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_weight_measurements_qc_item'
      ) THEN
        ALTER TABLE weight_measurements
          ADD CONSTRAINT fk_weight_measurements_qc_item
          FOREIGN KEY (quality_check_item_id)
          REFERENCES quality_check_items(id)
          ON DELETE SET NULL;
      END IF;
    END $$;
  `,
  down: `
    ALTER TABLE weight_measurements DROP CONSTRAINT IF EXISTS fk_weight_measurements_qc_item;
    DROP TABLE IF EXISTS item_gemstones CASCADE;
    DROP TABLE IF EXISTS quality_check_items CASCADE;
    DELETE FROM permissions WHERE code = 'qc:inspect';
  `,
};
