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
  getInventoryItemBySerialNumber,
  getInventoryItemByQualityCheckItemId,
  listInventoryItems,
} from "../src/index.js";
import {
  StoreType,
  MeasurementType,
  QualityState,
  ApprovalState,
  CustodyState,
  CommercialState,
  UnprocessableEntityError,
  ConflictError,
  NotFoundError,
} from "@jewelcore/shared";

describe("Serialized Piece Birth & Lineage Integrity Repository (FEAT-INV-01 / INV-14)", () => {
  let orgId: string;
  let storeId: string;
  let altStoreId: string;
  let userId: string;
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

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_INV_REPO');",
    );
    await query(
      "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_INV_REPO_%';",
    );
    await query(
      "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-INV-REPO-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-INV-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_INV_REPO_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-INV-REPO-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_INV_REPO_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_INV_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_INV_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_INV_REPO_%';");
    await query("DELETE FROM compartments WHERE code LIKE 'CMP_INV_REPO_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'LCK_INV_REPO_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'VLT_INV_REPO_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'inv_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_INV_REPO_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_INV_REPO';");

    // 1. Organization & Stores
    const org = await createOrganization({
      code: "ORG_INV_REPO",
      name: "Inventory Birth Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_INV_REPO_001",
      name: "Flagship Vault Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_INV_REPO_002",
      name: "Secondary Branch",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    altStoreId = altStore.id;

    // 2. User
    const user = await createUser({
      organizationId: orgId,
      email: "inv_repo_custodian@jewelcore.local",
      firstName: "Vault",
      lastName: "Custodian",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    userId = user.id;

    // 3. Storage Hierarchy in primary store
    const vault = await createVault({
      storeId,
      code: "VLT_INV_REPO_01",
      name: "Main Treasury Safe",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_INV_REPO_01",
      name: "High Security Locker A",
      lockerNumber: "LCK-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_INV_REPO_01",
      name: "Diamond Solitaire Tray 1",
      compartmentNumber: "CMP-01",
    });
    compartmentId = comp.id;

    // Storage hierarchy in alternate store (for cross-store isolation testing)
    const altVault = await createVault({
      storeId: altStoreId,
      code: "VLT_INV_REPO_02",
      name: "Alt Treasury Safe",
      vaultType: "MAIN_VAULT",
    });

    const altLocker = await createLocker({
      vaultId: altVault.id,
      storeId: altStoreId,
      code: "LCK_INV_REPO_02",
      name: "Alt Locker B",
      lockerNumber: "LCK-02",
    });

    const altComp = await createCompartment({
      lockerId: altLocker.id,
      storeId: altStoreId,
      code: "CMP_INV_REPO_02",
      name: "Alt Tray 2",
      compartmentNumber: "CMP-02",
    });
    altCompartmentId = altComp.id;

    // 4. Taxonomy: Material, Purity, Category, Product, SKUs
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_INV_REPO_RINGS",
      name: "Solitaire Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_INV_REPO_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_INV_REPO_18K",
      name: "18 Karat Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });
    purityId = purity.id;

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_INV_REPO_001",
      name: "Classic Solitaire Ring",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    // Serialized SKU (tracking_type = SERIALIZED)
    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-INV-REPO-SER-001",
      name: "Classic Solitaire Ring - Size 6",
      variantName: "Classic Solitaire Ring - Size 6",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 8.5,
      targetMetalWeightGrams: 8.5,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // Quantity-Batch SKU (tracking_type = QUANTITY_BATCH)
    const batchProduct = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_INV_REPO_FINDINGS",
      name: "Gold Findings",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "QUANTITY_BATCH",
    });

    const batchSku = await createProductSku({
      organizationId: orgId,
      productId: batchProduct.id,
      skuCode: "SKU-INV-REPO-BATCH-001",
      name: "Gold Earring Backings Pack",
      variantName: "Gold Earring Backings Pack",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 2.0,
      targetMetalWeightGrams: 2.0,
      trackingType: "QUANTITY_BATCH",
    });
    batchSkuId = batchSku.id;

    // 5. Procurement: Supplier, GRN, Shipment
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_INV_REPO_01",
      name: "Geneva Bullion S.A.",
    });
    supplierId = supplier.id;

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-INV-REPO-001",
      createdByUserId: userId,
    });
    grnId = grn.id;

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-INV-REPO-001",
      carrierName: "Brink's Precious",
      trackingNumber: "TRK-INV-REPO-001",
      declaredPackageCount: 1,
      grossPackageWeightGrams: 50.0,
      receivedByUserId: userId,
    });
    shipmentId = shipment.id;

    await query("UPDATE shipments SET status = 'RECEIVED' WHERE id = $1", [
      shipmentId,
    ]);

    const qc = await createQualityCheck({
      shipmentId,
      storeId,
      inspectorUserId: userId,
    });
    qcId = qc.id;
  });

  afterAll(async () => {
    try {
      await query("DELETE FROM inventory_items WHERE organization_id = $1;", [
        orgId,
      ]);
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
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-INV-REPO-%';",
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
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-INV-REPO-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_INV_REPO_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-INV-REPO-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_INV_REPO_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_INV_REPO_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_INV_REPO_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_INV_REPO_%';");
      await query("DELETE FROM compartments WHERE code LIKE 'CMP_INV_REPO_%';");
      await query("DELETE FROM lockers WHERE code LIKE 'LCK_INV_REPO_%';");
      await query("DELETE FROM vaults WHERE code LIKE 'VLT_INV_REPO_%';");
      await query(
        "DELETE FROM users WHERE email LIKE 'inv_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_INV_REPO_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_INV_REPO';");
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
    const gross = options?.grossWeightGrams ?? 8.5;
    const net = options?.netWeightGrams ?? 8.5;
    const lineNum = lineCounter++;

    const shipItem = await addShipmentItem(shipmentId, {
      productSkuId: targetSku,
      lineNumber: lineNum,
      supplierItemCode: `SUP-ITEM-INV-REPO-${lineNum}`,
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

    // Record verified scale observation
    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-INV-REPO-METTLER-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: gross,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: userId,
    });

    // 3VL physical inspections
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
      { userId },
    );

    return { shipItemId: shipItem.id, qcItemId: qcItem.id, updated };
  }

  it("Scenario 1: Atomic Serialized Piece Birth from Approved QC Item (INV-14)", async () => {
    const { qcItemId } = await createQcPieceFixture({ isApproved: true });

    const item = await birthInventoryItem(
      {
        qualityCheckItemId: qcItemId,
        currentCompartmentId: compartmentId,
        serialNumber: "SN-2026-INV-0001",
        itemName: "Classic Solitaire Ring 18K",
        costPriceCad: 850.0,
        sellingPriceCad: 1800.0,
      },
      { userId },
    );

    expect(item.id).toBeDefined();
    expect(item.organizationId).toBe(orgId);
    expect(item.storeId).toBe(storeId);
    expect(item.productSkuId).toBe(skuId);
    expect(item.qualityCheckItemId).toBe(qcItemId);
    expect(item.serialNumber).toBe("SN-2026-INV-0001");
    expect(item.itemName).toBe("Classic Solitaire Ring 18K");
    expect(item.grossWeightGrams).toBe(8.5);
    expect(item.netWeightGrams).toBe(8.5);
    expect(item.purityId).toBe(purityId);
    expect(item.qualityState).toBe(QualityState.QC_APPROVED);
    expect(item.approvalState).toBe(ApprovalState.DRAFT);
    expect(item.custodyState).toBe(CustodyState.IN_VAULT);
    expect(item.commercialState).toBe(CommercialState.UNREADY);
    expect(item.currentCompartmentId).toBe(compartmentId);
    expect(item.costPriceCad).toBe(850.0);
    expect(item.sellingPriceCad).toBe(1800.0);
    expect(item.version).toBe(1);
  });

  it("Scenario 2: Duplicate Birth Rejection (UNIQUE quality_check_item_id / 409 Conflict)", async () => {
    const { qcItemId } = await createQcPieceFixture({ isApproved: true });

    // First birth succeeds
    await birthInventoryItem(
      {
        qualityCheckItemId: qcItemId,
        currentCompartmentId: compartmentId,
      },
      { userId },
    );

    // Second birth on same QC item must reject with ConflictError (409)
    await expect(
      birthInventoryItem(
        {
          qualityCheckItemId: qcItemId,
          currentCompartmentId: compartmentId,
        },
        { userId },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("Scenario 3: Unapproved QC Item Birth Rejection (ERR_QC_NOT_APPROVED / 422)", async () => {
    // QC item in PENDING status
    const { qcItemId } = await createQcPieceFixture({ isApproved: false });

    await expect(
      birthInventoryItem(
        {
          qualityCheckItemId: qcItemId,
          currentCompartmentId: compartmentId,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 4: Non-Serialized SKU Birth Rejection (INV-06 / ERR_INVALID_TRACKING_TYPE)", async () => {
    // QC item bound to QUANTITY_BATCH SKU
    const { qcItemId } = await createQcPieceFixture({
      isApproved: true,
      useBatchSku: true,
    });

    await expect(
      birthInventoryItem(
        {
          qualityCheckItemId: qcItemId,
          currentCompartmentId: compartmentId,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 5: Cross-Store Compartment Rejection (INV-11 / ERR_COMPARTMENT_STORE_MISMATCH)", async () => {
    const { qcItemId } = await createQcPieceFixture({ isApproved: true });

    // Attempting to place piece into altCompartmentId belonging to altStoreId
    await expect(
      birthInventoryItem(
        {
          qualityCheckItemId: qcItemId,
          currentCompartmentId: altCompartmentId,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 6: Birth Lineage Immutability Trigger (trg_inventory_items_birth_lineage / INV-14)", async () => {
    const { qcItemId } = await createQcPieceFixture({ isApproved: true });
    const { qcItemId: dummyQcItemId } = await createQcPieceFixture({
      isApproved: true,
    });

    const item = await birthInventoryItem(
      {
        qualityCheckItemId: qcItemId,
        currentCompartmentId: compartmentId,
      },
      { userId },
    );

    // Direct SQL update attempting to re-parent the birth certificate
    await expect(
      query(
        "UPDATE inventory_items SET quality_check_item_id = $1 WHERE id = $2;",
        [dummyQcItemId, item.id],
      ),
    ).rejects.toThrow(/immutable birth lineage certificate/);
  });

  it("Scenario 7: Retrieval by ID, Serial Number, and QC Item ID", async () => {
    const { qcItemId } = await createQcPieceFixture({ isApproved: true });

    const created = await birthInventoryItem(
      {
        qualityCheckItemId: qcItemId,
        currentCompartmentId: compartmentId,
        serialNumber: "SN-2026-RETRIEVAL-001",
      },
      { userId },
    );

    const byId = await getInventoryItemById(created.id);
    expect(byId).toBeDefined();
    expect(byId?.id).toBe(created.id);
    expect(byId?.serialNumber).toBe("SN-2026-RETRIEVAL-001");

    const bySerial = await getInventoryItemBySerialNumber(
      orgId,
      "SN-2026-RETRIEVAL-001",
    );
    expect(bySerial).toBeDefined();
    expect(bySerial?.id).toBe(created.id);

    const byQc = await getInventoryItemByQualityCheckItemId(qcItemId);
    expect(byQc).toBeDefined();
    expect(byQc?.id).toBe(created.id);
  });

  it("Scenario 8: List inventory items with filters", async () => {
    const items = await listInventoryItems({
      storeId,
      custodyState: CustodyState.IN_VAULT,
      limit: 10,
      offset: 0,
    });

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((i) => i.storeId === storeId)).toBe(true);
    expect(items.every((i) => i.custodyState === CustodyState.IN_VAULT)).toBe(
      true,
    );
  });
});
