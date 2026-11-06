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
  getInventoryItemById,
  upsertStockBalance,
  getStockBalanceBySkuAndCompartment,
  createInventoryMovement,
  getInventoryMovementById,
  listInventoryMovements,
} from "../src/index.js";
import {
  StoreType,
  MeasurementType,
  CustodyState,
  MovementType,
  UnprocessableEntityError,
  ForbiddenError,
  BadRequestError,
} from "@jewelcore/shared";

describe("Unified Custody Movement Ledger Repository (FEAT-INV-03 / INV-09, INV-13, INV-16, Entity 30)", () => {
  let orgId: string;
  let storeId: string;
  let altStoreId: string;
  let userId: string;
  let materialId: string;
  let purityId: string;
  let skuId: string;
  let altSkuId: string;
  let batchSkuId: string;
  let compartment1Id: string;
  let compartment2Id: string;
  let altCompartmentId: string;
  let testItemId: string;
  let lineCounter = 1;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_REPO');",
    );
    await query(
      "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
    );

    await query(
      "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_REPO');",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_REPO');",
    );
    await query(
      "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_MOV_REPO_%';",
    );
    await query(
      "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-MOV-REPO-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-MOV-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_MOV_REPO_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-MOV-REPO-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_MOV_REPO_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_MOV_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_MOV_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_MOV_REPO_%';");
    await query("DELETE FROM compartments WHERE code LIKE 'CMP_MOV_REPO_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'LCK_MOV_REPO_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'VLT_MOV_REPO_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_MOV_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_REPO');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'mov_repo_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'mov_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_MOV_REPO_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_MOV_REPO';");

    // 1. Organization & Stores
    const org = await createOrganization({
      code: "ORG_MOV_REPO",
      name: "Movement Repository Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_MOV_REPO_001",
      name: "Main Treasury Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_MOV_REPO_002",
      name: "Branch Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    altStoreId = altStore.id;

    // 2. User
    const user = await createUser({
      organizationId: orgId,
      email: "mov_repo_officer@jewelcore.local",
      firstName: "Vault",
      lastName: "Officer",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    userId = user.id;

    // 3. Storage Hierarchy
    const vault = await createVault({
      storeId,
      code: "VLT_MOV_REPO_01",
      name: "Main Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_MOV_REPO_01",
      name: "Main Locker",
      lockerNumber: "LCK-01",
    });

    const comp1 = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_MOV_REPO_01",
      name: "Vault Safe Tray 1",
      compartmentNumber: "CMP-01",
    });
    compartment1Id = comp1.id;

    const comp2 = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_MOV_REPO_02",
      name: "Showroom Display Case 2",
      compartmentNumber: "CMP-02",
    });
    compartment2Id = comp2.id;

    const altVault = await createVault({
      storeId: altStoreId,
      code: "VLT_MOV_REPO_02",
      name: "Alt Vault",
      vaultType: "MAIN_VAULT",
    });

    const altLocker = await createLocker({
      vaultId: altVault.id,
      storeId: altStoreId,
      code: "LCK_MOV_REPO_02",
      name: "Alt Locker",
      lockerNumber: "LCK-02",
    });

    const altComp = await createCompartment({
      lockerId: altLocker.id,
      storeId: altStoreId,
      code: "CMP_MOV_REPO_03",
      name: "Alt Branch Tray 3",
      compartmentNumber: "CMP-03",
    });
    altCompartmentId = altComp.id;

    // 4. Taxonomy & SKUs
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_MOV_REPO_RINGS",
      name: "Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_MOV_REPO_PLATINUM",
      name: "Platinum",
      baseMetalType: "PLATINUM",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_MOV_REPO_PT950",
      name: "Platinum 950",
      purityPercentage: 95.0,
      purityRatio: 0.95,
      isHallmarkPurity: true,
    });
    materialId = material.id;
    purityId = purity.id;

    // Serialized SKU A
    const productA = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_MOV_REPO_RINGS",
      name: "Solitaire Platinum Ring",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "SERIALIZED",
    });

    const skuA = await createProductSku({
      organizationId: orgId,
      productId: productA.id,
      skuCode: "SKU-MOV-REPO-SER-001",
      name: "Solitaire Platinum Ring - Size 6",
      variantName: "Size 6",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 7.25,
      targetMetalWeightGrams: 7.25,
      trackingType: "SERIALIZED",
    });
    skuId = skuA.id;

    // Alt Serialized SKU B (for INV-16 mismatch testing)
    const skuB = await createProductSku({
      organizationId: orgId,
      productId: productA.id,
      skuCode: "SKU-MOV-REPO-SER-002",
      name: "Solitaire Platinum Ring - Size 7",
      variantName: "Size 7",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 7.8,
      targetMetalWeightGrams: 7.8,
      trackingType: "SERIALIZED",
    });
    altSkuId = skuB.id;

    // Batch SKU
    const batchProduct = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_MOV_REPO_BEADS",
      name: "Platinum Spacers",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "QUANTITY_BATCH",
    });

    const batchSku = await createProductSku({
      organizationId: orgId,
      productId: batchProduct.id,
      skuCode: "SKU-MOV-REPO-BATCH-001",
      name: "Platinum Spacers Pack",
      variantName: "Pack of 50",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 2.0,
      targetMetalWeightGrams: 2.0,
      trackingType: "QUANTITY_BATCH",
    });
    batchSkuId = batchSku.id;

    // 5. Procurement & QC Piece Birth fixture
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_MOV_REPO_01",
      name: "Zurich Refiners",
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-MOV-REPO-001",
      createdByUserId: userId,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-MOV-REPO-001",
      carrierName: "Loomis",
      trackingNumber: "TRK-MOV-REPO-001",
      declaredPackageCount: 1,
      grossPackageWeightGrams: 20.0,
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

    const lineNum = lineCounter++;
    const shipItem = await addShipmentItem(shipment.id, {
      productSkuId: skuId,
      lineNumber: lineNum,
      supplierItemCode: `SUP-ITEM-MOV-REPO-${lineNum}`,
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 7.25,
      declaredNetWeightGrams: 7.25,
    });

    const qcItem = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem.id,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      itemSequenceNumber: lineNum,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-MOV-REPO-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 7.25,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: userId,
    });

    await updateQualityCheckItem(
      qcItem.id,
      {
        grossWeightGrams: 7.25,
        tareWeightGrams: 0,
        netWeightGrams: 7.25,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId },
    );

    // Birth physical inventory piece into compartment1Id (IN_VAULT)
    const birthedItem = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem.id,
        serialNumber: "SN-MOV-REPO-PT-001",
        itemName: "Solitaire Platinum Ring",
        currentCompartmentId: compartment1Id,
      },
      { userId },
    );
    testItemId = birthedItem.id;

    // Seed stock balance in compartment1Id for batch SKU
    await upsertStockBalance(
      {
        storeId,
        productSkuId: batchSkuId,
        compartmentId: compartment1Id,
        quantityOnHand: 100,
        quantityReserved: 0,
        totalWeightGrams: 4.0,
      },
      { userId },
    );
  });

  afterAll(async () => {
    try {
      await query(
        "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
      );
      await query(
        "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_REPO');",
      );
      await query(
        "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
      );

      await query(
        "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_REPO');",
      );
      await query(
        "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_REPO');",
      );
      await query(
        "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
      );
      await query(
        "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_MOV_REPO_%';",
      );
      await query(
        "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
      );

      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-MOV-REPO-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-MOV-REPO-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-MOV-REPO-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_MOV_REPO_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-MOV-REPO-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_MOV_REPO_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_MOV_REPO_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_MOV_REPO_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_MOV_REPO_%';");
      await query("DELETE FROM compartments WHERE code LIKE 'CMP_MOV_REPO_%';");
      await query("DELETE FROM lockers WHERE code LIKE 'LCK_MOV_REPO_%';");
      await query("DELETE FROM vaults WHERE code LIKE 'VLT_MOV_REPO_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_MOV_REPO_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_MOV_REPO');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'mov_repo_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'mov_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_MOV_REPO_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_MOV_REPO';");
    } finally {
      await closePool();
    }
  });

  let createdMovementId: string;

  it("Scenario 1: executes vault-to-display custody movement (IN_VAULT -> IN_DISPLAY) and updates item compartment", async () => {
    const movement = await createInventoryMovement(
      {
        storeId,
        inventoryItemId: testItemId,
        productSkuId: skuId,
        movementType: MovementType.DISPLAY_PLACEMENT,
        fromCompartmentId: compartment1Id,
        toCompartmentId: compartment2Id,
        fromCustodyState: CustodyState.IN_VAULT,
        toCustodyState: CustodyState.IN_DISPLAY,
        quantity: 1,
        reasonCode: "MORNING_SHOWROOM_STAGING",
      },
      { userId },
    );

    expect(movement.id).toBeDefined();
    expect(movement.organizationId).toBe(orgId);
    expect(movement.storeId).toBe(storeId);
    expect(movement.inventoryItemId).toBe(testItemId);
    expect(movement.productSkuId).toBe(skuId);
    expect(movement.movementType).toBe(MovementType.DISPLAY_PLACEMENT);
    expect(movement.fromCompartmentId).toBe(compartment1Id);
    expect(movement.toCompartmentId).toBe(compartment2Id);
    expect(movement.fromCustodyState).toBe(CustodyState.IN_VAULT);
    expect(movement.toCustodyState).toBe(CustodyState.IN_DISPLAY);
    expect(movement.quantity).toBe(1);
    expect(movement.actorUserId).toBe(userId);
    expect(movement.reasonCode).toBe("MORNING_SHOWROOM_STAGING");

    createdMovementId = movement.id;

    // Verify physical piece updated in inventory_items
    const item = await getInventoryItemById(testItemId);
    expect(item).not.null;
    expect(item!.custodyState).toBe(CustodyState.IN_DISPLAY);
    expect(item!.currentCompartmentId).toBe(compartment2Id);
    expect(item!.version).toBe(2);
  });

  it("Scenario 2: enforces INV-13 destination compartment consistency (to_compartment_id must be null for RELEASED)", async () => {
    // Attempting to release asset with a non-null toCompartmentId must be rejected
    await expect(
      createInventoryMovement(
        {
          storeId,
          inventoryItemId: testItemId,
          productSkuId: skuId,
          movementType: MovementType.CUSTODY_DEPARTURE,
          fromCompartmentId: compartment2Id,
          toCompartmentId: compartment1Id, // Non-null when departing custody
          fromCustodyState: CustodyState.IN_DISPLAY,
          toCustodyState: CustodyState.RELEASED,
          quantity: 1,
        },
        { userId },
      ),
    ).rejects.toThrow();

    // Direct SQL check constraint validation: chk_movements_destination_compartment
    await expect(
      query(
        `
        INSERT INTO inventory_movements (
          id, organization_id, store_id, inventory_item_id, product_sku_id,
          movement_type, from_compartment_id, to_compartment_id, from_custody_state,
          to_custody_state, quantity, actor_user_id
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4,
          'CUSTODY_DEPARTURE', $5, $6, 'IN_DISPLAY',
          'RELEASED', 1, $7
        )
        `,
        [
          orgId,
          storeId,
          testItemId,
          skuId,
          compartment2Id,
          compartment1Id, // Violation: non-null destination compartment for RELEASED
          userId,
        ],
      ),
    ).rejects.toThrow(/chk_movements_destination_compartment/);

    // Valid departure movement with toCompartmentId: null
    const departure = await createInventoryMovement(
      {
        storeId,
        inventoryItemId: testItemId,
        productSkuId: skuId,
        movementType: MovementType.CUSTODY_DEPARTURE,
        fromCompartmentId: compartment2Id,
        toCompartmentId: null,
        fromCustodyState: CustodyState.IN_DISPLAY,
        toCustodyState: CustodyState.RELEASED,
        quantity: 1,
        reasonCode: "CUSTOMER_COLLECTION",
      },
      { userId },
    );

    expect(departure.toCustodyState).toBe(CustodyState.RELEASED);
    expect(departure.toCompartmentId).toBeNull();

    // Verify item updated
    const item = await getInventoryItemById(testItemId);
    expect(item!.custodyState).toBe(CustodyState.RELEASED);
    expect(item!.currentCompartmentId).toBeNull();
  });

  it("Scenario 3: enforces INV-16 movement SKU and item coherence", async () => {
    // Attempting to move testItemId with altSkuId
    await expect(
      createInventoryMovement(
        {
          storeId,
          inventoryItemId: testItemId,
          productSkuId: altSkuId, // Mismatched SKU
          movementType: MovementType.RETURN_TO_VAULT,
          fromCompartmentId: null,
          toCompartmentId: compartment1Id,
          fromCustodyState: CustodyState.RELEASED,
          toCustodyState: CustodyState.IN_VAULT,
          quantity: 1,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    // Direct SQL trigger validation: trg_inventory_movements_sku_coherence
    await expect(
      query(
        `
        INSERT INTO inventory_movements (
          id, organization_id, store_id, inventory_item_id, product_sku_id,
          movement_type, from_compartment_id, to_compartment_id, from_custody_state,
          to_custody_state, quantity, actor_user_id
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4,
          'RETURN_TO_VAULT', NULL, $5, 'RELEASED',
          'IN_VAULT', 1, $6
        )
        `,
        [orgId, storeId, testItemId, altSkuId, compartment1Id, userId],
      ),
    ).rejects.toThrow(/Movement SKU .* does not match piece SKU/);
  });

  it("Scenario 4: rejects cross-store compartment mismatch (INV-11)", async () => {
    await expect(
      createInventoryMovement(
        {
          storeId,
          inventoryItemId: testItemId,
          productSkuId: skuId,
          movementType: MovementType.VAULT_TRANSFER,
          fromCompartmentId: compartment1Id,
          toCompartmentId: altCompartmentId, // Compartment in altStoreId
          fromCustodyState: CustodyState.RELEASED,
          toCustodyState: CustodyState.IN_VAULT,
          quantity: 1,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 5: enforces INV-09 audit immutability (UPDATE and DELETE prohibited)", async () => {
    // UPDATE attempt rejected
    await expect(
      query("UPDATE inventory_movements SET quantity = 2 WHERE id = $1", [
        createdMovementId,
      ]),
    ).rejects.toThrow(/strictly append-only and immutable.*INV-09/);

    // DELETE attempt rejected
    await expect(
      query("DELETE FROM inventory_movements WHERE id = $1", [
        createdMovementId,
      ]),
    ).rejects.toThrow(/strictly append-only and immutable.*INV-09/);
  });

  it("Scenario 6: executes bulk quantity-batch movement and updates stock balances in source and destination", async () => {
    // Current balance in compartment1Id is 100
    const movement = await createInventoryMovement(
      {
        storeId,
        productSkuId: batchSkuId,
        movementType: MovementType.VAULT_TRANSFER,
        fromCompartmentId: compartment1Id,
        toCompartmentId: compartment2Id,
        fromCustodyState: CustodyState.IN_VAULT,
        toCustodyState: CustodyState.IN_VAULT,
        quantity: 25,
        reasonCode: "REPLENISH_WORKBENCH",
      },
      { userId },
    );

    expect(movement.id).toBeDefined();
    expect(movement.inventoryItemId).toBeNull();
    expect(movement.quantity).toBe(25);

    // Source balance decremented: 100 - 25 = 75
    const fromBal = await getStockBalanceBySkuAndCompartment(
      storeId,
      batchSkuId,
      compartment1Id,
    );
    expect(fromBal).not.null;
    expect(fromBal!.quantityOnHand).toBe(75);

    // Destination balance incremented: 0 + 25 = 25
    const toBal = await getStockBalanceBySkuAndCompartment(
      storeId,
      batchSkuId,
      compartment2Id,
    );
    expect(toBal).not.null;
    expect(toBal!.quantityOnHand).toBe(25);
  });

  it("Scenario 7: rejects quantity-batch movement when source balance is insufficient", async () => {
    // Available in compartment1Id is 75, requested is 150
    await expect(
      createInventoryMovement(
        {
          storeId,
          productSkuId: batchSkuId,
          movementType: MovementType.VAULT_TRANSFER,
          fromCompartmentId: compartment1Id,
          toCompartmentId: compartment2Id,
          fromCustodyState: CustodyState.IN_VAULT,
          toCustodyState: CustodyState.IN_VAULT,
          quantity: 150,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 8: retrieves movement by ID and lists movements with filters", async () => {
    const byId = await getInventoryMovementById(createdMovementId);
    expect(byId).not.null;
    expect(byId!.id).toBe(createdMovementId);
    expect(byId!.inventoryItemId).toBe(testItemId);

    const listByStore = await listInventoryMovements({
      storeId,
      limit: 10,
      offset: 0,
    });
    expect(listByStore).toBeInstanceOf(Array);
    expect(listByStore.length).toBeGreaterThanOrEqual(1);

    const listByItem = await listInventoryMovements({
      storeId,
      inventoryItemId: testItemId,
    });
    expect(listByItem.length).toBeGreaterThanOrEqual(1);
    for (const mov of listByItem) {
      expect(mov.inventoryItemId).toBe(testItemId);
    }
  });
});
