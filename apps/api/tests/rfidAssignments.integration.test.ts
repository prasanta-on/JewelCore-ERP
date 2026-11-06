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
  createRfidTag,
  getRfidTagById,
} from "@jewelcore/database";
import {
  StoreType,
  MeasurementType,
  RfidTagStatus,
  RfidAssignmentStatus,
  RfidRetirementReason,
  CommercialState,
  StateDimension,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("RFID Tag Binding & Detachment Lifecycle API (FEAT-RFID-02 / INV-03, INV-04, INV-07)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let compartmentId: string;
  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let otherOrgManagerToken: string;
  let skuId: string;
  let testItemId: string;
  let secondItemId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "DELETE FROM rfid_tag_assignments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id = 'SCL-RFID-ASSIGN-01';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_ASSIGN_%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_ASSIGN_%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number = 'SHP-RFID-ASSIGN-001');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number = 'SHP-RFID-ASSIGN-001';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number = 'GRN-RFID-ASSIGN-001';",
    );
    await query("DELETE FROM suppliers WHERE code = 'SUP_RFID_ASSIGN_01';");
    await query(
      "DELETE FROM product_skus WHERE sku_code = 'SKU-RFID-ASSIGN-RING-01';",
    );
    await query(
      "DELETE FROM products WHERE product_code = 'PRD_RFID_ASSIGN_RING';",
    );
    await query("DELETE FROM purities WHERE code = 'PUR_RFID_ASSIGN_18K';");
    await query("DELETE FROM materials WHERE code = 'MAT_RFID_ASSIGN_GOLD';");
    await query("DELETE FROM categories WHERE code = 'CAT_RFID_ASSIGN_RINGS';");
    await query("DELETE FROM compartments WHERE code = 'CMP_RFID_ASSIGN_01';");
    await query("DELETE FROM lockers WHERE code = 'LCK_RFID_ASSIGN_01';");
    await query("DELETE FROM vaults WHERE code = 'VLT_RFID_ASSIGN_01';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_ASSIGN_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'rfid_assign_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'rfid_assign_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RFID_ASSIGN_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT');",
    );

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_RFID_ASSIGN_API",
      name: "RFID Assign Test Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_RFID_ASSIGN_API_ALT",
      name: "RFID Assign Alt Enterprise",
    });
    otherOrgId = altOrg.id;

    // 2. Store & Compartment
    const store = await createStore({
      organizationId: orgId,
      code: "STORE_RFID_ASSIGN_01",
      name: "Flagship RFID Assign Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const vault = await createVault({
      storeId,
      code: "VLT_RFID_ASSIGN_01",
      name: "Security Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_RFID_ASSIGN_01",
      name: "Locker 01",
      lockerNumber: "L-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_RFID_ASSIGN_01",
      name: "Safe Box 01",
      compartmentNumber: "C-01",
    });
    compartmentId = comp.id;

    // 3. Manager User (STORE_MANAGER with rfid:write and rfid:view)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "rfid_assign_api_mgr@jewelcore.local",
      firstName: "Assign",
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

    // 4. Associate User (SALES_ASSOCIATE with rfid:view only)
    const associateUser = await createUser({
      organizationId: orgId,
      email: "rfid_assign_api_assoc@jewelcore.local",
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

    // 5. Alt Org Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "rfid_assign_api_alt@jewelcore.local",
      firstName: "Alt",
      lastName: "Manager",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: altManagerUser.id,
      isDefault: true,
    });

    if (managerRole) {
      await assignRoleToUser(altManagerUser.id, managerRole.id);
    }

    otherOrgManagerToken = await signAccessToken({
      userId: altManagerUser.id,
      email: altManagerUser.email,
      orgId: otherOrgId,
    });

    // 6. Taxonomy, Product & SKU
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_RFID_ASSIGN_RINGS",
      name: "Rings",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_RFID_ASSIGN_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_RFID_ASSIGN_18K",
      name: "18K Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_RFID_ASSIGN_RING",
      name: "Solitaire Engagement Ring",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-RFID-ASSIGN-RING-01",
      name: "Solitaire Engagement Ring - Size 7",
      variantName: "Size 7",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 5.0,
      targetMetalWeightGrams: 5.0,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // 7. Procurement, QC & Serialized Item Birth
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_RFID_ASSIGN_01",
      name: "Valenza Master Goldsmiths",
    });

    const grn = await createGrn({
      organizationId: orgId,
      supplierId: supplier.id,
      storeId,
      grnNumber: "GRN-RFID-ASSIGN-001",
      createdByUserId: managerUserId,
      receivedByUserId: managerUserId,
      totalLinesExpected: 2,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHP-RFID-ASSIGN-001",
      receivedByUserId: managerUserId,
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
      inspectorUserId: managerUserId,
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
      balanceDeviceId: "SCL-RFID-ASSIGN-01",
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
      balanceDeviceId: "SCL-RFID-ASSIGN-01",
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
      "DELETE FROM rfid_tag_assignments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id = 'SCL-RFID-ASSIGN-01';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_ASSIGN_%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_ASSIGN_%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number = 'SHP-RFID-ASSIGN-001');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number = 'SHP-RFID-ASSIGN-001';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number = 'GRN-RFID-ASSIGN-001';",
    );
    await query("DELETE FROM suppliers WHERE code = 'SUP_RFID_ASSIGN_01';");
    await query(
      "DELETE FROM product_skus WHERE sku_code = 'SKU-RFID-ASSIGN-RING-01';",
    );
    await query(
      "DELETE FROM products WHERE product_code = 'PRD_RFID_ASSIGN_RING';",
    );
    await query("DELETE FROM purities WHERE code = 'PUR_RFID_ASSIGN_18K';");
    await query("DELETE FROM materials WHERE code = 'MAT_RFID_ASSIGN_GOLD';");
    await query("DELETE FROM categories WHERE code = 'CAT_RFID_ASSIGN_RINGS';");
    await query("DELETE FROM compartments WHERE code = 'CMP_RFID_ASSIGN_01';");
    await query("DELETE FROM lockers WHERE code = 'LCK_RFID_ASSIGN_01';");
    await query("DELETE FROM vaults WHERE code = 'VLT_RFID_ASSIGN_01';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_ASSIGN_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'rfid_assign_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'rfid_assign_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RFID_ASSIGN_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RFID_ASSIGN_API', 'ORG_RFID_ASSIGN_API_ALT');",
    );
    await closePool();
  });

  let assignedTagId: string;
  let assignmentId: string;

  // Scenario 1: Unauthorized access
  it("Scenario 1: rejects unauthenticated request with 401 Unauthorized", async () => {
    const res = await request(app).post("/api/v1/rfid/assignments").send({
      inventoryItemId: testItemId,
      rfidTagId: "0192e301-0000-7000-8000-000000000001",
    });

    expect(res.status).toBe(401);
  });

  // Scenario 2: Permission check - sales associate cannot assign tags
  it("Scenario 2: rejects tag assignment when lacking rfid:write permission (403 Forbidden)", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/assignments")
      .set("Authorization", `Bearer ${associateToken}`)
      .send({
        inventoryItemId: testItemId,
        rfidTagId: "0192e301-0000-7000-8000-000000000001",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  // Scenario 3: Successfully binds unencoded tag to piece
  it("Scenario 3: successfully binds unencoded tag to serialized piece (201 Created)", async () => {
    const tag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049API0001",
    });
    assignedTagId = tag.id;

    const res = await request(app)
      .post("/api/v1/rfid/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        inventoryItemId: testItemId,
        rfidTagId: tag.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.inventoryItemId).toBe(testItemId);
    expect(res.body.rfidTagId).toBe(tag.id);
    expect(res.body.status).toBe(RfidAssignmentStatus.ACTIVE);
    expect(res.body.assignedByUserId).toBe(managerUserId);

    assignmentId = res.body.id;

    // Verify tag in rfid_tags transitioned to ACTIVE and encoded_at is set
    const updatedTag = await getRfidTagById(tag.id);
    expect(updatedTag?.status).toBe(RfidTagStatus.ACTIVE);
    expect(updatedTag?.encodedAt).not.toBeNull();
  });

  // Scenario 4: Rejects second active tag on same piece (INV-03 / 409 Conflict)
  it("Scenario 4: rejects assigning a second active tag to the same piece (INV-03 / 409 Conflict)", async () => {
    const secondTag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049API0002",
    });

    const res = await request(app)
      .post("/api/v1/rfid/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        inventoryItemId: testItemId,
        rfidTagId: secondTag.id,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_ITEM_ALREADY_TAGGED");
  });

  // Scenario 5: Rejects assigning already active tag to another piece (INV-04 / 409 Conflict)
  it("Scenario 5: rejects assigning an already active tag to another piece (INV-04 / 409 Conflict)", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        inventoryItemId: secondItemId,
        rfidTagId: assignedTagId,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_TAG_ALREADY_ASSIGNED");
  });

  // Scenario 6: Rejects binding a terminal tag transponder (422 Unprocessable Entity)
  it("Scenario 6: rejects binding a terminal tag transponder (422 Unprocessable Entity)", async () => {
    const damagedTag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049API0003",
    });

    await query("UPDATE rfid_tags SET status = 'DAMAGED' WHERE id = $1", [
      damagedTag.id,
    ]);

    const res = await request(app)
      .post("/api/v1/rfid/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        inventoryItemId: secondItemId,
        rfidTagId: damagedTag.id,
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_TAG_TERMINAL_STATUS");
  });

  // Scenario 7: Retrieve assignment by ID
  it("Scenario 7: retrieves assignment by ID (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/rfid/assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${associateToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(assignmentId);
    expect(res.body.inventoryItemId).toBe(testItemId);
    expect(res.body.status).toBe(RfidAssignmentStatus.ACTIVE);
  });

  // Scenario 8: Retrieve active assignment for piece
  it("Scenario 8: retrieves active assignment for an item (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/rfid/items/${testItemId}/assignment`)
      .set("Authorization", `Bearer ${associateToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(assignmentId);
    expect(res.body.status).toBe(RfidAssignmentStatus.ACTIVE);
  });

  // Scenario 9: 404 for item with no active assignment
  it("Scenario 9: returns 404 for item with no active assignment", async () => {
    const res = await request(app)
      .get(`/api/v1/rfid/items/${secondItemId}/assignment`)
      .set("Authorization", `Bearer ${associateToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ERR_NOT_FOUND");
  });

  // Scenario 10: Retires active assignment
  it("Scenario 10: retires active assignment (200 OK)", async () => {
    const res = await request(app)
      .patch(`/api/v1/rfid/assignments/${assignmentId}/retire`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        retirementReason: RfidRetirementReason.DETACHED,
        notes: "Detached for appraisal",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(RfidAssignmentStatus.RETIRED);
    expect(res.body.retiredAt).not.toBeNull();
    expect(res.body.retirementReason).toBe(RfidRetirementReason.DETACHED);

    // Tag transponder should also be RETIRED
    const tag = await getRfidTagById(assignedTagId);
    expect(tag?.status).toBe(RfidTagStatus.RETIRED);
  });

  // Scenario 11: Rejects retiring an already retired assignment (400 Bad Request)
  it("Scenario 11: rejects retiring an already retired assignment (400 Bad Request)", async () => {
    const res = await request(app)
      .patch(`/api/v1/rfid/assignments/${assignmentId}/retire`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        retirementReason: RfidRetirementReason.DAMAGED,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_ASSIGNMENT_NOT_ACTIVE");
  });

  // Scenario 12: INV-07 Automatic Commercial Availability Reversion
  it("Scenario 12: detaching active tag reverts AVAILABLE_FOR_SALE item to UNREADY (INV-07)", async () => {
    // 1. Assign a new tag to testItemId
    const freshTag = await createRfidTag({
      organizationId: orgId,
      epc: "E2801160600002049API0004",
    });

    const assignRes = await request(app)
      .post("/api/v1/rfid/assignments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        inventoryItemId: testItemId,
        rfidTagId: freshTag.id,
      });
    expect(assignRes.status).toBe(201);

    // 2. Set item to AVAILABLE_FOR_SALE
    await query(
      "UPDATE inventory_items SET commercial_state = 'AVAILABLE_FOR_SALE' WHERE id = $1",
      [testItemId],
    );

    // 3. Retire assignment
    const retireRes = await request(app)
      .patch(`/api/v1/rfid/assignments/${assignRes.body.id}/retire`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        retirementReason: RfidRetirementReason.DETACHED,
        notes: "Tag damaged during customer demonstration",
      });
    expect(retireRes.status).toBe(200);

    // 4. Verify item commercial_state was reverted to UNREADY
    const itemRes = await query<{ commercial_state: string }>(
      "SELECT commercial_state FROM inventory_items WHERE id = $1",
      [testItemId],
    );
    expect(itemRes.rows[0].commercial_state).toBe(CommercialState.UNREADY);

    // 5. Verify audit entry in inventory_status_history
    const histRes = await query<{
      dimension_changed: string;
      old_state: string;
      new_state: string;
    }>(
      `SELECT dimension_changed, old_state, new_state
       FROM inventory_status_history
       WHERE inventory_item_id = $1
       ORDER BY transitioned_at DESC
       LIMIT 1`,
      [testItemId],
    );
    expect(histRes.rows[0].dimension_changed).toBe(StateDimension.COMMERCIAL);
    expect(histRes.rows[0].old_state).toBe(CommercialState.AVAILABLE_FOR_SALE);
    expect(histRes.rows[0].new_state).toBe(CommercialState.UNREADY);
  });

  // Scenario 13: List assignments
  it("Scenario 13: lists assignments matching query filters", async () => {
    const res = await request(app)
      .get("/api/v1/rfid/assignments")
      .set("Authorization", `Bearer ${associateToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  // Scenario 14: Cross-tenant isolation
  it("Scenario 14: prevents cross-tenant access to assignments (404 Not Found)", async () => {
    const res = await request(app)
      .get(`/api/v1/rfid/assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`);

    expect(res.status).toBe(404);
  });
});
