import type { MigrationDefinition } from "../migrator.js";

export const migration00014CreateProcurementStaffAssignments: MigrationDefinition =
  {
    name: "00014_create_procurement_staff_assignments",
    up: `
    CREATE TABLE IF NOT EXISTS staff_assignments (
      id UUID PRIMARY KEY,
      goods_receipt_note_id UUID NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE RESTRICT,
      shipment_id UUID REFERENCES shipments(id) ON DELETE RESTRICT,
      assigned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      assigned_role VARCHAR(20) NOT NULL CHECK (assigned_role IN ('RECEIVER', 'INSPECTOR', 'APPROVER')),
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_staff_assignments_grn_id ON staff_assignments(goods_receipt_note_id);
    CREATE INDEX IF NOT EXISTS idx_staff_assignments_shipment_id ON staff_assignments(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_staff_assignments_user_id ON staff_assignments(assigned_user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_assignments_unique_shipment
      ON staff_assignments(goods_receipt_note_id, shipment_id, assigned_user_id, assigned_role)
      WHERE shipment_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_assignments_unique_grn
      ON staff_assignments(goods_receipt_note_id, assigned_user_id, assigned_role)
      WHERE shipment_id IS NULL;
  `,
    down: `
    DROP TABLE IF EXISTS staff_assignments CASCADE;
  `,
  };
