import type { MigrationDefinition } from "../migrator.js";

export const migration00017CreateQcWeightMeasurements: MigrationDefinition = {
  name: "00017_create_qc_weight_measurements",
  up: `
    -- 1. Analytical Balance Weight Measurements (Entity 25 - FEAT-QC-02 / INV-02, INV-09)
    CREATE TABLE IF NOT EXISTS weight_measurements (
      id UUID PRIMARY KEY,
      quality_check_id UUID REFERENCES quality_checks(id) ON DELETE RESTRICT,
      quality_check_item_id UUID,
      balance_device_id VARCHAR(100) NOT NULL,
      measurement_type VARCHAR(30) NOT NULL DEFAULT 'GROSS_WEIGHT' CHECK (measurement_type IN ('GROSS_WEIGHT', 'NET_WEIGHT', 'GEMSTONE_WEIGHT')),
      measurement_stage VARCHAR(40) NOT NULL DEFAULT 'INTAKE_RECEIVING' CHECK (measurement_stage IN ('INTAKE_RECEIVING', 'INITIAL_INTAKE', 'QC_INSPECTION', 'REINSPECTION', 'POST_QC_AUDIT', 'VAULT_AUDIT', 'TRANSFER_VERIFICATION')),
      measured_weight NUMERIC(10, 4) NOT NULL CHECK (measured_weight > 0),
      tare_weight NUMERIC(10, 4) NOT NULL DEFAULT 0.0000 CHECK (tare_weight >= 0),
      net_weight NUMERIC(10, 4) GENERATED ALWAYS AS (measured_weight - tare_weight) STORED,
      measurement_unit VARCHAR(20) NOT NULL DEFAULT 'GRAMS' CHECK (measurement_unit IN ('GRAMS', 'CARATS', 'TROY_OUNCES', 'GRAM', 'CARAT')),
      is_calibrated BOOLEAN NOT NULL DEFAULT true,
      measured_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      measured_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT chk_weight_measurements_physics CHECK (measured_weight >= tare_weight)
    );

    CREATE INDEX IF NOT EXISTS idx_weight_measurements_qc_id ON weight_measurements(quality_check_id);
    CREATE INDEX IF NOT EXISTS idx_weight_measurements_qc_item_id ON weight_measurements(quality_check_item_id);
    CREATE INDEX IF NOT EXISTS idx_weight_measurements_device ON weight_measurements(balance_device_id);
    CREATE INDEX IF NOT EXISTS idx_weight_measurements_stage ON weight_measurements(measurement_stage);
    CREATE INDEX IF NOT EXISTS idx_weight_measurements_user ON weight_measurements(measured_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_weight_measurements_measured_at ON weight_measurements(measured_at DESC);

    -- 2. Strict Append-Only Immutability Gate (INV-09)
    CREATE OR REPLACE FUNCTION trg_enforce_weight_measurements_immutability()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'SQL % on weight_measurements is strictly prohibited (INV-09: Append-Only Metrology Log)', TG_OP
        USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_weight_measurements_immutability ON weight_measurements;
    CREATE TRIGGER trg_weight_measurements_immutability
    BEFORE UPDATE OR DELETE ON weight_measurements
    FOR EACH ROW
    EXECUTE FUNCTION trg_enforce_weight_measurements_immutability();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_weight_measurements_immutability ON weight_measurements;
    DROP FUNCTION IF EXISTS trg_enforce_weight_measurements_immutability();
    DROP TABLE IF EXISTS weight_measurements CASCADE;
  `,
};
