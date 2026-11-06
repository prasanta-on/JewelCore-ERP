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
  createVault,
  createLocker,
  createCompartment,
  createSupplier,
  createGrn,
  createShipment,
  addShipmentItem,
  createQualityCheck,
  createQualityCheckItem,
  updateQualityCheckItem,
  createWeightMeasurement,
  birthInventoryItem,
  createRfidTag,
  assignRfidTag,
  getInventoryItemById,
} from "@jewelcore/database";
import {
  StoreType,
  MeasurementType,
  StockApprovalStatus,
  ApprovalState,
  CommercialState,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Commercial Stock Approval & Availability Gate API (FEAT-GOV-01 / INV-01)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;
  let compartmentId: string;
  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let otherOrgManagerToken: string;
  let skuId: string;
  let eligibleItemId: string;
  let unassignedItemId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE stock_approvals DISABLE TRIGGER trg_stock_approvals_immutability;",
    );
    await query(
      "DELETE FROM stock_approvals WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_API', 'ORG_STK_APPR_API_ALT'));",
    );
    await query(
      "ALTER TABLE stock_approvals ENABLE TRIGGER trg_stock_approvals_immutability;",
    );

    await query(
      "DELETE FROM rfid_tag_assignments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_API', 'ORG_STK_APPR_API_ALT'));",
    );
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_API', 'ORG_STK_APPR_API_ALT'));",
    );

    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_API', 'ORG_STK_APPR_API_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );

    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_API', 'ORG_STK_APPR_API_ALT'));",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id = 'SCL-STK-APPR-API-01';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_STK_APPR_API_%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_STK_APPR_API_%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number = 'SHP-STK-APPR-API-001');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number = 'SHP-STK-APPR-API-001';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number = 'GRN-STK-APPR-API-001';",
    );
    await query("DELETE FROM suppliers WHERE code = 'SUP_STK_APPR_API_01';");
    await query(
      "DELETE FROM product_skus WHERE sku_code = 'SKU-STK-APPR-API-TIARA-01';",
    );
    await query(
      "DELETE FROM products WHERE product_code = 'PRD_STK_APPR_API_TIARA';",
    );
    await query("DELETE FROM purities WHERE code = 'PUR_STK_APPR_API_950';");
    await query("DELETE FROM materials WHERE code = 'MAT_STK_APPR_API_PLAT';");
    await query(
      "DELETE FROM categories WHERE code = 'CAT_STK_APPR_API_TIARA';",
    );
    await query("DELETE FROM compartments WHERE code = 'CMP_STK_APPR_API_01';");
    await query("DELETE FROM lockers WHERE code = 'LCK_STK_APPR_API_01';");
    await query("DELETE FROM vaults WHERE code = 'VLT_STK_APPR_API_01';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_STK_APPR_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_API', 'ORG_STK_APPR_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'stk_appr_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'stk_appr_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_STK_APPR_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_STK_APPR_API', 'ORG_STK_APPR_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_STK_APPR_API",
      name: "Stock Approval Enterprise API",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_STK_APPR_API_ALT",
      name: "Stock Approval Alt Enterprise API",
    });
    otherOrgId = altOrg.id;

    // 2. Stores & Compartments
    const store = await createStore({
      organizationId: orgId,
      code: "STORE_STK_APPR_API_01",
      name: "Flagship Luxury Boutique",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_STK_APPR_API_02",
      name: "Secondary Boutique",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    const vault = await createVault({
      storeId,
      code: "VLT_STK_APPR_API_01",
      name: "Showroom Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_STK_APPR_API_01",
      name: "High Value Locker",
      lockerNumber: "HVL-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_STK_APPR_API_01",
      name: "Safe Box A1",
      compartmentNumber: "SB-A1",
    });
    compartmentId = comp.id;

    // 3. Manager User (STORE_MANAGER with stock:approve and stock:view)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "stk_appr_api_mgr@jewelcore.local",
      firstName: "Store",
      lastName: "Director",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    managerUserId = managerUser.id;

    const managerOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: managerUserId,
      isDefault: true,
    });

    await createStoreMembership({
      storeId,
      organizationMembershipId: managerOrgMem.id,
      isDefault: true,
    });

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(managerUserId, managerRole.id);
    }

    managerToken = await signAccessToken({
      userId: managerUserId,
      email: managerUser.email,
      orgId: orgId,
    });

    // 4. Sales Associate (SALES_ASSOCIATE with stock:view only)
    const associateUser = await createUser({
      organizationId: orgId,
      email: "stk_appr_api_assoc@jewelcore.local",
      firstName: "Sales",
      lastName: "Consultant",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    associateUserId = associateUser.id;

    const associateOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: associateUserId,
      isDefault: true,
    });

    await createStoreMembership({
      storeId,
      organizationMembershipId: associateOrgMem.id,
      isDefault: true,
    });

    const associateRole = await getRoleByCode("SALES_ASSOCIATE");
    if (associateRole) {
      await assignRoleToUser(associateUserId, associateRole.id);
    }

    associateToken = await signAccessToken({
      userId: associateUserId,
      email: associateUser.email,
      orgId: orgId,
    });

    // 5. Alt Org Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "stk_appr_api_alt@jewelcore.local",
      firstName: "Alt",
      lastName: "Manager",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const altOrgMem = await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: altManagerUser.id,
      isDefault: true,
    });

    const altRole = await getRoleByCode("STORE_MANAGER");
    if (altRole) {
      await assignRoleToUser(altManagerUser.id, altRole.id);
    }

    otherOrgManagerToken = await signAccessToken({
      userId: altManagerUser.id,
      email: altManagerUser.email,
      orgId: otherOrgId,
    });

    // 6. Master Data & Procurement
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_STK_APPR_API_TIARA",
      name: "Tiaras",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_STK_APPR_API_PLAT",
      name: "Platinum",
      baseMetalType: "PLATINUM",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_STK_APPR_API_950",
      name: "PT950",
      purityPercentage: 95.0,
      purityRatio: 0.95,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_STK_APPR_API_TIARA",
      name: "Diamond Royal Tiara",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-STK-APPR-API-TIARA-01",
      name: "Royal Diamond Tiara",
      variantName: "Masterpiece",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 120.0,
      targetMetalWeightGrams: 110.0,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_STK_APPR_API_01",
      name: "Geneva Master Ateliers",
    });

    const grn = await createGrn({
      organizationId: orgId,
      supplierId: supplier.id,
      storeId,
      grnNumber: "GRN-STK-APPR-API-001",
      createdByUserId: managerUserId,
      receivedByUserId: managerUserId,
      totalLinesExpected: 2,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHP-STK-APPR-API-001",
      receivedByUserId: managerUserId,
      receivedAt: new Date(),
    });

    const shipItem1 = await addShipmentItem(shipment.id, {
      productSkuId: skuId,
      lineNumber: 1,
      declaredPieceCount: 1,
      receivedPieceCount: 1,
      declaredGrossWeightGrams: 120.0,
    });

    const shipItem2 = await addShipmentItem(shipment.id, {
      productSkuId: skuId,
      lineNumber: 2,
      declaredPieceCount: 1,
      receivedPieceCount: 1,
      declaredGrossWeightGrams: 120.0,
    });

    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId,
      inspectorUserId: managerUserId,
      inspectionType: "INITIAL_INTAKE",
    });

    // Eligible item 1
    const qcItem1 = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem1.id,
      verifiedMaterialId: mat.id,
      verifiedPurityId: pur.id,
      itemSequenceNumber: 1,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem1.id,
      balanceDeviceId: "SCL-STK-APPR-API-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 120.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: managerUserId,
    });

    await updateQualityCheckItem(
      qcItem1.id,
      {
        grossWeightGrams: 120.0,
        tareWeightGrams: 0,
        netWeightGrams: 110.0,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: managerUserId },
    );

    const item1 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem1.id,
        initialCompartmentId: compartmentId,
      },
      orgId,
    );
    eligibleItemId = item1.id;

    // Piece 2 without tag
    const qcItem2 = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem2.id,
      verifiedMaterialId: mat.id,
      verifiedPurityId: pur.id,
      itemSequenceNumber: 2,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem2.id,
      balanceDeviceId: "SCL-STK-APPR-API-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 120.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: managerUserId,
    });

    await updateQualityCheckItem(
      qcItem2.id,
      {
        grossWeightGrams: 120.0,
        tareWeightGrams: 0,
        netWeightGrams: 110.0,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: managerUserId },
    );

    const item2 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem2.id,
        initialCompartmentId: compartmentId,
      },
      orgId,
    );
    unassignedItemId = item2.id;

    // Tag and bind eligible item 1
    const tag = await createRfidTag({
      organizationId: orgId,
      epc: "E280116060000204781B0001",
      tid: "E28011600000000000000002",
    });

    await assignRfidTag(
      {
        inventoryItemId: eligibleItemId,
        rfidTagId: tag.id,
        organizationId: orgId,
      },
      { userId: managerUserId },
    );
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("authorizes stock approval and unlocks commercial availability (Scenario 1, INV-01)", async () => {
    const res = await request(app)
      .post("/api/v1/governance/stock-approvals")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        inventoryItemId: eligibleItemId,
        approvalStatus: StockApprovalStatus.APPROVED,
        approvalNotes:
          "Exceptional craftsmanship. Certified ready for retail sale.",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.inventoryItemId).toBe(eligibleItemId);
    expect(res.body.data.approvalStatus).toBe(StockApprovalStatus.APPROVED);
    expect(res.body.data.approverUserId).toBe(managerUserId);

    // Verify parent piece state in DB
    const item = await getInventoryItemById(eligibleItemId);
    expect(item!.approvalState).toBe(ApprovalState.APPROVED);
    expect(item!.commercialState).toBe(CommercialState.AVAILABLE_FOR_SALE);
  });

  it("rejects approval when piece lacks active RFID tag (Scenario 2, INV-01)", async () => {
    const res = await request(app)
      .post("/api/v1/governance/stock-approvals")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        inventoryItemId: unassignedItemId,
        approvalStatus: StockApprovalStatus.APPROVED,
        approvalNotes: "Trying to approve un-tagged piece",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_INV_01_TAG_REQUIRED");
    expect(res.body.detail).toContain("without an active RFID tag");
  });

  it("rejects approval when piece is not in vault or display custody (Scenario 3, INV-01)", async () => {
    // Temporarily mutate custody_state to IN_TRANSIT
    await query(
      `UPDATE inventory_items SET custody_state = 'IN_TRANSIT' WHERE id = $1`,
      [eligibleItemId],
    );

    const res = await request(app)
      .post("/api/v1/governance/stock-approvals")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        inventoryItemId: eligibleItemId,
        approvalStatus: StockApprovalStatus.APPROVED,
        approvalNotes: "Attempting approval in transit",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_INV_01_INVALID_CUSTODY_STATE");

    // Restore to IN_VAULT
    await query(
      `UPDATE inventory_items SET custody_state = 'IN_VAULT' WHERE id = $1`,
      [eligibleItemId],
    );
  });

  it("rejects approval attempt from user lacking stock:approve permission (Scenario 4)", async () => {
    const res = await request(app)
      .post("/api/v1/governance/stock-approvals")
      .set("Authorization", `Bearer ${associateToken}`)
      .set("x-store-id", storeId)
      .send({
        inventoryItemId: eligibleItemId,
        approvalStatus: StockApprovalStatus.APPROVED,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("authorizes managerial rejection and locks piece in UNREADY state", async () => {
    const res = await request(app)
      .post("/api/v1/governance/stock-approvals")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        inventoryItemId: eligibleItemId,
        approvalStatus: StockApprovalStatus.REJECTED,
        rejectionReasonCode: "AESTHETIC_DEFECT",
        approvalNotes:
          "Setting claw requires re-tightening before showroom display.",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.approvalStatus).toBe(StockApprovalStatus.REJECTED);
    expect(res.body.data.rejectionReasonCode).toBe("AESTHETIC_DEFECT");

    // Verify parent piece state transitioned to REJECTED and UNREADY
    const item = await getInventoryItemById(eligibleItemId);
    expect(item!.approvalState).toBe(ApprovalState.REJECTED);
    expect(item!.commercialState).toBe(CommercialState.UNREADY);
  });

  it("enforces multi-store context boundary (INV-11)", async () => {
    const res = await request(app)
      .post("/api/v1/governance/stock-approvals")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", otherStoreId) // Mismatched store ID
      .send({
        inventoryItemId: eligibleItemId,
        approvalStatus: StockApprovalStatus.APPROVED,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app)
      .post("/api/v1/governance/stock-approvals")
      .send({
        inventoryItemId: eligibleItemId,
        approvalStatus: StockApprovalStatus.APPROVED,
      });

    expect(res.status).toBe(401);
  });

  it("retrieves stock approval by ID, latest approval for item, and filtered list", async () => {
    // 1. Get latest approval for item
    const latestRes = await request(app)
      .get(`/api/v1/governance/items/${eligibleItemId}/latest-approval`)
      .set("Authorization", `Bearer ${associateToken}`);

    expect(latestRes.status).toBe(200);
    expect(latestRes.body.success).toBe(true);
    const latestApproval = latestRes.body.data;
    expect(latestApproval.inventoryItemId).toBe(eligibleItemId);
    expect(latestApproval.approvalStatus).toBe(StockApprovalStatus.REJECTED);

    // 2. Get approval by ID
    const byIdRes = await request(app)
      .get(`/api/v1/governance/stock-approvals/${latestApproval.id}`)
      .set("Authorization", `Bearer ${associateToken}`);

    expect(byIdRes.status).toBe(200);
    expect(byIdRes.body.data.id).toBe(latestApproval.id);

    // 3. List approvals with query filters
    const listRes = await request(app)
      .get("/api/v1/governance/stock-approvals")
      .set("Authorization", `Bearer ${associateToken}`)
      .query({
        inventoryItemId: eligibleItemId,
        approvalStatus: StockApprovalStatus.APPROVED,
      });

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].approvalStatus).toBe(
      StockApprovalStatus.APPROVED,
    );
    expect(listRes.body.meta.count).toBe(1);

    // 4. Non-existent ID returns 404
    const notFoundRes = await request(app)
      .get(
        "/api/v1/governance/stock-approvals/0192e301-0000-7000-8000-000000000999",
      )
      .set("Authorization", `Bearer ${associateToken}`);

    expect(notFoundRes.status).toBe(404);

    // 5. Cross-tenant isolation
    const crossTenantRes = await request(app)
      .get(`/api/v1/governance/stock-approvals/${latestApproval.id}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`);

    expect(crossTenantRes.status).toBe(404);
  });
});
