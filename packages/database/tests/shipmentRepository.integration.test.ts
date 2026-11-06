import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  createSupplier,
  createCategory,
  createMaterial,
  createPurity,
  createProduct,
  createProductSku,
  createGrn,
  closeGrn,
  createShipment,
  getShipmentById,
  getShipmentWithItems,
  getShipmentByNumber,
  listShipments,
  updateShipment,
  addShipmentItem,
  updateShipmentItem,
  getShipmentItemById,
  listShipmentItems,
} from "../src/index.js";
import {
  StoreType,
  ConflictError,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("Shipments & Line Items Repository Integration Tests (FEAT-PROC-03)", () => {
  let testOrgId: string;
  let testStoreId: string;
  let testUserId: string;
  let testSupplierId: string;
  let testSkuId: string;
  let openGrnId: string;
  let closedGrnId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up any stale data from prior interrupted runs
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHP-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHP-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-SHP-REPO-%';",
    );
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SHP-REPO-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'SHP-REPO-%';");
    await query("DELETE FROM purities WHERE code LIKE 'SHP_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'SHP_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'SHP_REPO_%';");
    await query("DELETE FROM suppliers WHERE code LIKE 'SHP_REPO_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'shp_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code = 'SHP_REPO_STORE_001';");
    await query("DELETE FROM organizations WHERE code = 'SHP_REPO_TEST_ORG';");

    // 1. Organization
    const org = await createOrganization({
      code: "SHP_REPO_TEST_ORG",
      name: "Shipment Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Store
    const store = await createStore({
      organizationId: testOrgId,
      code: "SHP_REPO_STORE_001",
      name: "Shipment Intake Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    testStoreId = store.id;

    // 3. User
    const user = await createUser({
      organizationId: testOrgId,
      email: "shp_repo_technician@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Shipment",
      lastName: "Technician",
      isActive: true,
    });
    testUserId = user.id;

    // 4. Supplier
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "SHP_REPO_SUPP_001",
      name: "Global Diamond Consignment Ltd",
    });
    testSupplierId = supplier.id;

    // 5. Taxonomy & SKU for line items
    const category = await createCategory({
      organizationId: testOrgId,
      code: "SHP_REPO_CAT_01",
      name: "Rings",
    });

    const material = await createMaterial({
      organizationId: testOrgId,
      code: "SHP_REPO_GOLD_01",
      name: "Yellow Gold",
      baseMetalType: "AU",
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "SHP_REPO_18K",
      name: "18 Karat",
      purityPercentage: 75.0,
      purityRatio: 0.75,
    });

    const product = await createProduct({
      organizationId: testOrgId,
      categoryId: category.id,
      materialId: material.id,
      defaultPurityId: purity.id,
      productCode: "SHP-REPO-RNG-001",
      name: "Solitaire Diamond Ring",
      defaultTrackingType: "SERIALIZED",
    });

    const sku = await createProductSku({
      organizationId: testOrgId,
      productId: product.id,
      skuCode: "SHP-REPO-SKU-001",
      variantName: "Solitaire Ring 18K Size 7",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 5.5,
      targetMetalWeightGrams: 5.0,
    });
    testSkuId = sku.id;

    // 6. Open GRN
    const openGrn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-SHP-REPO-OPEN-01",
      createdByUserId: testUserId,
    });
    openGrnId = openGrn.id;

    // 7. Closed GRN (for immutability tests)
    const closedGrn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-SHP-REPO-CLOSED-01",
      createdByUserId: testUserId,
    });
    await closeGrn(closedGrn.id, testUserId, "Formal closure");
    closedGrnId = closedGrn.id;
  });

  afterAll(async () => {
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHP-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHP-REPO-%';",
    );
    await query("DELETE FROM goods_receipt_notes WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SHP-REPO-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'SHP-REPO-%';");
    await query("DELETE FROM purities WHERE code LIKE 'SHP_REPO_%';");
    await query("DELETE FROM materials WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM categories WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM suppliers WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query(
      "DELETE FROM users WHERE email LIKE 'shp_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code = 'SHP_REPO_STORE_001';");
    await query("DELETE FROM organizations WHERE id = $1;", [testOrgId]);
    await closePool();
  });

  it("Scenario 1: creates shipment with manifest items and persists DEC-05 4-decimal weights", async () => {
    const shipment = await createShipment({
      goodsReceiptNoteId: openGrnId,
      shipmentNumber: "SHP-REPO-2026-0001",
      carrierName: "Brinks Secure Courier",
      trackingNumber: "BRINKS-TRK-9901",
      declaredPackageCount: 2,
      receivedPackageCount: 2,
      grossPackageWeightGrams: 250.452,
      receivedByUserId: testUserId,
      items: [
        {
          productSkuId: testSkuId,
          lineNumber: 1,
          supplierItemCode: "VEND-ITM-101",
          declaredPieceCount: 10,
          receivedPieceCount: 10,
          declaredGrossWeightGrams: 55.452, // 4-decimal DEC-05 precision
          declaredNetWeightGrams: 50.0,
          unitLabourMakingCost: 25.0,
          lineTotalSettlement: 5500.0,
        },
      ],
    });

    expect(shipment.id).toBeDefined();
    expect(shipment.shipmentNumber).toBe("SHP-REPO-2026-0001");
    expect(shipment.status).toBe("PENDING");
    expect(shipment.grossPackageWeightGrams).toBe(250.452);
    expect(shipment.items).toHaveLength(1);

    const line1 = shipment.items[0];
    expect(line1.lineNumber).toBe(1);
    expect(line1.declaredGrossWeightGrams).toBe(55.452);
    expect(line1.reconciliationStatus).toBe("PENDING");
    expect(line1.version).toBe(1);
  });

  it("Scenario 2: accepts missing declared gross weight (stores NULL) for non-automatic QC protocol", async () => {
    const shipment = await createShipment({
      goodsReceiptNoteId: openGrnId,
      shipmentNumber: "SHP-REPO-2026-0002",
      receivedByUserId: testUserId,
      items: [
        {
          productSkuId: testSkuId,
          lineNumber: 1,
          declaredPieceCount: 5,
          declaredGrossWeightGrams: null, // Vendor omitted gross weight
        },
      ],
    });

    expect(shipment.items[0].declaredGrossWeightGrams).toBeNull();
  });

  it("Scenario 3: rejects duplicate shipment_number with 409 Conflict", async () => {
    await expect(
      createShipment({
        goodsReceiptNoteId: openGrnId,
        shipmentNumber: "SHP-REPO-2026-0001", // Duplicate
        receivedByUserId: testUserId,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("Scenario 4: rejects duplicate line_number within same shipment with 409 Conflict", async () => {
    const shipment = await createShipment({
      goodsReceiptNoteId: openGrnId,
      shipmentNumber: "SHP-REPO-2026-0003",
      receivedByUserId: testUserId,
      items: [
        {
          productSkuId: testSkuId,
          lineNumber: 1,
          declaredPieceCount: 1,
        },
      ],
    });

    await expect(
      addShipmentItem(shipment.id, {
        productSkuId: testSkuId,
        lineNumber: 1, // Duplicate line_number in same shipment
        declaredPieceCount: 2,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("Scenario 5: enforces INV-06/INV-19 immutability: rejects creating shipment under CLOSED GRN", async () => {
    await expect(
      createShipment({
        goodsReceiptNoteId: closedGrnId, // CLOSED GRN!
        shipmentNumber: "SHP-REPO-2026-0004",
        receivedByUserId: testUserId,
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 6: retrieves shipment with items and updates shipment item with OCC version counter", async () => {
    const shipment = await getShipmentByNumber("SHP-REPO-2026-0001");
    expect(shipment).not.toBeNull();

    const withItems = await getShipmentWithItems(shipment!.id);
    expect(withItems).not.toBeNull();
    expect(withItems!.items.length).toBeGreaterThanOrEqual(1);

    const firstItem = withItems!.items[0];

    // Update line item
    const updated = await updateShipmentItem(firstItem.id, {
      receivedPieceCount: 10,
      measuredGrossWeightGrams: 55.4518, // Metrology balance intake weight
      reconciliationStatus: "MATCHED",
    });

    expect(updated.version).toBe(2);
    expect(updated.measuredGrossWeightGrams).toBe(55.4518);
    expect(updated.reconciliationStatus).toBe("MATCHED");
  });

  it("Scenario 7: rejects updating shipment item under a CLOSED GRN", async () => {
    // 1. Create a shipment under open GRN
    const shipment = await createShipment({
      goodsReceiptNoteId: openGrnId,
      shipmentNumber: "SHP-REPO-2026-0005",
      receivedByUserId: testUserId,
      items: [
        {
          productSkuId: testSkuId,
          lineNumber: 1,
          declaredPieceCount: 2,
        },
      ],
    });

    // 2. Close the parent GRN
    await closeGrn(openGrnId, testUserId, "Locking for audit");

    // 3. Attempt to update line item must fail with ERR_GRN_IMMUTABLE
    await expect(
      updateShipmentItem(shipment.items[0].id, {
        receivedPieceCount: 2,
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });
});
