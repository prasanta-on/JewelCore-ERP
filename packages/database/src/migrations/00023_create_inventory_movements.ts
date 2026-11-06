import type { MigrationDefinition } from "../migrator.js";

export const migration00023CreateInventoryMovements: MigrationDefinition = {
  name: "00023_create_inventory_movements",
  up: `
    -- 1. Unified Custody Movement Ledger Table (Entity 30 - FEAT-INV-03 / INV-09, INV-13, INV-16)
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
      product_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
      movement_type VARCHAR(30) NOT NULL CHECK (
        movement_type IN (
          'INTAKE_PLACEMENT',
          'VAULT_TRANSFER',
          'DISPLAY_PLACEMENT',
          'RETURN_TO_VAULT',
          'AUDIT_ADJUSTMENT',
          'CUSTODY_DEPARTURE'
        )
      ),
      from_compartment_id UUID REFERENCES compartments(id) ON DELETE RESTRICT,
      to_compartment_id UUID REFERENCES compartments(id) ON DELETE RESTRICT,
      from_custody_state VARCHAR(30),
      to_custody_state VARCHAR(30) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity >= 1),
      weight_grams NUMERIC(10, 4) CHECK (weight_grams IS NULL OR weight_grams > 0),
      actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reason_code VARCHAR(50),
      reference_document_type VARCHAR(50),
      reference_document_id UUID,
      moved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT chk_movements_qty_positive CHECK (quantity >= 1),
      CONSTRAINT chk_movements_serialized_qty CHECK (inventory_item_id IS NULL OR quantity = 1),
      CONSTRAINT chk_movements_destination_compartment CHECK (
        (to_custody_state IN ('IN_VAULT', 'IN_DISPLAY') AND to_compartment_id IS NOT NULL) OR
        (to_custody_state IN ('INTAKE_STAGING', 'IN_TRANSIT', 'MISSING', 'RELEASED') AND to_compartment_id IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_movements_org ON inventory_movements(organization_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_store ON inventory_movements(store_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(inventory_item_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON inventory_movements(product_sku_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_from_comp ON inventory_movements(from_compartment_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_to_comp ON inventory_movements(to_compartment_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_moved_at ON inventory_movements(moved_at);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref_doc ON inventory_movements(reference_document_type, reference_document_id);

    -- 2. Audit Immutability Trigger (INV-09)
    CREATE OR REPLACE FUNCTION fn_prevent_inventory_movements_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'inventory_movements ledger is strictly append-only and immutable (INV-09)'
        USING ERRCODE = '23514';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_inventory_movements_immutability ON inventory_movements;
    CREATE TRIGGER trg_inventory_movements_immutability
      BEFORE UPDATE OR DELETE ON inventory_movements
      FOR EACH ROW
      EXECUTE FUNCTION fn_prevent_inventory_movements_mutation();

    -- 3. Movement SKU & Item Coherence Trigger (INV-16)
    CREATE OR REPLACE FUNCTION fn_verify_inventory_movement_sku_coherence()
    RETURNS TRIGGER AS $$
    DECLARE
      item_sku_id UUID;
    BEGIN
      IF NEW.inventory_item_id IS NOT NULL THEN
        SELECT product_sku_id INTO item_sku_id
        FROM inventory_items
        WHERE id = NEW.inventory_item_id;

        IF item_sku_id IS DISTINCT FROM NEW.product_sku_id THEN
          RAISE EXCEPTION 'Movement SKU % does not match piece SKU % (INV-16)', NEW.product_sku_id, item_sku_id
            USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_inventory_movements_sku_coherence ON inventory_movements;
    CREATE TRIGGER trg_inventory_movements_sku_coherence
      BEFORE INSERT ON inventory_movements
      FOR EACH ROW
      EXECUTE FUNCTION fn_verify_inventory_movement_sku_coherence();
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_inventory_movements_sku_coherence ON inventory_movements;
    DROP FUNCTION IF EXISTS fn_verify_inventory_movement_sku_coherence();
    DROP TRIGGER IF EXISTS trg_inventory_movements_immutability ON inventory_movements;
    DROP FUNCTION IF EXISTS fn_prevent_inventory_movements_mutation();
    DROP TABLE IF EXISTS inventory_movements CASCADE;
  `,
};
