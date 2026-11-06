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
  upsertStockBalance,
} from "@jewelcore/database";
import {
  StoreType,
  TrackingType,
  MovementType,
  CustodyState,
  MeasurementType,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Unified Custody Movement Ledger API (FEAT-INV-03 / INV-09, INV-13, INV-16, Entity 30)", () => {
  const app = createApp();

  let orgId: string;
  let storeId: string;
  let altStoreId: string;
  let serializedSkuId: string;
  let otherSkuId: string;
  let batchSkuId: string;
  let vaultCompartmentId: string;
  let displayCompartmentId: string;
  let altStoreCompartmentId: string;
  let serializedItemId: string;

  let managerToken: string;
  let managerUserId: string;
  let viewerToken: string;
  let viewerUserId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_API');",
    );
    await query(
      "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
    );

    await query(
      "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_API');",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_API');",
    );

    await query(
      "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_MOV_API_%';",
    );
    await query(
      "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-MOV-API-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-MOV-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_MOV_API_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-MOV-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_MOV_API_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_MOV_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_MOV_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_MOV_API_%';");
    await query("DELETE FROM compartments WHERE code LIKE 'CMP_MOV_API_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'LCK_MOV_API_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'VLT_MOV_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_MOV_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_API');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'mov_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'mov_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_MOV_API_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_MOV_API';");

    // 1. Organization & Stores
    const org = await createOrganization({
      code: "ORG_MOV_API",
      name: "Custody Movement API Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_MOV_API_001",
      name: "Movement Primary Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_MOV_API_002",
      name: "Movement Secondary Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    altStoreId = altStore.id;

    // 2. Storage hierarchy in Store 1
    const vault = await createVault({
      storeId,
      code: "VLT_MOV_API_01",
      name: "Main Movement Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker1 = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_MOV_API_01",
      name: "Vault Safe Locker",
      lockerNumber: "LCK-01",
    });

    const comp1 = await createCompartment({
      lockerId: locker1.id,
      storeId,
      code: "CMP_MOV_API_VAULT",
      name: "Safe Box 101",
      compartmentNumber: "CMP-01",
      maxCapacityPieces: 100,
    });
    vaultCompartmentId = comp1.id;

    const locker2 = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_MOV_API_02",
      name: "Floor Display Cabinet",
      lockerNumber: "LCK-02",
    });

    const comp2 = await createCompartment({
      lockerId: locker2.id,
      storeId,
      code: "CMP_MOV_API_DISPLAY",
      name: "Showcase Shelf 1",
      compartmentNumber: "CMP-02",
      maxCapacityPieces: 50,
    });
    displayCompartmentId = comp2.id;

    // Storage hierarchy in Alt Store
    const altVault = await createVault({
      storeId: altStoreId,
      code: "VLT_MOV_API_02",
      name: "Alt Movement Vault",
      vaultType: "MAIN_VAULT",
    });

    const altLocker = await createLocker({
      vaultId: altVault.id,
      storeId: altStoreId,
      code: "LCK_MOV_API_03",
      name: "Alt Locker",
      lockerNumber: "LCK-03",
    });

    const altComp = await createCompartment({
      lockerId: altLocker.id,
      storeId: altStoreId,
      code: "CMP_MOV_API_ALT",
      name: "Alt Compartment",
      compartmentNumber: "CMP-03",
      maxCapacityPieces: 100,
    });
    altStoreCompartmentId = altComp.id;

    // 3. Taxonomy & Catalog
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_MOV_API_01",
      name: "Movement Diamond Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_MOV_API_01",
      name: "Platinum Mov",
      baseMetalType: "PLATINUM",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_MOV_API_01",
      name: "Pt950 Mov",
      purityPercentage: 95.0,
      purityRatio: 0.95,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_MOV_API_01",
      name: "Diamond Solitaire Ring Mov",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "SERIALIZED",
    });

    const sku1 = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-MOV-API-SER-01",
      name: "Solitaire 1ct Pt950 Mov",
      variantName: "1ct",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 5.5,
      targetMetalWeightGrams: 5.3,
      trackingType: "SERIALIZED",
    });
    serializedSkuId = sku1.id;

    const sku2 = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-MOV-API-SER-02",
      name: "Solitaire 2ct Pt950 Mov",
      variantName: "2ct",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 7.5,
      targetMetalWeightGrams: 7.1,
      trackingType: "SERIALIZED",
    });
    otherSkuId = sku2.id;

    const batchProduct = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_MOV_API_BATCH",
      name: "Diamond Findings Mov",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "QUANTITY_BATCH",
    });

    const batchSku = await createProductSku({
      organizationId: orgId,
      productId: batchProduct.id,
      skuCode: "SKU-MOV-API-BATCH-01",
      name: "Diamond Findings Mov Pack",
      variantName: "Pack of 50",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 0.25,
      targetMetalWeightGrams: 0.25,
      trackingType: "QUANTITY_BATCH",
    });
    batchSkuId = batchSku.id;

    // 4. Users & Authentication Tokens
    const managerUser = await createUser({
      organizationId: orgId,
      email: "mov_api_manager@jewelcore.local",
      firstName: "Movement",
      lastName: "Manager",
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

    const storeManagerRole = await getRoleByCode("STORE_MANAGER");
    if (storeManagerRole) {
      await assignRoleToUser(managerUserId, storeManagerRole.id);
    }

    managerToken = await signAccessToken({
      userId: managerUserId,
      email: managerUser.email,
      orgId: orgId,
    });

    const viewerUser = await createUser({
      organizationId: orgId,
      email: "mov_api_viewer@jewelcore.local",
      firstName: "Movement",
      lastName: "Viewer",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    viewerUserId = viewerUser.id;

    const viewerOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: viewerUserId,
      isDefault: true,
    });

    await createStoreMembership({
      storeId,
      organizationMembershipId: viewerOrgMem.id,
      isDefault: true,
    });

    const viewerRole = await getRoleByCode("SALES_ASSOCIATE");
    if (viewerRole) {
      await assignRoleToUser(viewerUserId, viewerRole.id);
    }

    viewerToken = await signAccessToken({
      userId: viewerUserId,
      email: viewerUser.email,
      orgId: orgId,
    });

    // 5. Birth a serialized piece into vaultCompartmentId
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_MOV_API_01",
      name: "Solitaire Gems Supplier",
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-MOV-API-001",
      createdByUserId: managerUserId,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-MOV-API-001",
      carrierName: "Brinks",
      trackingNumber: "TRK-MOV-API-001",
      declaredPackageCount: 1,
      grossPackageWeightGrams: 10.0,
      receivedByUserId: managerUserId,
    });

    await query("UPDATE shipments SET status = 'RECEIVED' WHERE id = $1", [
      shipment.id,
    ]);

    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId,
      inspectorUserId: managerUserId,
    });

    const shipItem = await addShipmentItem(shipment.id, {
      productSkuId: serializedSkuId,
      lineNumber: 1,
      supplierItemCode: "SUP-ITEM-MOV-API-01",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 5.5,
      declaredNetWeightGrams: 5.3,
    });

    const qcItem = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem.id,
      verifiedMaterialId: material.id,
      verifiedPurityId: purity.id,
      itemSequenceNumber: 1,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-MOV-API-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 5.5,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: managerUserId,
    });

    await updateQualityCheckItem(
      qcItem.id,
      {
        grossWeightGrams: 5.5,
        tareWeightGrams: 0,
        netWeightGrams: 5.3,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: managerUserId },
    );

    const item = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem.id,
        serialNumber: "SN-MOV-API-SER-001",
        itemName: "Solitaire 1ct Pt950 Mov",
        currentCompartmentId: vaultCompartmentId,
      },
      { userId: managerUserId },
    );
    serializedItemId = item.id;

    // 6. Seed stock balance for batch SKU in vault compartment
    await upsertStockBalance(
      {
        storeId,
        productSkuId: batchSkuId,
        compartmentId: vaultCompartmentId,
        quantityOnHand: 100,
        quantityReserved: 0,
        totalWeightGrams: 25.0,
      },
      { userId: managerUserId },
    );
  });

  afterAll(async () => {
    try {
      await query(
        "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
      );
      await query(
        "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_API');",
      );
      await query(
        "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
      );

      await query(
        "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_API');",
      );
      await query(
        "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_API');",
      );

      await query(
        "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
      );
      await query(
        "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_MOV_API_%';",
      );
      await query(
        "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
      );

      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-MOV-API-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-API-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-MOV-API-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_MOV_API_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-MOV-API-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_MOV_API_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_MOV_API_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_MOV_API_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_MOV_API_%';");
      await query("DELETE FROM compartments WHERE code LIKE 'CMP_MOV_API_%';");
      await query("DELETE FROM lockers WHERE code LIKE 'LCK_MOV_API_%';");
      await query("DELETE FROM vaults WHERE code LIKE 'VLT_MOV_API_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_MOV_API_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_API');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'mov_api_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'mov_api_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_MOV_API_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_MOV_API';");
    } finally {
      await closePool();
    }
  });

  describe("POST /api/v1/inventory/movements (Execute Custody Movement)", () => {
    it("executes serialized piece movement from vault to display showcase (201 Created)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          inventoryItemId: serializedItemId,
          productSkuId: serializedSkuId,
          movementType: MovementType.DISPLAY_PLACEMENT,
          fromCompartmentId: vaultCompartmentId,
          toCompartmentId: displayCompartmentId,
          fromCustodyState: CustodyState.IN_VAULT,
          toCustodyState: CustodyState.IN_DISPLAY,
          quantity: 1,
          reasonCode: "MORNING_SHOWCASE_SETUP",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.inventoryItemId).toBe(serializedItemId);
      expect(res.body.productSkuId).toBe(serializedSkuId);
      expect(res.body.movementType).toBe(MovementType.DISPLAY_PLACEMENT);
      expect(res.body.toCompartmentId).toBe(displayCompartmentId);
      expect(res.body.toCustodyState).toBe(CustodyState.IN_DISPLAY);
      expect(res.body.quantity).toBe(1);
      expect(res.body.actorUserId).toBe(managerUserId);

      // Verify physical piece record updated
      const itemRes = await request(app)
        .get(`/api/v1/inventory/items/${serializedItemId}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId);

      expect(itemRes.status).toBe(200);
      expect(itemRes.body.custodyState).toBe(CustodyState.IN_DISPLAY);
      expect(itemRes.body.currentCompartmentId).toBe(displayCompartmentId);
      expect(itemRes.body.version).toBe(2);
    });

    it("executes bulk quantity-batch movement and adjusts stock balances (201 Created)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          productSkuId: batchSkuId,
          movementType: MovementType.VAULT_TRANSFER,
          fromCompartmentId: vaultCompartmentId,
          toCompartmentId: displayCompartmentId,
          toCustodyState: CustodyState.IN_DISPLAY,
          quantity: 20,
          weightGrams: 5.0,
          reasonCode: "WORKSHOP_RESTOCK",
        });

      expect(res.status).toBe(201);
      expect(res.body.inventoryItemId).toBeNull();
      expect(res.body.quantity).toBe(20);
      expect(res.body.weightGrams).toBe(5);

      // Verify source balance decremented: 100 - 20 = 80
      const sourceBalRes = await request(app)
        .get("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .query({
          productSkuId: batchSkuId,
          compartmentId: vaultCompartmentId,
        });

      expect(sourceBalRes.status).toBe(200);
      expect(sourceBalRes.body[0].quantityOnHand).toBe(80);

      // Verify destination balance created: 20
      const destBalRes = await request(app)
        .get("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .query({
          productSkuId: batchSkuId,
          compartmentId: displayCompartmentId,
        });

      expect(destBalRes.status).toBe(200);
      expect(destBalRes.body[0].quantityOnHand).toBe(20);
    });

    it("enforces INV-13 destination compartment consistency (rejects IN_DISPLAY without toCompartmentId)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          inventoryItemId: serializedItemId,
          productSkuId: serializedSkuId,
          movementType: MovementType.DISPLAY_PLACEMENT,
          toCustodyState: CustodyState.IN_DISPLAY,
          // toCompartmentId is missing
          quantity: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
    });

    it("enforces INV-13 destination compartment consistency (rejects RELEASED with toCompartmentId present)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          inventoryItemId: serializedItemId,
          productSkuId: serializedSkuId,
          movementType: MovementType.CUSTODY_DEPARTURE,
          toCustodyState: CustodyState.RELEASED,
          toCompartmentId: displayCompartmentId, // Invalid: must be null for RELEASED
          quantity: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
    });

    it("permits custody departure with toCompartmentId null (201 Created)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          inventoryItemId: serializedItemId,
          productSkuId: serializedSkuId,
          movementType: MovementType.CUSTODY_DEPARTURE,
          fromCompartmentId: displayCompartmentId,
          toCompartmentId: null,
          fromCustodyState: CustodyState.IN_DISPLAY,
          toCustodyState: CustodyState.RELEASED,
          quantity: 1,
          reasonCode: "CUSTOMER_DELIVERY",
        });

      expect(res.status).toBe(201);
      expect(res.body.toCustodyState).toBe(CustodyState.RELEASED);
      expect(res.body.toCompartmentId).toBeNull();

      // Verify physical piece cleared of compartment
      const itemRes = await request(app)
        .get(`/api/v1/inventory/items/${serializedItemId}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId);

      expect(itemRes.status).toBe(200);
      expect(itemRes.body.custodyState).toBe(CustodyState.RELEASED);
      expect(itemRes.body.currentCompartmentId).toBeNull();
    });

    it("enforces INV-16 movement SKU and item coherence (422 Unprocessable Entity)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          inventoryItemId: serializedItemId,
          productSkuId: otherSkuId, // Mismatched SKU
          movementType: MovementType.RETURN_TO_VAULT,
          toCompartmentId: vaultCompartmentId,
          toCustodyState: CustodyState.IN_VAULT,
          quantity: 1,
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_MOVEMENT_SKU_MISMATCH");
    });

    it("rejects cross-store compartment mismatch (INV-11) (422 Unprocessable Entity)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          productSkuId: batchSkuId,
          movementType: MovementType.VAULT_TRANSFER,
          fromCompartmentId: vaultCompartmentId,
          toCompartmentId: altStoreCompartmentId, // Belongs to Store 2!
          toCustodyState: CustodyState.IN_VAULT,
          quantity: 5,
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_COMPARTMENT_STORE_MISMATCH");
    });

    it("rejects batch transfer when source balance is insufficient (422 Unprocessable Entity)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          productSkuId: batchSkuId,
          movementType: MovementType.VAULT_TRANSFER,
          fromCompartmentId: vaultCompartmentId,
          toCompartmentId: displayCompartmentId,
          toCustodyState: CustodyState.IN_DISPLAY,
          quantity: 500, // Available is only 80
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_STOCK_BALANCE");
    });

    it("rejects unauthorized access when user lacks inventory:transfer permission (403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("x-store-id", storeId)
        .send({
          productSkuId: batchSkuId,
          movementType: MovementType.VAULT_TRANSFER,
          fromCompartmentId: vaultCompartmentId,
          toCompartmentId: displayCompartmentId,
          toCustodyState: CustodyState.IN_DISPLAY,
          quantity: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    });

    it("rejects unauthenticated requests (401 Unauthorized)", async () => {
      const res = await request(app).post("/api/v1/inventory/movements").send({
        productSkuId: batchSkuId,
        movementType: MovementType.VAULT_TRANSFER,
        toCustodyState: CustodyState.IN_VAULT,
        quantity: 1,
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/inventory/movements/:id (Movement Lookup)", () => {
    let sampleMovementId: string;

    beforeAll(async () => {
      const listRes = await request(app)
        .get("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId);

      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBeGreaterThan(0);
      sampleMovementId = listRes.body[0].id;
    });

    it("retrieves movement details by ID for authorized viewer (200 OK)", async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/movements/${sampleMovementId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("x-store-id", storeId);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sampleMovementId);
      expect(res.body.storeId).toBe(storeId);
      expect(res.body.organizationId).toBe(orgId);
    });

    it("returns 404 for non-existent movement ID", async () => {
      const nonExistentId = "0192e301-ffff-7000-8000-000000000099";
      const res = await request(app)
        .get(`/api/v1/inventory/movements/${nonExistentId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("x-store-id", storeId);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });

    it("rejects cross-store retrieval (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/movements/${sampleMovementId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("x-store-id", altStoreId); // Scoped to Store 2

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
    });
  });

  describe("GET /api/v1/inventory/movements (Movement Listing & Filtering)", () => {
    it("lists movements with store context scoping (200 OK)", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("x-store-id", storeId);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      for (const m of res.body) {
        expect(m.storeId).toBe(storeId);
      }
    });

    it("filters movements by inventoryItemId (200 OK)", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("x-store-id", storeId)
        .query({ inventoryItemId: serializedItemId });

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      for (const m of res.body) {
        expect(m.inventoryItemId).toBe(serializedItemId);
      }
    });

    it("filters movements by productSkuId (200 OK)", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("x-store-id", storeId)
        .query({ productSkuId: batchSkuId });

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      for (const m of res.body) {
        expect(m.productSkuId).toBe(batchSkuId);
      }
    });

    it("filters movements by movementType (200 OK)", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/movements")
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("x-store-id", storeId)
        .query({ movementType: MovementType.VAULT_TRANSFER });

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      for (const m of res.body) {
        expect(m.movementType).toBe(MovementType.VAULT_TRANSFER);
      }
    });
  });
});
