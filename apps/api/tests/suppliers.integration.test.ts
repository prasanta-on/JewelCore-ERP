import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createUser,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Suppliers API Endpoints (FEAT-PROC-01)", () => {
  const app = createApp();

  let testOrgId: string;
  let managerToken: string;
  let salesToken: string;
  let createdSupplierId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "SUP_API_ORG",
      name: "Supplier API Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Manager User (STORE_MANAGER role has procurement:write and procurement:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "proc_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Procurement",
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

    // 3. Sales Associate User (SALES_ASSOCIATE role lacks procurement:write)
    const salesUser = await createUser({
      organizationId: testOrgId,
      email: "proc_sales@jewelcore.local",
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
    await query("DELETE FROM suppliers WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM users WHERE email LIKE 'proc_%@jewelcore.local';");
    await query("DELETE FROM organizations WHERE code LIKE 'SUP_API_%';");
    await closePool();
  });

  // AC Scenario 1: Supplier Creation & Code Uniqueness
  it("Scenario 1: registers supplier De Beers Global and rejects duplicate supplier code with 409", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/suppliers")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "SUP-001",
        name: "De Beers Global Sightholder Sales",
        contactName: "Arthur Sterling",
        email: "sales@debeers.local",
        phone: "+44 20 7404 4444",
        taxIdentifier: "GB999888777",
        currencyCode: "USD",
        paymentTerms: "NET_30",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.code).toBe("SUP-001");
    expect(res.body.data.name).toBe("De Beers Global Sightholder Sales");
    expect(res.body.data.currencyCode).toBe("USD");
    expect(res.body.data.paymentTerms).toBe("NET_30");
    expect(res.body.data.isActive).toBe(true);
    createdSupplierId = res.body.data.id;

    // Duplicate code in same organization must be rejected with 409 Conflict
    const dupRes = await request(app)
      .post("/api/v1/procurement/suppliers")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "SUP-001",
        name: "Duplicate De Beers",
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.code).toBe("ERR_DUPLICATE_SUPPLIER_CODE");
    expect(dupRes.body.title).toBe("Conflict");
  });

  // AC Scenario 2: Unauthorized Supplier Registration Rejection
  it("Scenario 2: rejects user without procurement:write with 403 Forbidden (ERR_INSUFFICIENT_PERMISSIONS)", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/suppliers")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        code: "SUP-UNAUTH-01",
        name: "Unauthorized Vendor",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    expect(res.body.title).toBe("Forbidden");
  });

  // Scenario 3: Validation Error on missing required fields
  it("Scenario 3: rejects request missing required fields with 400 Validation Error", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/suppliers")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        name: "Vendor Without Code",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_VALIDATION");
    expect(res.body.invalidParams).toBeDefined();
    expect(res.body.invalidParams.some((p: any) => p.name === "code")).toBe(
      true,
    );
  });

  // Scenario 4: Retrieve Supplier by ID and List with Filter
  it("Scenario 4: retrieves supplier by ID and lists suppliers under active organization", async () => {
    const getRes = await request(app)
      .get(`/api/v1/procurement/suppliers/${createdSupplierId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(createdSupplierId);
    expect(getRes.body.data.code).toBe("SUP-001");

    // List suppliers
    const listRes = await request(app)
      .get(`/api/v1/procurement/suppliers?isActive=true`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.data.some((s: any) => s.id === createdSupplierId)).toBe(
      true,
    );
  });

  // Scenario 5: Update Supplier Details
  it("Scenario 5: updates supplier commercial terms and rejects unauthorized patch", async () => {
    const patchRes = await request(app)
      .patch(`/api/v1/procurement/suppliers/${createdSupplierId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        paymentTerms: "CONSIGNMENT",
        contactName: "Lady Sarah Windsor",
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.paymentTerms).toBe("CONSIGNMENT");
    expect(patchRes.body.data.contactName).toBe("Lady Sarah Windsor");

    // Unauthorized patch rejected
    const unauthPatch = await request(app)
      .patch(`/api/v1/procurement/suppliers/${createdSupplierId}`)
      .set("Authorization", `Bearer ${salesToken}`)
      .send({ paymentTerms: "COD" });

    expect(unauthPatch.status).toBe(403);
    expect(unauthPatch.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });
});
