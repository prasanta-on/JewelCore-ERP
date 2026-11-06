import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createStore,
  createUser,
  createSupplier,
  createGrn,
  getGrnById,
  getGrnByNumber,
  listGrns,
  updateGrn,
  closeGrn,
} from "../src/index.js";
import {
  StoreType,
  ConflictError,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("Goods Receipt Notes Repository Integration Tests (FEAT-PROC-02)", () => {
  let testOrgId: string;
  let testStoreId: string;
  let testSupplierId: string;
  let testUserId: string;
  let managerUserId: string;

  beforeAll(async () => {
    await runAllMigrations();

    const org = await createOrganization({
      code: "GRN_REPO_ORG",
      name: "GRN Repo Enterprise",
    });
    testOrgId = org.id;

    const store = await createStore({
      organizationId: testOrgId,
      code: "GRN_REPO_STORE",
      name: "GRN Intake Hub",
      storeType: StoreType.VAULT_FACILITY,
    });
    testStoreId = store.id;

    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "GRN_REPO_SUP",
      name: "Apex Bullion Refinery",
      currencyCode: "CAD",
    });
    testSupplierId = supplier.id;

    const user = await createUser({
      organizationId: testOrgId,
      email: "grn_intake@jewelcore.local",
      passwordHash: "$argon2id$fake",
      firstName: "Intake",
      lastName: "Officer",
    });
    testUserId = user.id;

    const manager = await createUser({
      organizationId: testOrgId,
      email: "grn_mgr@jewelcore.local",
      passwordHash: "$argon2id$fake",
      firstName: "Procurement",
      lastName: "Manager",
    });
    managerUserId = manager.id;
  });

  afterAll(async () => {
    await query("DELETE FROM goods_receipt_notes WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM suppliers WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM users WHERE organization_id = $1;", [testOrgId]);
    await query("DELETE FROM stores WHERE organization_id = $1;", [testOrgId]);
    await query("DELETE FROM organizations WHERE id = $1;", [testOrgId]);
    await closePool();
  });

  it("creates a GRN in DRAFT status with initial version 1 and captures receiving details", async () => {
    const grn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-2026-0001",
      supplierInvoiceNumber: "INV-APEX-8839",
      createdByUserId: testUserId,
      remarks: "Consignment parcel intake batch 1",
    });

    expect(grn.id).toBeDefined();
    expect(grn.organizationId).toBe(testOrgId);
    expect(grn.storeId).toBe(testStoreId);
    expect(grn.supplierId).toBe(testSupplierId);
    expect(grn.grnNumber).toBe("GRN-2026-0001");
    expect(grn.status).toBe("DRAFT");
    expect(grn.version).toBe(1);
    expect(grn.createdByUserId).toBe(testUserId);
    expect(grn.closedByUserId).toBeNull();
    expect(grn.closedAt).toBeNull();
    expect(grn.receivedDate).toBeInstanceOf(Date);

    // Retrieve by ID
    const byId = await getGrnById(grn.id);
    expect(byId).not.toBeNull();
    expect(byId!.grnNumber).toBe("GRN-2026-0001");

    // Retrieve by Number
    const byNumber = await getGrnByNumber("GRN-2026-0001");
    expect(byNumber).not.toBeNull();
    expect(byNumber!.id).toBe(grn.id);
  });

  it("rejects duplicate grn_number across database with 409 Conflict", async () => {
    await expect(
      createGrn({
        organizationId: testOrgId,
        storeId: testStoreId,
        supplierId: testSupplierId,
        grnNumber: "GRN-2026-0001",
        createdByUserId: testUserId,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("updates a DRAFT GRN and increments OCC version counter", async () => {
    const grn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-2026-0002",
      createdByUserId: testUserId,
    });

    const updated = await updateGrn(grn.id, {
      remarks: "Updated shipment notes after visual inspection",
      supplierInvoiceNumber: "INV-UPDATED-001",
    });

    expect(updated.version).toBe(2);
    expect(updated.remarks).toBe(
      "Updated shipment notes after visual inspection",
    );
    expect(updated.supplierInvoiceNumber).toBe("INV-UPDATED-001");
  });

  it("closes a GRN, records closing manager, and enforces strict immutability lock", async () => {
    const grn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-2026-0003",
      createdByUserId: testUserId,
    });

    // Close the GRN
    const closed = await closeGrn(
      grn.id,
      managerUserId,
      "All shipments verified and intact",
    );

    expect(closed.status).toBe("CLOSED");
    expect(closed.closedByUserId).toBe(managerUserId);
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(closed.remarks).toBe("All shipments verified and intact");

    // Invariant: Modifying a CLOSED GRN must fail with ERR_GRN_IMMUTABLE
    await expect(
      updateGrn(grn.id, {
        remarks: "Attempted tampering on closed record",
      }),
    ).rejects.toThrow(UnprocessableEntityError);

    try {
      await updateGrn(grn.id, { remarks: "Tamper" });
    } catch (err: any) {
      expect(err.code).toBe("ERR_GRN_IMMUTABLE");
    }

    // Closing an already-closed GRN must fail
    await expect(closeGrn(grn.id, managerUserId)).rejects.toThrow(
      UnprocessableEntityError,
    );
  });

  it("lists GRNs filtered by storeId and status", async () => {
    const list = await listGrns({
      organizationId: testOrgId,
      storeId: testStoreId,
      status: "DRAFT",
    });

    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(
      list.every((g) => g.storeId === testStoreId && g.status === "DRAFT"),
    ).toBe(true);
  });
});
