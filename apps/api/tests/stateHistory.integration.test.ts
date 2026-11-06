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
} from "@jewelcore/database";
import {
  StoreType,
  MeasurementType,
  QualityState,
  ApprovalState,
  CustodyState,
  CommercialState,
  StateDimension,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Multi-Dimensional State History & OCC Concurrency API (FEAT-INV-04 / INV-08, Entity 31)", () => {
  const app = createApp();

  let orgId: string;
  let storeId: string;
  let altStoreId: string;
  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let testItemId: string;
  let unapprovedItemId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );

    await query(
      "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
    );
    await query(
      "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
    );

    await query(
      "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
    );

    await query(
      "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_HIST_API_%';",
    );
    await query(
      "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-HIST-API-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-HIST-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_HIST_API_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-HIST-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_HIST_API_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_HIST_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_HIST_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_HIST_API_%';");
    await query("DELETE FROM compartments WHERE code LIKE 'CMP_HIST_API_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'LCK_HIST_API_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'VLT_HIST_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_HIST_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'hist_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'hist_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_HIST_API_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_HIST_API';");

    // 1. Organization & Stores
    const org = await createOrganization({
      code: "ORG_HIST_API",
      name: "State History API Test Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_HIST_API_001",
      name: "Primary History Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_HIST_API_002",
      name: "Secondary Branch Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    altStoreId = altStore.id;

    // 2. Storage hierarchy
    const vault = await createVault({
      storeId,
      code: "VLT_HIST_API_01",
      name: "Main Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_HIST_API_01",
      name: "Vault Safe Locker",
      lockerNumber: "LCK-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_HIST_API_01",
      name: "Safe Box 01",
      compartmentNumber: "CMP-01",
    });

    // 3. Taxonomy
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_HIST_API_RINGS",
      name: "Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_HIST_API_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_HIST_API_18K",
      name: "18K Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_HIST_API_RING",
      name: "Diamond Band",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "SERIALIZED",
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-HIST-API-SER-001",
      name: "Diamond Band 18K",
      variantName: "Standard",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 5.0,
      targetMetalWeightGrams: 5.0,
      trackingType: "SERIALIZED",
    });

    // 4. Users & Roles
    const managerUser = await createUser({
      organizationId: orgId,
      email: "hist_api_manager@jewelcore.local",
      firstName: "Store",
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

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(managerUserId, managerRole.id);
    }

    managerToken = await signAccessToken({
      userId: managerUserId,
      email: managerUser.email,
      orgId: orgId,
    });

    const associateUser = await createUser({
      organizationId: orgId,
      email: "hist_api_associate@jewelcore.local",
      firstName: "Sales",
      lastName: "Associate",
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

    // 5. Procurement, QC & Serialized Item Birth
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_HIST_API_01",
      name: "Geneva Refiners",
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-HIST-API-001",
      createdByUserId: managerUserId,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-HIST-API-001",
      carrierName: "Brinks",
      trackingNumber: "TRK-HIST-API-001",
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

    const shipItem1 = await addShipmentItem(shipment.id, {
      productSkuId: sku.id,
      lineNumber: 1,
      supplierItemCode: "SUP-ITEM-HIST-API-01",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 5.0,
      declaredNetWeightGrams: 5.0,
    });

    const qcItem1 = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem1.id,
      verifiedMaterialId: material.id,
      verifiedPurityId: purity.id,
      itemSequenceNumber: 1,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem1.id,
      balanceDeviceId: "SCALE-HIST-API-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 5.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: managerUserId,
    });

    await updateQualityCheckItem(
      qcItem1.id,
      {
        grossWeightGrams: 5.0,
        tareWeightGrams: 0,
        netWeightGrams: 5.0,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: managerUserId },
    );

    const birthed1 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem1.id,
        serialNumber: "SN-HIST-API-SER-001",
        itemName: "Diamond Band 18K API",
        currentCompartmentId: comp.id,
      },
      { userId: managerUserId },
    );
    testItemId = birthed1.id;

    // Birth Item 2 (stays DRAFT)
    const shipItem2 = await addShipmentItem(shipment.id, {
      productSkuId: sku.id,
      lineNumber: 2,
      supplierItemCode: "SUP-ITEM-HIST-API-02",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 5.0,
      declaredNetWeightGrams: 5.0,
    });

    const qcItem2 = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem2.id,
      verifiedMaterialId: material.id,
      verifiedPurityId: purity.id,
      itemSequenceNumber: 2,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem2.id,
      balanceDeviceId: "SCALE-HIST-API-02",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 5.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: managerUserId,
    });

    await updateQualityCheckItem(
      qcItem2.id,
      {
        grossWeightGrams: 5.0,
        tareWeightGrams: 0,
        netWeightGrams: 5.0,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: managerUserId },
    );

    const birthed2 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem2.id,
        serialNumber: "SN-HIST-API-SER-002",
        itemName: "Diamond Band 18K API Unapproved",
        currentCompartmentId: comp.id,
      },
      { userId: managerUserId },
    );
    unapprovedItemId = birthed2.id;
  });

  afterAll(async () => {
    try {
      await query(
        "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
      );
      await query(
        "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
      );
      await query(
        "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
      );

      await query(
        "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
      );
      await query(
        "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
      );
      await query(
        "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
      );

      await query(
        "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
      );
      await query(
        "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
      );

      await query(
        "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
      );
      await query(
        "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_HIST_API_%';",
      );
      await query(
        "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
      );

      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-HIST-API-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-API-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-HIST-API-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_HIST_API_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-HIST-API-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_HIST_API_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_HIST_API_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_HIST_API_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_HIST_API_%';");
      await query("DELETE FROM compartments WHERE code LIKE 'CMP_HIST_API_%';");
      await query("DELETE FROM lockers WHERE code LIKE 'LCK_HIST_API_%';");
      await query("DELETE FROM vaults WHERE code LIKE 'VLT_HIST_API_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_HIST_API_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_API');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'hist_api_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'hist_api_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_HIST_API_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_HIST_API';");
    } finally {
      await closePool();
    }
  });

  describe("PATCH /api/v1/inventory/items/:id/state (State Transition & OCC)", () => {
    it("updates item approval state with OCC expectedVersion (200 OK)", async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${testItemId}/state`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          dimension: StateDimension.APPROVAL,
          newState: ApprovalState.APPROVED,
          reason: "Formal quality and stock approval completed",
          expectedVersion: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.item.approvalState).toBe(ApprovalState.APPROVED);
      expect(res.body.item.version).toBe(2);

      expect(res.body.history.id).toBeDefined();
      expect(res.body.history.dimensionChanged).toBe(StateDimension.APPROVAL);
      expect(res.body.history.oldState).toBe(ApprovalState.DRAFT);
      expect(res.body.history.newState).toBe(ApprovalState.APPROVED);
      expect(res.body.history.reason).toBe(
        "Formal quality and stock approval completed",
      );
    });

    it("updates commercial state to AVAILABLE_FOR_SALE when prerequisites are met (200 OK)", async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${testItemId}/state`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          dimension: StateDimension.COMMERCIAL,
          newState: CommercialState.AVAILABLE_FOR_SALE,
          reason: "Promoted to online catalogue",
          expectedVersion: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.item.commercialState).toBe(
        CommercialState.AVAILABLE_FOR_SALE,
      );
      expect(res.body.item.version).toBe(3);
      expect(res.body.history.dimensionChanged).toBe(StateDimension.COMMERCIAL);
    });

    it("enforces OCC version check and rejects stale version (409 Conflict)", async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${testItemId}/state`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          dimension: StateDimension.COMMERCIAL,
          newState: CommercialState.RESERVED,
          expectedVersion: 1, // Current is 3!
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ERR_OCC_VERSION_MISMATCH");
    });

    it("enforces commercial readiness gate (422 Unprocessable Entity)", async () => {
      // unapprovedItemId has approval_state = 'DRAFT'
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${unapprovedItemId}/state`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          dimension: StateDimension.COMMERCIAL,
          newState: CommercialState.AVAILABLE_FOR_SALE,
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_COMMERCIAL_STATE_INVALID_PREREQUISITE");
    });

    it("rejects no-op state transition (400 Bad Request)", async () => {
      // testItemId is already in AVAILABLE_FOR_SALE
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${testItemId}/state`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          dimension: StateDimension.COMMERCIAL,
          newState: CommercialState.AVAILABLE_FOR_SALE,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_NOOP_STATE_TRANSITION");
    });

    it("rejects invalid state enum for dimension (400 Bad Request / Validation)", async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${testItemId}/state`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          dimension: StateDimension.APPROVAL,
          newState: "INVALID_APPROVAL_STATE",
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
    });

    it("returns 404 for non-existent inventory item", async () => {
      const nonExistentId = "0192e301-ffff-7000-8000-000000000099";
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${nonExistentId}/state`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", storeId)
        .send({
          dimension: StateDimension.APPROVAL,
          newState: ApprovalState.APPROVED,
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });

    it("rejects cross-store context violation (403 Forbidden)", async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${testItemId}/state`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", altStoreId) // Scoped to Store 2
        .send({
          dimension: StateDimension.APPROVAL,
          newState: ApprovalState.APPROVED,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
    });

    it("rejects unauthorized access when user lacks inventory:state:update (403 Forbidden)", async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${testItemId}/state`)
        .set("Authorization", `Bearer ${associateToken}`)
        .set("x-store-id", storeId)
        .send({
          dimension: StateDimension.APPROVAL,
          newState: ApprovalState.APPROVED,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    });

    it("rejects unauthenticated requests (401 Unauthorized)", async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/items/${testItemId}/state`)
        .send({
          dimension: StateDimension.APPROVAL,
          newState: ApprovalState.APPROVED,
        });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/inventory/items/:id/history (Piece Transition History)", () => {
    it("retrieves full status history for an item (200 OK)", async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/items/${testItemId}/history`)
        .set("Authorization", `Bearer ${associateToken}`)
        .set("x-store-id", storeId);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(2);
      expect(res.body[0].dimensionChanged).toBe(StateDimension.COMMERCIAL);
      expect(res.body[1].dimensionChanged).toBe(StateDimension.APPROVAL);
    });

    it("rejects cross-store history retrieval (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/items/${testItemId}/history`)
        .set("Authorization", `Bearer ${associateToken}`)
        .set("x-store-id", altStoreId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
    });

    it("returns 404 for non-existent item history lookup", async () => {
      const nonExistentId = "0192e301-ffff-7000-8000-000000000099";
      const res = await request(app)
        .get(`/api/v1/inventory/items/${nonExistentId}/history`)
        .set("Authorization", `Bearer ${associateToken}`)
        .set("x-store-id", storeId);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });
  });

  describe("GET /api/v1/inventory/status-history (Global Status History Query)", () => {
    it("lists history records filtered by inventoryItemId (200 OK)", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/status-history")
        .set("Authorization", `Bearer ${associateToken}`)
        .query({ inventoryItemId: testItemId });

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(2);
      for (const h of res.body) {
        expect(h.inventoryItemId).toBe(testItemId);
      }
    });

    it("lists history records filtered by dimensionChanged (200 OK)", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/status-history")
        .set("Authorization", `Bearer ${associateToken}`)
        .query({
          inventoryItemId: testItemId,
          dimensionChanged: StateDimension.APPROVAL,
        });

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(1);
      expect(res.body[0].dimensionChanged).toBe(StateDimension.APPROVAL);
    });

    it("rejects unauthenticated global history queries (401 Unauthorized)", async () => {
      const res = await request(app).get("/api/v1/inventory/status-history");
      expect(res.status).toBe(401);
    });
  });
});
