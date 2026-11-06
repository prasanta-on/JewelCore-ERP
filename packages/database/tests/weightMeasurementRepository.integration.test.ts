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
  createWeightMeasurement,
  getWeightMeasurementById,
  listWeightMeasurements,
} from "../src/index.js";
import {
  StoreType,
  MeasurementType,
  MeasurementStage,
  BadRequestError,
} from "@jewelcore/shared";

describe("Weight Measurement Repository Integration Tests (FEAT-QC-02 / INV-02, INV-09)", () => {
  let testOrgId: string;
  let testStoreId: string;
  let testUserId: string;
  let testQcId: string;

  beforeAll(async () => {
    const report = await runAllMigrations();
    if (report.status === "FAILED") {
      throw new Error(
        `Migrations failed: ${report.error} in ${report.failedMigration}`,
      );
    }

    // Clean up stale test fixtures
    await query(
      "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-TEST-REPO-%';",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-WM-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-WM-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-WM-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_WM_REPO_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'wm_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code = 'STORE_WM_REPO_01';");
    await query("DELETE FROM organizations WHERE code = 'ORG_WM_REPO';");

    // 1. Organization
    const org = await createOrganization({
      code: "ORG_WM_REPO",
      name: "Metrology Laboratory Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Store
    const store = await createStore({
      organizationId: testOrgId,
      code: "STORE_WM_REPO_01",
      name: "Certified Metrology Lab",
      storeType: StoreType.SHOWROOM,
    });
    testStoreId = store.id;

    // 3. User (Metrology Technician)
    const user = await createUser({
      organizationId: testOrgId,
      email: "wm_repo_tech@jewelcore.local",
      firstName: "Metrologist",
      lastName: "ScaleOperator",
      passwordHash: "argon2id_mock_hash",
    });
    testUserId = user.id;

    // 4. Supplier & GRN & Shipment & QC Session
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "SUP_WM_REPO_01",
      name: "Metrology Supplier Ltd",
    });

    const grn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: supplier.id,
      grnNumber: "GRN-WM-REPO-001",
      createdByUserId: testUserId,
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-WM-REPO-001",
      receivedByUserId: testUserId,
      status: "RECEIVED",
    });

    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId: testStoreId,
      inspectorUserId: testUserId,
    });
    testQcId = qc.id;
  });

  afterAll(async () => {
    try {
      // Direct delete on weight_measurements is blocked by trigger,
      // so we temporarily drop or delete through cascading or test cleanup.
      // Dropping trigger during test cleanup or deleting by disabling triggers:
      await query(
        "ALTER TABLE weight_measurements DISABLE TRIGGER trg_weight_measurements_immutability;",
      );
      await query(
        "DELETE FROM weight_measurements WHERE balance_device_id LIKE 'SCALE-TEST-REPO-%';",
      );
      await query(
        "ALTER TABLE weight_measurements ENABLE TRIGGER trg_weight_measurements_immutability;",
      );

      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-WM-REPO-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-WM-REPO-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-WM-REPO-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_WM_REPO_%';");
      await query(
        "DELETE FROM users WHERE email LIKE 'wm_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code = 'STORE_WM_REPO_01';");
      await query("DELETE FROM organizations WHERE code = 'ORG_WM_REPO';");
    } finally {
      await closePool();
    }
  });

  it("Scenario 1: ingests sub-milligram balance reading (12.3456g gross, 0.1200g tare) with DEC-05 precision", async () => {
    const reading = await createWeightMeasurement({
      qualityCheckId: testQcId,
      balanceDeviceId: "SCALE-TEST-REPO-01",
      measuredWeight: 12.3456,
      tareWeight: 0.12,
      measurementStage: MeasurementStage.INTAKE_RECEIVING,
      measurementType: MeasurementType.GROSS_WEIGHT,
      measurementUnit: "GRAMS",
      isCalibrated: true,
      measuredByUserId: testUserId,
    });

    expect(reading).toBeDefined();
    expect(reading.id).toBeDefined();
    expect(reading.balanceDeviceId).toBe("SCALE-TEST-REPO-01");
    expect(reading.measuredWeight).toBe(12.3456);
    expect(reading.tareWeight).toBe(0.12);
    expect(reading.netWeight).toBe(12.2256);
    expect(reading.measurementStage).toBe(MeasurementStage.INTAKE_RECEIVING);
    expect(reading.isCalibrated).toBe(true);
    expect(reading.measuredByUserId).toBe(testUserId);
  });

  it("retrieves a weight measurement record by ID", async () => {
    const list = await listWeightMeasurements({
      balanceDeviceId: "SCALE-TEST-REPO-01",
    });
    expect(list.total).toBeGreaterThanOrEqual(1);

    const first = list.items[0]!;
    const fetched = await getWeightMeasurementById(first.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(first.id);
    expect(fetched?.measuredWeight).toBe(first.measuredWeight);
    expect(fetched?.netWeight).toBe(first.netWeight);
  });

  it("Scenario 1 (INV-09): enforces strict immutability — rejects SQL UPDATE on weight_measurements", async () => {
    const list = await listWeightMeasurements({
      balanceDeviceId: "SCALE-TEST-REPO-01",
    });
    const record = list.items[0]!;

    await expect(
      query(
        "UPDATE weight_measurements SET measured_weight = 20.0000 WHERE id = $1;",
        [record.id],
      ),
    ).rejects.toThrow(/strictly prohibited.*INV-09/i);
  });

  it("Scenario 1 (INV-09): enforces strict immutability — rejects SQL DELETE on weight_measurements", async () => {
    const list = await listWeightMeasurements({
      balanceDeviceId: "SCALE-TEST-REPO-01",
    });
    const record = list.items[0]!;

    await expect(
      query("DELETE FROM weight_measurements WHERE id = $1;", [record.id]),
    ).rejects.toThrow(/strictly prohibited.*INV-09/i);
  });

  it("Scenario 3 (INV-02): rejects zero or negative gross weight with ERR_INVALID_WEIGHT_VALUE", async () => {
    await expect(
      createWeightMeasurement({
        balanceDeviceId: "SCALE-TEST-REPO-01",
        measuredWeight: 0.0,
        measuredByUserId: testUserId,
      }),
    ).rejects.toThrow(BadRequestError);

    await expect(
      createWeightMeasurement({
        balanceDeviceId: "SCALE-TEST-REPO-01",
        measuredWeight: -0.5,
        measuredByUserId: testUserId,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it("Scenario 3 (INV-02): rejects gross weight smaller than tare weight", async () => {
    await expect(
      createWeightMeasurement({
        balanceDeviceId: "SCALE-TEST-REPO-01",
        measuredWeight: 5.0,
        tareWeight: 6.0,
        measuredByUserId: testUserId,
      }),
    ).rejects.toThrow(BadRequestError);
  });
});
