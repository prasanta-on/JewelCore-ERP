import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
  createGoldBuybackOrder,
  settleGoldBuybackOrder,
  getGoldBuybackOrderById,
  listGoldBuybackOrders,
} from "../src/index.js";
import {
  StoreType,
  BuybackItemType,
  BuybackPayoutMethod,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("Gold Buyback Repository (FEAT-RET-02, Entities 54 & 55)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;
  let compartmentId: string;
  let userId: string;
  let customerId: string;

  let purity18kId: string;
  let purity24kId: string;

  let createdOrderId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;",
    );
    await query(
      "ALTER TABLE daily_market_rates DISABLE TRIGGER trg_daily_market_rates_immutability;",
    );

    await query(
      "DELETE FROM gold_buyback_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_REPO', 'ORG_BB_REPO_ALT'));",
    );
    await query(
      "DELETE FROM gold_buyback_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_REPO', 'ORG_BB_REPO_ALT'));",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_REPO', 'ORG_BB_REPO_ALT'));",
    );
    await query(
      "DELETE FROM daily_market_rates WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_REPO', 'ORG_BB_REPO_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_REPO', 'ORG_BB_REPO_ALT'));",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_BB_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_BB_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_BB_REPO_%';");
    await query(
      "DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BB_REPO_%');",
    );
    await query(
      "DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BB_REPO_%');",
    );
    await query(
      "DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BB_REPO_%');",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BB_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_BB_REPO', 'ORG_BB_REPO_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'bb_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_BB_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_BB_REPO', 'ORG_BB_REPO_ALT');",
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

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_BB_REPO",
      name: "Gold Standard Buyback Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_BB_REPO_ALT",
      name: "Alt Buyback Group",
    });
    otherOrgId = altOrg.id;

    // 2. Stores
    const store = await createStore({
      organizationId: orgId,
      code: "STORE_BB_REPO_01",
      name: "Downtown Gold Depot",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_BB_REPO_ALT",
      name: "Out of Town Depot",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    // 3. Vault & Compartment
    const vaultRes = await query<{ id: string }>(
      `INSERT INTO vaults (id, store_id, code, name, vault_type)
       VALUES (gen_random_uuid(), $1, 'VLT-BB-01', 'Depot Safe', 'MAIN_VAULT')
       RETURNING id`,
      [storeId],
    );
    const lockerRes = await query<{ id: string }>(
      `INSERT INTO lockers (id, vault_id, store_id, code, name, locker_number)
       VALUES (gen_random_uuid(), $1, $2, 'LCK-BB-01', 'Scrap Locker', 'SL-01')
       RETURNING id`,
      [vaultRes.rows[0]!.id, storeId],
    );
    const compRes = await query<{ id: string }>(
      `INSERT INTO compartments (id, locker_id, store_id, code, name, compartment_number)
       VALUES (gen_random_uuid(), $1, $2, 'CMP-BB-01', 'Scrap Tray', 'ST-01')
       RETURNING id`,
      [lockerRes.rows[0]!.id, storeId],
    );
    compartmentId = compRes.rows[0]!.id;

    // 4. User
    const userRes = await query<{ id: string }>(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active)
       VALUES (gen_random_uuid(), $1, 'bb_repo_appraiser@jewelcore.local', 'hash', 'Gold', 'Appraiser', true)
       RETURNING id`,
      [orgId],
    );
    userId = userRes.rows[0]!.id;

    // 5. Material & Purities
    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_BB_REPO_GOLD",
      name: "Fine Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const p18k = await createPurity({
      materialId: mat.id,
      code: "PUR_BB_REPO_18K",
      name: "18K Gold (750)",
      purityPercentage: 75.0,
      hallmarkEligible: true,
    });
    purity18kId = p18k.id;

    const p24k = await createPurity({
      materialId: mat.id,
      code: "PUR_BB_REPO_24K",
      name: "24K Pure Gold (999)",
      purityPercentage: 99.9,
      hallmarkEligible: true,
    });
    purity24kId = p24k.id;

    // 6. Active Daily Market Rate: Gold at $100.00 CAD per gram
    await recordDailyMarketRate({
      organizationId: orgId,
      storeId,
      metalType: "GOLD",
      ratePerGramCad: 100.0,
      recordedByUserId: userId,
    });

    // 7. Customer
    const cust = await createCustomer({
      organizationId: orgId,
      primaryStoreId: storeId,
      customerCode: "CUST-BB-REPO-01",
      customerType: "INDIVIDUAL",
      firstName: "Midas",
      lastName: "Goldtouch",
      email: "midas@example.com",
    });
    customerId = cust.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("creates and appraises gold buyback order using daily market spot rate (FEAT-RET-02)", async () => {
    // 18K piece: 10g net weight, 75% fineness -> 7.5g pure gold @ $100/g = $750 melt value
    // Smelting fee CAD 30 -> Net payout CAD 720
    // 24K piece: 5g net weight, 99.9% fineness -> 4.995g pure gold @ $100/g = $499.50 melt value
    // Smelting fee CAD 10 -> Net payout CAD 489.50
    const order = await createGoldBuybackOrder({
      organizationId: orgId,
      storeId,
      customerId,
      createdByUserId: userId,
      payoutMethod: BuybackPayoutMethod.CASH,
      notes: "Scrap jewellery trade-in batch",
      items: [
        {
          itemType: BuybackItemType.SCRAP_JEWELLERY,
          description: "Broken 18K curb chain",
          purityId: purity18kId,
          grossWeightGrams: 10.5,
          netWeightGrams: 10.0,
          smeltingFeeCad: 30.0,
          targetCompartmentId: compartmentId,
          notes: "Small stones removed",
        },
        {
          itemType: BuybackItemType.OLD_GOLD_BAR,
          description: "5g fine gold wafer",
          purityId: purity24kId,
          grossWeightGrams: 5.0,
          netWeightGrams: 5.0,
          smeltingFeeCad: 10.0,
          targetCompartmentId: compartmentId,
        },
      ],
    });

    expect(order.id).toBeDefined();
    expect(order.orderNumber).toMatch(/^BB-/);
    expect(order.status).toBe("APPRAISED");
    expect(order.totalGrossWeightGrams).toBe(15.5);
    expect(order.totalNetWeightGrams).toBe(15.0);
    expect(order.totalMeltValueCad).toBeCloseTo(1249.5, 2); // 750 + 499.50
    expect(order.totalSmeltingFeeCad).toBe(40.0);
    expect(order.netPayoutAmountCad).toBeCloseTo(1209.5, 2); // 1249.50 - 40.00
    expect(order.items).toHaveLength(2);
    expect(order.items![0]!.meltValueCad).toBe(750.0);
    expect(order.items![0]!.netPayoutCad).toBe(720.0);
    expect(order.items![1]!.meltValueCad).toBeCloseTo(499.5, 2);
    expect(order.items![1]!.netPayoutCad).toBeCloseTo(489.5, 2);

    createdOrderId = order.id;

    // Verify audit event appended
    const auditRes = await query<{ action: string; resource_id: string }>(
      `SELECT action, resource_id FROM audit_events WHERE resource_id = $1`,
      [order.id],
    );
    expect(auditRes.rows[0]!.action).toBe("GOLD_BUYBACK_APPRAISED");
  });

  it("settles gold buyback order and marks status SETTLED (FEAT-RET-02)", async () => {
    const settled = await settleGoldBuybackOrder({
      id: createdOrderId,
      organizationId: orgId,
      settledByUserId: userId,
      input: {
        payoutMethod: BuybackPayoutMethod.CASH,
        payoutReference: "CASH-REGISTER-DRAWER-01",
        notes: "Cash handed to customer",
      },
    });

    expect(settled.status).toBe("SETTLED");
    expect(settled.settledAt).toBeDefined();
    expect(settled.settledByUserId).toBe(userId);
    expect(settled.payoutReference).toBe("CASH-REGISTER-DRAWER-01");
    expect(settled.notes).toContain("Cash handed to customer");

    // Verify audit event for settlement
    const auditRes = await query<{ action: string }>(
      `SELECT action FROM audit_events WHERE resource_id = $1 AND action = 'GOLD_BUYBACK_SETTLED'`,
      [createdOrderId],
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it("rejects settling an already settled buyback order", async () => {
    await expect(
      settleGoldBuybackOrder({
        id: createdOrderId,
        organizationId: orgId,
        settledByUserId: userId,
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("rejects buyback order creation if smelting fee exceeds melt value", async () => {
    await expect(
      createGoldBuybackOrder({
        organizationId: orgId,
        storeId,
        customerId,
        createdByUserId: userId,
        payoutMethod: BuybackPayoutMethod.CASH,
        items: [
          {
            itemType: BuybackItemType.SCRAP_JEWELLERY,
            description: "Tiny gold link",
            purityId: purity18kId,
            grossWeightGrams: 1.0,
            netWeightGrams: 1.0,
            smeltingFeeCad: 500.0, // exceeds melt value ($75)
          },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("retrieves gold buyback order by ID with line items and customer/store joins", async () => {
    const fetched = await getGoldBuybackOrderById({
      id: createdOrderId,
      organizationId: orgId,
    });

    expect(fetched.id).toBe(createdOrderId);
    expect(fetched.customerName).toBe("Midas Goldtouch");
    expect(fetched.storeName).toBe("Downtown Gold Depot");
    expect(fetched.items).toHaveLength(2);
    expect(fetched.items![0]!.purityCode).toBe("PUR_BB_REPO_18K");
  });

  it("lists gold buyback orders with store filtering and pagination", async () => {
    const listRes = await listGoldBuybackOrders({
      organizationId: orgId,
      storeId,
      limit: 10,
      offset: 0,
    });

    expect(listRes.total).toBeGreaterThanOrEqual(1);
    expect(listRes.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.data[0]!.id).toBe(createdOrderId);

    const emptyList = await listGoldBuybackOrders({
      organizationId: orgId,
      storeId: otherStoreId,
    });
    expect(emptyList.total).toBe(0);
    expect(emptyList.data).toHaveLength(0);
  });
});
