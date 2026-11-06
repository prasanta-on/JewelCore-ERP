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
  createGemstone,
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
  createWeightMeasurement,
  updateQualityCheckItem,
  addItemGemstone,
  createQualityDecision,
  birthInventoryItem,
  getInventoryItemById,
  getActiveAssignmentByItemId,
} from "@jewelcore/database";
import {
  StoreType,
  MeasurementType,
  QualityDecisionType,
  ApprovalState,
  CommercialState,
  CustodyState,
  MovementType,
  RfidJobStatus,
  RfidJobItemStatus,
  RfidAssignmentStatus,
  StockApprovalStatus,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Phase 0 Core Asset Lifecycle End-to-End System Integration Test (E2E Master Workflow)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let vaultId: string;
  let stagingCompartmentId: string;
  let showcaseCompartmentId: string;

  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let otherOrgManagerToken: string;

  let supplierId: string;
  let skuId: string;
  let grnId: string;
  let shipmentId: string;
  let shipmentItemId: string;
  let qcSessionId: string;
  let qcItemId: string;
  let birthedPieceId: string;
  let rfidJobId: string;
  let stockApprovalId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );
    await query(
      "ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;",
    );

    await query(
      "ALTER TABLE stock_approvals DISABLE TRIGGER trg_stock_approvals_immutability;",
    );
    await query(
      "DELETE FROM stock_approvals WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );
    await query(
      "ALTER TABLE stock_approvals ENABLE TRIGGER trg_stock_approvals_immutability;",
    );

    await query(
      "DELETE FROM rfid_job_items WHERE job_id IN (SELECT id FROM rfid_jobs WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT')));",
    );
    await query(
      "DELETE FROM rfid_jobs WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );
    await query("DELETE FROM outbox_events WHERE topic = 'rfid.job.created';");
    await query(
      "DELETE FROM rfid_tag_assignments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );

    await query(
      "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
    );

    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );

    await query(
      "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );
    await query(
      "ALTER TABLE quality_decisions DISABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM quality_decisions WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_E2E_LC_%'));",
    );
    await query(
      "ALTER TABLE quality_decisions ENABLE TRIGGER trg_quality_decisions_immutability;",
    );
    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_E2E_LC_%')));",
    );

    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id = 'BAL-E2E-METTLER-01';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );

    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_E2E_LC_%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_E2E_LC_%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number = 'SHP-E2E-LC-001');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number = 'SHP-E2E-LC-001';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number = 'GRN-E2E-LC-001';",
    );
    await query("DELETE FROM suppliers WHERE code = 'SUP_E2E_LC_01';");
    await query(
      "DELETE FROM product_skus WHERE sku_code = 'SKU-E2E-ROYAL-NECKLACE-01';",
    );
    await query(
      "DELETE FROM products WHERE product_code = 'PRD_E2E_ROYAL_NECKLACE';",
    );
    await query("DELETE FROM gemstones WHERE code = 'GEM_E2E_DIAMOND';");
    await query("DELETE FROM purities WHERE code = 'PUR_E2E_22K';");
    await query("DELETE FROM materials WHERE code = 'MAT_E2E_GOLD';");
    await query("DELETE FROM categories WHERE code = 'CAT_E2E_NECKLACES';");
    await query("DELETE FROM compartments WHERE code LIKE 'CMP_E2E_LC_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'LCK_E2E_LC_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'VLT_E2E_LC_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_E2E_LC_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'e2e_lc_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'e2e_lc_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_E2E_LC_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_E2E_LC', 'ORG_E2E_LC_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // -------------------------------------------------------------
    // Step 1: Enterprise Organization, Store & Storage Hierarchy (Sprint 1)
    // -------------------------------------------------------------
    const org = await createOrganization({
      code: "ORG_E2E_LC",
      name: "Royal Crown High Jewellery Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_E2E_LC_ALT",
      name: "Competing Luxury Atelier Enterprise",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_E2E_LC_01",
      name: "Geneva Flagship Salon & High Vault",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    const vault = await createVault({
      storeId,
      code: "VLT_E2E_LC_01",
      name: "High Security Deep Vault",
      vaultType: "MAIN_VAULT",
    });
    vaultId = vault.id;

    const locker = await createLocker({
      vaultId,
      storeId,
      code: "LCK_E2E_LC_01",
      name: "Armored Safe Locker 01",
      lockerNumber: "ASL-01",
    });

    const comp1 = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_E2E_LC_01",
      name: "Intake Staging Compartment",
      compartmentNumber: "STG-A1",
    });
    stagingCompartmentId = comp1.id;

    const comp2 = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_E2E_LC_02",
      name: "Front Showcase Vault Compartment",
      compartmentNumber: "SHW-B2",
    });
    showcaseCompartmentId = comp2.id;

    // -------------------------------------------------------------
    // Step 2: IAM Identities, RBAC Roles & Store Memberships
    // -------------------------------------------------------------
    // Store Manager with all administrative, procurement, QC, RFID & governance permissions
    const managerUser = await createUser({
      organizationId: orgId,
      email: "e2e_lc_manager@jewelcore.local",
      firstName: "Geneva",
      lastName: "Director",
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
      orgId,
    });

    // Sales Associate User (restricted permissions)
    const associateUser = await createUser({
      organizationId: orgId,
      email: "e2e_lc_associate@jewelcore.local",
      firstName: "Salon",
      lastName: "Associate",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    associateUserId = associateUser.id;

    const assocOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: associateUserId,
      isDefault: true,
    });

    await createStoreMembership({
      storeId,
      organizationMembershipId: assocOrgMem.id,
      isDefault: true,
    });

    const assocRole = await getRoleByCode("SALES_ASSOCIATE");
    if (assocRole) {
      await assignRoleToUser(associateUserId, assocRole.id);
    }

    associateToken = await signAccessToken({
      userId: associateUserId,
      email: associateUser.email,
      orgId,
    });

    // Cross-tenant Alt Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "e2e_lc_alt@jewelcore.local",
      firstName: "Alt",
      lastName: "Director",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const altOrgMem = await createOrganizationMembership({
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

    // -------------------------------------------------------------
    // Step 3: Master Data Taxonomy & Catalog (Sprint 2 / DEC-05)
    // -------------------------------------------------------------
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_E2E_NECKLACES",
      name: "High Jewellery Necklaces",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_E2E_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_E2E_22K",
      name: "22 Karat Yellow Gold",
      purityPercentage: 91.6,
      purityRatio: 0.916,
      isHallmarkPurity: true,
    });

    const gem = await createGemstone({
      organizationId: orgId,
      code: "GEM_E2E_DIAMOND",
      name: "Natural Brilliant Cut Diamond",
      gemstoneType: "PRECIOUS",
      defaultMeasurementUnit: "CARAT",
      isActive: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_E2E_ROYAL_NECKLACE",
      name: "Imperial Diamond Solitaire Pendant Necklace",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-E2E-ROYAL-NECKLACE-01",
      name: "Imperial Solitaire 22K 45.5g",
      variantName: "Masterpiece Solitaire",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 45.5,
      targetMetalWeightGrams: 43.5,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // Supplier Master
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_E2E_LC_01",
      name: "Geneva Master Atelier S.A.",
    });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Step 1: Inbound Receiving & Goods Receipt Note Manifest (Sprint 3 / FEAT-PROC-02, PROC-03)", async () => {
    // 1. Create Goods Receipt Note in DRAFT
    const grn = await createGrn({
      organizationId: orgId,
      supplierId,
      storeId,
      grnNumber: "GRN-E2E-LC-001",
      createdByUserId: managerUserId,
      receivedByUserId: managerUserId,
      totalLinesExpected: 1,
    });
    grnId = grn.id;
    expect(grnId).toBeDefined();

    // 2. Register Inbound Shipment
    const shipment = await createShipment({
      goodsReceiptNoteId: grnId,
      shipmentNumber: "SHP-E2E-LC-001",
      receivedByUserId: managerUserId,
      receivedAt: new Date(),
    });
    shipmentId = shipment.id;
    expect(shipmentId).toBeDefined();

    // 3. Add Shipment Line Item
    const shipItem = await addShipmentItem(shipmentId, {
      productSkuId: skuId,
      lineNumber: 1,
      declaredPieceCount: 1,
      receivedPieceCount: 1,
      declaredGrossWeightGrams: 45.5,
    });
    shipmentItemId = shipItem.id;
    expect(shipmentItemId).toBeDefined();
  });

  it("Step 2: Analytical QC Metrology, Scale Weighing & Gemstone Grading (Sprint 4 / FEAT-QC-01 to QC-06)", async () => {
    // 1. Create QC Inspection Session
    const qc = await createQualityCheck({
      shipmentId,
      storeId,
      inspectorUserId: managerUserId,
      inspectionType: "INITIAL_INTAKE",
    });
    qcSessionId = qc.id;

    // 2. Create QC Item for shipment piece
    const mat = (
      await query("SELECT id FROM materials WHERE code = 'MAT_E2E_GOLD';")
    ).rows[0];
    const pur = (
      await query("SELECT id FROM purities WHERE code = 'PUR_E2E_22K';")
    ).rows[0];

    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcSessionId,
      shipmentItemId,
      verifiedMaterialId: mat.id,
      verifiedPurityId: pur.id,
      itemSequenceNumber: 1,
    });
    qcItemId = qcItem.id;

    // 3. High-Precision Analytical Scale Reading (FEAT-QC-02 / INV-09)
    await createWeightMeasurement({
      qualityCheckItemId: qcItemId,
      balanceDeviceId: "BAL-E2E-METTLER-01",
      measurementType: MeasurementType.GROSS_WEIGHT,
      measuredWeight: 45.52,
      tareWeight: 0,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: managerUserId,
    });

    // 4. Mounted Gemstone Parcel Grading (FEAT-QC-03)
    const gem = (
      await query("SELECT id FROM gemstones WHERE code = 'GEM_E2E_DIAMOND';")
    ).rows[0];
    await addItemGemstone({
      qualityCheckItemId: qcItemId,
      gemstoneId: gem.id,
      stoneType: "PRIMARY_SOLITAIRE",
      stoneCount: 1,
      caratWeight: 2.02,
      cutGrade: "EXCELLENT",
      colorGrade: "D",
      clarityGrade: "VVS1",
      settingVerified: true,
    });

    // 5. 3VL Inspection & Intake Tolerance Verification (INV-12, INV-15, INV-18)
    // Formula: Net Weight = Gross - Tare - Gemstones (2.02 ct * 0.2000 g/ct = 0.4040 g)
    // Net Weight = 45.5200 - 0.4040 = 45.1160g
    await updateQualityCheckItem(
      qcItemId,
      {
        grossWeightGrams: 45.52,
        tareWeightGrams: 0,
        netWeightGrams: 45.116,
        hallmarkVerified: true,
        visualInspectionPassed: true,
        damageDetected: false,
        status: "APPROVED",
      },
      { userId: managerUserId },
    );

    // 6. Quality Decision Authorization (FEAT-QC-06)
    const decision = await createQualityDecision(
      {
        qualityCheckId: qcSessionId,
        qualityCheckItemId: qcItemId,
        decision: QualityDecisionType.APPROVED,
        reasonCode: "SPECIFICATION_COMPLIANT",
        notes:
          "Analytical metrology verified: perfect alloy ratio and genuine VVS1 diamond",
        decidedByUserId: managerUserId,
      },
      { userId: managerUserId },
    );
    expect(decision.decision).toBe(QualityDecisionType.APPROVED);
  });

  it("Step 3: Physical Piece Birth & Vault Staging Custody (Sprint 5 / FEAT-INV-01 / INV-14)", async () => {
    // Birth serialized inventory item with complete provenance lineage
    const piece = await birthInventoryItem(
      {
        qualityCheckItemId: qcItemId,
        currentCompartmentId: stagingCompartmentId,
      },
      { userId: managerUserId },
    );

    birthedPieceId = piece.id;
    expect(birthedPieceId).toBeDefined();

    // Verify initial state dimensions
    const item = await getInventoryItemById(birthedPieceId);
    expect(item).not.toBeNull();
    expect(item?.qualityState).toBe("QC_APPROVED");
    expect(item?.custodyState).toBe(CustodyState.IN_VAULT);
    expect(item?.approvalState).toBe(ApprovalState.DRAFT);
    expect(item?.commercialState).toBe(CommercialState.UNREADY);
    expect(item?.currentCompartmentId).toBe(stagingCompartmentId);
    expect(item?.version).toBe(1); // OCC initial version
  });

  it("Step 4: Custody Transfer Movement to Front Showcase Vault (Sprint 5 / FEAT-INV-03 / INV-09, INV-13)", async () => {
    // Transfer piece from Intake Staging to Front Showcase Display Compartment
    const moveRes = await request(app)
      .post("/api/v1/inventory/movements")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        inventoryItemId: birthedPieceId,
        productSkuId: skuId,
        movementType: MovementType.VAULT_TRANSFER,
        fromCompartmentId: stagingCompartmentId,
        toCompartmentId: showcaseCompartmentId,
        fromCustodyState: CustodyState.IN_VAULT,
        toCustodyState: CustodyState.IN_VAULT,
        quantity: 1,
        reasonCode: "VAULT_TRANSFER",
      });

    expect(moveRes.status).toBe(201);
    expect(moveRes.body.id).toBeDefined();
    expect(moveRes.body.fromCompartmentId).toBe(stagingCompartmentId);
    expect(moveRes.body.toCompartmentId).toBe(showcaseCompartmentId);

    // Verify parent piece state updated and OCC incremented
    const updatedPiece = await getInventoryItemById(birthedPieceId);
    expect(updatedPiece?.currentCompartmentId).toBe(showcaseCompartmentId);
    expect(updatedPiece?.version).toBe(2);

    // Verify movement immutability (INV-09)
    await expect(
      query(
        "UPDATE inventory_movements SET reason_code = 'Tampered' WHERE id = $1",
        [moveRes.body.id],
      ),
    ).rejects.toThrow(
      /inventory_movements ledger is strictly append-only and immutable/,
    );
  });

  it("Step 5: Async RFID Batch Print & Encoding Worker Gateway (Sprint 6 / FEAT-RFID-03, Entities 37, 38 & 43)", async () => {
    // 1. Enqueue RFID Print & Encoding Batch Job
    const jobRes = await request(app)
      .post("/api/v1/rfid/jobs")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        printerDeviceId: "ZEBRA-ZT411-GENEVA-01",
        jobName: "High Jewellery Solitaire Tag Ingestion",
        items: [
          {
            inventoryItemId: birthedPieceId,
            targetEpc: "E28011606000000000000099",
          },
        ],
      });

    expect(jobRes.status).toBe(201);
    expect(jobRes.body.success).toBe(true);
    rfidJobId = jobRes.body.data.id;
    expect(jobRes.body.data.status).toBe(RfidJobStatus.QUEUED);
    expect(jobRes.body.data.totalItems).toBe(1);

    // Verify transactional outbox event (Entity 43)
    const outboxRes = await query(
      "SELECT * FROM outbox_events WHERE topic = 'rfid.job.created' ORDER BY created_at DESC LIMIT 1;",
    );
    expect(outboxRes.rows.length).toBe(1);
    expect(outboxRes.rows[0].payload_json.jobId).toBe(rfidJobId);

    // 2. Trigger worker processing with transient failure simulation and backoff retry
    const processRes = await request(app)
      .post(`/api/v1/rfid/jobs/${rfidJobId}/process`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        simulateFailures: 1, // Attempt 1 fails, attempt 2 retries & succeeds!
        errorMessage: "Transient RF antenna disconnect on Zebra printer",
      });

    expect(processRes.status).toBe(200);
    expect(processRes.body.data.status).toBe(RfidJobStatus.COMPLETED);
    expect(processRes.body.data.completedItems).toBe(1);

    // Verify active RFID tag assignment bound to piece (INV-03, INV-04)
    const activeAssignment = await getActiveAssignmentByItemId(
      birthedPieceId,
      orgId,
    );
    expect(activeAssignment).not.toBeNull();
    expect(activeAssignment?.status).toBe(RfidAssignmentStatus.ACTIVE);
  });

  it("Step 6: Commercial Availability Gate & Executive Stock Approval Authorization (Sprint 6 / FEAT-GOV-01 / INV-01)", async () => {
    // 1. Authorize stock approval
    const apprRes = await request(app)
      .post("/api/v1/governance/stock-approvals")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        inventoryItemId: birthedPieceId,
        approvalStatus: StockApprovalStatus.APPROVED,
        approvalNotes:
          "Executive sign-off: Piece passed analytical metrology, vault custody verified, and active RFID transponder bound",
      });

    expect(apprRes.status).toBe(201);
    expect(apprRes.body.success).toBe(true);
    expect(apprRes.body.data.id).toBeDefined();
    expect(apprRes.body.data.approvalStatus).toBe(StockApprovalStatus.APPROVED);

    stockApprovalId = apprRes.body.data.id;

    // 2. Verify root aggregate state on inventory_items
    const releasedPiece = await getInventoryItemById(birthedPieceId);
    expect(releasedPiece?.approvalState).toBe(ApprovalState.APPROVED);
    expect(releasedPiece?.commercialState).toBe(
      CommercialState.AVAILABLE_FOR_SALE,
    );
    expect(releasedPiece?.version).toBe(3); // OCC incremented from 2 to 3

    // 3. Verify stock approval immutability trigger (INV-09)
    await expect(
      query(
        "UPDATE stock_approvals SET approval_notes = 'Tampered' WHERE id = $1",
        [stockApprovalId],
      ),
    ).rejects.toThrow(
      /Stock approval records are append-only audit ledgers and cannot be updated or deleted/,
    );
  });

  it("Step 7: Immutable Compliance Audit Trail Engine Verification (Sprint 6 / FEAT-GOV-02 / INV-09)", async () => {
    // 1. Capture material state transition compliance audit event
    const auditRes = await request(app)
      .post("/api/v1/governance/audit-events")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        actorIpAddress: "192.168.10.15",
        action: "STOCK_APPROVAL.AUTHORIZE",
        resourceType: "INVENTORY_ITEM",
        resourceId: birthedPieceId,
        payloadBeforeJson: {
          commercialState: "UNREADY",
          approvalState: "DRAFT",
          custodyState: "IN_VAULT",
        },
        payloadAfterJson: {
          commercialState: "AVAILABLE_FOR_SALE",
          approvalState: "APPROVED",
          custodyState: "IN_VAULT",
        },
        reason: "Commercial availability unlocked for retail showroom sale",
      });

    expect(auditRes.status).toBe(201);
    const auditEventId = auditRes.body.data.id;
    expect(auditEventId).toBeDefined();

    // 2. Query compliance audit trail filtered by birthedPieceId
    const queryRes = await request(app)
      .get("/api/v1/governance/audit-events")
      .query({
        resourceType: "INVENTORY_ITEM",
        resourceId: birthedPieceId,
      })
      .set("Authorization", `Bearer ${managerToken}`);

    expect(queryRes.status).toBe(200);
    expect(queryRes.body.success).toBe(true);
    expect(queryRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(queryRes.body.data[0].resourceId).toBe(birthedPieceId);
    expect(queryRes.body.data[0].action).toBe("STOCK_APPROVAL.AUTHORIZE");

    // 3. Verify unauthorized staff cannot access compliance audit logs (403 Forbidden)
    const forbiddenRes = await request(app)
      .get("/api/v1/governance/audit-events")
      .set("Authorization", `Bearer ${associateToken}`);

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");

    // 4. Verify multi-tenant boundary protection: alt org manager cannot view audit event (404 Not Found)
    const crossTenantRes = await request(app)
      .get(`/api/v1/governance/audit-events/${auditEventId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`);

    expect(crossTenantRes.status).toBe(404);

    // 5. Verify audit immutability trigger (INV-09)
    await expect(
      query(
        "UPDATE audit_events SET reason = 'Illegal mutation' WHERE id = $1",
        [auditEventId],
      ),
    ).rejects.toThrow(
      /Audit events are strictly append-only; UPDATE and DELETE operations are prohibited \(INV-09\)/,
    );
  });
});
