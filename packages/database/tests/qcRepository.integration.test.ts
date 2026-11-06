import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  createSupplier,
  createGrn,
  createShipment,
  createQualityCheck,
  getQualityCheckById,
  listQualityChecks,
  updateQualityCheck,
  getShipmentWithStore,
} from "../src/index.js";
import {
  StoreType,
  QualityCheckStatus,
  InspectionType,
  UnprocessableEntityError,
  ConflictError,
} from "@jewelcore/shared";

describe("Quality Control (QC) Repository Integration Tests (FEAT-QC-01)", () => {
  let testOrgId: string;
  let testStoreId: string;
  let testUserId: string;
  let testSupplierId: string;
  let testGrnId: string;
  let testShipmentId: string;

  beforeAll(async () => {
    const report = await runAllMigrations();
    if (report.status === "FAILED") {
      throw new Error(
        `Migrations failed: ${report.error} in ${report.failedMigration}`,
      );
    }

    // Clean up any stale test fixtures
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QC-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QC-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QC-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QC_REPO_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'qc_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code = 'STORE_QC_REPO_01';");
    await query("DELETE FROM organizations WHERE code = 'ORG_QC_REPO';");

    // 1. Organization
    const org = await createOrganization({
      code: "ORG_QC_REPO",
      name: "QC Repository Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Store
    const store = await createStore({
      organizationId: testOrgId,
      code: "STORE_QC_REPO_01",
      name: "QC Testing Laboratory & Intake Showroom",
      storeType: StoreType.SHOWROOM,
    });
    testStoreId = store.id;

    // 3. User (Certified Gemmologist / QC Inspector)
    const user = await createUser({
      organizationId: testOrgId,
      email: "qc_repo_inspector@jewelcore.local",
      firstName: "Aria",
      lastName: "Gemmologist",
      passwordHash: "argon2id_mock_hash",
    });
    testUserId = user.id;

    // 4. Supplier
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "SUP_QC_REPO_01",
      name: "QC Repos Diamond Cutters",
    });
    testSupplierId = supplier.id;

    // 5. GRN
    const grn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-QC-REPO-001",
      createdByUserId: testUserId,
    });
    testGrnId = grn.id;

    // 6. Shipment (status: RECEIVED)
    const shipment = await createShipment({
      goodsReceiptNoteId: testGrnId,
      shipmentNumber: "SHIP-QC-REPO-001",
      receivedByUserId: testUserId,
      status: "RECEIVED",
      declaredPackageCount: 1,
      receivedPackageCount: 1,
    });
    testShipmentId = shipment.id;
  });

  afterAll(async () => {
    try {
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-QC-REPO-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-QC-REPO-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-QC-REPO-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_QC_REPO_%';");
      await query(
        "DELETE FROM users WHERE email LIKE 'qc_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code = 'STORE_QC_REPO_01';");
      await query("DELETE FROM organizations WHERE code = 'ORG_QC_REPO';");
    } finally {
      await closePool();
    }
  });

  it("retrieves shipment joined with parent GRN store and organization context", async () => {
    const context = await getShipmentWithStore(testShipmentId);
    expect(context).not.toBeNull();
    expect(context?.id).toBe(testShipmentId);
    expect(context?.shipmentNumber).toBe("SHIP-QC-REPO-001");
    expect(context?.status).toBe("RECEIVED");
    expect(context?.storeId).toBe(testStoreId);
    expect(context?.organizationId).toBe(testOrgId);
  });

  it("creates an initial intake quality inspection session with sequence number 1", async () => {
    const qc = await createQualityCheck({
      shipmentId: testShipmentId,
      storeId: testStoreId,
      inspectorUserId: testUserId,
      inspectionType: InspectionType.INITIAL_INTAKE,
    });

    expect(qc).toBeDefined();
    expect(qc.id).toBeDefined();
    expect(qc.shipmentId).toBe(testShipmentId);
    expect(qc.storeId).toBe(testStoreId);
    expect(qc.inspectorUserId).toBe(testUserId);
    expect(qc.sessionSequenceNumber).toBe(1);
    expect(qc.status).toBe(QualityCheckStatus.IN_PROGRESS);
    expect(qc.inspectionType).toBe(InspectionType.INITIAL_INTAKE);
    expect(qc.version).toBe(1);
    expect(qc.completedAt).toBeNull();
  });

  it("creates a reinspection session and monotonically increments sessionSequenceNumber to 2", async () => {
    const qc2 = await createQualityCheck({
      shipmentId: testShipmentId,
      storeId: testStoreId,
      inspectorUserId: testUserId,
      inspectionType: InspectionType.REINSPECTION,
    });

    expect(qc2.sessionSequenceNumber).toBe(2);
    expect(qc2.inspectionType).toBe(InspectionType.REINSPECTION);
    expect(qc2.status).toBe(QualityCheckStatus.IN_PROGRESS);
  });

  it("retrieves a quality check session by ID", async () => {
    const listed = await listQualityChecks({ shipmentId: testShipmentId });
    expect(listed.total).toBe(2);
    expect(listed.items.length).toBe(2);

    const first = listed.items.find((item) => item.sessionSequenceNumber === 1);
    expect(first).toBeDefined();

    const fetched = await getQualityCheckById(first!.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(first!.id);
    expect(fetched?.shipmentId).toBe(testShipmentId);
  });

  it("updates quality check status with OCC concurrency tracking", async () => {
    const listed = await listQualityChecks({ shipmentId: testShipmentId });
    const sessionToUpdate = listed.items.find(
      (item) => item.sessionSequenceNumber === 2,
    )!;

    const updated = await updateQualityCheck(sessionToUpdate.id, {
      status: QualityCheckStatus.PENDING,
      rejectionNotes: "Pending x-ray spectrometer alloy verification",
      expectedVersion: 1,
    });

    expect(updated.status).toBe(QualityCheckStatus.PENDING);
    expect(updated.version).toBe(2);
    expect(updated.rejectionNotes).toBe(
      "Pending x-ray spectrometer alloy verification",
    );
  });

  it("detects OCC conflict when expectedVersion does not match", async () => {
    const listed = await listQualityChecks({ shipmentId: testShipmentId });
    const session = listed.items.find(
      (item) => item.sessionSequenceNumber === 2,
    )!;

    await expect(
      updateQualityCheck(session.id, {
        status: QualityCheckStatus.DRAFT,
        expectedVersion: 1, // Stale version, current is 2
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("seals a session upon transitioning to FINALIZED or APPROVED and records completion time", async () => {
    const listed = await listQualityChecks({ shipmentId: testShipmentId });
    const session = listed.items.find(
      (item) => item.sessionSequenceNumber === 2,
    )!;

    const finalized = await updateQualityCheck(session.id, {
      status: QualityCheckStatus.FINALIZED,
      expectedVersion: 2,
    });

    expect(finalized.status).toBe(QualityCheckStatus.FINALIZED);
    expect(finalized.version).toBe(3);
    expect(finalized.completedAt).not.toBeNull();
  });

  it("enforces Sealed Session Immutability Gate (ERR_SESSION_SEALED) when modifying a finalized session", async () => {
    const listed = await listQualityChecks({ shipmentId: testShipmentId });
    const session = listed.items.find(
      (item) => item.sessionSequenceNumber === 2,
    )!;

    await expect(
      updateQualityCheck(session.id, {
        rejectionNotes: "Attempting to modify sealed session notes",
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });
});
