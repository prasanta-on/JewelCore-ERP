import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
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
  birthInventoryItem,
  updateInventoryItemState,
  getInventoryItemHistory,
  listStatusHistory,
} from "../src/index.js";
import {
  StoreType,
  MeasurementType,
  QualityState,
  ApprovalState,
  CustodyState,
  CommercialState,
  StateDimension,
  ConflictError,
  NotFoundError,
  BadRequestError,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("Multi-Dimensional State History & OCC Concurrency Repository (FEAT-INV-04 / INV-08, Entity 31)", () => {
  let orgId: string;
  let storeId: string;
  let userId: string;
  let testItemId: string;
  let unapprovedItemId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );

    await query(
      "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
    );
    await query(
      "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
    );

    await query(
      "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
    );

    await query(
      "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_HIST_REPO_%';",
    );
    await query(
      "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-HIST-REPO-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-HIST-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_HIST_REPO_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-HIST-REPO-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_HIST_REPO_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_HIST_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_HIST_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_HIST_REPO_%';");
    await query("DELETE FROM compartments WHERE code LIKE 'CMP_HIST_REPO_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'LCK_HIST_REPO_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'VLT_HIST_REPO_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_HIST_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'hist_repo_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'hist_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_HIST_REPO_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_HIST_REPO';");

    // 1. Organization & Store
    const org = await createOrganization({
      code: "ORG_HIST_REPO",
      name: "State History Repo Test Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_HIST_REPO_001",
      name: "State History Main Vault Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    // 2. User
    const user = await createUser({
      organizationId: orgId,
      email: "hist_repo_supervisor@jewelcore.local",
      firstName: "Inventory",
      lastName: "Supervisor",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    userId = user.id;

    // 3. Storage Hierarchy
    const vault = await createVault({
      storeId,
      code: "VLT_HIST_REPO_01",
      name: "Main Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_HIST_REPO_01",
      name: "Main Locker",
      lockerNumber: "LCK-01",
    });

    const compartment = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_HIST_REPO_01",
      name: "Safe Box 01",
      compartmentNumber: "CMP-01",
    });

    // 4. Taxonomy & SKUs
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_HIST_REPO_RINGS",
      name: "Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_HIST_REPO_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_HIST_REPO_18K",
      name: "18K Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_HIST_REPO_RING",
      name: "Diamond Band",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "SERIALIZED",
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-HIST-REPO-SER-001",
      name: "Diamond Band 18K",
      variantName: "Standard",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 5.0,
      targetMetalWeightGrams: 5.0,
      trackingType: "SERIALIZED",
    });

    // 5. Procurement, QC & Birth Item 1
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_HIST_REPO_01",
      name: "Geneva Refiners",
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-HIST-REPO-001",
      createdByUserId: userId,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-HIST-REPO-001",
      carrierName: "Brinks",
      trackingNumber: "TRK-HIST-REPO-001",
      declaredPackageCount: 1,
      grossPackageWeightGrams: 10.0,
      receivedByUserId: userId,
    });

    await query("UPDATE shipments SET status = 'RECEIVED' WHERE id = $1", [
      shipment.id,
    ]);

    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId,
      inspectorUserId: userId,
    });

    const shipItem1 = await addShipmentItem(shipment.id, {
      productSkuId: sku.id,
      lineNumber: 1,
      supplierItemCode: "SUP-ITEM-HIST-REPO-01",
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
      balanceDeviceId: "SCALE-HIST-REPO-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 5.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: userId,
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
      { userId },
    );

    const birthed1 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem1.id,
        serialNumber: "SN-HIST-REPO-SER-001",
        itemName: "Diamond Band 18K",
        currentCompartmentId: compartment.id,
      },
      { userId },
    );
    testItemId = birthed1.id;

    // Birth Item 2 (stays DRAFT in approval_state for prerequisite testing)
    const shipItem2 = await addShipmentItem(shipment.id, {
      productSkuId: sku.id,
      lineNumber: 2,
      supplierItemCode: "SUP-ITEM-HIST-REPO-02",
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
      balanceDeviceId: "SCALE-HIST-REPO-02",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 5.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: userId,
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
      { userId },
    );

    const birthed2 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem2.id,
        serialNumber: "SN-HIST-REPO-SER-002",
        itemName: "Diamond Band 18K Unapproved",
        currentCompartmentId: compartment.id,
      },
      { userId },
    );
    unapprovedItemId = birthed2.id;
  });

  afterAll(async () => {
    try {
      await query(
        "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
      );
      await query(
        "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
      );
      await query(
        "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
      );

      await query(
        "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
      );
      await query(
        "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
      );
      await query(
        "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
      );

      await query(
        "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
      );
      await query(
        "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
      );

      await query(
        "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
      );
      await query(
        "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_HIST_REPO_%';",
      );
      await query(
        "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
      );

      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-HIST-REPO-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-HIST-REPO-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-HIST-REPO-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_HIST_REPO_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-HIST-REPO-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_HIST_REPO_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_HIST_REPO_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_HIST_REPO_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_HIST_REPO_%';");
      await query(
        "DELETE FROM compartments WHERE code LIKE 'CMP_HIST_REPO_%';",
      );
      await query("DELETE FROM lockers WHERE code LIKE 'LCK_HIST_REPO_%';");
      await query("DELETE FROM vaults WHERE code LIKE 'VLT_HIST_REPO_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_HIST_REPO_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_HIST_REPO');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'hist_repo_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'hist_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_HIST_REPO_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_HIST_REPO';");
    } finally {
      await closePool();
    }
  });

  it("Scenario 1: executes state mutation, increments OCC version, and creates status history record", async () => {
    // Initial birthed state: approval_state = 'DRAFT', version = 1
    const result = await updateInventoryItemState(
      testItemId,
      {
        dimension: StateDimension.APPROVAL,
        newState: ApprovalState.APPROVED,
        reason: "Manager stock verification passed",
        expectedVersion: 1,
      },
      { userId },
    );

    expect(result.item.approvalState).toBe(ApprovalState.APPROVED);
    expect(result.item.version).toBe(2);

    expect(result.history.id).toBeDefined();
    expect(result.history.inventoryItemId).toBe(testItemId);
    expect(result.history.dimensionChanged).toBe(StateDimension.APPROVAL);
    expect(result.history.oldState).toBe(ApprovalState.DRAFT);
    expect(result.history.newState).toBe(ApprovalState.APPROVED);
    expect(result.history.actorUserId).toBe(userId);
    expect(result.history.reason).toBe("Manager stock verification passed");
    expect(result.history.transitionedAt).toBeInstanceOf(Date);
  });

  it("Scenario 2: updates commercial state to AVAILABLE_FOR_SALE when prerequisites are met", async () => {
    // Now item has QC_APPROVED, APPROVED, IN_VAULT, version = 2
    const result = await updateInventoryItemState(
      testItemId,
      {
        dimension: StateDimension.COMMERCIAL,
        newState: CommercialState.AVAILABLE_FOR_SALE,
        reason: "Promoted to retail catalogue",
        expectedVersion: 2,
      },
      { userId },
    );

    expect(result.item.commercialState).toBe(
      CommercialState.AVAILABLE_FOR_SALE,
    );
    expect(result.item.version).toBe(3);

    expect(result.history.dimensionChanged).toBe(StateDimension.COMMERCIAL);
    expect(result.history.oldState).toBe(CommercialState.UNREADY);
    expect(result.history.newState).toBe(CommercialState.AVAILABLE_FOR_SALE);
  });

  it("Scenario 3: enforces OCC lost update prevention (rejects stale expectedVersion with 409 Conflict)", async () => {
    // Current version is 3; caller passes stale expectedVersion: 1
    await expect(
      updateInventoryItemState(
        testItemId,
        {
          dimension: StateDimension.COMMERCIAL,
          newState: CommercialState.RESERVED,
          expectedVersion: 1, // Stale!
        },
        { userId },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("Scenario 4: enforces commercial readiness gate (rejects AVAILABLE_FOR_SALE when approval_state is DRAFT)", async () => {
    // unapprovedItemId has approval_state = 'DRAFT'
    await expect(
      updateInventoryItemState(
        unapprovedItemId,
        {
          dimension: StateDimension.COMMERCIAL,
          newState: CommercialState.AVAILABLE_FOR_SALE,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 5: rejects no-op state transition (ERR_NOOP_STATE_TRANSITION)", async () => {
    // Item is already in CommercialState.AVAILABLE_FOR_SALE
    await expect(
      updateInventoryItemState(
        testItemId,
        {
          dimension: StateDimension.COMMERCIAL,
          newState: CommercialState.AVAILABLE_FOR_SALE,
        },
        { userId },
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it("Scenario 6: rejects update for non-existent inventory item (404 Not Found)", async () => {
    const nonExistentId = "0192e301-ffff-7000-8000-000000000099";
    await expect(
      updateInventoryItemState(
        nonExistentId,
        {
          dimension: StateDimension.APPROVAL,
          newState: ApprovalState.APPROVED,
        },
        { userId },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("Scenario 7: enforces INV-09 audit immutability (UPDATE and DELETE prohibited on inventory_status_history)", async () => {
    const historyList = await getInventoryItemHistory(testItemId);
    expect(historyList.length).toBeGreaterThanOrEqual(2);
    const targetHistoryId = historyList[0].id;

    // Direct UPDATE attempt must fail with SQLSTATE 23514
    await expect(
      query(
        "UPDATE inventory_status_history SET new_state = 'HACKED' WHERE id = $1",
        [targetHistoryId],
      ),
    ).rejects.toThrow();

    // Direct DELETE attempt must fail with SQLSTATE 23514
    await expect(
      query("DELETE FROM inventory_status_history WHERE id = $1", [
        targetHistoryId,
      ]),
    ).rejects.toThrow();
  });

  it("Scenario 8: retrieves item history and lists history records with query filters", async () => {
    const itemHistory = await getInventoryItemHistory(testItemId);
    expect(itemHistory.length).toBe(2);
    // Most recent transition first
    expect(itemHistory[0].dimensionChanged).toBe(StateDimension.COMMERCIAL);
    expect(itemHistory[1].dimensionChanged).toBe(StateDimension.APPROVAL);

    // List with dimension filter
    const approvalLogs = await listStatusHistory({
      inventoryItemId: testItemId,
      dimensionChanged: StateDimension.APPROVAL,
      limit: 10,
      offset: 0,
    });

    expect(approvalLogs.length).toBe(1);
    expect(approvalLogs[0].dimensionChanged).toBe(StateDimension.APPROVAL);
    expect(approvalLogs[0].newState).toBe(ApprovalState.APPROVED);
  });
});
