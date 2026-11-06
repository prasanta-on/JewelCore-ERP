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
  createCategory,
  createMaterial,
  createPurity,
  createProduct,
  createProductSku,
  createSupplier,
  createGrn,
  createShipment,
  addShipmentItem,
  createQualityCheck,
  createQualityCheckItem,
  createWeightMeasurement,
  updateQualityCheck,
} from "@jewelcore/database";
import {
  StoreType,
  QualityCheckStatus,
  MeasurementType,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("QC Item 3VL Inspection & Completeness Gate API (FEAT-QC-04 / INV-02, INV-15, INV-18)", () => {
  const app = createApp();

  let orgId: string;
  let storeId: string;
  let materialId: string;
  let purityId: string;
  let qcId: string;
  let shipmentItemId: string;
  let inspectorUserId: string;
  let authorizedToken: string;
  let unauthorizedToken: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCI-API-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCI-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCI_API_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCI-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_QCI_API_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_QCI_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_QCI_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_QCI_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_QCI_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_QCI_API');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qci_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'qci_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_QCI_API_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_QCI_API';");

    // 1. Organization & Store
    const org = await createOrganization({
      code: "ORG_QCI_API",
      name: "QC 3VL API Test Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_QCI_API_001",
      name: "Intake Inspection Bay",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    // 2. Authorized Inspector (STORE_MANAGER with qc:inspect & qc:measure)
    const inspectorUser = await createUser({
      organizationId: orgId,
      email: "qci_api_inspector@jewelcore.local",
      firstName: "QC",
      lastName: "Inspector",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    inspectorUserId = inspectorUser.id;

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(inspectorUser.id, managerRole.id);
    }
    const orgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: inspectorUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: storeId,
      organizationMembershipId: orgMem.id,
      isDefault: true,
    });

    authorizedToken = await signAccessToken({
      userId: inspectorUser.id,
      email: inspectorUser.email,
      orgId: orgId,
    });

    // 3. Unauthorized User (VIEWER lacking qc:inspect)
    const viewerUser = await createUser({
      organizationId: orgId,
      email: "qci_api_viewer@jewelcore.local",
      firstName: "Read",
      lastName: "Only",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const viewerRole = await getRoleByCode("VIEWER");
    if (viewerRole) {
      await assignRoleToUser(viewerUser.id, viewerRole.id);
    }
    const viewerOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: viewerUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: storeId,
      organizationMembershipId: viewerOrgMem.id,
      isDefault: true,
    });

    unauthorizedToken = await signAccessToken({
      userId: viewerUser.id,
      email: viewerUser.email,
      orgId: orgId,
    });

    // 4. Taxonomy
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_QCI_API_PENDANTS",
      name: "Diamond Pendants",
      targetGender: "WOMEN",
      isActive: true,
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_QCI_API_PLATINUM",
      name: "Platinum 950",
      baseMetalType: "PLATINUM",
      isPrecious: true,
      isActive: true,
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_QCI_API_PT950",
      name: "Platinum 950 Fineness",
      karatage: "950Pt",
      purityPercentage: 95.0,
      isActive: true,
    });
    purityId = purity.id;

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      materialId: material.id,
      defaultPurityId: purity.id,
      productCode: "PRD_QCI_API_PENDANT",
      name: "Heart Shaped Platinum Pendant",
      isActive: true,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-QCI-API-001",
      variantName: "Platinum Pendant 950",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 8.5,
      targetMetalWeightGrams: 8.5,
      isActive: true,
    });

    // 5. Procurement: Supplier, GRN, Shipment, ShipmentItem
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_QCI_API_001",
      name: "Luxury Findings Corp",
      isActive: true,
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId: storeId,
      supplierId: supplier.id,
      createdByUserId: inspectorUser.id,
      grnNumber: "GRN-QCI-API-001",
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-QCI-API-001",
      carrierName: "FedEx Secure",
      trackingNumber: "FX-11223344",
      status: "RECEIVED",
      receivedByUserId: inspectorUser.id,
    });

    const item = await addShipmentItem(shipment.id, {
      productSkuId: sku.id,
      lineNumber: 1,
      supplierItemCode: "LUX-P01",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 8.5,
    });
    shipmentItemId = item.id;

    // 6. Quality Check Session
    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId: storeId,
      inspectorUserId: inspectorUser.id,
    });
    qcId = qc.id;
  });

  afterAll(async () => {
    try {
      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCI-API-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-API-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCI-API-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCI_API_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCI-API-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_QCI_API_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_QCI_API_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_QCI_API_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_QCI_API_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_QCI_API_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_QCI_API');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qci_api_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'qci_api_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_QCI_API_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_QCI_API';");
    } finally {
      await closePool();
    }
  });

  it("Scenario 1: Draft QC Nullability Allowed (saves successfully with null inspection outcomes)", async () => {
    const res = await request(app)
      .post("/api/v1/qc/items")
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        qualityCheckId: qcId,
        shipmentItemId,
        grossWeightGrams: null,
        netWeightGrams: null,
        verifiedMaterialId: null,
        verifiedPurityId: null,
        hallmarkVerified: null,
        visualInspectionPassed: null,
        damageDetected: null,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("PENDING");
    expect(res.body.hallmarkVerified).toBeNull();
    expect(res.body.visualInspectionPassed).toBeNull();
    expect(res.body.damageDetected).toBeNull();
  });

  it("Scenario 5: Unauthorized Inspection Item Modification Rejection (403 Forbidden without qc:inspect)", async () => {
    // Create draft item
    const item = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
    });

    const res = await request(app)
      .put(`/api/v1/qc/items/${item.id}`)
      .set("Authorization", `Bearer ${unauthorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        hallmarkVerified: true,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    expect(res.body.status).toBe(403);
  });

  it("Scenario 3: Pre-Approval Completeness Gate Enforcement (hallmark_verified = NULL cannot transition to APPROVED)", async () => {
    const item = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
      grossWeightGrams: 8.5,
      tareWeightGrams: 0.0,
      netWeightGrams: 8.5,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      visualInspectionPassed: true,
      damageDetected: false,
      hallmarkVerified: null, // NOT verified
    });

    const res = await request(app)
      .put(`/api/v1/qc/items/${item.id}`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        status: "APPROVED",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_APPROVAL_PREREQUISITE_FAILED");
    expect(res.body.detail).toContain("hallmark");
  });

  it("Scenario 4: Net Weight Exceeds Gross Weight Rejection", async () => {
    const item = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
      grossWeightGrams: 8.5,
      netWeightGrams: 8.5,
    });

    const res = await request(app)
      .put(`/api/v1/qc/items/${item.id}`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        status: "APPROVED",
        grossWeightGrams: 8.5,
        netWeightGrams: 10.0, // Violation: net > gross
        verifiedMaterialId: materialId,
        verifiedPurityId: purityId,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_APPROVAL_PREREQUISITE_FAILED");
    expect(res.body.detail).toContain(
      "Net precious metal weight cannot exceed gross weight",
    );
  });

  it("enforces Tier C missing laboratory scale measurement rejection", async () => {
    const item = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
      grossWeightGrams: 8.5,
      tareWeightGrams: 0.0,
      netWeightGrams: 8.5,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    const res = await request(app)
      .put(`/api/v1/qc/items/${item.id}`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        status: "APPROVED",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_MISSING_SCALE_OBSERVATION");
  });

  it("successfully approves item when all Tier B, C, and D prerequisites are satisfied", async () => {
    const item = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
      grossWeightGrams: 8.5,
      tareWeightGrams: 0.0,
      netWeightGrams: 8.5,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    // Ingest certified scale reading
    await createWeightMeasurement({
      qualityCheckId: qcId,
      qualityCheckItemId: item.id,
      balanceDeviceId: "SCALE-QCI-API-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 8.5,
      tareWeight: 0.0,
      measuredByUserId: inspectorUserId,
    });

    const res = await request(app)
      .put(`/api/v1/qc/items/${item.id}`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        status: "APPROVED",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.decisionByUserId).toBe(inspectorUserId);
    expect(res.body.decisionAt).not.toBeNull();
  });

  it("enforces Sealed Session Immutability Gate on item modifications", async () => {
    const item = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
    });

    // Seal the QC session
    await updateQualityCheck(qcId, {
      status: QualityCheckStatus.APPROVED,
    });

    const res = await request(app)
      .put(`/api/v1/qc/items/${item.id}`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        hallmarkVerified: true,
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_SESSION_SEALED");
  });
});
