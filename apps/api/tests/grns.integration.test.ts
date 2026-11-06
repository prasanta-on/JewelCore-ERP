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
  getRoleByCode,
  assignRoleToUser,
  createSupplier,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Goods Receipt Notes (GRN) API Endpoints (FEAT-PROC-02)", () => {
  const app = createApp();

  let testOrgId: string;
  let testStoreId: string;
  let testSupplierId: string;
  let managerToken: string;
  let salesToken: string;
  let createdGrnId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "GRN_API_ORG",
      name: "GRN API Enterprise",
    });
    testOrgId = org.id;

    // 2. Store Branch
    const store = await createStore({
      organizationId: testOrgId,
      code: "GRN_STR_001",
      name: "Flagship Receiving Vault",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    testStoreId = store.id;

    // 3. Supplier
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "GRN_SUPP_001",
      name: "De Beers Diamond Intake",
      currencyCode: "USD",
      paymentTerms: "NET_30",
    });
    testSupplierId = supplier.id;

    // 4. Manager User (STORE_MANAGER role has procurement:write and procurement:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "grn_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "GRN",
      lastName: "Manager",
      isActive: true,
    });

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(manager.id, managerRole.id);
    }

    managerToken = await signAccessToken({
      userId: manager.id,
      orgId: testOrgId,
      email: manager.email,
    });

    // 5. Sales Associate User (SALES_ASSOCIATE role lacks procurement:write)
    const salesUser = await createUser({
      organizationId: testOrgId,
      email: "grn_sales@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Sales",
      lastName: "Associate",
      isActive: true,
    });

    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    if (salesRole) {
      await assignRoleToUser(salesUser.id, salesRole.id);
    }

    salesToken = await signAccessToken({
      userId: salesUser.id,
      orgId: testOrgId,
      email: salesUser.email,
    });
  });

  afterAll(async () => {
    await query("DELETE FROM goods_receipt_notes WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM suppliers WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM stores WHERE code = 'GRN_STR_001';");
    await query("DELETE FROM users WHERE email LIKE 'grn_%@jewelcore.local';");
    await query("DELETE FROM organizations WHERE code = 'GRN_API_ORG';");
    await closePool();
  });

  // AC Scenario 1: GRN Creation in DRAFT state
  it("Scenario 1: creates GRN in DRAFT status, capturing createdByUserId and defaulting receivedDate", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/grns")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        storeId: testStoreId,
        supplierId: testSupplierId,
        grnNumber: "GRN-2026-001",
        supplierInvoiceNumber: "INV-DEBEERS-8899",
        supplierInvoiceDate: "2026-11-01T00:00:00.000Z",
        remarks: "Initial intake for November batch",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.organizationId).toBe(testOrgId);
    expect(res.body.data.storeId).toBe(testStoreId);
    expect(res.body.data.supplierId).toBe(testSupplierId);
    expect(res.body.data.grnNumber).toBe("GRN-2026-001");
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.supplierInvoiceNumber).toBe("INV-DEBEERS-8899");
    expect(res.body.data.createdByUserId).toBeDefined();
    expect(res.body.data.closedByUserId).toBeNull();
    expect(res.body.data.closedAt).toBeNull();
    expect(res.body.data.version).toBe(1);

    createdGrnId = res.body.data.id;
  });

  // AC Scenario 2: Duplicate GRN Number Rejection (409 Conflict)
  it("Scenario 2: rejects duplicate grnNumber in same organization with 409 Conflict", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/grns")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        storeId: testStoreId,
        supplierId: testSupplierId,
        grnNumber: "GRN-2026-001",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_GRN_NUMBER");
    expect(res.body.title).toBe("Conflict");
  });

  // AC Scenario 3: Unauthorized Access Rejection (403 Forbidden)
  it("Scenario 3: rejects GRN creation without procurement:write permission with 403 Forbidden", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/grns")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        storeId: testStoreId,
        supplierId: testSupplierId,
        grnNumber: "GRN-UNAUTH-01",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  // AC Scenario 4: Validation Error on missing required fields
  it("Scenario 4: rejects creation missing supplierId with 400 Validation Error", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/grns")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        storeId: testStoreId,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_VALIDATION");
    expect(
      res.body.invalidParams.some((p: any) => p.name === "supplierId"),
    ).toBe(true);
  });

  // AC Scenario 5: Retrieve GRN by ID and List with Filter
  it("Scenario 5: retrieves GRN by ID and lists GRNs filtered by storeId and status", async () => {
    const getRes = await request(app)
      .get(`/api/v1/procurement/grns/${createdGrnId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(createdGrnId);
    expect(getRes.body.data.grnNumber).toBe("GRN-2026-001");

    const listRes = await request(app)
      .get(`/api/v1/procurement/grns?storeId=${testStoreId}&status=DRAFT`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.data.some((g: any) => g.id === createdGrnId)).toBe(
      true,
    );
  });

  // AC Scenario 6: Update GRN while in DRAFT status
  it("Scenario 6: updates remarks and supplier invoice in DRAFT status", async () => {
    const patchRes = await request(app)
      .patch(`/api/v1/procurement/grns/${createdGrnId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        remarks: "Updated intake remarks with verified packing slip",
        supplierInvoiceNumber: "INV-DEBEERS-8899-REV1",
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.remarks).toBe(
      "Updated intake remarks with verified packing slip",
    );
    expect(patchRes.body.data.supplierInvoiceNumber).toBe(
      "INV-DEBEERS-8899-REV1",
    );
    expect(patchRes.body.data.version).toBe(2);
  });

  // AC Scenario 7: Close GRN and enforce Immutable Lock (INV-06)
  it("Scenario 7: transitions GRN to CLOSED status, records closedByUserId, and locks against mutation (ERR_GRN_IMMUTABLE)", async () => {
    const closeRes = await request(app)
      .post(`/api/v1/procurement/grns/${createdGrnId}/close`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        remarks:
          "All items received, verified, and placed into vault compartment",
      });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe("CLOSED");
    expect(closeRes.body.data.closedByUserId).toBeDefined();
    expect(closeRes.body.data.closedAt).toBeDefined();
    expect(closeRes.body.data.remarks).toBe(
      "All items received, verified, and placed into vault compartment",
    );

    // Mutation Attempt 1: PATCH on CLOSED GRN must fail with 422 ERR_GRN_IMMUTABLE
    const mutateRes = await request(app)
      .patch(`/api/v1/procurement/grns/${createdGrnId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        remarks: "Illegal tamper attempt",
      });

    expect(mutateRes.status).toBe(422);
    expect(mutateRes.body.code).toBe("ERR_GRN_IMMUTABLE");

    // Mutation Attempt 2: Re-close on CLOSED GRN must fail with 422 ERR_GRN_ALREADY_CLOSED
    const recloseRes = await request(app)
      .post(`/api/v1/procurement/grns/${createdGrnId}/close`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        remarks: "Duplicate close attempt",
      });

    expect(recloseRes.status).toBe(422);
    expect(recloseRes.body.code).toBe("ERR_GRN_ALREADY_CLOSED");
  });
});
