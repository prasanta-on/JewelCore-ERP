import type { MigrationDefinition } from "../migrator.js";

export const migration00026CreateRfidTagAssignments: MigrationDefinition = {
  name: "00026_create_rfid_tag_assignments",
  up: `
    -- RFID Tag Assignments Ledger (Entity 36 - FEAT-RFID-02)
    CREATE TABLE IF NOT EXISTS rfid_tag_assignments (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      rfid_tag_id UUID NOT NULL REFERENCES rfid_tags(id) ON DELETE RESTRICT,
      status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('ACTIVE', 'RETIRED', 'VOIDED')
      ),
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      assigned_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      retired_at TIMESTAMPTZ,
      retired_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      retirement_reason VARCHAR(64) CHECK (
        retirement_reason IS NULL OR retirement_reason IN ('DAMAGED', 'DETACHED', 'ITEM_SOLD', 'RETURN_TO_VENDOR')
      ),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    -- INV-03: Partial unique index guaranteeing at most ONE active RFID tag per physical serialized piece
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rfid_tag_assignments_active_item
      ON rfid_tag_assignments(inventory_item_id)
      WHERE status = 'ACTIVE';

    -- INV-04: Partial unique index guaranteeing at most ONE active piece per RFID transponder tag
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rfid_tag_assignments_active_tag
      ON rfid_tag_assignments(rfid_tag_id)
      WHERE status = 'ACTIVE';

    -- Query optimization indexes
    CREATE INDEX IF NOT EXISTS idx_rfid_tag_assignments_org ON rfid_tag_assignments(organization_id);
    CREATE INDEX IF NOT EXISTS idx_rfid_tag_assignments_item ON rfid_tag_assignments(inventory_item_id);
    CREATE INDEX IF NOT EXISTS idx_rfid_tag_assignments_tag ON rfid_tag_assignments(rfid_tag_id);
    CREATE INDEX IF NOT EXISTS idx_rfid_tag_assignments_status ON rfid_tag_assignments(status);
  `,
  down: `
    DROP TABLE IF EXISTS rfid_tag_assignments CASCADE;
  `,
};
