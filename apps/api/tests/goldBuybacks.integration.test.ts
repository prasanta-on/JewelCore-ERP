import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createCategory,
  createMaterial,
  createPurity,
  createCustomer,
  recordDailyMarketRate,
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import {
  StoreType,
  BuybackItemType,
  BuybackPayoutMethod,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Gold Buyback API (FEAT-RET-02, Entities 54 & 55)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;
  let compartmentId: string;

  let managerToken: string;
  let managerUserId: string;
  let qcInspectorToken: string;
  let qcInspectorUserId: string;
  let otherOrgManagerToken: string;

  let customerId: string;
  let purity18kId: string;

  let createdBuybackId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;",
    );
    await query(
      "ALTER TABLE daily_market_rates DISABLE TRIGGER trg_daily_market_rates_immutability;",
    );

    await query(
      "DELETE FROM gold_buyback_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_API', 'ORG_BB_API_ALT'));",
    );
    await query(
      "DELETE FROM gold_buyback_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_API', 'ORG_BB_API_ALT'));",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_API', 'ORG_BB_API_ALT'));",
    );
    await query(
      "DELETE FROM daily_market_rates WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_API', 'ORG_BB_API_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_API', 'ORG_BB_API_ALT'));",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_BB_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_BB_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_BB_API_%';");
    await query(
      "DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BB_API_%');",
    );
    await query(
      "DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BB_API_%');",
    );
    await query(
      "DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BB_API_%');",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BB_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_API', 'ORG_BB_API_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'bb_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_BB_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_BB_API', 'ORG_BB_API_ALT');",
    );

    await query(
      "ALTER TABLE daily_market_rates ENABLE TRIGGER trg_daily_market_rates_immutability;",
    );
    await query(
      "ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_BB_API",
      name: "High Purity Bullion & Scrap Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_BB_API_ALT",
      name: "Alt Bullion Corp",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_BB_API_01",
      name: "Yorkville Bullion Exchange",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_BB_API_ALT",
      name: "Vancouver Gold Counter",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    // Compartment
    const vaultRes = await query<{ id: string }>(
      `INSERT INTO vaults (id, store_id, code, name, vault_type)
       VALUES (gen_random_uuid(), $1, 'VLT-BB-API-01', 'Yorkville Safe', 'MAIN_VAULT')
       RETURNING id`,
      [storeId],
    );
    const lockerRes = await query<{ id: string }>(
      `INSERT INTO lockers (id, vault_id, store_id, code, name, locker_number)
       VALUES (gen_random_uuid(), $1, $2, 'LCK-BB-API-01', 'Gold Locker', 'GL-01')
       RETURNING id`,
      [vaultRes.rows[0]!.id, storeId],
    );
    const compRes = await query<{ id: string }>(
      `INSERT INTO compartments (id, locker_id, store_id, code, name, compartment_number)
       VALUES (gen_random_uuid(), $1, $2, 'CMP-BB-API-01', 'Melt Tray', 'MT-01')
       RETURNING id`,
      [lockerRes.rows[0]!.id, storeId],
    );
    compartmentId = compRes.rows[0]!.id;

    // Manager User
    const managerUser = await createUser({
      organizationId: orgId,
      email: "bb_api_mgr@jewelcore.local",
      firstName: "Mayer",
      lastName: "Rothschild",
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

    // QC Inspector User (lacks buyback permissions)
    const qcUser = await createUser({
      organizationId: orgId,
      email: "bb_api_qc@jewelcore.local",
      firstName: "Jacques",
      lastName: "Clouseau",
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
      email: "bb_api_alt_mgr@jewelcore.local",
      firstName: "Baron",
      lastName: "Harkonnen",
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

    // Material & Purity
    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_BB_API_GLD",
      name: "Scrap Gold Material",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_BB_API_18K",
      name: "18K (750)",
      purityPercentage: 75.0,
      hallmarkEligible: true,
    });
    purity18kId = pur.id;

    // Spot Rate: $90.00 CAD per pure gold gram
    await recordDailyMarketRate({
      organizationId: orgId,
      storeId,
      metalType: "GOLD",
      ratePerGramCad: 90.0,
      recordedByUserId: managerUserId,
    });

    // Customer
    const cust = await createCustomer({
      organizationId: orgId,
      primaryStoreId: storeId,
      customerCode: "CUST-BB-API-01",
      customerType: "INDIVIDUAL",
      firstName: "Warren",
      lastName: "Buffett",
      email: "warren.bb@example.com",
    });
    customerId = cust.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("POST /api/v1/sales/buybacks returns 401 Unauthorized if Bearer token missing", async () => {
    const res = await request(app).post("/api/v1/sales/buybacks").send({});
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/sales/buybacks returns 403 Forbidden if user lacks buyback:order:create", async () => {
    const res = await request(app)
      .post("/api/v1/sales/buybacks")
      .set("Authorization", `Bearer ${qcInspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        payoutMethod: BuybackPayoutMethod.CASH,
        items: [
          {
            itemType: BuybackItemType.SCRAP_JEWELLERY,
            description: "Old 18K ring",
            purityId: purity18kId,
            grossWeightGrams: 5.0,
            netWeightGrams: 5.0,
          },
        ],
      });

    expect(res.status).toBe(403);
  });

  it("POST /api/v1/sales/buybacks returns 400 Bad Request on missing fields", async () => {
    const res = await request(app)
      .post("/api/v1/sales/buybacks")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.title).toBe("Validation Error");
  });

  it("POST /api/v1/sales/buybacks successfully appraises scrap gold (201 Created)", async () => {
    // 20g net weight of 18K (75%) = 15g pure gold @ $90/g = $1350 melt value
    // Smelting fee CAD 50 -> Net payout CAD 1300
    const res = await request(app)
      .post("/api/v1/sales/buybacks")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        payoutMethod: BuybackPayoutMethod.BANK_TRANSFER,
        notes: "Customer selling heirloom scrap gold",
        items: [
          {
            itemType: BuybackItemType.SCRAP_JEWELLERY,
            description: "Broken 18K bangle",
            purityId: purity18kId,
            grossWeightGrams: 20.5,
            netWeightGrams: 20.0,
            smeltingFeeCad: 50.0,
            targetCompartmentId: compartmentId,
            notes: "Stones pried out",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.orderNumber).toMatch(/^BB-/);
    expect(res.body.data.status).toBe("APPRAISED");
    expect(res.body.data.totalMeltValueCad).toBe(1350.0);
    expect(res.body.data.totalSmeltingFeeCad).toBe(50.0);
    expect(res.body.data.netPayoutAmountCad).toBe(1300.0);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].marketRatePerGramCad).toBe(90.0);

    createdBuybackId = res.body.data.id;
  });

  it("POST /api/v1/sales/buybacks returns 422 if smelting fee exceeds melt value", async () => {
    const res = await request(app)
      .post("/api/v1/sales/buybacks")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        payoutMethod: BuybackPayoutMethod.CASH,
        items: [
          {
            itemType: BuybackItemType.SCRAP_JEWELLERY,
            description: "Tiny gold clasp",
            purityId: purity18kId,
            grossWeightGrams: 1.0,
            netWeightGrams: 1.0,
            smeltingFeeCad: 9999.0,
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_INVALID_SMELTING_FEE");
  });

  it("POST /api/v1/sales/buybacks/:id/settle successfully finalizes payout (200 OK)", async () => {
    const res = await request(app)
      .post(`/api/v1/sales/buybacks/${createdBuybackId}/settle`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        payoutMethod: BuybackPayoutMethod.BANK_TRANSFER,
        payoutReference: "WIRE-REF-992817",
        notes: "EFT initiated via RBC business banking",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("SETTLED");
    expect(res.body.data.payoutReference).toBe("WIRE-REF-992817");
    expect(res.body.data.settledAt).toBeDefined();
  });

  it("POST /api/v1/sales/buybacks/:id/settle returns 422 if already settled", async () => {
    const res = await request(app)
      .post(`/api/v1/sales/buybacks/${createdBuybackId}/settle`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_ORDER_ALREADY_SETTLED");
  });

  it("GET /api/v1/sales/buybacks/:id retrieves buyback order with line items", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/buybacks/${createdBuybackId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdBuybackId);
    expect(res.body.data.customerName).toBe("Warren Buffett");
    expect(res.body.data.storeName).toBe("Yorkville Bullion Exchange");
    expect(res.body.data.items).toHaveLength(1);
  });

  it("GET /api/v1/sales/buybacks/:id returns 404 for other organization's order (tenant isolation)", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/buybacks/${createdBuybackId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`)
      .set("x-store-id", otherStoreId);

    expect(res.status).toBe(404);
  });

  it("GET /api/v1/sales/buybacks lists buybacks with store filter and pagination", async () => {
    const res = await request(app)
      .get("/api/v1/sales/buybacks")
      .query({ storeId, limit: 10, offset: 0 })
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });
});
