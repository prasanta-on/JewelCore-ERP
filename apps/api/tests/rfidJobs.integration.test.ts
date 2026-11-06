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
  getActiveAssignmentByItemId,
  getRfidJobById,
} from "@jewelcore/database";
import {
  StoreType,
  MeasurementType,
  RfidJobStatus,
  RfidJobItemStatus,
  RfidAssignmentStatus,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";
import {
  executeRfidJobWorker,
  type RfidPrinterAdapter,
} from "../src/modules/rfid/rfidPrinterAdapter.js";

describe("Async RFID Print & Encoding Batch Jobs API (FEAT-RFID-03, Entities 37, 38 & 43)", () => {
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
  let itemIds: string[] = [];

  async function cleanFixtures() {
    await query(
      "DELETE FROM rfid_job_items WHERE job_id IN (SELECT id FROM rfid_jobs WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_API', 'ORG_RFID_JOB_API_ALT')));",
    );
    await query(
      "DELETE FROM rfid_jobs WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_API', 'ORG_RFID_JOB_API_ALT'));",
    );
    await query("DELETE FROM outbox_events WHERE topic = 'rfid.job.created';");
    await query(
      "DELETE FROM rfid_tag_assignments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_API', 'ORG_RFID_JOB_API_ALT'));",
    );
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_API', 'ORG_RFID_JOB_API_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_API', 'ORG_RFID_JOB_API_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_API', 'ORG_RFID_JOB_API_ALT'));",
    );
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id = 'SCL-RFID-JOB-API-01';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_JOB_API_%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_JOB_API_%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number = 'SHP-RFID-JOB-API-001');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number = 'SHP-RFID-JOB-API-001';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number = 'GRN-RFID-JOB-API-001';",
    );
    await query("DELETE FROM suppliers WHERE code = 'SUP_RFID_JOB_API_01';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-RFID-JOB-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code = 'PRD_RFID_JOB_API_BANGLE';",
    );
    await query("DELETE FROM purities WHERE code = 'PUR_RFID_JOB_API_22K';");
    await query("DELETE FROM materials WHERE code = 'MAT_RFID_JOB_API_GOLD';");
    await query(
      "DELETE FROM categories WHERE code = 'CAT_RFID_JOB_API_BANGLES';",
    );
    await query("DELETE FROM compartments WHERE code = 'CMP_RFID_JOB_API_01';");
    await query("DELETE FROM lockers WHERE code = 'LCK_RFID_JOB_API_01';");
    await query("DELETE FROM vaults WHERE code = 'VLT_RFID_JOB_API_01';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_JOB_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_API', 'ORG_RFID_JOB_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'rfid_job_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'rfid_job_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RFID_JOB_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RFID_JOB_API', 'ORG_RFID_JOB_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Organizations & Stores
    const org = await createOrganization({
      code: "ORG_RFID_JOB_API",
      name: "RFID Print API Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_RFID_JOB_API_ALT",
      name: "RFID Alt Enterprise",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_RFID_JOB_API_01",
      name: "RFID Encoding Hub Store",
      storeType: StoreType.CENTRAL_WAREHOUSE,
      isActive: true,
    });
    storeId = store.id;

    // 2. Physical Vault Hierarchy
    const vault = await createVault({
      storeId,
      code: "VLT_RFID_JOB_API_01",
      name: "RFID Processing Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_RFID_JOB_API_01",
      name: "RFID Locker",
      lockerNumber: "RL-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_RFID_JOB_API_01",
      name: "RFID Staging Box",
      compartmentNumber: "RS-B1",
    });
    compartmentId = comp.id;

    // 3. Manager User (STORE_MANAGER - has rfid:encode and rfid:view)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "rfid_job_api_mgr@jewelcore.local",
      firstName: "Encoding",
      lastName: "Supervisor",
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

    // 4. Sales Associate User (SALES_ASSOCIATE - has rfid:view but NOT rfid:encode)
    const associateUser = await createUser({
      organizationId: orgId,
      email: "rfid_job_api_assoc@jewelcore.local",
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
      email: "rfid_job_api_alt@jewelcore.local",
      firstName: "Alt",
      lastName: "Manager",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const altOrgMem = await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: altManagerUser.id,
      isDefault: true,
    });

    const altRole = await getRoleByCode("STORE_MANAGER");
    if (altRole) {
      await assignRoleToUser(altManagerUser.id, altRole.id);
    }

    otherOrgManagerToken = await signAccessToken({
      userId: altManagerUser.id,
      email: altManagerUser.email,
      orgId: otherOrgId,
    });

    // 6. Master Data Setup
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_RFID_JOB_API_BANGLES",
      name: "Gold Bangles",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_RFID_JOB_API_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_RFID_JOB_API_22K",
      name: "22K Yellow Gold",
      purityPercentage: 91.6,
      purityRatio: 0.916,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_RFID_JOB_API_BANGLE",
      name: "Classic Filigree Bangle",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-RFID-JOB-API-01",
      name: "Filigree Bangle 22K 40G",
      variantName: "Size 2.6",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 40.0,
      targetMetalWeightGrams: 40.0,
      trackingType: "SERIALIZED",
    });

    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_RFID_JOB_API_01",
      name: "RFID Testing Jewellers",
    });

    const grn = await createGrn({
      organizationId: orgId,
      supplierId: supplier.id,
      storeId,
      grnNumber: "GRN-RFID-JOB-API-001",
      createdByUserId: managerUserId,
      receivedByUserId: managerUserId,
      totalLinesExpected: 3,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHP-RFID-JOB-API-001",
      receivedByUserId: managerUserId,
      receivedAt: new Date(),
    });

    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId,
      inspectorUserId: managerUserId,
      inspectionType: "INITIAL_INTAKE",
    });

    itemIds = [];
    for (let i = 1; i <= 3; i++) {
      const shipItem = await addShipmentItem(shipment.id, {
        productSkuId: sku.id,
        lineNumber: i,
        declaredPieceCount: 1,
        receivedPieceCount: 1,
        declaredGrossWeightGrams: 40.0,
      });

      const qcItem = await createQualityCheckItem({
        qualityCheckId: qc.id,
        shipmentItemId: shipItem.id,
        verifiedMaterialId: mat.id,
        verifiedPurityId: pur.id,
        itemSequenceNumber: i,
      });

      await createWeightMeasurement({
        qualityCheckItemId: qcItem.id,
        balanceDeviceId: "SCL-RFID-JOB-API-01",
        measurementType: MeasurementType.GROSS_WEIGHT,
        measuredWeight: 40.0,
        tareWeight: 0,
        measurementUnit: "GRAMS",
        isCalibrated: true,
        measuredByUserId: managerUserId,
      });

      await updateQualityCheckItem(
        qcItem.id,
        {
          grossWeightGrams: 40.0,
          tareWeightGrams: 0,
          netWeightGrams: 40.0,
          hallmarkVerified: true,
          visualInspectionPassed: true,
          damageDetected: false,
          status: "APPROVED",
        },
        { userId: managerUserId },
      );

      const piece = await birthInventoryItem(
        {
          qualityCheckItemId: qcItem.id,
          initialCompartmentId: compartmentId,
        },
        orgId,
      );
      itemIds.push(piece.id);
    }
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  let createdJobId: string;

  it("Scenario 1: Dispatches and queues an RFID batch print job with transactional outbox event (FEAT-RFID-03, Entity 43)", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/jobs")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        printerDeviceId: "ZEBRA-ZT411-VAULT-01",
        jobName: "Morning Vault Ingestion Batch",
        items: [
          {
            inventoryItemId: itemIds[0],
            targetEpc: "E28011606000000000000001",
          },
          {
            inventoryItemId: itemIds[1],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe(RfidJobStatus.QUEUED);
    expect(res.body.data.totalItems).toBe(2);
    expect(res.body.data.completedItems).toBe(0);
    expect(res.body.data.failedItems).toBe(0);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0].status).toBe(RfidJobItemStatus.PENDING);
    expect(res.body.data.items[1].status).toBe(RfidJobItemStatus.PENDING);

    createdJobId = res.body.data.id;

    // Verify transactional outbox event was recorded (Entity 43)
    const outboxRes = await query(
      "SELECT * FROM outbox_events WHERE topic = 'rfid.job.created' ORDER BY created_at DESC LIMIT 1;",
    );
    expect(outboxRes.rows.length).toBe(1);
    expect(outboxRes.rows[0].topic).toBe("rfid.job.created");
    expect(outboxRes.rows[0].payload_json.jobId).toBe(createdJobId);
    expect(outboxRes.rows[0].payload_json.totalItems).toBe(2);
  });

  it("Scenario 2: Rejects job creation if user lacks 'rfid:encode' permission (403 Forbidden)", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/jobs")
      .set("Authorization", `Bearer ${associateToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        printerDeviceId: "ZEBRA-ZT411-VAULT-01",
        jobName: "Unauthorized Batch",
        items: [{ inventoryItemId: itemIds[2] }],
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("Scenario 3: Fetches job details and job items with rfid:view and validates multi-tenant isolation", async () => {
    // 1. Manager fetches job details
    const jobRes = await request(app)
      .get(`/api/v1/rfid/jobs/${createdJobId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(jobRes.status).toBe(200);
    expect(jobRes.body.data.id).toBe(createdJobId);
    expect(jobRes.body.data.printerDeviceId).toBe("ZEBRA-ZT411-VAULT-01");

    // 2. Sales associate with rfid:view can also inspect job items
    const itemsRes = await request(app)
      .get(`/api/v1/rfid/jobs/${createdJobId}/items`)
      .set("Authorization", `Bearer ${associateToken}`);

    expect(itemsRes.status).toBe(200);
    expect(itemsRes.body.data).toHaveLength(2);
    expect(itemsRes.body.meta.count).toBe(2);

    // 3. Alt org manager cannot access job (multi-tenant boundary)
    const altRes = await request(app)
      .get(`/api/v1/rfid/jobs/${createdJobId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`);

    expect(altRes.status).toBe(404);
  });

  it("Scenario 4: Lists batch jobs with store and status filtering", async () => {
    const listRes = await request(app)
      .get("/api/v1/rfid/jobs")
      .query({ status: RfidJobStatus.QUEUED })
      .set("Authorization", `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.data.some((j: any) => j.id === createdJobId)).toBe(
      true,
    );
  });

  it("Scenario 5: Executes batch print job with transient failure injection and exponential backoff retry", async () => {
    // Simulate 1 transient hardware failure; retry should succeed on attempt 2
    const processRes = await request(app)
      .post(`/api/v1/rfid/jobs/${createdJobId}/process`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        simulateFailures: 1,
        errorMessage: "Simulated hardware antenna socket disconnect",
      });

    expect(processRes.status).toBe(200);
    expect(processRes.body.data.status).toBe(RfidJobStatus.COMPLETED);
    expect(processRes.body.data.completedItems).toBe(2);
    expect(processRes.body.data.failedItems).toBe(0);

    // Verify items in job were updated to ENCODED
    const itemsRes = await request(app)
      .get(`/api/v1/rfid/jobs/${createdJobId}/items`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(itemsRes.status).toBe(200);
    expect(
      itemsRes.body.data.every(
        (it: any) => it.status === RfidJobItemStatus.ENCODED,
      ),
    ).toBe(true);
    expect(itemsRes.body.data.every((it: any) => it.rfidTagId !== null)).toBe(
      true,
    );

    // Verify each piece now has an active RFID tag bound (FEAT-RFID-02)
    const assignment1 = await getActiveAssignmentByItemId(itemIds[0], orgId);
    expect(assignment1).toBeDefined();
    expect(assignment1?.status).toBe(RfidAssignmentStatus.ACTIVE);

    const assignment2 = await getActiveAssignmentByItemId(itemIds[1], orgId);
    expect(assignment2).toBeDefined();
    expect(assignment2?.status).toBe(RfidAssignmentStatus.ACTIVE);
  });

  it("Scenario 6: Marks items and job FAILED when hardware printer retries are exhausted", async () => {
    // 1. Create a single-item job for item 3
    const createRes = await request(app)
      .post("/api/v1/rfid/jobs")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        printerDeviceId: "ZEBRA-ZT411-VAULT-01",
        jobName: "Failing Job Batch",
        items: [{ inventoryItemId: itemIds[2] }],
      });

    expect(createRes.status).toBe(201);
    const failingJobId = createRes.body.data.id;

    // 2. Trigger process with 5 simulated failures (exceeding max 3 retries)
    const processRes = await request(app)
      .post(`/api/v1/rfid/jobs/${failingJobId}/process`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        simulateFailures: 5,
        errorMessage: "Irrecoverable transponder antenna burn",
      });

    expect(processRes.status).toBe(200);
    expect(processRes.body.data.status).toBe(RfidJobStatus.FAILED);
    expect(processRes.body.data.completedItems).toBe(0);
    expect(processRes.body.data.failedItems).toBe(1);

    // 3. Inspect items
    const itemsRes = await request(app)
      .get(`/api/v1/rfid/jobs/${failingJobId}/items`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(itemsRes.status).toBe(200);
    expect(itemsRes.body.data[0].status).toBe(RfidJobItemStatus.FAILED);
    expect(itemsRes.body.data[0].errorMessage).toContain(
      "Irrecoverable transponder antenna burn",
    );
  });

  it("Scenario 7: Directly tests worker with non-retryable printer error aborting immediately", async () => {
    // 1. Create another job
    const createRes = await request(app)
      .post("/api/v1/rfid/jobs")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        printerDeviceId: "CUSTOM-ENCODER-01",
        jobName: "Non-Retryable Direct Worker Test",
        items: [{ inventoryItemId: itemIds[2] }],
      });

    const directJobId = createRes.body.data.id;

    let attemptCount = 0;
    const nonRetryableAdapter: RfidPrinterAdapter = {
      async encodeTag() {
        attemptCount++;
        return {
          success: false,
          epc: "",
          errorMessage:
            "Hardware thermal ribbon empty - manual operator required",
          isRetryable: false, // Should immediately abort without retrying
        };
      },
    };

    const finishedJob = await executeRfidJobWorker(directJobId, orgId, {
      printerAdapter: nonRetryableAdapter,
      maxRetries: 3,
      baseBackoffMs: 2,
    });

    expect(attemptCount).toBe(1); // Aborted after 1 attempt because isRetryable is false
    expect(finishedJob.status).toBe(RfidJobStatus.FAILED);
    expect(finishedJob.failedItems).toBe(1);
  });
});
