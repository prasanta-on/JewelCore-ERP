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
  updateQualityCheck,
  getQualityCheckById,
  createQualityDecision,
  listQualityDecisionsByItemId,
  listQualityDecisionsBySessionId,
} from "../src/index.js";
import {
  StoreType,
  QualityCheckItemStatus,
  MeasurementType,
  QualityCheckStatus,
  QualityDecisionType,
  ForbiddenError,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("Quality Decision Authorization & Damage-Waiver Protocol Repository (FEAT-QC-06 / INV-09, INV-18 Tier D, Gap 3)", () => {
  let orgId: string;
  let storeId: string;
  let inspectorUserId: string;
  let supervisorUserId: string;
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
      "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM quality_decisions WHERE reason_code LIKE 'DEC_REPO_%';",
    );
    await query(
      "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCD-REPO-%';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-REPO-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCD-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCD_REPO_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCD-REPO-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_QCD_REPO_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_QCD_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_QCD_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_QCD_REPO_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'qcd_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_QCD_REPO_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_QCD_REPO';");

    // 1. Organization & Store
    const org = await createOrganization({
      code: "ORG_QCD_REPO",
      name: "QC Decision Authorization Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_QCD_REPO_001",
      name: "QC Metrology & Inspection Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    // 2. Users: Inspector & Supervisor
    const inspector = await createUser({
      organizationId: orgId,
      email: "qcd_repo_inspector@jewelcore.local",
      firstName: "Bench",
      lastName: "Inspector",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    inspectorUserId = inspector.id;

    const supervisor = await createUser({
      organizationId: orgId,
      email: "qcd_repo_supervisor@jewelcore.local",
      firstName: "Store",
      lastName: "Manager",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    supervisorUserId = supervisor.id;

    // 3. Taxonomy: Material, Purity, Category, Product, SKU
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_QCD_REPO_01",
      name: "Decision Bangles",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_QCD_REPO_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_QCD_REPO_22K",
      name: "22 Karat Gold",
      purityPercentage: 91.6,
      purityRatio: 0.916,
      isHallmarkPurity: true,
    });
    purityId = purity.id;

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_QCD_REPO_001",
      name: "Royal Diamond Bangle",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-QCD-REPO-001",
      name: "Royal Diamond Bangle - Size M",
      variantName: "Royal Diamond Bangle - Size M",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 20.0,
      targetMetalWeightGrams: 20.0,
    });
    skuId = sku.id;

    // 4. Procurement: Supplier, GRN, Shipment
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_QCD_REPO_01",
      name: "Prestige Bullion Ltd",
    });
    supplierId = supplier.id;

    const grn = await createGrn({
      organizationId: orgId,
      storeId,
      supplierId: supplier.id,
      grnNumber: "GRN-QCD-REPO-001",
      createdByUserId: inspectorUserId,
    });
    grnId = grn.id;

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-QCD-REPO-001",
      carrierName: "Brink's Global",
      trackingNumber: "TRK-QCD-REPO-001",
      declaredPackageCount: 1,
      grossPackageWeightGrams: 100.0,
      receivedByUserId: inspectorUserId,
    });
    shipmentId = shipment.id;

    await query("UPDATE shipments SET status = 'RECEIVED' WHERE id = $1", [
      shipmentId,
    ]);

    // 5. QC Inspection Session
    const qc = await createQualityCheck({
      shipmentId,
      storeId,
      inspectorUserId,
    });
    qcId = qc.id;
  });

  afterAll(async () => {
    try {
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
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-QCD-REPO-%';",
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
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-REPO-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QCD-REPO-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QCD-REPO-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QCD_REPO_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-QCD-REPO-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_QCD_REPO_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_QCD_REPO_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_QCD_REPO_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_QCD_REPO_%';");
      await query(
        "DELETE FROM users WHERE email LIKE 'qcd_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_QCD_REPO_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_QCD_REPO';");
    } finally {
      await closePool();
    }
  });

  let lineCounter = 1;

  async function createPieceFixture(options: {
    declaredGrossWeightGrams?: number;
    measuredGrossWeightGrams?: number;
    damageDetected?: boolean;
    damageNotes?: string;
  }) {
    const declaredGross = options.declaredGrossWeightGrams ?? 25.0;
    const measuredGross = options.measuredGrossWeightGrams ?? 25.0;
    const lineNum = lineCounter++;

    const shipItem = await addShipmentItem(shipmentId, {
      productSkuId: skuId,
      lineNumber: lineNum,
      supplierItemCode: `SUP-ITEM-QCD-${lineNum}`,
      declaredPieceCount: 1,
      declaredGrossWeightGrams: declaredGross,
      declaredNetWeightGrams: declaredGross,
    });

    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId: shipItem.id,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
      itemSequenceNumber: 1,
    });

    // Record verified GROSS_WEIGHT scale observation (Tier C)
    await createWeightMeasurement({
      qualityCheckItemId: qcItem.id,
      balanceDeviceId: "SCALE-QCD-REPO-METTLER-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: measuredGross,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: inspectorUserId,
    });

    // Perform 3VL physical inspections
    const updated = await updateQualityCheckItem(
      qcItem.id,
      {
        grossWeightGrams: measuredGross,
        tareWeightGrams: 0,
        netWeightGrams: measuredGross,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: options.damageDetected ?? false,
        damageNotes: options.damageNotes,
      },
      { userId: inspectorUserId },
    );

    return { shipItemId: shipItem.id, qcItemId: qcItem.id, updated };
  }

  it("Scenario 1: creates immutable decision record and transitions item to APPROVED for clean piece", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 20.0,
      measuredGrossWeightGrams: 20.0,
      damageDetected: false,
    });

    const decision = await createQualityDecision(
      {
        qualityCheckItemId: qcItemId,
        decision: QualityDecisionType.APPROVED,
        reasonCode: "DEC_REPO_STANDARD_PASS",
        notes: "All 3VL gates and metrology passed baseline tolerances",
        decidedByUserId: inspectorUserId,
      },
      { userId: inspectorUserId },
    );

    expect(decision.id).toBeDefined();
    expect(decision.qualityCheckItemId).toBe(qcItemId);
    expect(decision.qualityCheckId).toBe(qcId);
    expect(decision.decision).toBe(QualityDecisionType.APPROVED);
    expect(decision.reasonCode).toBe("DEC_REPO_STANDARD_PASS");
    expect(decision.decidedByUserId).toBe(inspectorUserId);
    expect(decision.decidedAt).toBeDefined();

    // Verify item record was transitioned to APPROVED
    const item = await getQualityCheckItemById(qcItemId);
    expect(item).toBeDefined();
    expect(item?.status).toBe(QualityCheckItemStatus.APPROVED);
    expect(item?.decisionByUserId).toBe(inspectorUserId);
  });

  it("Scenario 2: authorizes supervisor damage waiver with reason_code DAMAGE_WAIVER and notes (INV-18 Tier D / Gap 3)", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 18.5,
      measuredGrossWeightGrams: 18.5,
      damageDetected: true,
      damageNotes:
        "Minor surface scratch on clasp, structural integrity intact",
    });

    const decision = await createQualityDecision(
      {
        qualityCheckItemId: qcItemId,
        decision: QualityDecisionType.APPROVED,
        reasonCode: "DAMAGE_WAIVER",
        notes: "Approved minor aesthetic scratch for in-house polishing buffer",
        decidedByUserId: supervisorUserId,
      },
      {
        userId: supervisorUserId,
        role: "STORE_MANAGER",
        hasWaiverPermission: true,
      },
    );

    expect(decision.decision).toBe(QualityDecisionType.APPROVED);
    expect(decision.reasonCode).toBe("DAMAGE_WAIVER");
    expect(decision.notes).toBe(
      "Approved minor aesthetic scratch for in-house polishing buffer",
    );

    const item = await getQualityCheckItemById(qcItemId);
    expect(item?.status).toBe(QualityCheckItemStatus.APPROVED);
    expect(item?.decisionByUserId).toBe(supervisorUserId);
  });

  it("Scenario 3: rejects damage waiver when user lacks qc:waiver permission (ERR_SUPERVISOR_WAIVER_REQUIRED)", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 15.0,
      measuredGrossWeightGrams: 15.0,
      damageDetected: true,
      damageNotes: "Bent prong",
    });

    await expect(
      createQualityDecision(
        {
          qualityCheckItemId: qcItemId,
          decision: QualityDecisionType.APPROVED,
          reasonCode: "DAMAGE_WAIVER",
          notes: "Inspector trying to waive own defect",
          decidedByUserId: inspectorUserId,
        },
        {
          userId: inspectorUserId,
          hasWaiverPermission: false,
          permissions: ["qc:inspect", "qc:measure"],
        },
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("Scenario 4: rejects damage waiver when reason_code is not DAMAGE_WAIVER or notes missing", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 15.0,
      measuredGrossWeightGrams: 15.0,
      damageDetected: true,
      damageNotes: "Loose setting",
    });

    // Wrong reason code
    await expect(
      createQualityDecision(
        {
          qualityCheckItemId: qcItemId,
          decision: QualityDecisionType.APPROVED,
          reasonCode: "OTHER_REASON",
          notes: "Some notes",
          decidedByUserId: supervisorUserId,
        },
        {
          userId: supervisorUserId,
          hasWaiverPermission: true,
        },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    // Missing notes
    await expect(
      createQualityDecision(
        {
          qualityCheckItemId: qcItemId,
          decision: QualityDecisionType.APPROVED,
          reasonCode: "DAMAGE_WAIVER",
          notes: "",
          decidedByUserId: supervisorUserId,
        },
        {
          userId: supervisorUserId,
          hasWaiverPermission: true,
        },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 5: creates REJECTED decision and marks item REJECTED with rejection reason", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 12.0,
      measuredGrossWeightGrams: 12.0,
      damageDetected: true,
      damageNotes: "Major crack along shank",
    });

    const decision = await createQualityDecision(
      {
        qualityCheckItemId: qcItemId,
        decision: QualityDecisionType.REJECTED,
        reasonCode: "DEFECTIVE_STRUCTURAL_CRACK",
        notes: "Piece failed structural stability test. Return to supplier.",
        decidedByUserId: inspectorUserId,
      },
      { userId: inspectorUserId },
    );

    expect(decision.decision).toBe(QualityDecisionType.REJECTED);
    expect(decision.reasonCode).toBe("DEFECTIVE_STRUCTURAL_CRACK");

    const item = await getQualityCheckItemById(qcItemId);
    expect(item?.status).toBe(QualityCheckItemStatus.REJECTED);
    expect(item?.rejectionReason).toBe(
      "Piece failed structural stability test. Return to supplier.",
    );
  });

  it("Scenario 6: creates ESCALATED_FOR_REINSPECTION decision record", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 22.0,
      measuredGrossWeightGrams: 22.0,
      damageDetected: false,
    });

    const decision = await createQualityDecision(
      {
        qualityCheckItemId: qcItemId,
        decision: QualityDecisionType.ESCALATED_FOR_REINSPECTION,
        reasonCode: "SUSPECTED_TUNGSTEN_CORE",
        notes:
          "Ultrasonic density check inconclusive, escalating to master metallurgist",
        decidedByUserId: inspectorUserId,
      },
      { userId: inspectorUserId },
    );

    expect(decision.decision).toBe(
      QualityDecisionType.ESCALATED_FOR_REINSPECTION,
    );
    expect(decision.reasonCode).toBe("SUSPECTED_TUNGSTEN_CORE");

    // Item should remain in its pending state for reinspection
    const item = await getQualityCheckItemById(qcItemId);
    expect(item?.status).toBe(QualityCheckItemStatus.PENDING);
  });

  it("Scenario 7: immutability trigger trg_quality_decisions_immutability rejects UPDATE and DELETE (INV-09)", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 10.0,
      measuredGrossWeightGrams: 10.0,
      damageDetected: false,
    });

    const decision = await createQualityDecision(
      {
        qualityCheckItemId: qcItemId,
        decision: QualityDecisionType.APPROVED,
        reasonCode: "DEC_REPO_IMMUTABLE",
        notes: "Strict append-only verification record",
        decidedByUserId: inspectorUserId,
      },
      { userId: inspectorUserId },
    );

    // Attempt UPDATE directly in SQL
    await expect(
      query("UPDATE quality_decisions SET notes = 'Tampered' WHERE id = $1;", [
        decision.id,
      ]),
    ).rejects.toThrow(/immutable and append-only/);

    // Attempt DELETE directly in SQL
    await expect(
      query("DELETE FROM quality_decisions WHERE id = $1;", [decision.id]),
    ).rejects.toThrow(/immutable and append-only/);
  });

  it("Scenario 8: rejects decision creation when session is sealed (ERR_SESSION_SEALED)", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 30.0,
      measuredGrossWeightGrams: 30.0,
      damageDetected: false,
    });

    // Seal the session
    await updateQualityCheck(qcId, {
      status: QualityCheckStatus.FINALIZED,
    });

    await expect(
      createQualityDecision(
        {
          qualityCheckItemId: qcItemId,
          decision: QualityDecisionType.APPROVED,
          reasonCode: "LATE_APPROVAL",
          notes: "Attempting approval after session sealed",
          decidedByUserId: inspectorUserId,
        },
        { userId: inspectorUserId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    // Unseal for subsequent tests
    await query(
      "UPDATE quality_checks SET status = 'IN_PROGRESS' WHERE id = $1",
      [qcId],
    );
  });

  it("Scenario 9: lists decisions by item ID and session ID", async () => {
    const { qcItemId } = await createPieceFixture({
      declaredGrossWeightGrams: 16.0,
      measuredGrossWeightGrams: 16.0,
      damageDetected: false,
    });

    // Record two decisions on same item (e.g. escalated then approved)
    await createQualityDecision(
      {
        qualityCheckItemId: qcItemId,
        decision: QualityDecisionType.ESCALATED_FOR_REINSPECTION,
        reasonCode: "INITIAL_UNCERTAINTY",
        notes: "First pass flagged for review",
        decidedByUserId: inspectorUserId,
      },
      { userId: inspectorUserId },
    );

    await createQualityDecision(
      {
        qualityCheckItemId: qcItemId,
        decision: QualityDecisionType.APPROVED,
        reasonCode: "RESOLVED_ON_RECHECK",
        notes: "Second pass cleared",
        decidedByUserId: supervisorUserId,
      },
      {
        userId: supervisorUserId,
        role: "STORE_MANAGER",
        hasWaiverPermission: true,
      },
    );

    const itemDecisions = await listQualityDecisionsByItemId(qcItemId);
    expect(itemDecisions.length).toBe(2);
    expect(itemDecisions[0].decision).toBe(QualityDecisionType.APPROVED);
    expect(itemDecisions[1].decision).toBe(
      QualityDecisionType.ESCALATED_FOR_REINSPECTION,
    );

    const sessionDecisions = await listQualityDecisionsBySessionId(qcId);
    expect(sessionDecisions.length).toBeGreaterThanOrEqual(2);
  });

  it("Scenario 10: records session-level quality decision and updates session status", async () => {
    const sessionDecision = await createQualityDecision(
      {
        qualityCheckId: qcId,
        decision: QualityDecisionType.APPROVED,
        reasonCode: "SESSION_ALL_ITEMS_VERIFIED",
        notes: "All received shipment lots fully inspected and reconciled",
        decidedByUserId: supervisorUserId,
      },
      {
        userId: supervisorUserId,
        role: "STORE_MANAGER",
        hasWaiverPermission: true,
      },
    );

    expect(sessionDecision.id).toBeDefined();
    expect(sessionDecision.qualityCheckId).toBe(qcId);
    expect(sessionDecision.qualityCheckItemId).toBeNull();
    expect(sessionDecision.decision).toBe(QualityDecisionType.APPROVED);

    const session = await getQualityCheckById(qcId);
    expect(session?.status).toBe(QualityCheckStatus.APPROVED);
    expect(session?.completedAt).toBeDefined();
  });
});
