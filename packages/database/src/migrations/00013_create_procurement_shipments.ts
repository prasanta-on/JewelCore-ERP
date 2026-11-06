import type { MigrationDefinition } from "../migrator.js";

export const migration00013CreateProcurementShipments: MigrationDefinition = {
  name: "00013_create_procurement_shipments",
  up: `
    CREATE TABLE IF NOT EXISTS shipments (
      id UUID PRIMARY KEY,
      goods_receipt_note_id UUID NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE RESTRICT,
      shipment_number VARCHAR(50) NOT NULL UNIQUE,
      carrier_name VARCHAR(100),
      tracking_number VARCHAR(100),
      declared_package_count INTEGER NOT NULL DEFAULT 1 CHECK (declared_package_count >= 0),
      received_package_count INTEGER NOT NULL DEFAULT 1 CHECK (received_package_count >= 0),
      gross_package_weight_grams NUMERIC(10, 4) CHECK (gross_package_weight_grams IS NULL OR gross_package_weight_grams > 0),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RECEIVED', 'RECONCILED')),
      received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      received_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_shipments_grn_id ON shipments(goods_receipt_note_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_shipment_number ON shipments(shipment_number);
    CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);

    CREATE TABLE IF NOT EXISTS shipment_items (
      id UUID PRIMARY KEY,
      shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
      product_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
      line_number INTEGER NOT NULL CHECK (line_number > 0),
      supplier_item_code VARCHAR(100),
      declared_piece_count INTEGER NOT NULL CHECK (declared_piece_count >= 0),
      received_piece_count INTEGER NOT NULL DEFAULT 0 CHECK (received_piece_count >= 0),
      declared_gross_weight_grams NUMERIC(10, 4) CHECK (declared_gross_weight_grams IS NULL OR declared_gross_weight_grams > 0),
      measured_gross_weight_grams NUMERIC(10, 4) CHECK (measured_gross_weight_grams IS NULL OR measured_gross_weight_grams > 0),
      declared_net_weight_grams NUMERIC(10, 4) CHECK (declared_net_weight_grams IS NULL OR declared_net_weight_grams > 0),
      unit_labour_making_cost NUMERIC(12, 4) CHECK (unit_labour_making_cost IS NULL OR unit_labour_making_cost >= 0),
      line_total_settlement NUMERIC(14, 2) CHECK (line_total_settlement IS NULL OR line_total_settlement >= 0),
      reconciliation_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (reconciliation_status IN ('PENDING', 'MATCHED', 'DISCREPANCY', 'REJECTED')),
      discrepancy_reason TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_shipment_items_line UNIQUE (shipment_id, line_number)
    );

    CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id ON shipment_items(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_shipment_items_product_sku_id ON shipment_items(product_sku_id);
    CREATE INDEX IF NOT EXISTS idx_shipment_items_reconciliation_status ON shipment_items(reconciliation_status);
  `,
  down: `
    DROP TABLE IF EXISTS shipment_items CASCADE;
    DROP TABLE IF EXISTS shipments CASCADE;
  `,
};
