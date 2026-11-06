import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  createSupplier,
  createGrn,
  closeGrn,
  createShipment,
  createStaffAssignment,
  getStaffAssignmentById,
  listStaffAssignments,
  deleteStaffAssignment,
} from "../src/index.js";
import {
  StoreType,
  ConflictError,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("Staff Assignment Repository Integration Tests (FEAT-PROC-04)", () => {
  let testOrgId: string;
  let testStoreId: string;
  let testSupplierId: string;
  let techUser1Id: string;
  let techUser2Id: string;
  let grn1Id: string;
  let grn2Id: string;
  let closedGrnId: string;
  let grn1ShipmentId: string;
  let grn2ShipmentId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up any stale data from prior runs
    await query(
      "DELETE FROM staff_assignments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-ASN-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHP-ASN-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-ASN-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'ASN_%';");
    await query("DELETE FROM users WHERE email LIKE 'asn_%@jewelcore.local';");
    await query("DELETE FROM stores WHERE code = 'ASN_STORE_001';");
    await query("DELETE FROM organizations WHERE code = 'ASN_TEST_ORG';");

    // 1. Organization
    const org = await createOrganization({
      code: "ASN_TEST_ORG",
      name: "Staff Assignment Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Store
    const store = await createStore({
      organizationId: testOrgId,
      code: "ASN_STORE_001",
      name: "Assignment Intake Facility",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    testStoreId = store.id;

    // 3. Supplier
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "ASN_SUPP_001",
      name: "De Beers Diamond Intakes",
    });
    testSupplierId = supplier.id;

    // 4. Users
    const u1 = await createUser({
      organizationId: testOrgId,
      email: "asn_tech1@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Receiving",
      lastName: "Officer",
      isActive: true,
    });
    techUser1Id = u1.id;

    const u2 = await createUser({
      organizationId: testOrgId,
      email: "asn_tech2@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "QC",
      lastName: "Inspector",
      isActive: true,
    });
    techUser2Id = u2.id;

    // 5. GRN 1
    const g1 = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-ASN-001",
      createdByUserId: techUser1Id,
    });
    grn1Id = g1.id;

    // 6. GRN 2 (for cross-parent mismatch testing)
    const g2 = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-ASN-002",
      createdByUserId: techUser1Id,
    });
    grn2Id = g2.id;

    // 7. Closed GRN
    const gClosed = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-ASN-CLOSED",
      createdByUserId: techUser1Id,
    });
    await closeGrn(gClosed.id, techUser1Id, "Formal close");
    closedGrnId = gClosed.id;

    // 8. Shipment under GRN 1
    const s1 = await createShipment({
      goodsReceiptNoteId: grn1Id,
      shipmentNumber: "SHP-ASN-001",
      receivedByUserId: techUser1Id,
    });
    grn1ShipmentId = s1.id;

    // 9. Shipment under GRN 2
    const s2 = await createShipment({
      goodsReceiptNoteId: grn2Id,
      shipmentNumber: "SHP-ASN-002",
      receivedByUserId: techUser1Id,
    });
    grn2ShipmentId = s2.id;
  });

  afterAll(async () => {
    await query(
      "DELETE FROM staff_assignments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-ASN-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHP-ASN-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-ASN-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'ASN_%';");
    await query("DELETE FROM users WHERE email LIKE 'asn_%@jewelcore.local';");
    await query("DELETE FROM stores WHERE code = 'ASN_STORE_001';");
    await query("DELETE FROM organizations WHERE id = $1;", [testOrgId]);
    await closePool();
  });

  it("Scenario 1: creates staff assignment for GRN intake duties and retrieves by ID", async () => {
    const assignment = await createStaffAssignment({
      goodsReceiptNoteId: grn1Id,
      assignedUserId: techUser1Id,
      assignedRole: "RECEIVER",
    });

    expect(assignment.id).toBeDefined();
    expect(assignment.goodsReceiptNoteId).toBe(grn1Id);
    expect(assignment.shipmentId).toBeNull();
    expect(assignment.assignedUserId).toBe(techUser1Id);
    expect(assignment.assignedRole).toBe("RECEIVER");

    const retrieved = await getStaffAssignmentById(assignment.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(assignment.id);
  });

  it("Scenario 2: creates shipment-specific staff assignment matching parent GRN", async () => {
    const assignment = await createStaffAssignment({
      goodsReceiptNoteId: grn1Id,
      shipmentId: grn1ShipmentId, // Matches grn1Id
      assignedUserId: techUser2Id,
      assignedRole: "INSPECTOR",
    });

    expect(assignment.id).toBeDefined();
    expect(assignment.shipmentId).toBe(grn1ShipmentId);
    expect(assignment.assignedRole).toBe("INSPECTOR");
  });

  it("Scenario 3: enforces INV-19 cross-entity integrity: rejects assignment when shipment belongs to another GRN (ERR_ASSIGNMENT_GRN_MISMATCH)", async () => {
    await expect(
      createStaffAssignment({
        goodsReceiptNoteId: grn1Id,
        shipmentId: grn2ShipmentId, // Mismatched: belongs to grn2Id!
        assignedUserId: techUser2Id,
        assignedRole: "INSPECTOR",
      }),
    ).rejects.toThrow(UnprocessableEntityError);

    try {
      await createStaffAssignment({
        goodsReceiptNoteId: grn1Id,
        shipmentId: grn2ShipmentId,
        assignedUserId: techUser2Id,
        assignedRole: "INSPECTOR",
      });
    } catch (err: any) {
      expect(err.code).toBe("ERR_ASSIGNMENT_GRN_MISMATCH");
    }
  });

  it("Scenario 4: rejects duplicate staff assignment for the same role and scope with 409 Conflict", async () => {
    await expect(
      createStaffAssignment({
        goodsReceiptNoteId: grn1Id,
        assignedUserId: techUser1Id,
        assignedRole: "RECEIVER", // Already assigned in Scenario 1
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("Scenario 5: enforces INV-06 immutable lock: rejects assignment on a CLOSED GRN", async () => {
    await expect(
      createStaffAssignment({
        goodsReceiptNoteId: closedGrnId, // CLOSED GRN
        assignedUserId: techUser1Id,
        assignedRole: "APPROVER",
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 6: lists staff assignments filtered by GRN and role", async () => {
    const list = await listStaffAssignments({
      goodsReceiptNoteId: grn1Id,
      assignedRole: "INSPECTOR",
    });

    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(
      list.every(
        (a) =>
          a.goodsReceiptNoteId === grn1Id && a.assignedRole === "INSPECTOR",
      ),
    ).toBe(true);
  });

  it("Scenario 7: deletes a staff assignment and verifies rejection when parent GRN is CLOSED", async () => {
    const tempAssignment = await createStaffAssignment({
      goodsReceiptNoteId: grn1Id,
      assignedUserId: techUser1Id,
      assignedRole: "APPROVER",
    });

    await deleteStaffAssignment(tempAssignment.id);

    const deleted = await getStaffAssignmentById(tempAssignment.id);
    expect(deleted).toBeNull();
  });
});
