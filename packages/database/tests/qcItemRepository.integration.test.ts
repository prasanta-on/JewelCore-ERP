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
  getQualityCheckItemById,
  updateQualityCheckItem,
  createWeightMeasurement,
  listQualityCheckItemsBySessionId,
} from "../src/index.js";
import {
  StoreType,
  QualityCheckItemStatus,
  MeasurementType,
} from "@jewelcore/shared";

describe("QC Item 3VL Inspection & Completeness Gate Repository (FEAT-QC-04 / INV-02, INV-15, INV-18)", () => {
  let orgId: string;
  let storeId: string;
  let userId: string;
  let materialId: string;
  let purityId: string;
  let shipmentId: string;
  let shipmentItemId: string;
  let qcId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCI-REPO-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCI-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCI_REPO_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCI-REPO-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_QCI_REPO_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_QCI_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_QCI_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_QCI_REPO_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'qci_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_QCI_REPO_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_QCI_REPO';");

    // 1. Organization & Store
    const org = await createOrganization({
      code: "ORG_QCI_REPO",
      name: "QC 3VL Inspection Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_QCI_REPO_001",
      name: "QC Laboratory Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    // 2. User
    const user = await createUser({
      organizationId: orgId,
      email: "qci_repo_inspector@jewelcore.local",
      firstName: "Technical",
      lastName: "Inspector",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    userId = user.id;

    // 3. Taxonomy: Material, Purity, Category, Product, SKU
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_QCI_REPO_BANGLES",
      name: "Gold Bangles",
      targetGender: "WOMEN",
      isActive: true,
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_QCI_REPO_GOLD",
      name: "Rose Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
      isActive: true,
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_QCI_REPO_22K",
      name: "22 Karat Rose Gold",
      karatage: "22K",
      purityPercentage: 91.6,
      isActive: true,
    });
    purityId = purity.id;

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      materialId: material.id,
      defaultPurityId: purity.id,
      productCode: "PRD_QCI_REPO_BANGLE",
      name: "Traditional Solid Gold Bangle",
      isActive: true,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-QCI-REPO-001",
      variantName: "Solid Bangle 22K 15g",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 15.0,
      targetMetalWeightGrams: 15.0,
      isActive: true,
    });

    // 4. Procurement: Supplier, GRN, Shipment, ShipmentItem
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_QCI_REPO_001",
      name: "Artisan Goldsmith Co",
      isActive: true,
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId: storeId,
      supplierId: supplier.id,
      createdByUserId: userId,
      grnNumber: "GRN-QCI-REPO-001",
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-QCI-REPO-001",
      carrierName: "Secure Freight",
      trackingNumber: "SEC-987123",
      status: "RECEIVED",
      receivedByUserId: userId,
    });
    shipmentId = shipment.id;

    const item = await addShipmentItem(shipment.id, {
      productSkuId: sku.id,
      lineNumber: 1,
      supplierItemCode: "ART-B01",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 15.0,
    });
    shipmentItemId = item.id;

    // 5. Quality Check Session
    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId: storeId,
      inspectorUserId: userId,
    });
    qcId = qc.id;
  });

  afterAll(async () => {
    try {
      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCI-REPO-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCI-REPO-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCI-REPO-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCI_REPO_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCI-REPO-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_QCI_REPO_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_QCI_REPO_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_QCI_REPO_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_QCI_REPO_%';");
      await query(
        "DELETE FROM users WHERE email LIKE 'qci_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_QCI_REPO_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_QCI_REPO';");
    } finally {
      await closePool();
    }
  });

  it("Scenario 1: Draft QC Nullability Allowed (pending inspection fields are NULL)", async () => {
    const draftItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
      grossWeightGrams: null,
      netWeightGrams: null,
      verifiedMaterialId: null,
      verifiedPurityId: null,
      hallmarkVerified: null,
      visualInspectionPassed: null,
      damageDetected: null,
    });

    expect(draftItem.id).toBeDefined();
    expect(draftItem.status).toBe(QualityCheckItemStatus.PENDING);
    expect(draftItem.grossWeightGrams).toBeNull();
    expect(draftItem.netWeightGrams).toBeNull();
    expect(draftItem.verifiedMaterialId).toBeNull();
    expect(draftItem.verifiedPurityId).toBeNull();
    expect(draftItem.hallmarkVerified).toBeNull();
    expect(draftItem.visualInspectionPassed).toBeNull();
    expect(draftItem.damageDetected).toBeNull();

    const refetched = await getQualityCheckItemById(draftItem.id);
    expect(refetched).not.toBeNull();
    expect(refetched?.status).toBe(QualityCheckItemStatus.PENDING);
  });

  it("Scenario 2: Non-Null Net Weight Without Gross Weight Rejection (3VL chk_qc_items_weight_physics)", async () => {
    // Attempt inserting directly with gross_weight_grams = NULL and net_weight_grams = 5.0000
    await expect(
      query(
        `
        INSERT INTO quality_check_items (
          id, quality_check_id, shipment_item_id, item_sequence_number, status, gross_weight_grams, net_weight_grams
        )
        VALUES (gen_random_uuid(), $1, $2, 99, 'PENDING', NULL, 5.0000);
        `,
        [qcId, shipmentItemId],
      ),
    ).rejects.toThrow("chk_qc_items_weight_physics");
  });

  it("Scenario 3: Pre-Approval Completeness Gate Enforcement (hallmark_verified = NULL cannot be APPROVED)", async () => {
    // Create draft item with gross weight and material but NULL hallmark_verified
    const draftItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
      grossWeightGrams: 15.0,
      tareWeightGrams: 0.0,
      netWeightGrams: 15.0,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      visualInspectionPassed: true,
      damageDetected: false,
      hallmarkVerified: null, // NOT yet verified
    });

    // Attempting application update to APPROVED fails
    await expect(
      updateQualityCheckItem(
        draftItem.id,
        {
          status: QualityCheckItemStatus.APPROVED,
        },
        { userId },
      ),
    ).rejects.toThrow("Approval requires hallmark inspection");

    // Attempting direct database SQL update to APPROVED with hallmark_verified = NULL fails constraint
    await expect(
      query(
        `
        UPDATE quality_check_items
        SET status = 'APPROVED'
        WHERE id = $1;
        `,
        [draftItem.id],
      ),
    ).rejects.toThrow("chk_qc_items_approval_prerequisites");
  });

  it("Scenario 4: Net Weight Exceeds Gross Weight Rejection (net_weight_grams <= gross_weight_grams)", async () => {
    await expect(
      query(
        `
        INSERT INTO quality_check_items (
          id, quality_check_id, shipment_item_id, item_sequence_number, status, gross_weight_grams, net_weight_grams
        )
        VALUES (gen_random_uuid(), $1, $2, 98, 'PENDING', 10.0000, 12.0000);
        `,
        [qcId, shipmentItemId],
      ),
    ).rejects.toThrow("chk_qc_items_weight_physics");
  });

  it("enforces Tier C laboratory scale measurement presence before approval", async () => {
    // Create complete inspection item that has all attributes but NO GROSS_WEIGHT scale measurement in weight_measurements
    const inspectionItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
      grossWeightGrams: 15.0,
      tareWeightGrams: 0.0,
      netWeightGrams: 15.0,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    // Approval without scale reading throws ERR_MISSING_SCALE_OBSERVATION
    await expect(
      updateQualityCheckItem(
        inspectionItem.id,
        {
          status: QualityCheckItemStatus.APPROVED,
        },
        { userId },
      ),
    ).rejects.toThrow(
      "Approval requires at least one verified GROSS_WEIGHT scale measurement in weight_measurements",
    );
  });

  it("enforces Tier D supervisor damage waiver when damage_detected is TRUE", async () => {
    // Create inspection item with damage detected
    const damagedItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
      grossWeightGrams: 15.0,
      tareWeightGrams: 0.0,
      netWeightGrams: 15.0,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: true,
      damageNotes: "Minor surface casting porosity on inner shank",
    });

    // Ingest scale reading
    await createWeightMeasurement({
      qualityCheckId: qcId,
      qualityCheckItemId: damagedItem.id,
      balanceDeviceId: "SCALE-QCI-REPO-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 15.0,
      tareWeight: 0.0,
      measuredByUserId: userId,
    });

    // Approval without supervisor waiver fails
    await expect(
      updateQualityCheckItem(
        damagedItem.id,
        {
          status: QualityCheckItemStatus.APPROVED,
        },
        { userId },
      ),
    ).rejects.toThrow(
      "Approval with detected damage requires an authorized supervisor waiver",
    );

    // Approval WITH supervisor waiver succeeds
    const approvedItem = await updateQualityCheckItem(
      damagedItem.id,
      {
        status: QualityCheckItemStatus.APPROVED,
        isSupervisorWaiver: true,
        waiverNotes:
          "Porosity does not compromise structural integrity. Approved under waiver.",
      },
      { userId },
    );

    expect(approvedItem.status).toBe(QualityCheckItemStatus.APPROVED);
    expect(approvedItem.decisionByUserId).toBe(userId);
    expect(approvedItem.decisionAt).not.toBeNull();
  });

  it("lists all items scoped to a QC inspection session", async () => {
    const items = await listQualityCheckItemsBySessionId(qcId);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0]!.qualityCheckId).toBe(qcId);
  });
});
