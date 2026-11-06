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
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
  createSupplier,
  createGrn,
  createShipment,
  createQualityCheck,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Analytical Balance Weight Measurements API (FEAT-QC-02 / INV-02, INV-09)", () => {
  const app = createApp();

  let testOrgId: string;
  let testStoreId: string;
  let testQcId: string;
  let authorizedToken: string;
  let unauthorizedToken: string;
  let techUserId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-API-WM-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-WM-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-WM-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-WM-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_WM_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_WM_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_WM_API');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'wm_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'wm_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_WM_API_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_WM_API';");

    // 1. Organization
    const org = await createOrganization({
      code: "ORG_WM_API",
      name: "Metrology API Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Store
    const store = await createStore({
      organizationId: testOrgId,
      code: "STORE_WM_API_001",
      name: "Metrology Intake Lab Showroom",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    testStoreId = store.id;

    // 3. Authorized Metrology Technician (STORE_MANAGER role with qc:measure)
    const techUser = await createUser({
      organizationId: testOrgId,
      email: "wm_api_tech@jewelcore.local",
      firstName: "Metrologist",
      lastName: "Officer",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    techUserId = techUser.id;

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(techUser.id, managerRole.id);
    }

    const techOrgMem = await createOrganizationMembership({
      organizationId: testOrgId,
      userId: techUser.id,
      isActive: true,
    });

    await createStoreMembership({
      organizationMembershipId: techOrgMem.id,
      storeId: testStoreId,
      isDefault: true,
      isActive: true,
    });

    authorizedToken = await signAccessToken({
      userId: techUser.id,
      orgId: testOrgId,
      email: techUser.email,
    });

    // 4. Unauthorized User (SALES_ASSOCIATE role lacking qc:measure)
    const salesUser = await createUser({
      organizationId: testOrgId,
      email: "wm_api_sales@jewelcore.local",
      firstName: "Sales",
      lastName: "Associate",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    if (salesRole) {
      await assignRoleToUser(salesUser.id, salesRole.id);
    }

    const salesOrgMem = await createOrganizationMembership({
      organizationId: testOrgId,
      userId: salesUser.id,
      isActive: true,
    });

    await createStoreMembership({
      organizationMembershipId: salesOrgMem.id,
      storeId: testStoreId,
      isDefault: true,
      isActive: true,
    });

    unauthorizedToken = await signAccessToken({
      userId: salesUser.id,
      orgId: testOrgId,
      email: salesUser.email,
    });

    // 5. Supplier, GRN, Shipment, and QC Session
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "SUP_WM_API_01",
      name: "Metrology Jewels Consignment",
    });

    const grn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: supplier.id,
      grnNumber: "GRN-WM-API-001",
      createdByUserId: techUser.id,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-WM-API-001",
      receivedByUserId: techUser.id,
      status: "RECEIVED",
    });

    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId: testStoreId,
      inspectorUserId: techUser.id,
    });
    testQcId = qc.id;
  });

  afterAll(async () => {
    try {
      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-API-WM-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-WM-API-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-WM-API-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-WM-API-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_WM_API_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_WM_API_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_WM_API');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'wm_api_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'wm_api_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_WM_API_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_WM_API';");
    } finally {
      await closePool();
    }
  });

  it("Scenario 1: Sub-Milligram Analytical Scale Ingestion (12.3456g gross, 0.1200g tare)", async () => {
    const res = await request(app)
      .post("/api/v1/qc/measurements")
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", testStoreId)
      .send({
        qualityCheckId: testQcId,
        balanceDeviceId: "SCALE-API-WM-METTLER-01",
        grossWeightGrams: 12.3456,
        tareWeightGrams: 0.12,
        measurementStage: "INTAKE_RECEIVING",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.balanceDeviceId).toBe("SCALE-API-WM-METTLER-01");
    expect(res.body.measuredWeight).toBe(12.3456);
    expect(res.body.tareWeight).toBe(0.12);
    expect(res.body.netWeight).toBe(12.2256);
    expect(res.body.measurementStage).toBe("INTAKE_RECEIVING");
    expect(res.body.measurementType).toBe("GROSS_WEIGHT");
    expect(res.body.isCalibrated).toBe(true);
    expect(res.body.measuredByUserId).toBe(techUserId);

    // Verify record retrieval by ID
    const getRes = await request(app)
      .get(`/api/v1/qc/measurements/${res.body.id}`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", testStoreId);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(res.body.id);
    expect(getRes.body.measuredWeight).toBe(12.3456);
    expect(getRes.body.netWeight).toBe(12.2256);
  });

  it("Scenario 1 (INV-09): verifies measurement record is strictly immutable (no SQL UPDATE or DELETE permitted)", async () => {
    // 1. Ingest reading
    const res = await request(app)
      .post("/api/v1/qc/measurements")
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", testStoreId)
      .send({
        qualityCheckId: testQcId,
        balanceDeviceId: "SCALE-API-WM-METTLER-02",
        measuredWeight: 10.0,
        tareWeight: 0.5,
      });

    expect(res.status).toBe(201);
    const readingId = res.body.id;

    // 2. Attempting SQL UPDATE must be rejected by PostgreSQL immutability trigger
    await expect(
      query(
        "UPDATE weight_measurements SET measured_weight = 15.0000 WHERE id = $1;",
        [readingId],
      ),
    ).rejects.toThrow(/strictly prohibited.*INV-09/i);

    // 3. Attempting SQL DELETE must be rejected by PostgreSQL immutability trigger
    await expect(
      query("DELETE FROM weight_measurements WHERE id = $1;", [readingId]),
    ).rejects.toThrow(/strictly prohibited.*INV-09/i);
  });

  it("Scenario 2: Unauthorized Analytical Scale Ingestion Rejection", async () => {
    // User with SALES_ASSOCIATE role lacking qc:measure permission
    const res = await request(app)
      .post("/api/v1/qc/measurements")
      .set("Authorization", `Bearer ${unauthorizedToken}`)
      .set("x-store-id", testStoreId)
      .send({
        qualityCheckId: testQcId,
        balanceDeviceId: "SCALE-API-WM-METTLER-01",
        grossWeightGrams: 12.3456,
        tareWeightGrams: 0.12,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("Scenario 3: Zero or Negative Weight Rejection (INV-02)", async () => {
    // Test 1: Gross weight 0.0000g
    const zeroRes = await request(app)
      .post("/api/v1/qc/measurements")
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", testStoreId)
      .send({
        qualityCheckId: testQcId,
        balanceDeviceId: "SCALE-API-WM-METTLER-01",
        grossWeightGrams: 0.0,
        tareWeightGrams: 0.0,
      });

    expect(zeroRes.status).toBe(400);
    expect(zeroRes.body.code).toBe("ERR_INVALID_WEIGHT_VALUE");

    // Test 2: Gross weight negative -0.5000g
    const negativeRes = await request(app)
      .post("/api/v1/qc/measurements")
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", testStoreId)
      .send({
        qualityCheckId: testQcId,
        balanceDeviceId: "SCALE-API-WM-METTLER-01",
        grossWeightGrams: -0.5,
        tareWeightGrams: 0.0,
      });

    expect(negativeRes.status).toBe(400);
    expect(negativeRes.body.code).toBe("ERR_INVALID_WEIGHT_VALUE");
  });
});
