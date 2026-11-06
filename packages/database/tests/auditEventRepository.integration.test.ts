import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  recordAuditEvent,
  getAuditEventById,
  listAuditEvents,
} from "../src/index.js";
import { StoreType } from "@jewelcore/shared";

describe("Immutable Compliance Audit Trail Engine Repository (FEAT-GOV-02, Entity 40 / INV-09)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let actorUserId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_AUDIT_REPO', 'ORG_AUDIT_REPO_ALT'));",
    );
    await query(
      "ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;",
    );

    await query(
      "DELETE FROM users WHERE email LIKE 'audit_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_AUDIT_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_AUDIT_REPO', 'ORG_AUDIT_REPO_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_AUDIT_REPO",
      name: "Compliance Audit Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_AUDIT_REPO_ALT",
      name: "Compliance Alt Enterprise",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_AUDIT_REPO_01",
      name: "Audit Test Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const user = await createUser({
      organizationId: orgId,
      email: "audit_repo_actor@jewelcore.local",
      firstName: "Audit",
      lastName: "Officer",
      passwordHash: "mock_hash",
      isActive: true,
    });
    actorUserId = user.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  let createdEventId: string;
  const targetResourceId = "0192e301-0001-7000-8000-000000000099";

  it("Scenario 1: Persists an immutable compliance audit event with before and after state snapshots", async () => {
    const event = await recordAuditEvent({
      organizationId: orgId,
      storeId,
      actorUserId,
      actorIpAddress: "192.168.1.50",
      action: "STOCK_APPROVAL.AUTHORIZE",
      resourceType: "INVENTORY_ITEM",
      resourceId: targetResourceId,
      payloadBeforeJson: {
        commercialState: "UNREADY",
        qualityState: "QC_APPROVED",
      },
      payloadAfterJson: {
        commercialState: "AVAILABLE_FOR_SALE",
        qualityState: "QC_APPROVED",
      },
      reason: "Quarterly seasonal collection release authorization",
    });

    expect(event.id).toBeDefined();
    expect(event.organizationId).toBe(orgId);
    expect(event.storeId).toBe(storeId);
    expect(event.actorUserId).toBe(actorUserId);
    expect(event.actorIpAddress).toBe("192.168.1.50");
    expect(event.action).toBe("STOCK_APPROVAL.AUTHORIZE");
    expect(event.resourceType).toBe("INVENTORY_ITEM");
    expect(event.resourceId).toBe(targetResourceId);
    expect(event.payloadBeforeJson).toEqual({
      commercialState: "UNREADY",
      qualityState: "QC_APPROVED",
    });
    expect(event.payloadAfterJson).toEqual({
      commercialState: "AVAILABLE_FOR_SALE",
      qualityState: "QC_APPROVED",
    });
    expect(event.reason).toBe(
      "Quarterly seasonal collection release authorization",
    );
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.createdAt).toBeInstanceOf(Date);

    createdEventId = event.id;
  });

  it("Scenario 2: Retrieves an audit event by ID with tenant boundary protection", async () => {
    // 1. Authorized tenant query
    const found = await getAuditEventById(createdEventId, orgId);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(createdEventId);

    // 2. Cross-tenant isolation query
    const notFoundCrossTenant = await getAuditEventById(
      createdEventId,
      otherOrgId,
    );
    expect(notFoundCrossTenant).toBeNull();
  });

  it("Scenario 3: Lists and filters audit events by resource type and actor", async () => {
    // Record another event
    await recordAuditEvent({
      organizationId: orgId,
      actorUserId,
      action: "CUSTODY.TRANSFER",
      resourceType: "INVENTORY_MOVEMENT",
      resourceId: "0192e301-0001-7000-8000-000000000098",
      payloadBeforeJson: { custodyState: "IN_TRANSIT" },
      payloadAfterJson: { custodyState: "IN_VAULT" },
    });

    const allEvents = await listAuditEvents({
      organizationId: orgId,
    });
    expect(allEvents.length).toBeGreaterThanOrEqual(2);

    const filtered = await listAuditEvents({
      organizationId: orgId,
      resourceType: "INVENTORY_ITEM",
      resourceId: targetResourceId,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].action).toBe("STOCK_APPROVAL.AUTHORIZE");
  });

  it("Scenario 4: Enforces INV-09 audit immutability (UPDATE and DELETE prohibited by trigger)", async () => {
    // 1. UPDATE must fail
    await expect(
      query(
        "UPDATE audit_events SET reason = 'Tampered reason' WHERE id = $1",
        [createdEventId],
      ),
    ).rejects.toThrow(
      /Audit events are strictly append-only; UPDATE and DELETE operations are prohibited/,
    );

    // 2. DELETE must fail
    await expect(
      query("DELETE FROM audit_events WHERE id = $1", [createdEventId]),
    ).rejects.toThrow(
      /Audit events are strictly append-only; UPDATE and DELETE operations are prohibited/,
    );
  });
});
