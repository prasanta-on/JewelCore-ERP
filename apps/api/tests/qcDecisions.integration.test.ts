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
  createRole,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
  assignPermissionsToRole,
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
  updateQualityCheckItem,
  createWeightMeasurement,
  updateQualityCheck,
  getPermissionByCode,
} from "@jewelcore/database";
import {
  StoreType,
  QualityCheckStatus,
  MeasurementType,
  QualityDecisionType,
  QualityCheckItemStatus,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Quality Decision Authorization & Damage-Waiver Protocol API (FEAT-QC-06 / INV-09, INV-18 Tier D, Gap 3)", () => {
  const app = createApp();

  let orgId: string;
  let storeId: string;
  let altStoreId: string;
  let materialId: string;
  let purityId: string;
  let skuId: string;
  let qcId: string;
  let lineCounter = 1;

  let supervisorToken: string;
  let supervisorUserId: string;
  let inspectorToken: string;
  let inspectorUserId: string;
  let viewerToken: string;
  let shipmentId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_API_%';",
    );
    await query(
      "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCD-API-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-API-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCD-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCD_API_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCD-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_QCD_API_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_QCD_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_QCD_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_QCD_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_QCD_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_QCD_API');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qcd_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'qcd_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_QCD_API_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_QCD_API';");

    // 1. Organization & Stores
    const org = await createOrganization({
      code: "ORG_QCD_API",
      name: "QC Decision API Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_QCD_API_001",
      name: "QC Receiving Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_QCD_API_002",
      name: "Secondary Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    altStoreId = altStore.id;

    // 2. Supervisor User (STORE_MANAGER with qc:approve and qc:waiver)
    const supervisorUser = await createUser({
      organizationId: orgId,
      email: "qcd_api_supervisor@jewelcore.local",
      firstName: "Store",
      lastName: "Supervisor",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    supervisorUserId = supervisorUser.id;

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(supervisorUser.id, managerRole.id);
    }
    const supOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: supervisorUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: storeId,
      organizationMembershipId: supOrgMem.id,
      isDefault: true,
    });

    supervisorToken = await signAccessToken({
      userId: supervisorUser.id,
      email: supervisorUser.email,
      orgId: orgId,
    });

    // 3. Bench Inspector User (Custom role with qc:approve, qc:inspect, qc:measure, qc:view, but WITHOUT qc:waiver)
    const inspectorUser = await createUser({
      organizationId: orgId,
      email: "qcd_api_inspector@jewelcore.local",
      firstName: "Bench",
      lastName: "Inspector",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    inspectorUserId = inspectorUser.id;

    const inspectorRole = await createRole({
      organizationId: orgId,
      code: "ROLE_QCD_BENCH_INSPECTOR",
      name: "Bench QC Inspector",
    });

    // Assign qc:approve, qc:inspect, qc:measure, qc:view (NO qc:waiver)
    await assignPermissionsToRole(inspectorRole.id, [
      "qc:approve",
      "qc:inspect",
      "qc:measure",
      "qc:view",
    ]);

    await assignRoleToUser(inspectorUser.id, inspectorRole.id);

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

    // 4. Viewer User (SALES_ASSOCIATE lacking qc:approve)
    const viewerUser = await createUser({
      organizationId: orgId,
      email: "qcd_api_viewer@jewelcore.local",
      firstName: "Sales",
      lastName: "Viewer",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    if (salesRole) {
      await assignRoleToUser(viewerUser.id, salesRole.id);
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

    // 5. Taxonomy & Procurement Fixtures
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_QCD_API_CHAINS",
      name: "Diamond Chains",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_QCD_API_PLATINUM",
      name: "Platinum",
      baseMetalType: "PLATINUM",
      isPrecious: true,
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_QCD_API_PT950",
      name: "Platinum 950",
      purityPercentage: 95.0,
      purityRatio: 0.95,
      isHallmarkPurity: true,
    });
    purityId = purity.id;

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_QCD_API_001",
      name: "Platinum Tennis Necklace",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-QCD-API-001",
      name: "Platinum Tennis Necklace 45cm",
      variantName: "Platinum Tennis Necklace 45cm",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 35.0,
      targetMetalWeightGrams: 35.0,
    });
    skuId = sku.id;

    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_QCD_API_01",
      name: "Geneva Vault Refiners",
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-QCD-API-001",
      createdByUserId: supervisorUserId,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-QCD-API-001",
      carrierName: "Malca-Amit",
      trackingNumber: "TRK-QCD-API-001",
      declaredPackageCount: 1,
      grossPackageWeightGrams: 100.0,
      receivedByUserId: supervisorUserId,
    });
    shipmentId = shipment.id;

    await query("UPDATE shipments SET status = 'RECEIVED' WHERE id = $1", [
      shipmentId,
    ]);

    const qc = await createQualityCheck({
      shipmentId,
      storeId,
      inspectorUserId: supervisorUserId,
    });
    qcId = qc.id;
  });

  afterAll(async () => {
    try {
      await query(
        "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
      );
      await query(
        "DELETE FROM quality_decisions WHERE quality_check_id = $1;",
        [qcId],
      );
      await query(
        "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
      );

      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCD-API-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id = $1);",
        [qcId],
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id = $1;",
        [qcId],
      );
      await query("DELETE FROM quality_checks WHERE id = $1;", [qcId]);
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-API-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-API-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCD-API-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCD_API_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCD-API-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_QCD_API_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_QCD_API_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_QCD_API_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_QCD_API_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_QCD_API_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_QCD_API');",
      );
      await query(
        "DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code = 'ROLE_QCD_BENCH_INSPECTOR');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'qcd_api_%@jewelcore.local');",
      );
      await query("DELETE FROM roles WHERE code = 'ROLE_QCD_BENCH_INSPECTOR';");
      await query(
        "DELETE FROM users WHERE email LIKE 'qcd_api_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_QCD_API_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_QCD_API';");
    } finally {
      await closePool();
    }
  });

  async function createPieceFixture(options: {
    declaredGrossWeightGrams?: number;
    measuredGrossWeightGrams?: number;
    damageDetected?: boolean;
    damageNotes?: string;
  }) {
    const declaredGross = options.declaredGrossWeightGrams ?? 35.0;
    const measuredGross = options.measuredGrossWeightGrams ?? 35.0;
    const lineNum = lineCounter++;

    const shipItem = await addShipmentItem(shipmentId, {
      productSkuId: skuId,
      lineNumber: lineNum,
      supplierItemCode: `SUP-ITEM-QCD-API-${lineNum}`,
      declaredPieceCount: 1,
      declaredGrossWeightGrams: declaredGross,
      declaredNetWeightGrams: declaredGross,
    });

    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      itemSequenceNumber: lineNum,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCD-API-METTLER-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: measuredGross,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: supervisorUserId,
    });

    await updateQualityCheckItem(
      qcItem.id,
      {
        grossWeightGrams: measuredGross,
        tareWeightGrams: 0,
        netWeightGrams: measuredGross,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: options.damageDetected ?? false,
        damageNotes: options.damageNotes,
      },
      { userId: supervisorUserId },
    );

    return { shipItemId: shipItem.id, qcItemId: qcItem.id };
  }

  it("Scenario 1: POST /api/v1/qc/items/:id/decisions approves clean piece with 201 Created", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: false,
    });

    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "APPROVED",
        reasonCode: "DEC_API_ROUTINE_PASS",
        notes: "Passed metrology, hallmark, and visual inspection",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.qualityCheckItemId).toBe(qcItemId);
    expect(res.body.decision).toBe("APPROVED");
    expect(res.body.reasonCode).toBe("DEC_API_ROUTINE_PASS");
    expect(res.body.decidedByUserId).toBe(inspectorUserId);
    expect(res.body.decidedAt).toBeDefined();
  });

  it("Scenario 2: POST /api/v1/qc/items/:id/decisions authorizes supervisor damage waiver (201 Created / Gap 3)", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: true,
      damageNotes: "Minor surface blemish on clasp tongue",
    });

    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "APPROVED",
        reasonCode: "DAMAGE_WAIVER",
        notes: "Supervisor approved minor clasp blemish for local burnishing",
      });

    expect(res.status).toBe(201);
    expect(res.body.decision).toBe("APPROVED");
    expect(res.body.reasonCode).toBe("DAMAGE_WAIVER");
    expect(res.body.notes).toBe(
      "Supervisor approved minor clasp blemish for local burnishing",
    );
  });

  it("Scenario 3: POST /api/v1/qc/items/:id/decisions rejects non-supervisor damage waiver with 403 ERR_SUPERVISOR_WAIVER_REQUIRED", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: true,
      damageNotes: "Deep gouge across link",
    });

    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "APPROVED",
        reasonCode: "DAMAGE_WAIVER",
        notes:
          "Inspector trying to waive severe defect without supervisor role",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_SUPERVISOR_WAIVER_REQUIRED");
  });

  it("Scenario 4: POST /api/v1/qc/items/:id/decisions rejects missing waiver notes with 422 ERR_DAMAGE_WAIVER_REQUIRED", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: true,
      damageNotes: "Loose hinge",
    });

    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "APPROVED",
        reasonCode: "DAMAGE_WAIVER",
        notes: "",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_DAMAGE_WAIVER_REQUIRED");
  });

  it("Scenario 5: POST /api/v1/qc/items/:id/decisions creates REJECTED decision (201 Created)", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: true,
      damageNotes: "Severely deformed link",
    });

    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "REJECTED",
        reasonCode: "DEC_API_REJECT_DEFECT",
        notes: "Piece failed structural stability. Returning lot to supplier.",
      });

    expect(res.status).toBe(201);
    expect(res.body.decision).toBe("REJECTED");
    expect(res.body.reasonCode).toBe("DEC_API_REJECT_DEFECT");
  });

  it("Scenario 6: POST /api/v1/qc/items/:id/decisions creates ESCALATED_FOR_REINSPECTION decision (201 Created)", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: false,
    });

    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "ESCALATED_FOR_REINSPECTION",
        reasonCode: "DEC_API_ESCALATE_XRF",
        notes: "Requesting XRF assay for trace alloy composition",
      });

    expect(res.status).toBe(201);
    expect(res.body.decision).toBe("ESCALATED_FOR_REINSPECTION");
    expect(res.body.reasonCode).toBe("DEC_API_ESCALATE_XRF");
  });

  it("Scenario 7: POST /api/v1/qc/items/:id/decisions rejects user lacking qc:approve with 403 ERR_INSUFFICIENT_PERMISSIONS", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: false,
    });

    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "APPROVED",
        reasonCode: "UNAUTHORIZED_ATTEMPT",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("Scenario 8: POST /api/v1/qc/items/:id/decisions enforces multi-store isolation with 403 ERR_STORE_ACCESS_DENIED (INV-11)", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: false,
    });

    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .set("X-Store-Id", altStoreId)
      .send({
        decision: "APPROVED",
        reasonCode: "CROSS_STORE_ATTEMPT",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
  });

  it("Scenario 9: POST /api/v1/qc/items/:id/decisions rejects decision on sealed session with 422 ERR_SESSION_SEALED", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: false,
    });

    // Temporarily seal the session
    await query(
      "UPDATE quality_checks SET status = 'FINALIZED' WHERE id = $1",
      [qcId],
    );

    try {
      const res = await request(app)
        .post(`/api/v1/qc/items/${qcItemId}/decisions`)
        .set("Authorization", `Bearer ${supervisorToken}`)
        .set("X-Store-Id", storeId)
        .send({
          decision: "APPROVED",
          reasonCode: "LATE_DECISION",
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_SESSION_SEALED");
    } finally {
      // Unseal for subsequent tests
      await query(
        "UPDATE quality_checks SET status = 'IN_PROGRESS' WHERE id = $1",
        [qcId],
      );
    }
  });

  it("Scenario 10: GET /api/v1/qc/items/:id/decisions retrieves decision history (200 OK)", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 35.0,
      measuredGrossWeightGrams: 35.0,
      damageDetected: false,
    });

    // Post an escalation then an approval
    await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "ESCALATED_FOR_REINSPECTION",
        reasonCode: "DEC_API_HISTORY_ESCALATE",
        notes: "First decision note",
      });

    await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "APPROVED",
        reasonCode: "DEC_API_HISTORY_APPROVE",
        notes: "Final decision note",
      });

    const res = await request(app)
      .get(`/api/v1/qc/items/${qcItemId}/decisions`)
      .set("Authorization", `Bearer ${inspectorToken}`)
      .set("X-Store-Id", storeId);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0].decision).toBe("APPROVED");
    expect(res.body[1].decision).toBe("ESCALATED_FOR_REINSPECTION");
  });

  it("Scenario 11: POST & GET /api/v1/qc/checks/:id/decisions records and lists session-level decisions", async () => {
    const postRes = await request(app)
      .post(`/api/v1/qc/checks/${qcId}/decisions`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .set("X-Store-Id", storeId)
      .send({
        decision: "APPROVED",
        reasonCode: "DEC_API_SESSION_COMPLETE",
        notes: "Entire shipment lot passed quality clearance",
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body.qualityCheckId).toBe(qcId);
    expect(postRes.body.qualityCheckItemId).toBeNull();
    expect(postRes.body.decision).toBe("APPROVED");

    const getRes = await request(app)
      .get(`/api/v1/qc/checks/${qcId}/decisions`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .set("X-Store-Id", storeId);

    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body)).toBe(true);
    expect(getRes.body.length).toBeGreaterThanOrEqual(1);
    const sessionDec = getRes.body.find((d: any) => d.id === postRes.body.id);
    expect(sessionDec).toBeDefined();
    expect(sessionDec.decision).toBe("APPROVED");
  });
});
