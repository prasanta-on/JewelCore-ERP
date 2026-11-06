import type { MigrationDefinition } from "../migrator.js";

export const migration00012CreateProcurementGrns: MigrationDefinition = {
  name: "00012_create_procurement_grns",
  up: `
    -- Goods Receipt Notes (GRN, Entity 19)
    CREATE TABLE IF NOT EXISTS goods_receipt_notes (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      grn_number VARCHAR(50) NOT NULL UNIQUE,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RECEIVED', 'CLOSED')),
      supplier_invoice_number VARCHAR(100),
      supplier_invoice_date TIMESTAMPTZ,
      received_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      closed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      closed_at TIMESTAMPTZ,
      remarks TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_grn_org_id ON goods_receipt_notes(organization_id);
    CREATE INDEX IF NOT EXISTS idx_grn_store_id ON goods_receipt_notes(store_id);
    CREATE INDEX IF NOT EXISTS idx_grn_supplier_id ON goods_receipt_notes(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_grn_status ON goods_receipt_notes(status);
    CREATE INDEX IF NOT EXISTS idx_grn_number ON goods_receipt_notes(grn_number);
  `,
  down: `
    DROP TABLE IF EXISTS goods_receipt_notes CASCADE;
  `,
};
