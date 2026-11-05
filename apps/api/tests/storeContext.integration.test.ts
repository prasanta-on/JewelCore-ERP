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
} from "@jewelcore/database";
import { signAccessToken } from "../src/modules/auth/authUtils.js";
import { authenticate } from "../src/common/authMiddleware.js";
import { requireStoreContext } from "../src/common/storeContextMiddleware.js";
import { StoreType } from "@jewelcore/shared";

describe("Store-Context Isolation & Memberships (FEAT-IAM-04 / INV-11)", () => {
  const app = createApp((testApp) => {
    // Strict store context route: requires explicit x-store-id header
    testApp.get(
      "/api/v1/test/store-scoped",
      authenticate,
      requireStoreContext({ allowDefaultFallback: false }),
      (req, res) => {
        res.status(200).json({
          success: true,
          storeContext: req.storeContext,
        });
      },
    );

    // Flexible store context route: falls back to user default store
    testApp.get(
      "/api/v1/test/store-scoped-fallback",
      authenticate,
      requireStoreContext({ allowDefaultFallback: true }),
      (req, res) => {
        res.status(200).json({
          success: true,
          storeContext: req.storeContext,
        });
      },
    );
  });

  let testOrgId: string;
  let store001Id: string;
  let store002Id: string;
  let store003Id: string;
  let storeInactiveId: string;
  let testUserId: string;
  let userToken: string;
  let orgMembershipId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "CTX_TEST_ORG",
      name: "Context Test Enterprise Inc.",
      currency: "CAD",
      isActive: true,
    });
    testOrgId = org.id;

    // 2. Stores
    const s1 = await createStore({
      organizationId: testOrgId,
      code: "CTX_STORE001",
      name: "Store 001 - Downtown Flagship",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    store001Id = s1.id;

    const s2 = await createStore({
      organizationId: testOrgId,
      code: "CTX_STORE002",
      name: "Store 002 - North York Boutique",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    store002Id = s2.id;

    const s3 = await createStore({
      organizationId: testOrgId,
      code: "CTX_STORE003",
      name: "Store 003 - Central Vault Facility",
      storeType: StoreType.VAULT_FACILITY,
      isActive: true,
    });
    store003Id = s3.id;

    const s4 = await createStore({
      organizationId: testOrgId,
      code: "CTX_STORE004",
      name: "Store 004 - Inactive Branch",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeInactiveId = s4.id;

    // 3. User
    const user = await createUser({
      organizationId: testOrgId,
      email: "ctx_operator@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Context",
      lastName: "Operator",
      isActive: true,
    });
    testUserId = user.id;

    userToken = await signAccessToken({
      userId: user.id,
      orgId: testOrgId,
      email: user.email,
    });

    // 4. Organization Membership
    const om = await createOrganizationMembership({
      organizationId: testOrgId,
      userId: testUserId,
      isActive: true,
    });
    orgMembershipId = om.id;

    // 5. Store Memberships: Assigned to STORE001 (default) and STORE002
    await createStoreMembership({
      organizationMembershipId: orgMembershipId,
      storeId: store001Id,
      isDefault: true,
      isActive: true,
    });

    await createStoreMembership({
      organizationMembershipId: orgMembershipId,
      storeId: store002Id,
      isDefault: false,
      isActive: true,
    });

    // Inactive store membership for STORE004
    await createStoreMembership({
      organizationMembershipId: orgMembershipId,
      storeId: storeInactiveId,
      isDefault: false,
      isActive: false, // inactive membership
    });
  });

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE 'ctx_%@jewelcore.local';");
    await query("DELETE FROM stores WHERE code LIKE 'CTX_%';");
    await query("DELETE FROM organizations WHERE code LIKE 'CTX_%';");
    await closePool();
  });

  // AC Scenario 1: Valid Store-Context Header Resolution
  it("Scenario 1: binds currentStoreId when valid x-store-id header is provided", async () => {
    const res = await request(app)
      .get("/api/v1/test/store-scoped")
      .set("Authorization", `Bearer ${userToken}`)
      .set("x-store-id", store001Id);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.storeContext.storeId).toBe(store001Id);
    expect(res.body.storeContext.organizationId).toBe(testOrgId);
    expect(res.body.storeContext.isDefault).toBe(true);

    // Also valid for assigned non-default store STORE002
    const res2 = await request(app)
      .get("/api/v1/test/store-scoped")
      .set("Authorization", `Bearer ${userToken}`)
      .set("x-store-id", store002Id);

    expect(res2.status).toBe(200);
    expect(res2.body.storeContext.storeId).toBe(store002Id);
    expect(res2.body.storeContext.isDefault).toBe(false);
  });

  // AC Scenario 2: Cross-Store Access Rejection (INV-11)
  it("Scenario 2: rejects cross-store access with 403 ERR_STORE_ACCESS_DENIED for unassigned store", async () => {
    const res = await request(app)
      .get("/api/v1/test/store-scoped")
      .set("Authorization", `Bearer ${userToken}`)
      .set("x-store-id", store003Id);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
    expect(res.body.title).toBe("Forbidden");
  });

  it("Scenario 3: rejects request with 403 ERR_STORE_ACCESS_DENIED if store membership is inactive", async () => {
    const res = await request(app)
      .get("/api/v1/test/store-scoped")
      .set("Authorization", `Bearer ${userToken}`)
      .set("x-store-id", storeInactiveId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
  });

  it("Scenario 4: resolves default store context automatically when x-store-id is omitted and fallback is allowed", async () => {
    const res = await request(app)
      .get("/api/v1/test/store-scoped-fallback")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.storeContext.storeId).toBe(store001Id);
    expect(res.body.storeContext.isDefault).toBe(true);
  });

  it("Scenario 5: rejects with 400 ERR_MISSING_STORE_CONTEXT when header is omitted on strict store route", async () => {
    const res = await request(app)
      .get("/api/v1/test/store-scoped")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_MISSING_STORE_CONTEXT");
  });

  it("Scenario 6: rejects with 400 ERR_INVALID_STORE_ID when x-store-id is malformed", async () => {
    const res = await request(app)
      .get("/api/v1/test/store-scoped")
      .set("Authorization", `Bearer ${userToken}`)
      .set("x-store-id", "not-a-valid-uuid");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_INVALID_STORE_ID");
  });

  it("Scenario 7: GET /api/v1/auth/me/stores returns the stores accessible to the authenticated user", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me/stores")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);

    const storeIds = res.body.data.map((s: any) => s.storeId);
    expect(storeIds).toContain(store001Id);
    expect(storeIds).toContain(store002Id);
    expect(storeIds).not.toContain(store003Id);
    expect(storeIds).not.toContain(storeInactiveId);
  });

  it("Scenario 8: IAM Membership endpoints allow enrolling and managing memberships", async () => {
    // Create new user for testing IAM membership management endpoints
    const newUser = await createUser({
      organizationId: testOrgId,
      email: "ctx_new_member@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "New",
      lastName: "Member",
    });

    // 1. Assign to Org
    const orgRes = await request(app)
      .post("/api/v1/iam/memberships/organizations")
      .send({
        organizationId: testOrgId,
        userId: newUser.id,
        isActive: true,
      });

    expect(orgRes.status).toBe(201);
    expect(orgRes.body.data.organizationId).toBe(testOrgId);
    const newOrgMemId = orgRes.body.data.id;

    // 2. Assign to Store 003
    const storeRes = await request(app)
      .post("/api/v1/iam/memberships/stores")
      .send({
        organizationMembershipId: newOrgMemId,
        storeId: store003Id,
        isDefault: true,
        isActive: true,
      });

    expect(storeRes.status).toBe(201);
    expect(storeRes.body.data.storeId).toBe(store003Id);
    expect(storeRes.body.data.isDefault).toBe(true);

    // 3. Query user stores via IAM
    const listRes = await request(app).get(`/api/v1/iam/users/${newUser.id}/stores`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].storeId).toBe(store003Id);
  });
});
