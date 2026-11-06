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
import { StoreType, RfidTagStatus, RfidFrequencyBand } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("RFID Tag Master Registry & Lifecycle API (FEAT-RFID-01, Entity 35)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let otherOrgManagerToken: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale RFID test fixtures
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_API', 'ORG_RFID_API_ALT'));",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_API', 'ORG_RFID_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'rfid_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'rfid_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RFID_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RFID_API', 'ORG_RFID_API_ALT');",
    );

    // 1. Primary Organization & Store
    const org = await createOrganization({
      code: "ORG_RFID_API",
      name: "RFID Testing Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_RFID_API_ALT",
      name: "RFID Alternative Enterprise",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_RFID_API_001",
      name: "Flagship RFID Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    // 2. Manager User (STORE_MANAGER with rfid:write and rfid:view)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "rfid_api_manager@jewelcore.local",
      firstName: "RFID",
      lastName: "Manager",
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

    // 3. Associate User (SALES_ASSOCIATE with rfid:view only)
    const associateUser = await createUser({
      organizationId: orgId,
      email: "rfid_api_associate@jewelcore.local",
      firstName: "RFID",
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

    // 4. Other Org Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "rfid_api_alt_mgr@jewelcore.local",
      firstName: "AltOrg",
      lastName: "Manager",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: altManagerUser.id,
      isDefault: true,
    });

    if (managerRole) {
      await assignRoleToUser(altManagerUser.id, managerRole.id);
    }

    otherOrgManagerToken = await signAccessToken({
      userId: altManagerUser.id,
      email: altManagerUser.email,
      orgId: otherOrgId,
    });
  });

  afterAll(async () => {
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_API', 'ORG_RFID_API_ALT'));",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RFID_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RFID_API', 'ORG_RFID_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'rfid_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'rfid_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RFID_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RFID_API', 'ORG_RFID_API_ALT');",
    );
    await closePool();
  });

  let createdTagId: string;
  const testEpc = "E2801160600002049ABC0001";
  const testTid = "E2801130200024B1";

  // Scenario 1: Unauthorized access
  it("Scenario 1: rejects unauthenticated requests with 401 Unauthorized", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/tags")
      .send({ epc: "E2801160600002049ABC9999" });

    expect(res.status).toBe(401);
  });

  // Scenario 2: Insufficient permissions for tag creation
  it("Scenario 2: rejects tag creation for roles without rfid:write permission (403 Forbidden)", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/tags")
      .set("Authorization", `Bearer ${associateToken}`)
      .send({
        epc: "E2801160600002049ABC9999",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  // Scenario 3: Validation error on empty EPC
  it("Scenario 3: rejects tag registration with empty EPC (400 Bad Request)", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/tags")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        epc: "",
      });

    expect(res.status).toBe(400);
  });

  // Scenario 4: Successful RFID tag registration
  it("Scenario 4: successfully registers new RFID tag in UNENCODED status (201 Created)", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/tags")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        epc: testEpc,
        tid: testTid,
        frequencyBand: RfidFrequencyBand.UHF_860_960_MHZ,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.epc).toBe(testEpc);
    expect(res.body.tid).toBe(testTid);
    expect(res.body.status).toBe(RfidTagStatus.UNENCODED);
    expect(res.body.frequencyBand).toBe(RfidFrequencyBand.UHF_860_960_MHZ);
    expect(res.body.organizationId).toBe(orgId);
    expect(res.body.encodedAt).toBeNull();
    expect(res.body.retiredAt).toBeNull();

    createdTagId = res.body.id;
  });

  // Scenario 5: Duplicate EPC rejection within same organization
  it("Scenario 5: rejects duplicate EPC within the same organization with 409 Conflict", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/tags")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        epc: testEpc,
        tid: "E2801130200024B2",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_EPC");
  });

  // Scenario 6: Identical EPC allowed in different organization (multi-tenant)
  it("Scenario 6: allows identical EPC in different organization (multi-tenant boundary)", async () => {
    const res = await request(app)
      .post("/api/v1/rfid/tags")
      .set("Authorization", `Bearer ${otherOrgManagerToken}`)
      .send({
        epc: testEpc,
      });

    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(otherOrgId);
    expect(res.body.epc).toBe(testEpc);
  });

  // Scenario 7: Retrieve tag by primary key ID
  it("Scenario 7: retrieves tag by ID (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/rfid/tags/${createdTagId}`)
      .set("Authorization", `Bearer ${associateToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdTagId);
    expect(res.body.epc).toBe(testEpc);
  });

  // Scenario 8: Retrieve tag by EPC string
  it("Scenario 8: retrieves tag by EPC string (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/rfid/tags/${testEpc}`)
      .set("Authorization", `Bearer ${associateToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdTagId);
    expect(res.body.epc).toBe(testEpc);
  });

  // Scenario 9: Cross-tenant tag retrieval rejection
  it("Scenario 9: prevents cross-tenant tag retrieval by ID (404 Not Found)", async () => {
    const res = await request(app)
      .get(`/api/v1/rfid/tags/${createdTagId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`);

    expect(res.status).toBe(404);
  });

  // Scenario 10: Non-existent tag retrieval
  it("Scenario 10: returns 404 Not Found for non-existent tag", async () => {
    const res = await request(app)
      .get("/api/v1/rfid/tags/0192e301-9999-7000-8000-000000000000")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(404);
  });

  // Scenario 11: Advance status UNENCODED -> ACTIVE
  it("Scenario 11: updates tag lifecycle status to ACTIVE and sets encodedAt", async () => {
    const res = await request(app)
      .patch(`/api/v1/rfid/tags/${createdTagId}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        status: RfidTagStatus.ACTIVE,
        reason: "Encoded onto physical jewellery piece tag",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(RfidTagStatus.ACTIVE);
    expect(res.body.encodedAt).not.toBeNull();
    expect(res.body.retiredAt).toBeNull();
  });

  // Scenario 12: Rejects no-op state transition (ACTIVE -> ACTIVE)
  it("Scenario 12: rejects no-op status transition (400 Bad Request)", async () => {
    const res = await request(app)
      .patch(`/api/v1/rfid/tags/${createdTagId}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        status: RfidTagStatus.ACTIVE,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_NOOP_STATE_TRANSITION");
  });

  // Scenario 13: Rejects status update without rfid:write
  it("Scenario 13: rejects status update when lacking rfid:write (403 Forbidden)", async () => {
    const res = await request(app)
      .patch(`/api/v1/rfid/tags/${createdTagId}/status`)
      .set("Authorization", `Bearer ${associateToken}`)
      .send({
        status: RfidTagStatus.RETIRED,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  // Scenario 14: Advance status ACTIVE -> RETIRED
  it("Scenario 14: updates tag lifecycle status to RETIRED and sets retiredAt", async () => {
    const res = await request(app)
      .patch(`/api/v1/rfid/tags/${createdTagId}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        status: RfidTagStatus.RETIRED,
        reason: "Tag decommissioned after sale and customer delivery",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(RfidTagStatus.RETIRED);
    expect(res.body.retiredAt).not.toBeNull();
  });

  // Scenario 15: Rejects transition from terminal state RETIRED
  it("Scenario 15: rejects transition from terminal RETIRED status (422 Unprocessable Entity)", async () => {
    const res = await request(app)
      .patch(`/api/v1/rfid/tags/${createdTagId}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        status: RfidTagStatus.ACTIVE,
        reason: "Attempted reactivation of retired tag",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_INVALID_TAG_LIFECYCLE_STATE");
  });

  // Scenario 16: List tags with filters and pagination
  it("Scenario 16: lists RFID tags filtered by status and EPC substring", async () => {
    // Register another active tag
    const resAdd = await request(app)
      .post("/api/v1/rfid/tags")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        epc: "E2801160600002049ABC0002",
      });
    expect(resAdd.status).toBe(201);

    // List all
    const resAll = await request(app)
      .get("/api/v1/rfid/tags")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(resAll.status).toBe(200);
    expect(Array.isArray(resAll.body)).toBe(true);
    expect(resAll.body.length).toBeGreaterThanOrEqual(2);

    // Filter by status=RETIRED
    const resRetired = await request(app)
      .get(`/api/v1/rfid/tags?status=${RfidTagStatus.RETIRED}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(resRetired.status).toBe(200);
    expect(
      resRetired.body.every((t: any) => t.status === RfidTagStatus.RETIRED),
    ).toBe(true);

    // Filter by EPC substring
    const resSub = await request(app)
      .get("/api/v1/rfid/tags?epc=0002")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(resSub.status).toBe(200);
    expect(
      resSub.body.some((t: any) => t.epc === "E2801160600002049ABC0002"),
    ).toBe(true);
  });
});
