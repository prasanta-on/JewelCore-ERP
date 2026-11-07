import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createCustomer,
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import { StoreType, StoreCreditTransactionType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Customer Store Credit API (FEAT-RET-03, Entities 56 & 57 / INV-09)", () => {
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

  let customerId: string;
  let otherOrgCustomerId: string;

  let createdAccountId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;",
    );
    await query(
      "ALTER TABLE store_credit_transactions DISABLE TRIGGER trg_store_credit_transactions_immutability;",
    );

    await query(
      "DELETE FROM store_credit_transactions WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_API', 'ORG_SC_API_ALT'));",
    );
    await query(
      "DELETE FROM store_credit_accounts WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_API', 'ORG_SC_API_ALT'));",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_API', 'ORG_SC_API_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_API', 'ORG_SC_API_ALT'));",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_SC_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_API', 'ORG_SC_API_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'sc_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_SC_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_SC_API', 'ORG_SC_API_ALT');",
    );

    await query(
      "ALTER TABLE store_credit_transactions ENABLE TRIGGER trg_store_credit_transactions_immutability;",
    );
    await query(
      "ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_SC_API",
      name: "Prestige Credit Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_SC_API_ALT",
      name: "Alt Credit Corp",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_SC_API_01",
      name: "Yorkdale Prestige Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_SC_API_ALT",
      name: "Montreal Prestige Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    // Manager User
    const managerUser = await createUser({
      organizationId: orgId,
      email: "sc_api_mgr@jewelcore.local",
      firstName: "Gabriel",
      lastName: "Macon",
      passwordHash: "hash",
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

    // QC Inspector User (lacks store_credit permissions)
    const qcUser = await createUser({
      organizationId: orgId,
      email: "sc_api_qc@jewelcore.local",
      firstName: "Inspector",
      lastName: "Derrick",
      passwordHash: "hash",
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
    const altManager = await createUser({
      organizationId: otherOrgId,
      email: "sc_api_alt_mgr@jewelcore.local",
      firstName: "Lady",
      lastName: "Jessica",
      passwordHash: "hash",
      isActive: true,
    });

    const altOrgMem = await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: altManager.id,
      isDefault: true,
    });

    await createStoreMembership({
      storeId: otherStoreId,
      organizationMembershipId: altOrgMem.id,
      isDefault: true,
    });

    if (storeManagerRole) {
      await assignRoleToUser(altManager.id, storeManagerRole.id);
    }

    otherOrgManagerToken = await signAccessToken({
      userId: altManager.id,
      email: altManager.email,
      orgId: otherOrgId,
    });

    // Customers
    const cust = await createCustomer({
      organizationId: orgId,
      primaryStoreId: storeId,
      customerCode: "CUST-SC-API-01",
      customerType: "INDIVIDUAL",
      firstName: "Grace",
      lastName: "Kelly",
      email: "grace.kelly@example.com",
    });
    customerId = cust.id;

    const altCust = await createCustomer({
      organizationId: otherOrgId,
      primaryStoreId: otherStoreId,
      customerCode: "CUST-SC-API-ALT",
      customerType: "INDIVIDUAL",
      firstName: "Audrey",
      lastName: "Hepburn",
      email: "audrey.hepburn@example.com",
    });
    otherOrgCustomerId = altCust.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("GET /api/v1/sales/store-credits/customer/:customerId returns 401 if unauthenticated", async () => {
    const res = await request(app).get(
      `/api/v1/sales/store-credits/customer/${customerId}`,
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/sales/store-credits/adjust returns 403 if user lacks store_credit:adjust", async () => {
    const res = await request(app)
      .post("/api/v1/sales/store-credits/adjust")
      .set("Authorization", `Bearer ${qcInspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        transactionType: StoreCreditTransactionType.MANUAL_ADJUSTMENT,
        amountCad: 100.0,
      });

    expect(res.status).toBe(403);
  });

  it("GET /api/v1/sales/store-credits/customer/:customerId lazily creates account with 0.0000 balance (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/store-credits/customer/${customerId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.customerId).toBe(customerId);
    expect(res.body.data.accountNumber).toMatch(/^SCA-/);
    expect(res.body.data.balanceCad).toBe(0);
    expect(res.body.data.currency).toBe("CAD");

    createdAccountId = res.body.data.id;
  });

  it("POST /api/v1/sales/store-credits/adjust adds credit to customer account (200 OK)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/store-credits/adjust")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        transactionType: StoreCreditTransactionType.ISSUE_PROMOTION,
        amountCad: 800.0,
        notes: "VIP promotion loyalty bonus",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.account.balanceCad).toBe(800.0);
    expect(res.body.data.transaction.amountCad).toBe(800.0);
    expect(res.body.data.transaction.balanceBeforeCad).toBe(0.0);
    expect(res.body.data.transaction.balanceAfterCad).toBe(800.0);
  });

  it("POST /api/v1/sales/store-credits/redeem deducts credit tender (200 OK)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/store-credits/redeem")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        amountCad: 250.0,
        notes: "Partial payment redemption",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.account.balanceCad).toBe(550.0);
    expect(res.body.data.transaction.amountCad).toBe(250.0);
    expect(res.body.data.transaction.balanceBeforeCad).toBe(800.0);
    expect(res.body.data.transaction.balanceAfterCad).toBe(550.0);
  });

  it("POST /api/v1/sales/store-credits/redeem returns 422 if amount exceeds balance", async () => {
    const res = await request(app)
      .post("/api/v1/sales/store-credits/redeem")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        amountCad: 1000.0, // exceeds available 550
        notes: "Overdraft attempt",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_STORE_CREDIT");
  });

  it("GET /api/v1/sales/store-credits/accounts/:accountId/transactions returns immutable ledger history (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/store-credits/accounts/${createdAccountId}/transactions`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2); // 1 adjustment + 1 redemption
    expect(res.body.total).toBe(2);
    expect(res.body.data[0].storeName).toBe("Yorkdale Prestige Salon");
    expect(res.body.data[0].performerName).toBe("Gabriel Macon");
  });

  it("GET /api/v1/sales/store-credits/customer/:customerId returns 404 for other organization's customer (tenant isolation)", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/store-credits/customer/${otherOrgCustomerId}`)
      .set("Authorization", `Bearer ${managerToken}`) // orgId manager trying to view otherOrgId customer
      .set("x-store-id", storeId);

    expect(res.status).toBe(404);
  });
});
