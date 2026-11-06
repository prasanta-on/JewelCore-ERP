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
  updateQualityCheck,
  evaluateIntakeWeightTolerance,
} from "../src/index.js";
import {
  StoreType,
  QualityCheckItemStatus,
  MeasurementType,
  QualityCheckStatus,
} from "@jewelcore/shared";

describe("Intake Weight Tolerance & Discrepancy Gate Repository (FEAT-QC-05 / INV-12)", () => {
  let orgId: string;
  let storeId: string;
  let userId: string;
  let materialId: string;
  let purityId: string;
  let skuId: string;
  let supplierId: string;
  let grnId: string;
  let shipmentId: string;
  let qcId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCT-REPO-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCT-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCT_REPO_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCT-REPO-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_QCT_REPO_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_QCT_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_QCT_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_QCT_REPO_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'qct_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_QCT_REPO_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_QCT_REPO';");

    // 1. Organization & Store
    const org = await createOrganization({
      code: "ORG_QCT_REPO",
      name: "QC Weight Tolerance Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_QCT_REPO_001",
      name: "QC Tolerance Intake Vault",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    // 2. User
    const user = await createUser({
      organizationId: orgId,
      email: "qct_repo_inspector@jewelcore.local",
      firstName: "Tolerance",
      lastName: "Inspector",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    userId = user.id;

    // 3. Taxonomy: Material, Purity, Category, Product, SKU
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_QCT_REPO_CHAINS",
      name: "Gold Chains",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_QCT_REPO_GOLD",
      name: "Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_QCT_REPO_22K",
      name: "22 Karat",
      purityPercentage: 91.6667,
      purityRatio: 0.9167,
      isHallmarkPurity: true,
    });
    purityId = purity.id;

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_QCT_REPO_CURB",
      name: "Curb Chain 22K",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-QCT-REPO-CURB-22K",
      variantName: "Curb Chain 22K 50cm",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 10.0,
      targetMetalWeightGrams: 10.0,
    });
    skuId = sku.id;

    // 4. Supplier, GRN, Shipment
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_QCT_REPO_PRECISION",
      name: "Precision Bullion Ltd",
    });
    supplierId = supplier.id;

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-QCT-REPO-001",
      createdByUserId: userId,
    });
    grnId = grn.id;

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-QCT-REPO-001",
      carrierName: "Brinks Logistics",
      trackingNumber: "TRK-QCT-REPO-001",
      declaredPackageCount: 1,
      grossPackageWeightGrams: 100.0,
      receivedByUserId: userId,
    });
    shipmentId = shipment.id;

    await query("UPDATE shipments SET status = 'RECEIVED' WHERE id = $1", [
      shipment.id,
    ]);

    // 5. QC Inspection Session
    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId,
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
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCT-REPO-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCT-REPO-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCT-REPO-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCT_REPO_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCT-REPO-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_QCT_REPO_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_QCT_REPO_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_QCT_REPO_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_QCT_REPO_%';");
      await query(
        "DELETE FROM users WHERE email LIKE 'qct_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_QCT_REPO_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_QCT_REPO';");
    } finally {
      await closePool();
    }
  });

  it("Scenario 1: Within-Tolerance Automatic Approval Clearance (Delta = +0.0100g, Tolerance = ±0.0200g)", async () => {
    // 1. Create shipment item with declared gross weight 10.0000g
    const shipItem = await addShipmentItem(shipmentId, {
      productSkuId: skuId,
      lineNumber: 101,
      supplierItemCode: "SUP-ITEM-QCT-101",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.0,
      declaredNetWeightGrams: 10.0,
    });

    // 2. Create QC item
    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 101,
      grossWeightGrams: 10.01,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.01,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    // Ingest scale gross weight observation
    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-REPO-001",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.01,
      measuredByUserId: userId,
    });

    // 3. Evaluate tolerance check
    const evalResult = await evaluateIntakeWeightTolerance(qcItem.id);
    expect(evalResult.hasDeclaredWeight).toBe(true);
    expect(evalResult.declaredGrossWeightGrams).toBe(10.0);
    expect(evalResult.measuredGrossWeightGrams).toBe(10.01);
    expect(evalResult.varianceDeltaGrams).toBe(0.01);
    expect(evalResult.allowedToleranceGrams).toBe(0.02);
    expect(evalResult.isWithinTolerance).toBe(true);
    expect(evalResult.reconciliationStatus).toBe("MATCHED");
    expect(evalResult.discrepancyReason).toBeNull();

    // Verify shipment_item reconciliation status updated to MATCHED
    const shipRes = await query<{
      reconciliation_status: string;
      measured_gross_weight_grams: string;
    }>(
      "SELECT reconciliation_status, measured_gross_weight_grams FROM shipment_items WHERE id = $1",
      [shipItem.id],
    );
    expect(shipRes.rows[0].reconciliation_status).toBe("MATCHED");
    expect(Number(shipRes.rows[0].measured_gross_weight_grams)).toBe(10.01);

    // 4. Approval commits successfully
    const approvedItem = await updateQualityCheckItem(
      qcItem.id,
      {
        status: QualityCheckItemStatus.APPROVED,
      },
      { userId },
    );
    expect(approvedItem.status).toBe(QualityCheckItemStatus.APPROVED);
  });

  it("Scenario 2: Out-of-Tolerance Discrepancy Escrow (Delta = +0.0800g, Tolerance = ±0.0200g)", async () => {
    // 1. Create shipment item with declared gross weight 10.0000g
    const shipItem = await addShipmentItem(shipmentId, {
      productSkuId: skuId,
      lineNumber: 102,
      supplierItemCode: "SUP-ITEM-QCT-102",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.0,
      declaredNetWeightGrams: 10.0,
    });

    // 2. Create QC item with measured gross weight 10.0800g (delta = +0.0800g > 0.0200g)
    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 102,
      grossWeightGrams: 10.08,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.08,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-REPO-002",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.08,
      measuredByUserId: userId,
    });

    // 3. Evaluate tolerance check
    const evalResult = await evaluateIntakeWeightTolerance(qcItem.id);
    expect(evalResult.hasDeclaredWeight).toBe(true);
    expect(evalResult.varianceDeltaGrams).toBe(0.08);
    expect(evalResult.isWithinTolerance).toBe(false);
    expect(evalResult.reconciliationStatus).toBe("DISCREPANCY");
    expect(evalResult.discrepancyReason).toContain(
      "exceeds allowable tolerance",
    );

    // Verify shipment_item reconciliation status updated to DISCREPANCY
    const shipRes = await query<{
      reconciliation_status: string;
      discrepancy_reason: string;
    }>(
      "SELECT reconciliation_status, discrepancy_reason FROM shipment_items WHERE id = $1",
      [shipItem.id],
    );
    expect(shipRes.rows[0].reconciliation_status).toBe("DISCREPANCY");
    expect(shipRes.rows[0].discrepancy_reason).toContain(
      "exceeds allowable tolerance",
    );

    // 4. Attempting auto-approval is blocked with ERR_WEIGHT_TOLERANCE_EXCEEDED (422)
    await expect(
      updateQualityCheckItem(
        qcItem.id,
        {
          status: QualityCheckItemStatus.APPROVED,
        },
        { userId },
      ),
    ).rejects.toThrowError(/exceeds allowable tolerance/);
  });

  it("Scenario 3: Missing Declared Weight Auto-Approval Rejection (Fail-Closed Protocol)", async () => {
    // 1. Create shipment item with declared gross weight = NULL
    const shipItem = await addShipmentItem(shipmentId, {
      productSkuId: skuId,
      lineNumber: 103,
      supplierItemCode: "SUP-ITEM-QCT-103",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: null,
      declaredNetWeightGrams: null,
    });

    // 2. Create QC item
    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 103,
      grossWeightGrams: 10.05,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.05,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-REPO-003",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.05,
      measuredByUserId: userId,
    });

    // 3. Evaluate tolerance check
    const evalResult = await evaluateIntakeWeightTolerance(qcItem.id);
    expect(evalResult.hasDeclaredWeight).toBe(false);
    expect(evalResult.declaredGrossWeightGrams).toBeNull();
    expect(evalResult.isWithinTolerance).toBe(false);
    expect(evalResult.reconciliationStatus).toBe("DISCREPANCY");
    expect(evalResult.discrepancyReason).toContain(
      "missing declared gross weight",
    );

    // 4. Attempting auto-approval is blocked with ERR_MISSING_DECLARED_WEIGHT (422)
    await expect(
      updateQualityCheckItem(
        qcItem.id,
        {
          status: QualityCheckItemStatus.APPROVED,
        },
        { userId },
      ),
    ).rejects.toThrowError(/missing declared gross weight on manifest/);
  });

  it("Scenario 4: Unauthorized Tolerance Parameter Override Rejection", async () => {
    // 1. Create shipment item with out-of-tolerance weight
    const shipItem = await addShipmentItem(shipmentId, {
      productSkuId: skuId,
      lineNumber: 104,
      supplierItemCode: "SUP-ITEM-QCT-104",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.0,
      declaredNetWeightGrams: 10.0,
    });

    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 104,
      grossWeightGrams: 10.15,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.15,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      hallmarkVerified: true,
      visualInspectionPassed: true,
      damageDetected: false,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-REPO-004",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.15,
      measuredByUserId: userId,
    });

    // User without qc:tolerance:admin attempts overrideTolerance: true
    await expect(
      updateQualityCheckItem(
        qcItem.id,
        {
          status: QualityCheckItemStatus.APPROVED,
          overrideTolerance: true,
          toleranceOverrideReason: "Inspector manual bypass",
        },
        { userId, hasToleranceAdminPermission: false },
      ),
    ).rejects.toThrowError(/qc:tolerance:admin/);

    // Non-admin user attempts custom tolerance limit in evaluateIntakeWeightTolerance
    await expect(
      evaluateIntakeWeightTolerance(
        qcItem.id,
        { absoluteToleranceGrams: 0.2 },
        { userId, hasToleranceAdminPermission: false },
      ),
    ).rejects.toThrowError(/qc:tolerance:admin/);
  });

  it("Scenario 5: Authorized Supervisor / Admin Override Permits Approval", async () => {
    // Out-of-tolerance piece from Scenario 4
    const qcItems = await query<{ id: string }>(
      "SELECT id FROM quality_check_items WHERE item_sequence_number = 104 AND quality_check_id = $1",
      [qcId],
    );
    const qcItemId = qcItems.rows[0].id;

    // Admin with qc:tolerance:admin overrides discrepancy
    const approvedItem = await updateQualityCheckItem(
      qcItemId,
      {
        status: QualityCheckItemStatus.APPROVED,
        overrideTolerance: true,
        toleranceOverrideReason: "Vendor certified calibration offset accepted",
      },
      { userId, hasToleranceAdminPermission: true },
    );

    expect(approvedItem.status).toBe(QualityCheckItemStatus.APPROVED);

    // Verify shipment_item reconciliation status updated to MATCHED with override noted
    const shipRes = await query<{
      reconciliation_status: string;
      discrepancy_reason: string;
    }>(
      "SELECT reconciliation_status, discrepancy_reason FROM shipment_items WHERE line_number = 104 AND shipment_id = $1",
      [shipmentId],
    );
    expect(shipRes.rows[0].reconciliation_status).toBe("MATCHED");
    expect(shipRes.rows[0].discrepancy_reason).toContain(
      "override authorized by admin",
    );
  });

  it("Scenario 6: Enforces Sealed Session Immutability Gate on Tolerance Check", async () => {
    // 1. Create a fresh shipment, item, and QC session
    const sealedShip = await createShipment({
      goodsReceiptNoteId: grnId,
      shipmentNumber: "SHIP-QCT-REPO-002",
      carrierName: "Brinks",
      trackingNumber: "TRK-QCT-REPO-002",
      receivedByUserId: userId,
    });
    await query("UPDATE shipments SET status = 'RECEIVED' WHERE id = $1", [
      sealedShip.id,
    ]);

    const shipItem = await addShipmentItem(sealedShip.id, {
      productSkuId: skuId,
      lineNumber: 201,
      supplierItemCode: "SUP-ITEM-QCT-201",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.0,
      declaredNetWeightGrams: 10.0,
    });

    const sealedQc = await createQualityCheck({
      shipmentId: sealedShip.id,
      storeId,
      inspectorUserId: userId,
    });

    const qcItem = await createQualityCheckItem({
      qualityCheckId: sealedQc.id,
      shipmentItemId: shipItem.id,
      itemSequenceNumber: 201,
      grossWeightGrams: 10.01,
      tareWeightGrams: 0.0,
      netWeightGrams: 10.01,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCT-REPO-005",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 10.01,
      measuredByUserId: userId,
    });

    // Seal the QC session
    await updateQualityCheck(sealedQc.id, {
      status: QualityCheckStatus.FINALIZED,
    });

    // Tolerance check on sealed session item must fail
    await expect(evaluateIntakeWeightTolerance(qcItem.id)).rejects.toThrowError(
      /Inspection session is FINALIZED and sealed/,
    );
  });
});
