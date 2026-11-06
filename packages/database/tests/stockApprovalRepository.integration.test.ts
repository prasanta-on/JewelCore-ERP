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
  createRfidTag,
  assignRfidTag,
  createStockApproval,
  getStockApprovalById,
  getLatestApprovalByItemId,
  listStockApprovals,
  getInventoryItemById,
} from "../src/index.js";
import {
  StoreType,
  MeasurementType,
  StockApprovalStatus,
  CommercialState,
  ApprovalState,
  QualityState,
  CustodyState,
  StateDimension,
  NotFoundError,
  ForbiddenError,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("Commercial Stock Approval Workflow Repository (FEAT-GOV-01, Entity 39)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;
  let compartmentId: string;
  let approverUserId: string;
  let skuId: string;
  let eligibleItemId: string;
  let unassignedItemId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE stock_approvals DISABLE TRIGGER trg_stock_approvals_immutability;",
    );
    await query(
      "DELETE FROM stock_approvals WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_REPO', 'ORG_STK_APPR_ALT'));",
    );
    await query(
      "ALTER TABLE stock_approvals ENABLE TRIGGER trg_stock_approvals_immutability;",
    );

    await query(
      "DELETE FROM rfid_tag_assignments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_REPO', 'ORG_STK_APPR_ALT'));",
    );
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_REPO', 'ORG_STK_APPR_ALT'));",
    );

    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_REPO', 'ORG_STK_APPR_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );

    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_STK_APPR_REPO', 'ORG_STK_APPR_ALT'));",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id = 'SCL-STK-APPR-01';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_STK_APPR_%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_STK_APPR_%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number = 'SHP-STK-APPR-001');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number = 'SHP-STK-APPR-001';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number = 'GRN-STK-APPR-001';",
    );
    await query("DELETE FROM suppliers WHERE code = 'SUP_STK_APPR_01';");
    await query(
      "DELETE FROM product_skus WHERE sku_code = 'SKU-STK-APPR-RING-01';",
    );
    await query(
      "DELETE FROM products WHERE product_code = 'PRD_STK_APPR_RING';",
    );
    await query("DELETE FROM purities WHERE code = 'PUR_STK_APPR_750';");
    await query("DELETE FROM materials WHERE code = 'MAT_STK_APPR_GOLD';");
    await query("DELETE FROM categories WHERE code = 'CAT_STK_APPR_RING';");
    await query("DELETE FROM compartments WHERE code = 'CMP_STK_APPR_01';");
    await query("DELETE FROM lockers WHERE code = 'LCK_STK_APPR_01';");
    await query("DELETE FROM vaults WHERE code = 'VLT_STK_APPR_01';");
    await query(
      "DELETE FROM users WHERE email LIKE 'stk_appr_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_STK_APPR_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_STK_APPR_REPO', 'ORG_STK_APPR_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_STK_APPR_REPO",
      name: "Stock Approval Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_STK_APPR_ALT",
      name: "Stock Approval Alt Enterprise",
    });
    otherOrgId = altOrg.id;

    // 2. Stores & Compartment
    const store = await createStore({
      organizationId: orgId,
      code: "STORE_STK_APPR_01",
      name: "Main Flagship Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_STK_APPR_02",
      name: "Secondary Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    const vault = await createVault({
      storeId,
      code: "VLT_STK_APPR_01",
      name: "Main High Security Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_STK_APPR_01",
      name: "Diamond Locker",
      lockerNumber: "DL-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_STK_APPR_01",
      name: "Top Drawer",
      compartmentNumber: "TD-01",
    });
    compartmentId = comp.id;

    // 3. User
    const user = await createUser({
      organizationId: orgId,
      email: "stk_appr_repo_mgr@jewelcore.local",
      firstName: "Approval",
      lastName: "Manager",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    approverUserId = user.id;

    // 4. Product & SKU
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_STK_APPR_RING",
      name: "Solitaire Rings",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_STK_APPR_GOLD",
      name: "18K Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_STK_APPR_750",
      name: "18K-750",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_STK_APPR_RING",
      name: "Solitaire Engagement Ring",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-STK-APPR-RING-01",
      name: "Solitaire Ring 18K",
      variantName: "Size 6",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 5.0,
      targetMetalWeightGrams: 4.8,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // 5. Procurement, QC and Birthing
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_STK_APPR_01",
      name: "De Beers Diamond Supplier",
    });

    const grn = await createGrn({
      organizationId: orgId,
      supplierId: supplier.id,
      storeId,
      grnNumber: "GRN-STK-APPR-001",
      createdByUserId: approverUserId,
      receivedByUserId: approverUserId,
      totalLinesExpected: 2,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHP-STK-APPR-001",
      receivedByUserId: approverUserId,
      receivedAt: new Date(),
    });

    const shipItem1 = await addShipmentItem(shipment.id, {
      productSkuId: skuId,
      lineNumber: 1,
      declaredPieceCount: 1,
      receivedPieceCount: 1,
      declaredGrossWeightGrams: 5.0,
    });

    const shipItem2 = await addShipmentItem(shipment.id, {
      productSkuId: skuId,
      lineNumber: 2,
      declaredPieceCount: 1,
      receivedPieceCount: 1,
      declaredGrossWeightGrams: 5.0,
    });

    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId,
      inspectorUserId: approverUserId,
      inspectionType: "INITIAL_INTAKE",
    });

    // Item 1: Eligible piece
    const qcItem1 = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem1.id,
      verifiedMaterialId: mat.id,
      verifiedPurityId: pur.id,
      itemSequenceNumber: 1,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem1.id,
      balanceDeviceId: "SCL-STK-APPR-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 5.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: approverUserId,
    });

    await updateQualityCheckItem(
      qcItem1.id,
      {
        grossWeightGrams: 5.0,
        tareWeightGrams: 0,
        netWeightGrams: 4.8,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: approverUserId },
    );

    const item1 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem1.id,
        initialCompartmentId: compartmentId,
      },
      orgId,
    );
    eligibleItemId = item1.id;

    // Item 2: Piece without RFID tag
    const qcItem2 = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem2.id,
      verifiedMaterialId: mat.id,
      verifiedPurityId: pur.id,
      itemSequenceNumber: 2,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem2.id,
      balanceDeviceId: "SCL-STK-APPR-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 5.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: approverUserId,
    });

    await updateQualityCheckItem(
      qcItem2.id,
      {
        grossWeightGrams: 5.0,
        tareWeightGrams: 0,
        netWeightGrams: 4.8,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: approverUserId },
    );

    const item2 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem2.id,
        initialCompartmentId: compartmentId,
      },
      orgId,
    );
    unassignedItemId = item2.id;

    // Create and bind active RFID tag to eligible item
    const tag = await createRfidTag({
      organizationId: orgId,
      epc: "E280116060000204781A0001",
      tid: "E28011600000000000000001",
    });

    await assignRfidTag(
      {
        inventoryItemId: eligibleItemId,
        rfidTagId: tag.id,
        organizationId: orgId,
      },
      { userId: approverUserId },
    );
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("authorizes stock approval and unlocks commercial availability (INV-01)", async () => {
    const itemBefore = await getInventoryItemById(eligibleItemId);
    expect(itemBefore).toBeDefined();
    expect(itemBefore!.qualityState).toBe(QualityState.QC_APPROVED);
    expect(itemBefore!.custodyState).toBe(CustodyState.IN_VAULT);
    expect(itemBefore!.approvalState).toBe(ApprovalState.DRAFT);
    expect(itemBefore!.commercialState).toBe(CommercialState.UNREADY);
    const initialVersion = itemBefore!.version;

    const approval = await createStockApproval(
      {
        inventoryItemId: eligibleItemId,
        approvalStatus: StockApprovalStatus.APPROVED,
        approvalNotes:
          "Verified hallmark and aesthetic perfection. Approved for boutique sale.",
        organizationId: orgId,
        storeId,
      },
      { userId: approverUserId },
    );

    expect(approval).toBeDefined();
    expect(approval.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(approval.organizationId).toBe(orgId);
    expect(approval.storeId).toBe(storeId);
    expect(approval.inventoryItemId).toBe(eligibleItemId);
    expect(approval.approverUserId).toBe(approverUserId);
    expect(approval.approvalStatus).toBe(StockApprovalStatus.APPROVED);
    expect(approval.approvalNotes).toBe(
      "Verified hallmark and aesthetic perfection. Approved for boutique sale.",
    );
    expect(approval.rejectionReasonCode).toBeNull();
    expect(approval.approvedAt).toBeInstanceOf(Date);

    // Verify parent piece state mutated correctly
    const itemAfter = await getInventoryItemById(eligibleItemId);
    expect(itemAfter!.approvalState).toBe(ApprovalState.APPROVED);
    expect(itemAfter!.commercialState).toBe(CommercialState.AVAILABLE_FOR_SALE);
    expect(itemAfter!.version).toBe(initialVersion + 1);

    // Verify dual status history entries logged in inventory_status_history
    const historyRes = await query<{
      dimension_changed: string;
      old_state: string;
      new_state: string;
      reason: string;
    }>(
      `SELECT dimension_changed, old_state, new_state, reason
       FROM inventory_status_history
       WHERE inventory_item_id = $1
       ORDER BY created_at DESC
       LIMIT 2`,
      [eligibleItemId],
    );

    expect(historyRes.rows.length).toBe(2);
    const dimensions = historyRes.rows.map((r) => r.dimension_changed);
    expect(dimensions).toContain(StateDimension.APPROVAL);
    expect(dimensions).toContain(StateDimension.COMMERCIAL);

    const approvalHist = historyRes.rows.find(
      (r) => r.dimension_changed === StateDimension.APPROVAL,
    );
    expect(approvalHist?.new_state).toBe(ApprovalState.APPROVED);

    const commercialHist = historyRes.rows.find(
      (r) => r.dimension_changed === StateDimension.COMMERCIAL,
    );
    expect(commercialHist?.new_state).toBe(CommercialState.AVAILABLE_FOR_SALE);
  });

  it("fails approval if active RFID tag transponder is missing (INV-01)", async () => {
    await expect(
      createStockApproval(
        {
          inventoryItemId: unassignedItemId,
          approvalStatus: StockApprovalStatus.APPROVED,
          approvalNotes: "Trying to approve piece without RFID",
          organizationId: orgId,
          storeId,
        },
        { userId: approverUserId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    try {
      await createStockApproval(
        {
          inventoryItemId: unassignedItemId,
          approvalStatus: StockApprovalStatus.APPROVED,
          approvalNotes: "Trying to approve piece without RFID",
          organizationId: orgId,
          storeId,
        },
        { userId: approverUserId },
      );
    } catch (err: any) {
      expect(err.code).toBe("ERR_INV_01_TAG_REQUIRED");
      expect(err.message).toContain("without an active RFID tag");
    }
  });

  it("fails approval if quality_state is not QC_APPROVED (INV-01)", async () => {
    // Manually force item quality_state to RE_INSPECTION for test
    await query(
      `UPDATE inventory_items SET quality_state = 'RE_INSPECTION' WHERE id = $1`,
      [eligibleItemId],
    );

    await expect(
      createStockApproval(
        {
          inventoryItemId: eligibleItemId,
          approvalStatus: StockApprovalStatus.APPROVED,
          organizationId: orgId,
          storeId,
        },
        { userId: approverUserId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    try {
      await createStockApproval(
        {
          inventoryItemId: eligibleItemId,
          approvalStatus: StockApprovalStatus.APPROVED,
          organizationId: orgId,
          storeId,
        },
        { userId: approverUserId },
      );
    } catch (err: any) {
      expect(err.code).toBe("ERR_INV_01_QC_NOT_APPROVED");
    }

    // Restore to QC_APPROVED
    await query(
      `UPDATE inventory_items SET quality_state = 'QC_APPROVED' WHERE id = $1`,
      [eligibleItemId],
    );
  });

  it("fails approval if custody_state is not IN_VAULT or IN_DISPLAY (INV-01)", async () => {
    // Manually update custody_state to IN_TRANSIT
    await query(
      `UPDATE inventory_items SET custody_state = 'IN_TRANSIT' WHERE id = $1`,
      [eligibleItemId],
    );

    await expect(
      createStockApproval(
        {
          inventoryItemId: eligibleItemId,
          approvalStatus: StockApprovalStatus.APPROVED,
          organizationId: orgId,
          storeId,
        },
        { userId: approverUserId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    try {
      await createStockApproval(
        {
          inventoryItemId: eligibleItemId,
          approvalStatus: StockApprovalStatus.APPROVED,
          organizationId: orgId,
          storeId,
        },
        { userId: approverUserId },
      );
    } catch (err: any) {
      expect(err.code).toBe("ERR_INV_01_INVALID_CUSTODY_STATE");
    }

    // Restore to IN_VAULT
    await query(
      `UPDATE inventory_items SET custody_state = 'IN_VAULT' WHERE id = $1`,
      [eligibleItemId],
    );
  });

  it("rejects approval correctly and keeps piece in UNREADY state", async () => {
    const rejection = await createStockApproval(
      {
        inventoryItemId: eligibleItemId,
        approvalStatus: StockApprovalStatus.REJECTED,
        approvalNotes:
          "Subtle prong misalignment detected during managerial inspection.",
        rejectionReasonCode: "AESTHETIC_DEFECT",
        organizationId: orgId,
        storeId,
      },
      { userId: approverUserId },
    );

    expect(rejection.approvalStatus).toBe(StockApprovalStatus.REJECTED);
    expect(rejection.rejectionReasonCode).toBe("AESTHETIC_DEFECT");

    const itemAfter = await getInventoryItemById(eligibleItemId);
    expect(itemAfter!.approvalState).toBe(ApprovalState.REJECTED);
    expect(itemAfter!.commercialState).toBe(CommercialState.UNREADY);
  });

  it("enforces multi-store boundary check (INV-11)", async () => {
    await expect(
      createStockApproval(
        {
          inventoryItemId: eligibleItemId,
          approvalStatus: StockApprovalStatus.APPROVED,
          organizationId: orgId,
          storeId: otherStoreId, // Mismatched store ID
        },
        { userId: approverUserId },
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("enforces tenant boundary check on inventory piece lookup", async () => {
    await expect(
      createStockApproval(
        {
          inventoryItemId: eligibleItemId,
          approvalStatus: StockApprovalStatus.APPROVED,
          organizationId: otherOrgId, // Cross-tenant
          storeId,
        },
        { userId: approverUserId },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("prohibits UPDATE and DELETE via immutability trigger trg_stock_approvals_immutability (INV-09)", async () => {
    const latest = await getLatestApprovalByItemId(eligibleItemId, orgId);
    expect(latest).toBeDefined();

    // UPDATE attempt
    await expect(
      query(
        `UPDATE stock_approvals SET approval_notes = 'tampered' WHERE id = $1`,
        [latest!.id],
      ),
    ).rejects.toThrow();

    // DELETE attempt
    await expect(
      query(`DELETE FROM stock_approvals WHERE id = $1`, [latest!.id]),
    ).rejects.toThrow();
  });

  it("retrieves approvals by ID, latest piece approval, and filtered query", async () => {
    const latest = await getLatestApprovalByItemId(eligibleItemId, orgId);
    expect(latest).toBeDefined();

    const byId = await getStockApprovalById(latest!.id, orgId);
    expect(byId).toBeDefined();
    expect(byId!.id).toBe(latest!.id);

    // Cross-tenant lookup returns null
    const crossTenant = await getStockApprovalById(latest!.id, otherOrgId);
    expect(crossTenant).toBeNull();

    // List query
    const list = await listStockApprovals({
      organizationId: orgId,
      inventoryItemId: eligibleItemId,
      limit: 10,
      offset: 0,
    });
    expect(list.length).toBeGreaterThanOrEqual(2); // One approved, one rejected

    const filteredApproved = await listStockApprovals({
      organizationId: orgId,
      inventoryItemId: eligibleItemId,
      approvalStatus: StockApprovalStatus.APPROVED,
      limit: 10,
      offset: 0,
    });
    expect(filteredApproved.length).toBe(1);
    expect(filteredApproved[0]!.approvalStatus).toBe(
      StockApprovalStatus.APPROVED,
    );
  });
});
