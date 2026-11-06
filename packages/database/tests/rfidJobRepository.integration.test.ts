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
  createRfidJob,
  getRfidJobById,
  listRfidJobItems,
  processRfidJobItem,
  listRfidJobs,
} from "../src/index.js";
import {
  StoreType,
  MeasurementType,
  RfidJobStatus,
  RfidJobItemStatus,
  ForbiddenError,
} from "@jewelcore/shared";

describe("RFID Batch Print & Encoding Jobs Repository (FEAT-RFID-03, Entities 37 & 38)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let operatorUserId: string;
  let itemIds: string[] = [];

  async function cleanFixtures() {
    await query(
      "DELETE FROM rfid_job_items WHERE job_id IN (SELECT id FROM rfid_jobs WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_REPO', 'ORG_RFID_JOB_ALT')));",
    );
    await query(
      "DELETE FROM rfid_jobs WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_REPO', 'ORG_RFID_JOB_ALT'));",
    );
    await query("DELETE FROM outbox_events WHERE topic = 'rfid.job.created';");
    await query(
      "DELETE FROM rfid_tag_assignments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_REPO', 'ORG_RFID_JOB_ALT'));",
    );
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_REPO', 'ORG_RFID_JOB_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_REPO', 'ORG_RFID_JOB_ALT'));",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_JOB_REPO', 'ORG_RFID_JOB_ALT'));",
    );
    await query(
      "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id = 'SCL-RFID-JOB-01';",
    );
    await query(
      "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_JOB_%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_JOB_%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number = 'SHP-RFID-JOB-001');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number = 'SHP-RFID-JOB-001';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number = 'GRN-RFID-JOB-001';",
    );
    await query("DELETE FROM suppliers WHERE code = 'SUP_RFID_JOB_01';");
    await query(
      "DELETE FROM product_skus WHERE sku_code = 'SKU-RFID-JOB-RING-01';",
    );
    await query(
      "DELETE FROM products WHERE product_code = 'PRD_RFID_JOB_RING';",
    );
    await query("DELETE FROM purities WHERE code = 'PUR_RFID_JOB_750';");
    await query("DELETE FROM materials WHERE code = 'MAT_RFID_JOB_GOLD';");
    await query("DELETE FROM categories WHERE code = 'CAT_RFID_JOB_RING';");
    await query("DELETE FROM compartments WHERE code = 'CMP_RFID_JOB_01';");
    await query("DELETE FROM lockers WHERE code = 'LCK_RFID_JOB_01';");
    await query("DELETE FROM vaults WHERE code = 'VLT_RFID_JOB_01';");
    await query(
      "DELETE FROM users WHERE email LIKE 'rfid_job_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RFID_JOB_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RFID_JOB_REPO', 'ORG_RFID_JOB_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_RFID_JOB_REPO",
      name: "RFID Jobs Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_RFID_JOB_ALT",
      name: "RFID Jobs Alt Enterprise",
    });
    otherOrgId = altOrg.id;

    // 2. Store & Compartment
    const store = await createStore({
      organizationId: orgId,
      code: "STORE_RFID_JOB_01",
      name: "RFID Factory Store",
      storeType: StoreType.CENTRAL_WAREHOUSE,
      isActive: true,
    });
    storeId = store.id;

    const vault = await createVault({
      storeId,
      code: "VLT_RFID_JOB_01",
      name: "Factory Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_RFID_JOB_01",
      name: "Encoding Locker",
      lockerNumber: "EL-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_RFID_JOB_01",
      name: "Tray 01",
      compartmentNumber: "T-01",
    });

    // 3. Operator User
    const user = await createUser({
      organizationId: orgId,
      email: "rfid_job_repo_op@jewelcore.local",
      firstName: "Print",
      lastName: "Operator",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    operatorUserId = user.id;

    // 4. Master Data
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_RFID_JOB_RING",
      name: "Engagement Rings",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_RFID_JOB_GOLD",
      name: "White Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_RFID_JOB_750",
      name: "18K White",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_RFID_JOB_RING",
      name: "White Gold Halo Ring",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-RFID-JOB-RING-01",
      name: "Halo Ring 18K",
      variantName: "Size 7",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 4.0,
      targetMetalWeightGrams: 3.8,
      trackingType: "SERIALIZED",
    });

    // 5. Procurement and Birthing 5 items
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_RFID_JOB_01",
      name: "Precious Metals Refiner",
    });

    const grn = await createGrn({
      organizationId: orgId,
      supplierId: supplier.id,
      storeId,
      grnNumber: "GRN-RFID-JOB-001",
      createdByUserId: operatorUserId,
      receivedByUserId: operatorUserId,
      totalLinesExpected: 5,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHP-RFID-JOB-001",
      receivedByUserId: operatorUserId,
      receivedAt: new Date(),
    });

    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId,
      inspectorUserId: operatorUserId,
      inspectionType: "INITIAL_INTAKE",
    });

    itemIds = [];
    for (let i = 1; i <= 5; i++) {
      const shipItem = await addShipmentItem(shipment.id, {
        productSkuId: sku.id,
        lineNumber: i,
        declaredPieceCount: 1,
        receivedPieceCount: 1,
        declaredGrossWeightGrams: 4.0,
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
        balanceDeviceId: "SCL-RFID-JOB-01",
        measurementType: MeasurementType.GROSS_WEIGHT,
        measuredWeight: 4.0,
        tareWeight: 0,
        measurementUnit: "GRAMS",
        isCalibrated: true,
        measuredByUserId: operatorUserId,
      });

      await updateQualityCheckItem(
        qcItem.id,
        {
          grossWeightGrams: 4.0,
          tareWeightGrams: 0,
          netWeightGrams: 3.8,
          hallmarkVerified: true,
          visualInspectionPassed: true,
          damageDetected: false,
          status: "APPROVED",
        },
        { userId: operatorUserId },
      );

      const item = await birthInventoryItem(
        {
          qualityCheckItemId: qcItem.id,
          initialCompartmentId: comp.id,
        },
        orgId,
      );

      itemIds.push(item.id);
    }
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("creates a batch RFID job with items and outbox event (Scenario 1, FEAT-RFID-03)", async () => {
    const batchPieces = itemIds.slice(0, 3);
    const { job, items } = await createRfidJob(
      {
        printerDeviceId: "PRN-ZEBRA-ZT411-01",
        jobName: "Morning Batch Halo Rings",
        organizationId: orgId,
        storeId,
        items: batchPieces.map((id, idx) => ({
          inventoryItemId: id,
          targetEpc: `E280116060000204781C000${idx + 1}`,
        })),
      },
      { userId: operatorUserId },
    );

    expect(job).toBeDefined();
    expect(job.status).toBe(RfidJobStatus.QUEUED);
    expect(job.totalItems).toBe(3);
    expect(job.completedItems).toBe(0);
    expect(job.failedItems).toBe(0);
    expect(job.printerDeviceId).toBe("PRN-ZEBRA-ZT411-01");

    expect(items.length).toBe(3);
    expect(items[0]!.status).toBe(RfidJobItemStatus.PENDING);
    expect(items[0]!.jobId).toBe(job.id);

    // Verify Outbox Event created
    const outboxRes = await query<{
      id: string;
      topic: string;
      payload_json: any;
    }>(
      `SELECT id, topic, payload_json
       FROM outbox_events
       WHERE topic = 'rfid.job.created' AND payload_json->>'jobId' = $1`,
      [job.id],
    );

    expect(outboxRes.rows.length).toBe(1);
    expect(outboxRes.rows[0]!.topic).toBe("rfid.job.created");
    expect(outboxRes.rows[0]!.payload_json.jobId).toBe(job.id);
  });

  it("processes items in job with success and partial failure (Scenario 2)", async () => {
    const batchPieces = itemIds.slice(0, 3);
    const { job, items } = await createRfidJob(
      {
        printerDeviceId: "PRN-ZEBRA-ZT411-01",
        jobName: "Processing Test Job",
        organizationId: orgId,
        storeId,
        items: batchPieces.map((id) => ({
          inventoryItemId: id,
        })),
      },
      { userId: operatorUserId },
    );

    // Create a real tag for item 1
    const tag1 = await createRfidTag({
      organizationId: orgId,
      epc: "E280116060000204781C0011",
    });

    // 1. Process item 1 (ENCODED)
    const processed1 = await processRfidJobItem(items[0]!.id, {
      status: RfidJobItemStatus.ENCODED,
      rfidTagId: tag1.id,
    });
    expect(processed1.status).toBe(RfidJobItemStatus.ENCODED);
    expect(processed1.attempts).toBe(1);

    const jobAfter1 = await getRfidJobById(job.id, orgId);
    expect(jobAfter1!.status).toBe(RfidJobStatus.PROCESSING);
    expect(jobAfter1!.completedItems).toBe(1);
    expect(jobAfter1!.failedItems).toBe(0);

    // 2. Process item 2 (FAILED with error message)
    const processed2 = await processRfidJobItem(items[1]!.id, {
      status: RfidJobItemStatus.FAILED,
      errorMessage: "Hardware antenna socket timeout",
    });
    expect(processed2.status).toBe(RfidJobItemStatus.FAILED);
    expect(processed2.errorMessage).toBe("Hardware antenna socket timeout");

    const jobAfter2 = await getRfidJobById(job.id, orgId);
    expect(jobAfter2!.status).toBe(RfidJobStatus.PROCESSING);
    expect(jobAfter2!.completedItems).toBe(1);
    expect(jobAfter2!.failedItems).toBe(1);

    // 3. Process item 3 (ENCODED)
    const tag3 = await createRfidTag({
      organizationId: orgId,
      epc: "E280116060000204781C0013",
    });
    await processRfidJobItem(items[2]!.id, {
      status: RfidJobItemStatus.ENCODED,
      rfidTagId: tag3.id,
    });

    // All items completed: job transitions to COMPLETED
    const finalJob = await getRfidJobById(job.id, orgId);
    expect(finalJob!.status).toBe(RfidJobStatus.COMPLETED);
    expect(finalJob!.completedItems).toBe(2);
    expect(finalJob!.failedItems).toBe(1);
    expect(finalJob!.completedAt).toBeInstanceOf(Date);
  });

  it("marks job as FAILED when all items fail", async () => {
    const batchPieces = itemIds.slice(3, 5);
    const { job, items } = await createRfidJob(
      {
        printerDeviceId: "PRN-ZEBRA-ZT411-02",
        jobName: "Total Failure Test Job",
        organizationId: orgId,
        storeId,
        items: batchPieces.map((id) => ({
          inventoryItemId: id,
        })),
      },
      { userId: operatorUserId },
    );

    await processRfidJobItem(items[0]!.id, {
      status: RfidJobItemStatus.FAILED,
      errorMessage: "Transponder chip defective",
    });

    await processRfidJobItem(items[1]!.id, {
      status: RfidJobItemStatus.FAILED,
      errorMessage: "Transponder chip defective",
    });

    const finalJob = await getRfidJobById(job.id, orgId);
    expect(finalJob!.status).toBe(RfidJobStatus.FAILED);
    expect(finalJob!.completedItems).toBe(0);
    expect(finalJob!.failedItems).toBe(2);
  });

  it("rejects creating job for store of another organization", async () => {
    await expect(
      createRfidJob(
        {
          printerDeviceId: "PRN-ZEBRA-01",
          organizationId: otherOrgId, // Cross-tenant
          storeId,
          items: [{ inventoryItemId: itemIds[0]! }],
        },
        { userId: operatorUserId },
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lists jobs and job items with filters and pagination", async () => {
    const list = await listRfidJobs({
      organizationId: orgId,
      limit: 10,
      offset: 0,
    });
    expect(list.length).toBeGreaterThanOrEqual(3);

    const filtered = await listRfidJobs({
      organizationId: orgId,
      printerDeviceId: "PRN-ZEBRA-ZT411-01",
      limit: 10,
      offset: 0,
    });
    expect(filtered.length).toBeGreaterThanOrEqual(2);

    const firstJob = list[0]!;
    const items = await listRfidJobItems(firstJob.id);
    expect(items.length).toBe(firstJob.totalItems);
  });
});
