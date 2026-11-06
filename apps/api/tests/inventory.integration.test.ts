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
  createVault,
  createLocker,
  createCompartment,
} from "@jewelcore/database";
import {
  StoreType,
  MeasurementType,
  QualityState,
  ApprovalState,
  CustodyState,
  CommercialState,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Serialized Piece Birth & Lineage Integrity API (FEAT-INV-01 / INV-14, Entity 28)", () => {
  const app = createApp();

  let orgId: string;
  let storeId: string;
  let altStoreId: string;
  let materialId: string;
  let purityId: string;
  let skuId: string;
  let batchSkuId: string;
  let supplierId: string;
  let grnId: string;
  let shipmentId: string;
  let qcId: string;
  let compartmentId: string;
  let altCompartmentId: string;
  let lineCounter = 1;

  let managerToken: string;
  let managerUserId: string;
  let viewerToken: string;
  let viewerUserId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_INV_API');",
    );
    await query(
      "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_INV_API_%';",
    );
    await query(
      "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-INV-API-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-INV-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_INV_API_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-INV-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_INV_API_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_INV_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_INV_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_INV_API_%';");
    await query("DELETE FROM compartments WHERE code LIKE 'CMP_INV_API_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'LCK_INV_API_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'VLT_INV_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_INV_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_INV_API');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'inv_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'inv_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_INV_API_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_INV_API';");

    // 1. Organization & Stores
    const org = await createOrganization({
      code: "ORG_INV_API",
      name: "Inventory API Test Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_INV_API_001",
      name: "Flagship Vault Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_INV_API_002",
      name: "Secondary Showroom Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    altStoreId = altStore.id;

    // 2. Storage hierarchy in primary store
    const vault = await createVault({
      storeId,
      code: "VLT_INV_API_01",
      name: "Main Treasury Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_INV_API_01",
      name: "High Security Locker 1",
      lockerNumber: "LCK-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_INV_API_01",
      name: "Solitaire Velvet Tray 01",
      compartmentNumber: "CMP-01",
    });
    compartmentId = comp.id;

    // Storage hierarchy in alternate store
    const altVault = await createVault({
      storeId: altStoreId,
      code: "VLT_INV_API_02",
      name: "Secondary Vault",
      vaultType: "MAIN_VAULT",
    });

    const altLocker = await createLocker({
      vaultId: altVault.id,
      storeId: altStoreId,
      code: "LCK_INV_API_02",
      name: "Secondary Locker 2",
      lockerNumber: "LCK-02",
    });

    const altComp = await createCompartment({
      lockerId: altLocker.id,
      storeId: altStoreId,
      code: "CMP_INV_API_02",
      name: "Secondary Tray 02",
      compartmentNumber: "CMP-02",
    });
    altCompartmentId = altComp.id;

    // 3. Manager User (STORE_MANAGER with inventory:create, inventory:view, vault:access)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "inv_api_manager@jewelcore.local",
      firstName: "Store",
      lastName: "Manager",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    managerUserId = managerUser.id;

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(managerUser.id, managerRole.id);
    }
    const mgrOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: managerUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: storeId,
      organizationMembershipId: mgrOrgMem.id,
      isDefault: true,
    });
    // Also member of altStoreId for testing store-context routing
    await createStoreMembership({
      storeId: altStoreId,
      organizationMembershipId: mgrOrgMem.id,
      isDefault: false,
    });

    managerToken = await signAccessToken({
      userId: managerUser.id,
      email: managerUser.email,
      orgId: orgId,
    });

    // 4. Viewer User (SALES_ASSOCIATE with inventory:view but NO inventory:create)
    const viewerUser = await createUser({
      organizationId: orgId,
      email: "inv_api_viewer@jewelcore.local",
      firstName: "Sales",
      lastName: "Associate",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    viewerUserId = viewerUser.id;

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

    // 5. Taxonomy: Material, Purity, Category, Product, SKUs
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_INV_API_RINGS",
      name: "Solitaire Engagement Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_INV_API_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_INV_API_18K",
      name: "18 Karat Yellow Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });
    purityId = purity.id;

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_INV_API_001",
      name: "Royal Solitaire Ring",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    // Serialized SKU
    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-INV-API-SER-001",
      name: "Royal Solitaire Ring 18K Yellow Gold - Size 6",
      variantName: "Size 6",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 9.25,
      targetMetalWeightGrams: 9.25,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // Batch SKU
    const batchProduct = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_INV_API_FINDINGS",
      name: "Gold Findings & Screws",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "QUANTITY_BATCH",
    });

    const batchSku = await createProductSku({
      organizationId: orgId,
      productId: batchProduct.id,
      skuCode: "SKU-INV-API-BATCH-001",
      name: "Gold Safety Friction Backs (Pack of 10)",
      variantName: "10-Pack",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 2.5,
      targetMetalWeightGrams: 2.5,
      trackingType: "QUANTITY_BATCH",
    });
    batchSkuId = batchSku.id;

    // 6. Procurement & QC Session
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_INV_API_01",
      name: "Antwerp Fine Diamonds S.A.",
    });
    supplierId = supplier.id;

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-INV-API-001",
      createdByUserId: managerUserId,
    });
    grnId = grn.id;

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-INV-API-001",
      carrierName: "Malca-Amit",
      trackingNumber: "TRK-INV-API-001",
      declaredPackageCount: 1,
      grossPackageWeightGrams: 100.0,
      receivedByUserId: managerUserId,
    });
    shipmentId = shipment.id;

    await query("UPDATE shipments SET status = 'RECEIVED' WHERE id = $1", [
      shipmentId,
    ]);

    const qc = await createQualityCheck({
      shipmentId,
      storeId,
      inspectorUserId: managerUserId,
    });
    qcId = qc.id;
  });

  afterAll(async () => {
    try {
      await query(
        "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_INV_API');",
      );
      await query(
        "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
      );
      await query(
        "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_INV_API_%';",
      );
      await query(
        "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
      );

      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-INV-API-%';",
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
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-INV-API-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_INV_API_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-INV-API-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_INV_API_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_INV_API_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_INV_API_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_INV_API_%';");
      await query("DELETE FROM compartments WHERE code LIKE 'CMP_INV_API_%';");
      await query("DELETE FROM lockers WHERE code LIKE 'LCK_INV_API_%';");
      await query("DELETE FROM vaults WHERE code LIKE 'VLT_INV_API_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_INV_API_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_INV_API');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'inv_api_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'inv_api_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_INV_API_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_INV_API';");
    } finally {
      await closePool();
    }
  });

  async function createQcPieceFixture(options?: {
    isApproved?: boolean;
    useBatchSku?: boolean;
    grossWeightGrams?: number;
    netWeightGrams?: number;
  }) {
    const isApproved = options?.isApproved ?? true;
    const targetSku = options?.useBatchSku ? batchSkuId : skuId;
    const gross = options?.grossWeightGrams ?? 9.25;
    const net = options?.netWeightGrams ?? 9.25;
    const lineNum = lineCounter++;

    const shipItem = await addShipmentItem(shipmentId, {
      productSkuId: targetSku,
      lineNumber: lineNum,
      supplierItemCode: `SUP-ITEM-INV-API-${lineNum}`,
      declaredPieceCount: 1,
      declaredGrossWeightGrams: gross,
      declaredNetWeightGrams: net,
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
      balanceDeviceId: "SCALE-INV-API-METTLER-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: gross,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: managerUserId,
    });

    const updated = await updateQualityCheckItem(
      qcItem.id,
      {
        grossWeightGrams: gross,
        tareWeightGrams: 0,
        netWeightGrams: net,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: isApproved ? "APPROVED" : "PENDING",
      },
      { userId: managerUserId },
    );

    return { shipItemId: shipItem.id, qcItemId: qcItem.id, updated };
  }

  let birthedItemId: string;
  let birthedQcItemId: string;

  describe("POST /api/v1/inventory/items/birth (Piece Birth & Lineage Integrity)", () => {
    it("successfully births a serialized inventory piece from an approved QC item (INV-14)", async () => {
      const { qcItemId } = await createQcPieceFixture({ isApproved: true });
      birthedQcItemId = qcItemId;

      const birthPayload = {
        qualityCheckItemId: qcItemId,
        serialNumber: "SN-INV-API-SOL-001",
        itemName: "Royal Solitaire Ring 18K Yellow Gold - Size 6",
        currentCompartmentId: compartmentId,
        costPriceCad: 1450.0,
        sellingPriceCad: 2899.0,
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send(birthPayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.qualityCheckItemId).toBe(qcItemId);
      expect(res.body.serialNumber).toBe("SN-INV-API-SOL-001");
      expect(res.body.itemName).toBe(
        "Royal Solitaire Ring 18K Yellow Gold - Size 6",
      );
      expect(res.body.storeId).toBe(storeId);
      expect(res.body.organizationId).toBe(orgId);
      expect(res.body.productSkuId).toBe(skuId);
      expect(res.body.purityId).toBe(purityId);
      expect(Number(res.body.grossWeightGrams)).toBe(9.25);
      expect(Number(res.body.netWeightGrams)).toBe(9.25);
      expect(res.body.qualityState).toBe(QualityState.QC_APPROVED);
      expect(res.body.approvalState).toBe(ApprovalState.DRAFT);
      expect(res.body.custodyState).toBe(CustodyState.IN_VAULT);
      expect(res.body.commercialState).toBe(CommercialState.UNREADY);
      expect(res.body.currentCompartmentId).toBe(compartmentId);
      expect(Number(res.body.costPriceCad)).toBe(1450.0);
      expect(Number(res.body.sellingPriceCad)).toBe(2899.0);
      expect(res.body.version).toBe(1);

      birthedItemId = res.body.id;
    });

    it("rejects duplicate piece birth attempt for the same QC item with 409 Conflict (INV-14 Guarantee)", async () => {
      const duplicatePayload = {
        qualityCheckItemId: birthedQcItemId,
        serialNumber: "SN-INV-API-SOL-DUP-01",
        itemName: "Duplicate Birth Attempt",
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send(duplicatePayload);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ERR_DUPLICATE_ITEM_BIRTH");
      expect(res.body.detail).toContain("already been birthed");
    });

    it("rejects duplicate serial number birth within the same organization with 409 Conflict", async () => {
      const { qcItemId } = await createQcPieceFixture({ isApproved: true });

      const duplicateSerialPayload = {
        qualityCheckItemId: qcItemId,
        serialNumber: "SN-INV-API-SOL-001", // Reusing first item's serial number
        itemName: "Duplicate Serial Ring",
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send(duplicateSerialPayload);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ERR_DUPLICATE_ITEM_BIRTH");
      expect(res.body.detail).toContain("SN-INV-API-SOL-001");
    });

    it("rejects piece birth from an unapproved QC inspection item with 422 Unprocessable Entity", async () => {
      const { qcItemId } = await createQcPieceFixture({ isApproved: false });

      const birthPayload = {
        qualityCheckItemId: qcItemId,
        serialNumber: "SN-INV-API-UNAPP-001",
        itemName: "Unapproved Piece",
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send(birthPayload);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_QC_NOT_APPROVED");
      expect(res.body.detail).toContain("APPROVED");
    });

    it("rejects piece birth for non-serialized SKU with 422 Unprocessable Entity (INV-06)", async () => {
      const { qcItemId } = await createQcPieceFixture({
        isApproved: true,
        useBatchSku: true,
      });

      const birthPayload = {
        qualityCheckItemId: qcItemId,
        serialNumber: "SN-INV-API-BATCH-001",
        itemName: "Batch Findings Attempt",
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send(birthPayload);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_INVALID_TRACKING_TYPE");
      expect(res.body.detail).toContain("QUANTITY_BATCH");
    });

    it("rejects piece birth when compartment belongs to a different store with 422 (INV-11)", async () => {
      const { qcItemId } = await createQcPieceFixture({ isApproved: true });

      const birthPayload = {
        qualityCheckItemId: qcItemId,
        serialNumber: "SN-INV-API-CROSS-COMP-001",
        itemName: "Cross Store Compartment Mismatch",
        currentCompartmentId: altCompartmentId, // Compartment in altStoreId
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send(birthPayload);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_COMPARTMENT_STORE_MISMATCH");
    });

    it("rejects cross-store piece birth with 403 Forbidden when request store does not match QC session store (INV-11)", async () => {
      const { qcItemId } = await createQcPieceFixture({ isApproved: true });

      const birthPayload = {
        qualityCheckItemId: qcItemId,
        serialNumber: "SN-INV-API-CROSS-STORE-001",
        itemName: "Cross Store Request Attempt",
      };

      // Header scoped to altStoreId while QC session belongs to storeId
      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", altStoreId)
        .send(birthPayload);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
      expect(res.body.detail).toContain("Cross-store access denied");
    });

    it("rejects piece birth when user lacks inventory:create permission with 403 Forbidden", async () => {
      const { qcItemId } = await createQcPieceFixture({ isApproved: true });

      const birthPayload = {
        qualityCheckItemId: qcItemId,
        serialNumber: "SN-INV-API-NO-PERM-001",
        itemName: "Unauthorized Birth Attempt",
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId)
        .send(birthPayload);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    });

    it("rejects unauthenticated piece birth request with 401 Unauthorized", async () => {
      const birthPayload = {
        qualityCheckItemId: "0192e301-0000-7000-8000-000000000999",
        serialNumber: "SN-INV-API-UNAUTH",
        itemName: "Unauthenticated Request",
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .send(birthPayload);

      expect(res.status).toBe(401);
    });

    it("rejects birth request with non-existent QC item ID with 404 Not Found", async () => {
      const nonExistentQcItemId = "0192e301-0000-7000-8000-000000000999";
      const birthPayload = {
        qualityCheckItemId: nonExistentQcItemId,
        serialNumber: "SN-INV-API-NON-EXISTENT",
        itemName: "Non Existent QC Item",
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send(birthPayload);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });

    it("rejects malformed payload with 400 Bad Request", async () => {
      const malformedPayload = {
        qualityCheckItemId: "not-a-uuid",
        serialNumber: "",
      };

      const res = await request(app)
        .post("/api/v1/inventory/items/birth")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send(malformedPayload);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
    });
  });

  describe("GET /api/v1/inventory/items/:id (Item Lookup)", () => {
    it("retrieves a birthed inventory piece by ID for authorized viewer (inventory:view)", async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/items/${birthedItemId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(birthedItemId);
      expect(res.body.serialNumber).toBe("SN-INV-API-SOL-001");
      expect(res.body.qualityState).toBe(QualityState.QC_APPROVED);
      expect(res.body.approvalState).toBe(ApprovalState.DRAFT);
      expect(res.body.custodyState).toBe(CustodyState.IN_VAULT);
      expect(res.body.commercialState).toBe(CommercialState.UNREADY);
      expect(Number(res.body.grossWeightGrams)).toBe(9.25);
      expect(Number(res.body.netWeightGrams)).toBe(9.25);
    });

    it("returns 404 Not Found for non-existent item UUID", async () => {
      const nonExistentId = "0192e301-0000-7000-8000-000000000888";

      const res = await request(app)
        .get(`/api/v1/inventory/items/${nonExistentId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });

    it("returns 403 Forbidden when requesting item under a different store context (INV-11)", async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/items/${birthedItemId}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", altStoreId); // Manager is member of altStore, but item is in storeId

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
    });
  });

  describe("GET /api/v1/inventory/items (List & Query Inventory Pieces)", () => {
    it("returns a paginated list of inventory items filtered by store and serial number", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/items")
        .query({
          storeId,
          serialNumber: "SN-INV-API-SOL-001",
          limit: 10,
          offset: 0,
        })
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].serialNumber).toBe("SN-INV-API-SOL-001");
    });

    it("filters inventory items by custodyState and commercialState", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/items")
        .query({
          storeId,
          custodyState: "IN_VAULT",
          commercialState: "UNREADY",
        })
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      for (const item of res.body) {
        expect(item.custodyState).toBe(CustodyState.IN_VAULT);
        expect(item.commercialState).toBe(CommercialState.UNREADY);
      }
    });

    it("defaults storeId to active store context when omitted from query parameters", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/items")
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      for (const item of res.body) {
        expect(item.storeId).toBe(storeId);
      }
    });
  });
});
