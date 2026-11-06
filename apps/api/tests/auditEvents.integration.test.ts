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

describe("Immutable Compliance Audit Trail Engine API (FEAT-GOV-02, Entity 40 / INV-09)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let otherOrgManagerToken: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_AUDIT_API', 'ORG_AUDIT_API_ALT'));",
    );
    await query(
      "ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;",
    );

    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_AUDIT_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_AUDIT_API', 'ORG_AUDIT_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'audit_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'audit_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_AUDIT_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_AUDIT_API', 'ORG_AUDIT_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Primary Organization & Store
    const org = await createOrganization({
      code: "ORG_AUDIT_API",
      name: "Compliance Audit Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_AUDIT_API_ALT",
      name: "Alt Compliance Enterprise",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_AUDIT_API_01",
      name: "Flagship Audit Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    // 2. Manager User (STORE_MANAGER - has audit:read)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "audit_api_mgr@jewelcore.local",
      firstName: "Compliance",
      lastName: "Director",
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

    // 3. Sales Associate User (SALES_ASSOCIATE - does NOT have audit:read)
    const associateUser = await createUser({
      organizationId: orgId,
      email: "audit_api_assoc@jewelcore.local",
      firstName: "Sales",
      lastName: "Staff",
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

    // 4. Alt Org Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "audit_api_alt@jewelcore.local",
      firstName: "Alt",
      lastName: "Director",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const altOrgMem = await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: altManagerUser.id,
      isDefault: true,
    });

    const altRole = await getRoleByCode("STORE_MANAGER");
    if (altRole) {
      await assignRoleToUser(altManagerUser.id, altRole.id);
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

  let capturedEventId: string;
  const mockItemId = "0192e301-0001-7000-8000-000000000088";

  it("Scenario 1: Captures a material mutation audit event with actor, IP, before/after states, and timestamp", async () => {
    const res = await request(app)
      .post("/api/v1/governance/audit-events")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        actorIpAddress: "203.0.113.195",
        action: "STOCK_APPROVAL.AUTHORIZE",
        resourceType: "INVENTORY_ITEM",
        resourceId: mockItemId,
        payloadBeforeJson: {
          commercialState: "UNREADY",
          approvalState: "PENDING_APPROVAL",
        },
        payloadAfterJson: {
          commercialState: "AVAILABLE_FOR_SALE",
          approvalState: "APPROVED",
        },
        reason: "Executive approval gate cleared after physical inspection",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.organizationId).toBe(orgId);
    expect(res.body.data.actorUserId).toBe(managerUserId);
    expect(res.body.data.actorIpAddress).toBe("203.0.113.195");
    expect(res.body.data.action).toBe("STOCK_APPROVAL.AUTHORIZE");
    expect(res.body.data.resourceType).toBe("INVENTORY_ITEM");
    expect(res.body.data.resourceId).toBe(mockItemId);
    expect(res.body.data.payloadBeforeJson).toEqual({
      commercialState: "UNREADY",
      approvalState: "PENDING_APPROVAL",
    });
    expect(res.body.data.payloadAfterJson).toEqual({
      commercialState: "AVAILABLE_FOR_SALE",
      approvalState: "APPROVED",
    });
    expect(res.body.data.reason).toBe(
      "Executive approval gate cleared after physical inspection",
    );
    expect(res.body.data.occurredAt).toBeDefined();
    expect(res.body.data.createdAt).toBeDefined();

    capturedEventId = res.body.data.id;
  });

  it("Scenario 2: Prevents audit tampering via SQL UPDATE or DELETE through PostgreSQL trigger (INV-09)", async () => {
    // 1. UPDATE must fail with INV-09 error
    await expect(
      query("UPDATE audit_events SET reason = 'Tampered text' WHERE id = $1", [
        capturedEventId,
      ]),
    ).rejects.toThrow(
      /Audit events are strictly append-only; UPDATE and DELETE operations are prohibited \(INV-09\)/,
    );

    // 2. DELETE must fail with INV-09 error
    await expect(
      query("DELETE FROM audit_events WHERE id = $1", [capturedEventId]),
    ).rejects.toThrow(
      /Audit events are strictly append-only; UPDATE and DELETE operations are prohibited \(INV-09\)/,
    );
  });

  it("Scenario 3: Rejects audit trail access for user without 'audit:read' permission (403 Forbidden)", async () => {
    // Sales Associate lacks audit:read
    const listRes = await request(app)
      .get("/api/v1/governance/audit-events")
      .set("Authorization", `Bearer ${associateToken}`);

    expect(listRes.status).toBe(403);
    expect(listRes.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");

    const getRes = await request(app)
      .get(`/api/v1/governance/audit-events/${capturedEventId}`)
      .set("Authorization", `Bearer ${associateToken}`);

    expect(getRes.status).toBe(403);
    expect(getRes.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("Scenario 4: Queries and filters audit events by resource type and resource ID with pagination", async () => {
    // 1. Record a second event on a different resource
    await request(app)
      .post("/api/v1/governance/audit-events")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        action: "QC_DECISION.APPROVE",
        resourceType: "QUALITY_DECISION",
        resourceId: "0192e301-0001-7000-8000-000000000077",
        payloadAfterJson: { decision: "PASSED" },
      });

    // 2. Query filtered by mockItemId
    const queryRes = await request(app)
      .get("/api/v1/governance/audit-events")
      .query({
        resourceType: "INVENTORY_ITEM",
        resourceId: mockItemId,
      })
      .set("Authorization", `Bearer ${managerToken}`);

    expect(queryRes.status).toBe(200);
    expect(queryRes.body.success).toBe(true);
    expect(queryRes.body.data).toHaveLength(1);
    expect(queryRes.body.data[0].id).toBe(capturedEventId);
    expect(queryRes.body.meta.count).toBe(1);
  });

  it("Scenario 5: Retrieves an audit event by ID and validates multi-tenant boundary isolation", async () => {
    // 1. Authorized user in same tenant
    const res = await request(app)
      .get(`/api/v1/governance/audit-events/${capturedEventId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(capturedEventId);

    // 2. Alt org user attempting to inspect cross-tenant audit event
    const crossRes = await request(app)
      .get(`/api/v1/governance/audit-events/${capturedEventId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`);

    expect(crossRes.status).toBe(404);
    expect(crossRes.body.code).toBe("ERR_NOT_FOUND");

    // 3. Invalid UUID returns 400
    const badRes = await request(app)
      .get("/api/v1/governance/audit-events/not-a-valid-uuid")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(badRes.status).toBe(400);
  });
});
