import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createSupplier,
  getSupplierById,
  getSupplierByCode,
  listSuppliers,
  updateSupplier,
} from "../src/index.js";
import { ConflictError, NotFoundError } from "@jewelcore/shared";

describe("Suppliers Repository Integration Tests (FEAT-PROC-01)", () => {
  let testOrg1Id: string;
  let testOrg2Id: string;

  beforeAll(async () => {
    await runAllMigrations();

    const org1 = await createOrganization({
      code: "SUP_REPO_ORG_1",
      name: "Supplier Repo Enterprise 1",
    });
    testOrg1Id = org1.id;

    const org2 = await createOrganization({
      code: "SUP_REPO_ORG_2",
      name: "Supplier Repo Enterprise 2",
    });
    testOrg2Id = org2.id;
  });

  afterAll(async () => {
    await query("DELETE FROM suppliers WHERE organization_id IN ($1, $2);", [testOrg1Id, testOrg2Id]);
    await query("DELETE FROM organizations WHERE code LIKE 'SUP_REPO_%';");
    await closePool();
  });

  it("creates and retrieves a supplier profile with commercial terms", async () => {
    const supplier = await createSupplier({
      organizationId: testOrg1Id,
      code: "SUP-DEBEERS-01",
      name: "De Beers Global Sightholder Sales",
      contactName: "Arthur Sterling",
      email: "procurement@debeers.local",
      phone: "+44 20 7404 4444",
      taxIdentifier: "GB999999999",
      currencyCode: "USD",
      paymentTerms: "NET_30",
    });

    expect(supplier.id).toBeDefined();
    expect(supplier.organizationId).toBe(testOrg1Id);
    expect(supplier.code).toBe("SUP-DEBEERS-01");
    expect(supplier.name).toBe("De Beers Global Sightholder Sales");
    expect(supplier.contactName).toBe("Arthur Sterling");
    expect(supplier.email).toBe("procurement@debeers.local");
    expect(supplier.currencyCode).toBe("USD");
    expect(supplier.paymentTerms).toBe("NET_30");
    expect(supplier.isActive).toBe(true);

    // Retrieve by ID
    const byId = await getSupplierById(supplier.id);
    expect(byId).not.toBeNull();
    expect(byId!.code).toBe("SUP-DEBEERS-01");

    // Retrieve by Code
    const byCode = await getSupplierByCode(testOrg1Id, "SUP-DEBEERS-01");
    expect(byCode).not.toBeNull();
    expect(byCode!.id).toBe(supplier.id);
  });

  it("enforces candidate business key (organization_id, code) uniqueness", async () => {
    // Duplicate in Org 1 rejected
    await expect(
      createSupplier({
        organizationId: testOrg1Id,
        code: "SUP-DEBEERS-01",
        name: "Duplicate De Beers",
      }),
    ).rejects.toThrow(ConflictError);

    // Same code in Org 2 is permitted
    const org2Supplier = await createSupplier({
      organizationId: testOrg2Id,
      code: "SUP-DEBEERS-01",
      name: "De Beers Org 2 Division",
    });

    expect(org2Supplier.id).toBeDefined();
    expect(org2Supplier.organizationId).toBe(testOrg2Id);
  });

  it("updates supplier profile details", async () => {
    const supplier = await createSupplier({
      organizationId: testOrg1Id,
      code: "SUP-CASTING-01",
      name: "Heritage Casting House",
      currencyCode: "CAD",
      paymentTerms: "COD",
    });

    const updated = await updateSupplier(supplier.id, {
      name: "Heritage Casting & Refining Ltd.",
      paymentTerms: "NET_60",
      contactName: "Elena Rostova",
      phone: "+1 416 555 0199",
    });

    expect(updated.name).toBe("Heritage Casting & Refining Ltd.");
    expect(updated.paymentTerms).toBe("NET_60");
    expect(updated.contactName).toBe("Elena Rostova");
    expect(updated.phone).toBe("+1 416 555 0199");

    // Updating non-existent supplier throws NotFoundError
    await expect(
      updateSupplier("0192e301-7000-7000-8000-000000000099", { name: "Non-Existent" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("lists suppliers filtered by organization and active status", async () => {
    const activeList = await listSuppliers({
      organizationId: testOrg1Id,
      isActive: true,
    });
    expect(activeList.length).toBeGreaterThanOrEqual(2);
    expect(activeList.every((s) => s.organizationId === testOrg1Id && s.isActive)).toBe(true);
  });
});
