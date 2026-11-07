import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  recordDailyMarketRate,
  getLatestEffectiveRate,
  getDailyMarketRateById,
  listDailyMarketRates,
} from "../src/index.js";
import { StoreType, MetalType, RateSource } from "@jewelcore/shared";

describe("Precious Metal Spot Rates Registry Repository (FEAT-PRICE-01, Entity 44 / INV-09)", () => {
  let orgId: string;
  let altOrgId: string;
  let store1Id: string;
  let store2Id: string;
  let userId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE daily_market_rates DISABLE TRIGGER trg_daily_market_rates_immutability;",
    );
    await query(
      "DELETE FROM daily_market_rates WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RATE_REPO', 'ORG_RATE_REPO_ALT'));",
    );
    await query(
      "ALTER TABLE daily_market_rates ENABLE TRIGGER trg_daily_market_rates_immutability;",
    );

    await query(
      "DELETE FROM users WHERE email LIKE 'rate_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RATE_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RATE_REPO', 'ORG_RATE_REPO_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_RATE_REPO",
      name: "Precious Bullion Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_RATE_REPO_ALT",
      name: "Competitor Bullion Enterprise",
    });
    altOrgId = altOrg.id;

    const store1 = await createStore({
      organizationId: orgId,
      code: "STORE_RATE_REPO_01",
      name: "Downtown Flagship Salon",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    store1Id = store1.id;

    const store2 = await createStore({
      organizationId: orgId,
      code: "STORE_RATE_REPO_02",
      name: "Airport Luxury Boutique",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    store2Id = store2.id;

    const user = await createUser({
      organizationId: orgId,
      email: "rate_repo_manager@jewelcore.local",
      firstName: "Pricing",
      lastName: "Officer",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    userId = user.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: records a corporate default precious metal spot rate (storeId = null)", async () => {
    const rate = await recordDailyMarketRate({
      organizationId: orgId,
      storeId: null,
      metalType: MetalType.GOLD,
      ratePerGramCad: 105.5,
      currency: "CAD",
      rateSource: RateSource.MANUAL_OVERRIDE,
      notes: "Morning market open fix for fine 24K gold",
      recordedByUserId: userId,
    });

    expect(rate.id).toBeDefined();
    expect(rate.organizationId).toBe(orgId);
    expect(rate.storeId).toBeNull();
    expect(rate.metalType).toBe(MetalType.GOLD);
    expect(rate.ratePerGramCad).toBe(105.5);
    expect(rate.currency).toBe("CAD");
    expect(rate.isActive).toBe(true);
    expect(rate.effectiveTo).toBeNull();
    expect(rate.rateSource).toBe(RateSource.MANUAL_OVERRIDE);
  });

  it("Scenario 2: atomic superseding of active corporate rate stamps effectiveTo and creates new active rate", async () => {
    // Current rate was 105.5000. Now publish midday update 108.2500
    const updateTime = new Date();
    const newRate = await recordDailyMarketRate({
      organizationId: orgId,
      storeId: null,
      metalType: MetalType.GOLD,
      ratePerGramCad: 108.25,
      currency: "CAD",
      effectiveFrom: updateTime,
      rateSource: RateSource.LBMA_FEED,
      notes: "Midday LBMA gold fix update",
      recordedByUserId: userId,
    });

    expect(newRate.id).toBeDefined();
    expect(newRate.ratePerGramCad).toBe(108.25);
    expect(newRate.isActive).toBe(true);
    expect(newRate.effectiveTo).toBeNull();

    // Verify latest effective rate reflects 108.25
    const latest = await getLatestEffectiveRate({
      organizationId: orgId,
      metalType: MetalType.GOLD,
    });
    expect(latest).not.toBeNull();
    expect(latest?.id).toBe(newRate.id);
    expect(latest?.ratePerGramCad).toBe(108.25);

    // Verify historical superseded rate has is_active = false and effectiveTo stamped
    const history = await listDailyMarketRates({
      organizationId: orgId,
      metalType: MetalType.GOLD,
    });
    expect(history.total).toBe(2);
    const retired = history.data.find((r) => r.ratePerGramCad === 105.5);
    expect(retired).toBeDefined();
    expect(retired?.isActive).toBe(false);
    expect(retired?.effectiveTo).not.toBeNull();
  });

  it("Scenario 3: store-level rate override takes precedence over corporate default", async () => {
    // Record store-specific rate for Store 1 (e.g. higher local duty / transport adjustment: 112.0000 CAD/g)
    const storeRate = await recordDailyMarketRate({
      organizationId: orgId,
      storeId: store1Id,
      metalType: MetalType.GOLD,
      ratePerGramCad: 112.0,
      currency: "CAD",
      rateSource: RateSource.MANUAL_OVERRIDE,
      notes: "Store 1 salon premium rate board",
      recordedByUserId: userId,
    });

    expect(storeRate.storeId).toBe(store1Id);
    expect(storeRate.ratePerGramCad).toBe(112.0);

    // Lookup for Store 1 -> returns 112.0000
    const store1Lookup = await getLatestEffectiveRate({
      organizationId: orgId,
      metalType: MetalType.GOLD,
      storeId: store1Id,
    });
    expect(store1Lookup).not.toBeNull();
    expect(store1Lookup?.id).toBe(storeRate.id);
    expect(store1Lookup?.ratePerGramCad).toBe(112.0);

    // Lookup for Store 2 (which has no store-specific rate) -> falls back to corporate rate (108.2500)
    const store2Lookup = await getLatestEffectiveRate({
      organizationId: orgId,
      metalType: MetalType.GOLD,
      storeId: store2Id,
    });
    expect(store2Lookup).not.toBeNull();
    expect(store2Lookup?.ratePerGramCad).toBe(108.25);
    expect(store2Lookup?.storeId).toBeNull();
  });

  it("Scenario 4: records rates for multiple metals (SILVER, PLATINUM) and lists with filters", async () => {
    await recordDailyMarketRate({
      organizationId: orgId,
      metalType: MetalType.SILVER,
      ratePerGramCad: 1.45,
      recordedByUserId: userId,
    });

    await recordDailyMarketRate({
      organizationId: orgId,
      metalType: MetalType.PLATINUM,
      ratePerGramCad: 42.8,
      recordedByUserId: userId,
    });

    const silverRate = await getLatestEffectiveRate({
      organizationId: orgId,
      metalType: MetalType.SILVER,
    });
    expect(silverRate?.ratePerGramCad).toBe(1.45);

    const platRate = await getLatestEffectiveRate({
      organizationId: orgId,
      metalType: MetalType.PLATINUM,
    });
    expect(platRate?.ratePerGramCad).toBe(42.8);

    // Filter by metalType SILVER
    const silverList = await listDailyMarketRates({
      organizationId: orgId,
      metalType: MetalType.SILVER,
    });
    expect(silverList.total).toBe(1);
    expect(silverList.data[0]?.ratePerGramCad).toBe(1.45);
  });

  it("Scenario 5: enforces append-only immutability trigger on rate values and rejects deletion (INV-09)", async () => {
    const rate = await recordDailyMarketRate({
      organizationId: orgId,
      metalType: MetalType.PALLADIUM,
      ratePerGramCad: 48.5,
      recordedByUserId: userId,
    });

    // Attempting to UPDATE the numerical rate or metal type must be rejected
    await expect(
      query(
        "UPDATE daily_market_rates SET rate_per_gram_cad = 50.00 WHERE id = $1;",
        [rate.id],
      ),
    ).rejects.toThrow(
      /daily_market_rates historical rate values are strictly immutable \(INV-09\)/,
    );

    // Attempting to DELETE must be rejected
    await expect(
      query("DELETE FROM daily_market_rates WHERE id = $1;", [rate.id]),
    ).rejects.toThrow(
      /daily_market_rates records are append-only and cannot be deleted \(INV-09\)/,
    );
  });

  it("Scenario 6: enforces multi-tenant boundary isolation", async () => {
    const rate = await recordDailyMarketRate({
      organizationId: orgId,
      metalType: MetalType.GOLD,
      ratePerGramCad: 109.0,
      recordedByUserId: userId,
    });

    // Cross-tenant lookup returns null
    const crossTenantRate = await getDailyMarketRateById(rate.id, altOrgId);
    expect(crossTenantRate).toBeNull();
  });
});
