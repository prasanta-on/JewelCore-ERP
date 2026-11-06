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
  getRfidTagById,
  assignRfidTag,
  retireRfidTagAssignment,
  getActiveAssignmentByItemId,
  getRfidAssignmentById,
  listRfidAssignments,
} from "../src/index.js";
import {
  StoreType,
  MeasurementType,
  RfidTagStatus,
  RfidAssignmentStatus,
  RfidRetirementReason,
  CommercialState,
  StateDimension,
} from "@jewelcore/shared";

describe("RFID Tag Binding & Detachment Lifecycle Repository (FEAT-RFID-02, Entity 36)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let compartmentId: string;
  let operatorUserId: string;
  let skuId: string;
  let testItemId: string;
  let secondItemId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale RFID assignment test fixtures
    await query(
      "DELETE FROM rfid_tag_assignments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT'));",
    );
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT'));",
    );
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id = 'SCL-RFID-01';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_BIND_%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_BIND_%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number = 'SHP-RFID-BIND-001');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number = 'SHP-RFID-BIND-001';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number = 'GRN-RFID-BIND-001';",
    );
    await query("DELETE FROM suppliers WHERE code = 'SUP_RFID_BIND_01';");
    await query(
      "DELETE FROM product_skus WHERE sku_code = 'SKU-RFID-BIND-COLLAR-01';",
    );
    await query(
      "DELETE FROM products WHERE product_code = 'PRD_RFID_BIND_COLLAR';",
    );
    await query("DELETE FROM purities WHERE code = 'PUR_RFID_BIND_950';");
    await query("DELETE FROM materials WHERE code = 'MAT_RFID_BIND_PLAT';");
    await query("DELETE FROM categories WHERE code = 'CAT_RFID_BIND_NECK';");
    await query("DELETE FROM compartments WHERE code = 'CMP_RFID_BIND_01';");
    await query("DELETE FROM lockers WHERE code = 'LCK_RFID_BIND_01';");
    await query("DELETE FROM vaults WHERE code = 'VLT_RFID_BIND_01';");
    await query(
      "DELETE FROM users WHERE email LIKE 'rfid_bind_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RFID_BIND_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT');",
    );

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_RFID_BIND_REPO",
      name: "RFID Binding Test Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_RFID_BIND_ALT",
      name: "RFID Binding Alt Enterprise",
    });
    otherOrgId = altOrg.id;

    // 2. Store & Compartment
    const store = await createStore({
      organizationId: orgId,
      code: "STORE_RFID_BIND_01",
      name: "Flagship RFID Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const vault = await createVault({
      storeId,
      code: "VLT_RFID_BIND_01",
      name: "Security Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_RFID_BIND_01",
      name: "Locker 01",
      lockerNumber: "L-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_RFID_BIND_01",
      name: "Safe Box 01",
      compartmentNumber: "C-01",
    });
    compartmentId = comp.id;

    // 3. User
    const user = await createUser({
      organizationId: orgId,
      email: "rfid_bind_repo_mgr@jewelcore.local",
      firstName: "Tag",
      lastName: "Operator",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    operatorUserId = user.id;

    // 4. Product & SKU
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_RFID_BIND_NECK",
      name: "Necklaces",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_RFID_BIND_PLAT",
      name: "Platinum",
      baseMetalType: "PLATINUM",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_RFID_BIND_950",
      name: "PT950",
      purityPercentage: 95.0,
      purityRatio: 0.95,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_RFID_BIND_COLLAR",
      name: "Diamond Collar Necklace",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-RFID-BIND-COLLAR-01",
      name: "Diamond Collar Necklace",
      variantName: "Standard Size",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 45.0,
      targetMetalWeightGrams: 42.0,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // 5. Inbound Procurement, QC & Serialized Item Birth
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_RFID_BIND_01",
      name: "Antwerp Diamond Cutters",
    });

    const grn = await createGrn({
      organizationId: orgId,
      supplierId: supplier.id,
      storeId,
      grnNumber: "GRN-RFID-BIND-001",
      createdByUserId: operatorUserId,
      receivedByUserId: operatorUserId,
      totalLinesExpected: 2,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHP-RFID-BIND-001",
      receivedByUserId: operatorUserId,
      receivedAt: new Date(),
    });

    const shipItem1 = await addShipmentItem(shipment.id, {
      productSkuId: skuId,
      lineNumber: 1,
      declaredPieceCount: 1,
      receivedPieceCount: 1,
      declaredGrossWeightGrams: 45.0,
    });

    const shipItem2 = await addShipmentItem(shipment.id, {
      productSkuId: skuId,
      lineNumber: 2,
      declaredPieceCount: 1,
      receivedPieceCount: 1,
      declaredGrossWeightGrams: 45.0,
    });

    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId,
      inspectorUserId: operatorUserId,
      inspectionType: "INITIAL_INTAKE",
    });

    // QC Item 1
    const qcItem1 = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem1.id,
      verifiedMaterialId: mat.id,
      verifiedPurityId: pur.id,
      itemSequenceNumber: 1,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem1.id,
      balanceDeviceId: "SCL-RFID-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 45.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: operatorUserId,
    });

    await updateQualityCheckItem(
      qcItem1.id,
      {
        grossWeightGrams: 45.0,
        tareWeightGrams: 0,
        netWeightGrams: 42.0,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: operatorUserId },
    );

    const item1 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem1.id,
        initialCompartmentId: compartmentId,
      },
      orgId,
    );
    testItemId = item1.id;

    // QC Item 2
    const qcItem2 = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: shipItem2.id,
      verifiedMaterialId: mat.id,
      verifiedPurityId: pur.id,
      itemSequenceNumber: 2,
    });

    await createWeightMeasurement({
      qualityCheckItemId: qcItem2.id,
      balanceDeviceId: "SCL-RFID-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 45.0,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: operatorUserId,
    });

    await updateQualityCheckItem(
      qcItem2.id,
      {
        grossWeightGrams: 45.0,
        tareWeightGrams: 0,
        netWeightGrams: 42.0,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: operatorUserId },
    );

    const item2 = await birthInventoryItem(
      {
        qualityCheckItemId: qcItem2.id,
        initialCompartmentId: compartmentId,
      },
      orgId,
    );
    secondItemId = item2.id;
  });

  afterAll(async () => {
    await query(
      "DELETE FROM rfid_tag_assignments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT'));",
    );
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT'));",
    );
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id = 'SCL-RFID-01';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_BIND_%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_BIND_%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number = 'SHP-RFID-BIND-001');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number = 'SHP-RFID-BIND-001';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number = 'GRN-RFID-BIND-001';",
    );
    await query("DELETE FROM suppliers WHERE code = 'SUP_RFID_BIND_01';");
    await query(
      "DELETE FROM product_skus WHERE sku_code = 'SKU-RFID-BIND-COLLAR-01';",
    );
    await query(
      "DELETE FROM products WHERE product_code = 'PRD_RFID_BIND_COLLAR';",
    );
    await query("DELETE FROM purities WHERE code = 'PUR_RFID_BIND_950';");
    await query("DELETE FROM materials WHERE code = 'MAT_RFID_BIND_PLAT';");
    await query("DELETE FROM categories WHERE code = 'CAT_RFID_BIND_NECK';");
    await query("DELETE FROM compartments WHERE code = 'CMP_RFID_BIND_01';");
    await query("DELETE FROM lockers WHERE code = 'LCK_RFID_BIND_01';");
    await query("DELETE FROM vaults WHERE code = 'VLT_RFID_BIND_01';");
    await query(
      "DELETE FROM users WHERE email LIKE 'rfid_bind_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RFID_BIND_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RFID_BIND_REPO', 'ORG_RFID_BIND_ALT');",
    );
    await closePool();
  });

  let assignedTagId: string;
  let assignmentRecordId: string;

  // Scenario 1: Assigns an UNENCODED tag to an inventory piece; auto-activates tag
  it("Scenario 1: binds unencoded tag to piece, activating tag and recording encoded_at", async () => {
    const tag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049BND0001",
      tid: "TID-BIND-0001",
    });
    assignedTagId = tag.id;
    expect(tag.status).toBe(RfidTagStatus.UNENCODED);
    expect(tag.encodedAt).toBeNull();

    const assignment = await assignRfidTag(
      {
        organizationId: orgId,
        inventoryItemId: testItemId,
        rfidTagId: tag.id,
      },
      { userId: operatorUserId },
    );

    expect(assignment.id).toBeDefined();
    expect(assignment.inventoryItemId).toBe(testItemId);
    expect(assignment.rfidTagId).toBe(tag.id);
    expect(assignment.status).toBe(RfidAssignmentStatus.ACTIVE);
    expect(assignment.assignedByUserId).toBe(operatorUserId);
    expect(assignment.retiredAt).toBeNull();

    assignmentRecordId = assignment.id;

    // Verify tag in rfid_tags transitioned to ACTIVE
    const updatedTag = await getRfidTagById(tag.id);
    expect(updatedTag).not.toBeNull();
    expect(updatedTag?.status).toBe(RfidTagStatus.ACTIVE);
    expect(updatedTag?.encodedAt).not.toBeNull();
  });

  // Scenario 2: Enforces INV-03 (Single Active Tag per Item)
  it("Scenario 2: rejects assigning a second active tag to the same piece (INV-03 / 409 Conflict)", async () => {
    const secondTag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049BND0002",
    });

    await expect(
      assignRfidTag(
        {
          organizationId: orgId,
          inventoryItemId: testItemId,
          rfidTagId: secondTag.id,
        },
        { userId: operatorUserId },
      ),
    ).rejects.toThrowError(/already has an active RFID tag assigned/);
  });

  // Scenario 3: Enforces INV-04 (Single Active Item per Tag)
  it("Scenario 3: rejects assigning an already active tag to another piece (INV-04 / 409 Conflict)", async () => {
    await expect(
      assignRfidTag(
        {
          organizationId: orgId,
          inventoryItemId: secondItemId,
          rfidTagId: assignedTagId,
        },
        { userId: operatorUserId },
      ),
    ).rejects.toThrowError(/already actively assigned to an inventory item/);
  });

  // Scenario 4: Rejects binding a terminal tag (RETIRED or DAMAGED)
  it("Scenario 4: rejects binding a terminal tag transponder (422 Unprocessable Entity)", async () => {
    const retiredTag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049BND0003",
    });

    // Manually mark tag as RETIRED
    await query("UPDATE rfid_tags SET status = 'RETIRED' WHERE id = $1", [
      retiredTag.id,
    ]);

    await expect(
      assignRfidTag(
        {
          organizationId: orgId,
          inventoryItemId: secondItemId,
          rfidTagId: retiredTag.id,
        },
        { userId: operatorUserId },
      ),
    ).rejects.toThrowError(/is in terminal status 'RETIRED'/);
  });

  // Scenario 5: Retires active tag assignment with reason DETACHED
  it("Scenario 5: retires active assignment and sets tag transponder to RETIRED", async () => {
    const retired = await retireRfidTagAssignment(
      assignmentRecordId,
      {
        status: RfidAssignmentStatus.RETIRED,
        retirementReason: RfidRetirementReason.DETACHED,
        notes: "Tag clip broken during showroom transfer",
      },
      orgId,
      { userId: operatorUserId },
    );

    expect(retired.status).toBe(RfidAssignmentStatus.RETIRED);
    expect(retired.retiredAt).not.toBeNull();
    expect(retired.retiredByUserId).toBe(operatorUserId);
    expect(retired.retirementReason).toBe(RfidRetirementReason.DETACHED);

    const tag = await getRfidTagById(assignedTagId);
    expect(tag?.status).toBe(RfidTagStatus.RETIRED);
    expect(tag?.retiredAt).not.toBeNull();
  });

  // Scenario 6: Rejects retiring an already retired assignment
  it("Scenario 6: rejects retiring an assignment that is already retired (400 Bad Request)", async () => {
    await expect(
      retireRfidTagAssignment(
        assignmentRecordId,
        {
          retirementReason: RfidRetirementReason.DAMAGED,
        },
        orgId,
        { userId: operatorUserId },
      ),
    ).rejects.toThrowError(
      /is currently in status 'RETIRED' and cannot be retired/,
    );
  });

  // Scenario 7: Retires active tag assignment with reason DAMAGED
  it("Scenario 7: sets transponder status to DAMAGED when retirementReason is DAMAGED", async () => {
    const tag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049BND0004",
    });

    const assignment = await assignRfidTag(
      {
        organizationId: orgId,
        inventoryItemId: secondItemId,
        rfidTagId: tag.id,
      },
      { userId: operatorUserId },
    );

    const retired = await retireRfidTagAssignment(
      assignment.id,
      {
        status: RfidAssignmentStatus.RETIRED,
        retirementReason: RfidRetirementReason.DAMAGED,
        notes: "IC chip crushed by display tray",
      },
      orgId,
      { userId: operatorUserId },
    );

    expect(retired.status).toBe(RfidAssignmentStatus.RETIRED);
    expect(retired.retirementReason).toBe(RfidRetirementReason.DAMAGED);

    const updatedTag = await getRfidTagById(tag.id);
    expect(updatedTag?.status).toBe(RfidTagStatus.DAMAGED);
  });

  // Scenario 8: INV-07 Automatic Commercial Availability Reversion
  it("Scenario 8: detaching active tag from AVAILABLE_FOR_SALE item reverts commercial state to UNREADY (INV-07)", async () => {
    // 1. Assign a new tag to testItemId (which is now untagged after Scenario 5)
    const newTag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049BND0005",
    });

    const assignment = await assignRfidTag(
      {
        organizationId: orgId,
        inventoryItemId: testItemId,
        rfidTagId: newTag.id,
      },
      { userId: operatorUserId },
    );

    // 2. Set test item commercial state to AVAILABLE_FOR_SALE
    await query(
      "UPDATE inventory_items SET commercial_state = 'AVAILABLE_FOR_SALE' WHERE id = $1",
      [testItemId],
    );

    // 3. Retire the tag
    await retireRfidTagAssignment(
      assignment.id,
      {
        retirementReason: RfidRetirementReason.DETACHED,
        notes: "Tag fell off during customer viewing",
      },
      orgId,
      { userId: operatorUserId },
    );

    // 4. Verify item commercial_state was reverted to UNREADY
    const itemRes = await query<{ commercial_state: string; version: number }>(
      "SELECT commercial_state, version FROM inventory_items WHERE id = $1",
      [testItemId],
    );
    expect(itemRes.rows[0].commercial_state).toBe(CommercialState.UNREADY);

    // 5. Verify status history audit record was logged
    const histRes = await query<{
      dimension_changed: string;
      old_state: string;
      new_state: string;
      reason: string;
    }>(
      `SELECT dimension_changed, old_state, new_state, reason
       FROM inventory_status_history
       WHERE inventory_item_id = $1
       ORDER BY transitioned_at DESC
       LIMIT 1`,
      [testItemId],
    );
    expect(histRes.rows.length).toBe(1);
    expect(histRes.rows[0].dimension_changed).toBe(StateDimension.COMMERCIAL);
    expect(histRes.rows[0].old_state).toBe(CommercialState.AVAILABLE_FOR_SALE);
    expect(histRes.rows[0].new_state).toBe(CommercialState.UNREADY);
    expect(histRes.rows[0].reason).toContain("RFID tag detached/retired");
  });

  // Scenario 9: Multi-tenant boundary isolation
  it("Scenario 9: prevents cross-tenant tag assignment", async () => {
    const otherTag = await createRfidTag({
      organizationId: otherOrgId,
      epc: "E2801160600002049BND0006",
    });

    await expect(
      assignRfidTag(
        {
          organizationId: orgId,
          inventoryItemId: testItemId,
          rfidTagId: otherTag.id,
        },
        { userId: operatorUserId },
      ),
    ).rejects.toThrowError(/not found/);
  });

  // Scenario 10: Lookups and listing
  it("Scenario 10: looks up active assignment by item ID and lists assignments", async () => {
    // Re-bind a new tag to secondItemId
    const freshTag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049BND0007",
    });

    const activeAssignment = await assignRfidTag(
      {
        organizationId: orgId,
        inventoryItemId: secondItemId,
        rfidTagId: freshTag.id,
      },
      { userId: operatorUserId },
    );

    // Lookup active assignment
    const foundActive = await getActiveAssignmentByItemId(secondItemId, orgId);
    expect(foundActive).not.toBeNull();
    expect(foundActive?.id).toBe(activeAssignment.id);
    expect(foundActive?.status).toBe(RfidAssignmentStatus.ACTIVE);

    // Lookup by ID
    const foundById = await getRfidAssignmentById(activeAssignment.id, orgId);
    expect(foundById).not.toBeNull();
    expect(foundById?.id).toBe(activeAssignment.id);

    // List assignments
    const list = await listRfidAssignments({
      organizationId: orgId,
      inventoryItemId: secondItemId,
      limit: 10,
      offset: 0,
    });
    expect(list.length).toBeGreaterThanOrEqual(2); // previous retired + current active
  });
});
