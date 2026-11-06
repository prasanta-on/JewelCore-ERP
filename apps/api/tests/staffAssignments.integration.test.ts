import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  getRoleByCode,
  assignRoleToUser,
  createSupplier,
  createGrn,
  closeGrn,
  createShipment,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Staff Assignments API Endpoints (FEAT-PROC-04)", () => {
  const app = createApp();

  let testOrgId: string;
  let testStoreId: string;
  let testSupplierId: string;
  let managerToken: string;
  let salesToken: string;
  let techUser1Id: string;
  let techUser2Id: string;
  let grn1Id: string;
  let grn2Id: string;
  let closedGrnId: string;
  let grn1ShipmentId: string;
  let grn2ShipmentId: string;
  let createdAssignmentId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up any stale data from prior runs
    await query(
      "DELETE FROM staff_assignments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-ASN-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHP-ASN-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-ASN-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'ASN_API_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'asn_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code = 'ASN_API_STR_01';");
    await query("DELETE FROM organizations WHERE code = 'ASN_API_ORG';");

    // 1. Organization
    const org = await createOrganization({
      code: "ASN_API_ORG",
      name: "Staff Assignment API Enterprise",
    });
    testOrgId = org.id;

    // 2. Store
    const store = await createStore({
      organizationId: testOrgId,
      code: "ASN_API_STR_01",
      name: "Assignment Intake Branch",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    testStoreId = store.id;

    // 3. Supplier
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "ASN_API_SUPP_01",
      name: "Boucheron Place Vendome",
    });
    testSupplierId = supplier.id;

    // 4. Manager User (STORE_MANAGER has procurement:write and procurement:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "asn_api_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Assignment",
      lastName: "Manager",
      isActive: true,
    });

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(manager.id, managerRole.id);
    }

    managerToken = await signAccessToken({
      userId: manager.id,
      orgId: testOrgId,
      email: manager.email,
    });

    // 5. Sales User (SALES_ASSOCIATE lacks procurement:write)
    const salesUser = await createUser({
      organizationId: testOrgId,
      email: "asn_api_sales@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Sales",
      lastName: "Associate",
      isActive: true,
    });

    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    if (salesRole) {
      await assignRoleToUser(salesUser.id, salesRole.id);
    }

    salesToken = await signAccessToken({
      userId: salesUser.id,
      orgId: testOrgId,
      email: salesUser.email,
    });

    // 6. Technicians to assign
    const tech1 = await createUser({
      organizationId: testOrgId,
      email: "asn_api_tech1@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Receiving",
      lastName: "Specialist",
      isActive: true,
    });
    techUser1Id = tech1.id;

    const tech2 = await createUser({
      organizationId: testOrgId,
      email: "asn_api_tech2@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "QC",
      lastName: "Inspector",
      isActive: true,
    });
    techUser2Id = tech2.id;

    // 7. GRNs
    const g1 = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-ASN-API-001",
      createdByUserId: manager.id,
    });
    grn1Id = g1.id;

    const g2 = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-ASN-API-002",
      createdByUserId: manager.id,
    });
    grn2Id = g2.id;

    const gClosed = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-ASN-API-CLOSED",
      createdByUserId: manager.id,
    });
    await closeGrn(gClosed.id, manager.id, "Audit locked");
    closedGrnId = gClosed.id;

    // 8. Shipments
    const s1 = await createShipment({
      goodsReceiptNoteId: grn1Id,
      shipmentNumber: "SHP-ASN-API-001",
      receivedByUserId: manager.id,
    });
    grn1ShipmentId = s1.id;

    const s2 = await createShipment({
      goodsReceiptNoteId: grn2Id,
      shipmentNumber: "SHP-ASN-API-002",
      receivedByUserId: manager.id,
    });
    grn2ShipmentId = s2.id;
  });

  afterAll(async () => {
    await query(
      "DELETE FROM staff_assignments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-ASN-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHP-ASN-API-%';",
    );
    await query("DELETE FROM goods_receipt_notes WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM suppliers WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query(
      "DELETE FROM users WHERE email LIKE 'asn_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code = 'ASN_API_STR_01';");
    await query("DELETE FROM organizations WHERE id = $1;", [testOrgId]);
    await closePool();
  });

  // AC Scenario 1: Cross-Entity Store & GRN Match (INV-19)
  it("Scenario 1: creates staff assignment when shipment belongs to the specified GRN", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        goodsReceiptNoteId: grn1Id,
        shipmentId: grn1ShipmentId, // Valid match
        assignedUserId: techUser1Id,
        assignedRole: "RECEIVER",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.goodsReceiptNoteId).toBe(grn1Id);
    expect(res.body.data.shipmentId).toBe(grn1ShipmentId);
    expect(res.body.data.assignedUserId).toBe(techUser1Id);
    expect(res.body.data.assignedRole).toBe("RECEIVER");

    createdAssignmentId = res.body.data.id;
  });

  // AC Scenario 2: Cross-Entity Parent Mismatch Rejection (INV-19)
  it("Scenario 2: rejects assignment when shipment belongs to another GRN with 422 ERR_ASSIGNMENT_GRN_MISMATCH", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        goodsReceiptNoteId: grn1Id,
        shipmentId: grn2ShipmentId, // Mismatched GRN!
        assignedUserId: techUser2Id,
        assignedRole: "INSPECTOR",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_ASSIGNMENT_GRN_MISMATCH");
  });

  // AC Scenario 3: Unauthorized Staff Assignment Rejection
  it("Scenario 3: rejects user without procurement:write permission with 403 Forbidden", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/assignments")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        goodsReceiptNoteId: grn1Id,
        assignedUserId: techUser1Id,
        assignedRole: "APPROVER",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  // Scenario 4: Duplicate Assignment Rejection (409 Conflict)
  it("Scenario 4: rejects duplicate staff assignment for same role and scope with 409 Conflict", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        goodsReceiptNoteId: grn1Id,
        shipmentId: grn1ShipmentId,
        assignedUserId: techUser1Id,
        assignedRole: "RECEIVER", // Already assigned in Scenario 1
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_STAFF_ASSIGNMENT");
  });

  // Scenario 5: Closed GRN Immutability Lock (INV-06)
  it("Scenario 5: rejects creating assignment on a CLOSED GRN with 422 ERR_GRN_IMMUTABLE", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        goodsReceiptNoteId: closedGrnId, // CLOSED GRN
        assignedUserId: techUser1Id,
        assignedRole: "RECEIVER",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_GRN_IMMUTABLE");
  });

  // Scenario 6: Retrieve & List Staff Assignments
  it("Scenario 6: retrieves assignment by ID and lists assignments filtered by GRN", async () => {
    const getRes = await request(app)
      .get(`/api/v1/procurement/assignments/${createdAssignmentId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(createdAssignmentId);

    const listRes = await request(app)
      .get(`/api/v1/procurement/assignments?goodsReceiptNoteId=${grn1Id}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(
      listRes.body.data.some((a: any) => a.id === createdAssignmentId),
    ).toBe(true);
  });

  // Scenario 7: Delete Staff Assignment & verify deletion
  it("Scenario 7: deletes staff assignment with 200 OK and confirms removal", async () => {
    const tempRes = await request(app)
      .post("/api/v1/procurement/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        goodsReceiptNoteId: grn1Id,
        assignedUserId: techUser2Id,
        assignedRole: "APPROVER",
      });

    expect(tempRes.status).toBe(201);
    const tempId = tempRes.body.data.id;

    const delRes = await request(app)
      .delete(`/api/v1/procurement/assignments/${tempId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(delRes.status).toBe(200);

    const checkRes = await request(app)
      .get(`/api/v1/procurement/assignments/${tempId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(checkRes.status).toBe(404);
  });
});
