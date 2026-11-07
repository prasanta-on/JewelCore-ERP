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
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Customer Master API (FEAT-SALES-01, Entity 48)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;

  let managerToken: string;
  let managerUserId: string;
  let qcInspectorToken: string;
  let qcInspectorUserId: string;
  let otherOrgManagerToken: string;

  let createdCustomerId: string;

  async function cleanFixtures() {
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_CUST_API', 'ORG_CUST_API_ALT'));",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_CUST_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_CUST_API', 'ORG_CUST_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'cust_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'cust_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_CUST_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_CUST_API', 'ORG_CUST_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_CUST_API",
      name: "Luxury Boutique Jewellery Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_CUST_API_ALT",
      name: "Rival Diamond Atelier Ltd",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_CUST_API_01",
      name: "Flagship Toronto Boutique",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const otherStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_CUST_API_02",
      name: "Montreal Branch",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = otherStore.id;

    // Manager User (STORE_MANAGER has customers:create, customers:view, customers:update)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "cust_api_mgr@jewelcore.local",
      firstName: "Claire",
      lastName: "Redfield",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    managerUserId = managerUser.id;

    const mgrOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: managerUserId,
      isDefault: true,
    });

    await createStoreMembership({
      storeId,
      organizationMembershipId: mgrOrgMem.id,
      isDefault: true,
    });

    const storeManagerRole = await getRoleByCode("STORE_MANAGER");
    if (storeManagerRole) {
      await assignRoleToUser(managerUserId, storeManagerRole.id);
    }

    managerToken = await signAccessToken({
      userId: managerUserId,
      email: managerUser.email,
      orgId,
    });

    // QC Inspector User (QC_INSPECTOR does NOT have customers:create or customers:update)
    const qcUser = await createUser({
      organizationId: orgId,
      email: "cust_api_qc@jewelcore.local",
      firstName: "Jill",
      lastName: "Valentine",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    qcInspectorUserId = qcUser.id;

    const qcOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: qcInspectorUserId,
      isDefault: true,
    });

    await createStoreMembership({
      storeId,
      organizationMembershipId: qcOrgMem.id,
      isDefault: true,
    });

    const qcRole = await getRoleByCode("QC_INSPECTOR");
    if (qcRole) {
      await assignRoleToUser(qcInspectorUserId, qcRole.id);
    }

    qcInspectorToken = await signAccessToken({
      userId: qcInspectorUserId,
      email: qcUser.email,
      orgId,
    });

    // Other Org Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "cust_api_alt_mgr@jewelcore.local",
      firstName: "Leon",
      lastName: "Kennedy",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const altMgrOrgMem = await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: altManagerUser.id,
      isDefault: true,
    });

    await createStoreMembership({
      storeId: otherStoreId,
      organizationMembershipId: altMgrOrgMem.id,
      isDefault: true,
    });

    if (storeManagerRole) {
      await assignRoleToUser(altManagerUser.id, storeManagerRole.id);
    }

    otherOrgManagerToken = await signAccessToken({
      userId: altManagerUser.id,
      email: altManagerUser.email,
      orgId: otherOrgId,
    });
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: creates a new customer master profile (201 Created)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/customers")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerCode: "CUST-API-001",
        firstName: "Eleanor",
        lastName: "Vance",
        email: "eleanor.vance@example.com",
        phone: "+1-416-555-0199",
        addressLine1: "100 Bloor St W",
        addressLine2: "Suite 400",
        city: "Toronto",
        stateProvince: "ON",
        postalCode: "M5S 1M4",
        country: "CA",
        taxIdentifier: "HST-99887766",
        tags: ["VIP", "HIGH_NET_WORTH"],
        notes: "Prefers platinum bridal and D-flawless diamonds.",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.customerCode).toBe("CUST-API-001");
    expect(res.body.data.firstName).toBe("Eleanor");
    expect(res.body.data.lastName).toBe("Vance");
    expect(res.body.data.email).toBe("eleanor.vance@example.com");
    expect(res.body.data.tags).toEqual(["VIP", "HIGH_NET_WORTH"]);
    expect(res.body.data.status).toBe("ACTIVE");

    createdCustomerId = res.body.data.id;
  });

  it("Scenario 2: rejects duplicate customer code within the same organization (409 Conflict)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/customers")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerCode: "CUST-API-001",
        firstName: "Eleanor",
        lastName: "Duplicate",
        email: "eleanor.dup@example.com",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_CUSTOMER_CODE_EXISTS");
  });

  it("Scenario 3: rejects invalid payload missing required fields (400 Bad Request)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/customers")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        email: "invalid-payload-no-name@example.com",
      });

    expect(res.status).toBe(400);
  });

  it("Scenario 4: retrieves customer profile by ID (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/customers/${createdCustomerId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdCustomerId);
    expect(res.body.data.customerCode).toBe("CUST-API-001");
    expect(res.body.data.phone).toBe("+1-416-555-0199");
  });

  it("Scenario 5: returns 404 for nonexistent customer ID", async () => {
    const res = await request(app)
      .get("/api/v1/sales/customers/0192e301-0000-7000-8000-000000009999")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(404);
  });

  it("Scenario 6: updates customer details (200 OK)", async () => {
    const res = await request(app)
      .patch(`/api/v1/sales/customers/${createdCustomerId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        phone: "+1-416-555-9999",
        tags: ["VIP", "HIGH_NET_WORTH", "ANNIVERSARY_CLUB"],
        notes: "Updated preference: sapphire accents.",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.phone).toBe("+1-416-555-9999");
    expect(res.body.data.tags).toContain("ANNIVERSARY_CLUB");
    expect(res.body.data.notes).toBe("Updated preference: sapphire accents.");
  });

  it("Scenario 7: lists customers with search filter and tag filter (200 OK)", async () => {
    // Create a second customer
    await request(app)
      .post("/api/v1/sales/customers")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerCode: "CUST-API-002",
        firstName: "Marcus",
        lastName: "Aurelius",
        email: "marcus.aurelius@example.com",
        tags: ["RETAIL"],
      });

    // List all
    const listRes = await request(app)
      .get("/api/v1/sales/customers")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(2);
    expect(listRes.body.data.length).toBe(2);

    // Filter by tag
    const tagRes = await request(app)
      .get("/api/v1/sales/customers?tag=ANNIVERSARY_CLUB")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(tagRes.status).toBe(200);
    expect(tagRes.body.total).toBe(1);
    expect(tagRes.body.data[0].customerCode).toBe("CUST-API-001");

    // Filter by search query
    const searchRes = await request(app)
      .get("/api/v1/sales/customers?search=Marcus")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.total).toBe(1);
    expect(searchRes.body.data[0].customerCode).toBe("CUST-API-002");
  });

  it("Scenario 8: enforces multi-tenant boundary isolation", async () => {
    // Other org manager attempts to access createdCustomerId
    const res = await request(app)
      .get(`/api/v1/sales/customers/${createdCustomerId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`)
      .set("x-store-id", otherStoreId);

    expect(res.status).toBe(404);
  });

  it("Scenario 9: enforces RBAC permission check (403 Forbidden)", async () => {
    // QC Inspector attempts to create customer
    const createRes = await request(app)
      .post("/api/v1/sales/customers")
      .set("Authorization", `Bearer ${qcInspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        customerCode: "CUST-API-UNAUTH",
        firstName: "Hacker",
        lastName: "Unauthorized",
      });

    expect(createRes.status).toBe(403);
    expect(createRes.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");

    // QC Inspector attempts to update customer
    const updateRes = await request(app)
      .patch(`/api/v1/sales/customers/${createdCustomerId}`)
      .set("Authorization", `Bearer ${qcInspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        firstName: "Tampered",
      });

    expect(updateRes.status).toBe(403);
    expect(updateRes.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("Scenario 10: unauthenticated request is rejected (401 Unauthorized)", async () => {
    const res = await request(app)
      .get("/api/v1/sales/customers")
      .set("x-store-id", storeId);

    expect(res.status).toBe(401);
  });
});
