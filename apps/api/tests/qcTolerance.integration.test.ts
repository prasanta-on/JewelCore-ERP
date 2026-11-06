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

describe("Intake Weight Tolerance Gate API (FEAT-QC-05 / INV-12)", () => {
  const app = createApp();

  let orgId: string;
  let storeId: string;
  let altStoreId: string;
  let materialId: string;
  let purityId: string;
  let skuId: string;
  let qcId: string;
  let inspectorUserId: string;
  let adminUserId: string;
  let inspectorToken: string;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCT-API-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCT-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCT_API_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCT-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_QCT_API_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_QCT_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_QCT_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_QCT_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_QCT_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_QCT_API');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qct_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'qct_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_QCT_API_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_QCT_API';");

    // 1. Organization & Stores
    const org = await createOrganization({
      code: "ORG_QCT_API",
      name: "QC Tolerance API Test Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_QCT_API_001",
      name: "Intake Metrology Bay",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_QCT_API_002",
      name: "Alternative Showroom",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    altStoreId = altStore.id;

    // 2. Standard QC Inspector (STORE_MANAGER with qc:inspect, qc:measure, qc:view, NO qc:tolerance:admin)
    const inspectorUser = await createUser({
      organizationId: orgId,
      email: "qct_api_inspector@jewelcore.local",
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
    const inspOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: inspectorUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: storeId,
      organizationMembershipId: inspOrgMem.id,
      isDefault: true,
    });

    inspectorToken = await signAccessToken({
      userId: inspectorUser.id,
      email: inspectorUser.email,
      orgId: orgId,
    });

    // 3. System Admin User (SYSTEM_ADMIN with qc:tolerance:admin)
    const adminUser = await createUser({
      organizationId: orgId,
      email: "qct_api_admin@jewelcore.local",
      firstName: "System",
      lastName: "Admin",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    adminUserId = adminUser.id;

    const adminRole = await getRoleByCode("SYSTEM_ADMIN");
    if (adminRole) {
      await assignRoleToUser(adminUser.id, adminRole.id);
    }
    const adminOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: adminUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: storeId,
      organizationMembershipId: adminOrgMem.id,
      isDefault: true,
    });

    adminToken = await signAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      orgId: orgId,
    });

    // 4. Read-Only Viewer (VIEWER lacking qc:inspect)
    const viewerUser = await createUser({
      organizationId: orgId,
      email: "qct_api_viewer@jewelcore.local",
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

    viewerToken = await signAccessToken({
      userId: viewerUser.id,
      email: viewerUser.email,
      orgId: orgId,
    });

    // 5. Taxonomy: Material, Purity, Category, Product, SKU
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_QCT_API_BANGLES",
      name: "Gold Bangles",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_QCT_API_GOLD",
      name: "22K Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_QCT_API_916",
      name: "916 Hallmarked",
      purityPercentage: 91.6667,
      purityRatio: 0.9167,
      isHallmarkPurity: true,
    });
    purityId = purity.id;

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_QCT_API_KADA",
      name: "Traditional Kada",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-QCT-API-KADA-22K",
      variantName: "Traditional Kada 22K 60mm",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 25.0,
      targetMetalWeightGrams: 25.0,
    });
    skuId = sku.id;

    // 6. Supplier, GRN, Shipment
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_QCT_API_ROYAL",
      name: "Royal Bullion Refiners",
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-QCT-API-001",
      createdByUserId: inspectorUserId,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-QCT-API-001",
      carrierName: "Malca-Amit",
      trackingNumber: "TRK-QCT-API-001",
      declaredPackageCount: 1,
      grossPackageWeightGrams: 250.0,
      receivedByUserId: inspectorUserId,
    });

    await query("UPDATE shipments SET status = 'RECEIVED' WHERE id = $1", [
      shipment.id,
    ]);

    // 7. QC Inspection Session
    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId,
      inspectorUserId: inspectorUserId,
    });
    qcId = qc.id;
  });

  afterAll(async () => {
    try {
      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCT-API-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-API-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCT-API-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCT_API_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCT-API-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_QCT_API_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_QCT_API_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_QCT_API_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_QCT_API_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_QCT_API_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_QCT_API');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qct_api_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'qct_api_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_QCT_API_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_QCT_API';");
    } finally {
      await closePool();
    }
  });

  it("Scenario 1: Within-Tolerance Automatic Approval Clearance (Delta = +0.0100g, Tolerance = ±0.0200g)", async () => {
    // 1. Create shipment item with declared weight 10.0000g
    const shipmentRes = await query<{ id: string }>(
      "SELECT id FROM shipments WHERE shipment_number = 'SHIP-QCT-API-001'",
    );
    const shipItem = await addShipmentItem(shipmentRes.rows[0].id, {
      productSkuId: skuId,
      lineNumber: 101,
      supplierItemCode: "KADA-LINE-101",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.0,
      declaredNetWeightGrams: 10.0,
    });

    // 2. Create QC item with measured gross weight 10.0100g
    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 101,
      grossWeightGrams: 10.01,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.01,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-API-001",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.01,
      measuredByUserId: inspectorUserId,
    });

    // 3. POST /api/v1/qc/items/:id/tolerance-check
    const evalRes = await request(app)
      .post(`/api/v1/qc/items/${qcItem.id}/tolerance-check`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", storeId)
      .send();

    expect(evalRes.status).toBe(200);
    expect(evalRes.body.isWithinTolerance).toBe(true);
    expect(evalRes.body.declaredGrossWeightGrams).toBe(10.0);
    expect(evalRes.body.measuredGrossWeightGrams).toBe(10.01);
    expect(evalRes.body.varianceDeltaGrams).toBe(0.01);
    expect(evalRes.body.allowedToleranceGrams).toBe(0.02);
    expect(evalRes.body.reconciliationStatus).toBe("MATCHED");

    // 4. Transition to APPROVED succeeds
    const approveRes = await request(app)
      .put(`/api/v1/qc/items/${qcItem.id}`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        status: "APPROVED",
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("APPROVED");
  });

  it("Scenario 2: Out-of-Tolerance Discrepancy Escrow (Delta = +0.0800g, Tolerance = ±0.0200g)", async () => {
    // 1. Create shipment item with declared weight 10.0000g
    const shipmentRes = await query<{ id: string }>(
      "SELECT id FROM shipments WHERE shipment_number = 'SHIP-QCT-API-001'",
    );
    const shipItem = await addShipmentItem(shipmentRes.rows[0].id, {
      productSkuId: skuId,
      lineNumber: 102,
      supplierItemCode: "KADA-LINE-102",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.0,
      declaredNetWeightGrams: 10.0,
    });

    // 2. Create QC item with measured gross weight 10.0800g (delta = +0.0800g)
    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 102,
      grossWeightGrams: 10.08,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.08,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-API-002",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.08,
      measuredByUserId: inspectorUserId,
    });

    // 3. POST /api/v1/qc/items/:id/tolerance-check
    const evalRes = await request(app)
      .post(`/api/v1/qc/items/${qcItem.id}/tolerance-check`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", storeId)
      .send();

    expect(evalRes.status).toBe(200);
    expect(evalRes.body.isWithinTolerance).toBe(false);
    expect(evalRes.body.reconciliationStatus).toBe("DISCREPANCY");
    expect(evalRes.body.varianceDeltaGrams).toBe(0.08);

    // 4. Attempting approval without override is blocked (422 ERR_WEIGHT_TOLERANCE_EXCEEDED)
    const approveRes = await request(app)
      .put(`/api/v1/qc/items/${qcItem.id}`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        status: "APPROVED",
      });

    expect(approveRes.status).toBe(422);
    expect(approveRes.body.code).toBe("ERR_WEIGHT_TOLERANCE_EXCEEDED");
    expect(approveRes.body.detail).toContain("exceeds allowable tolerance");
  });

  it("Scenario 3: Missing Declared Weight Auto-Approval Rejection (Fail-Closed Protocol)", async () => {
    // 1. Create shipment item with declaredGrossWeightGrams = null
    const shipmentRes = await query<{ id: string }>(
      "SELECT id FROM shipments WHERE shipment_number = 'SHIP-QCT-API-001'",
    );
    const shipItem = await addShipmentItem(shipmentRes.rows[0].id, {
      productSkuId: skuId,
      lineNumber: 103,
      supplierItemCode: "KADA-LINE-103",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: null,
      declaredNetWeightGrams: null,
    });

    // 2. Create QC item
    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 103,
      grossWeightGrams: 10.05,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.05,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-API-003",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.05,
      measuredByUserId: inspectorUserId,
    });

    // 3. POST /api/v1/qc/items/:id/tolerance-check
    const evalRes = await request(app)
      .post(`/api/v1/qc/items/${qcItem.id}/tolerance-check`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", storeId)
      .send();

    expect(evalRes.status).toBe(200);
    expect(evalRes.body.hasDeclaredWeight).toBe(false);
    expect(evalRes.body.isWithinTolerance).toBe(false);
    expect(evalRes.body.reconciliationStatus).toBe("DISCREPANCY");

    // 4. Attempting approval without override is blocked (422 ERR_MISSING_DECLARED_WEIGHT)
    const approveRes = await request(app)
      .put(`/api/v1/qc/items/${qcItem.id}`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        status: "APPROVED",
      });

    expect(approveRes.status).toBe(422);
    expect(approveRes.body.code).toBe("ERR_MISSING_DECLARED_WEIGHT");
    expect(approveRes.body.detail).toContain("missing declared gross weight");
  });

  it("Scenario 4: Unauthorized Tolerance Parameter Override Rejection", async () => {
    // 1. Create out-of-tolerance piece
    const shipmentRes = await query<{ id: string }>(
      "SELECT id FROM shipments WHERE shipment_number = 'SHIP-QCT-API-001'",
    );
    const shipItem = await addShipmentItem(shipmentRes.rows[0].id, {
      productSkuId: skuId,
      lineNumber: 104,
      supplierItemCode: "KADA-LINE-104",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.0,
      declaredNetWeightGrams: 10.0,
    });

    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 104,
      grossWeightGrams: 10.2,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.2,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-API-004",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.2,
      measuredByUserId: inspectorUserId,
    });

    // Non-admin inspector attempts overrideTolerance: true (403 ERR_INSUFFICIENT_PERMISSIONS)
    const overrideRes = await request(app)
      .put(`/api/v1/qc/items/${qcItem.id}`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        status: "APPROVED",
        overrideTolerance: true,
        toleranceOverrideReason: "Inspector bypass attempt",
      });

    expect(overrideRes.status).toBe(403);
    expect(overrideRes.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");

    // Non-admin inspector attempts custom tolerance limit (403 ERR_INSUFFICIENT_PERMISSIONS)
    const customLimitRes = await request(app)
      .post(`/api/v1/qc/items/${qcItem.id}/tolerance-check`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        absoluteToleranceGrams: 0.5,
      });

    expect(customLimitRes.status).toBe(403);
    expect(customLimitRes.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("Scenario 5: Authorized Admin with qc:tolerance:admin Permission Overrides and Approves", async () => {
    // Retrieve piece 104
    const itemRes = await query<{ id: string }>(
      "SELECT id FROM quality_check_items WHERE item_sequence_number = 104 AND quality_check_id = $1",
      [qcId],
    );
    const qcItemId = itemRes.rows[0].id;

    // Admin user invokes approval with override
    const approveRes = await request(app)
      .put(`/api/v1/qc/items/${qcItemId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("x-store-id", storeId)
      .send({
        status: "APPROVED",
        overrideTolerance: true,
        toleranceOverrideReason:
          "Supplier calibration variance authorized by Admin",
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("APPROVED");
  });

  it("Scenario 6: Multi-Store Isolation Rejection (INV-11)", async () => {
    const itemRes = await query<{ id: string }>(
      "SELECT id FROM quality_check_items WHERE item_sequence_number = 101 AND quality_check_id = $1",
      [qcId],
    );
    const qcItemId = itemRes.rows[0].id;

    // Call tolerance check with alternative store header
    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/tolerance-check`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", altStoreId)
      .send();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
  });

  it("Scenario 7: Sealed Session Immutability Gate Rejection (ERR_SESSION_SEALED)", async () => {
    // 1. Create fresh shipment and seal session
    const shipmentRes = await query<{ id: string }>(
      "SELECT id FROM shipments WHERE shipment_number = 'SHIP-QCT-API-001'",
    );
    const shipItem = await addShipmentItem(shipmentRes.rows[0].id, {
      productSkuId: skuId,
      lineNumber: 201,
      supplierItemCode: "KADA-LINE-201",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.0,
      declaredNetWeightGrams: 10.0,
    });

    const sealedQc = await createQualityCheck({
      shipmentId: shipmentRes.rows[0].id,
      storeId,
      inspectorUserId: inspectorUserId,
    });

    const qcItem = await createQualityCheckItem({
      qualityCheckId: sealedQc.id,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 201,
      grossWeightGrams: 10.01,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.01,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-API-005",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.01,
      measuredByUserId: inspectorUserId,
    });

    // Finalize / seal session
    await updateQualityCheck(sealedQc.id, {
      status: QualityCheckStatus.FINALIZED,
    });

    // Attempt tolerance check on sealed session item
    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItem.id}/tolerance-check`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("x-store-id", storeId)
      .send();

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_SESSION_SEALED");
  });
});
