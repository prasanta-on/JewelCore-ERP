import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createGemstone,
  createGemstonePriceMatrix,
  updateGemstonePriceMatrix,
  getGemstonePriceMatrixById,
  listGemstonePriceMatrices,
  resolveGemstoneRate,
} from "../src/index.js";

describe("Gemstone Valuation Matrix Repository (FEAT-PRICE-03, Entity 46)", () => {
  let orgId: string;
  let altOrgId: string;
  let diamondId: string;
  let sapphireId: string;

  let baseline1ctId: string;
  let topGrade1ctId: string;
  let midGrade1ctId: string;
  let tierHalfCtId: string;

  async function cleanFixtures() {
    await query(
      "DELETE FROM gemstone_price_matrices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_GEM_REPO', 'ORG_GEM_REPO_ALT'));",
    );
    await query("DELETE FROM gemstones WHERE code LIKE 'GEM_PRICE_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_GEM_REPO', 'ORG_GEM_REPO_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_GEM_REPO",
      name: "High Gemstone Valuation Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_GEM_REPO_ALT",
      name: "Competitor Gemstone Enterprise",
    });
    altOrgId = altOrg.id;

    const diamond = await createGemstone({
      organizationId: orgId,
      code: "GEM_PRICE_REPO_DIA",
      name: "Natural Brilliant Cut Diamond",
      gemstoneType: "PRECIOUS",
      defaultMeasurementUnit: "CARAT",
      isActive: true,
    });
    diamondId = diamond.id;

    const sapphire = await createGemstone({
      organizationId: orgId,
      code: "GEM_PRICE_REPO_SAPH",
      name: "Royal Blue Ceylon Sapphire",
      gemstoneType: "PRECIOUS",
      defaultMeasurementUnit: "CARAT",
      isActive: true,
    });
    sapphireId = sapphire.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: creates baseline carat tier rate without specific cut/color/clarity", async () => {
    const matrix = await createGemstonePriceMatrix({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratRangeMin: 1.0,
      caratRangeMax: 1.9999,
      ratePerCaratCad: 6500.0,
      currency: "CAD",
    });

    expect(matrix.id).toBeDefined();
    expect(matrix.organizationId).toBe(orgId);
    expect(matrix.gemstoneId).toBe(diamondId);
    expect(matrix.caratRangeMin).toBe(1.0);
    expect(matrix.caratRangeMax).toBe(1.9999);
    expect(matrix.cutGrade).toBeNull();
    expect(matrix.colorGrade).toBeNull();
    expect(matrix.clarityGrade).toBeNull();
    expect(matrix.ratePerCaratCad).toBe(6500.0);
    expect(matrix.currency).toBe("CAD");
    expect(matrix.isActive).toBe(true);

    baseline1ctId = matrix.id;
  });

  it("Scenario 2: creates high-grade and mid-grade specific matrices in the 1ct tier", async () => {
    // D / VVS1 / EXCELLENT -> 14,500 CAD/ct
    const topGrade = await createGemstonePriceMatrix({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratRangeMin: 1.0,
      caratRangeMax: 1.9999,
      cutGrade: "EXCELLENT",
      colorGrade: "D",
      clarityGrade: "VVS1",
      ratePerCaratCad: 14500.0,
      currency: "CAD",
    });
    topGrade1ctId = topGrade.id;

    // G / VS1 / VERY_GOOD -> 9,200 CAD/ct
    const midGrade = await createGemstonePriceMatrix({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratRangeMin: 1.0,
      caratRangeMax: 1.9999,
      cutGrade: "VERY_GOOD",
      colorGrade: "G",
      clarityGrade: "VS1",
      ratePerCaratCad: 9200.0,
      currency: "CAD",
    });
    midGrade1ctId = midGrade.id;

    expect(topGrade.ratePerCaratCad).toBe(14500.0);
    expect(midGrade.ratePerCaratCad).toBe(9200.0);
  });

  it("Scenario 3: creates tier rate for 0.50 - 0.9999 carat bracket", async () => {
    const halfCt = await createGemstonePriceMatrix({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratRangeMin: 0.5,
      caratRangeMax: 0.9999,
      ratePerCaratCad: 3800.0,
    });
    tierHalfCtId = halfCt.id;
    expect(halfCt.caratRangeMin).toBe(0.5);
  });

  it("Scenario 4: updates rate per carat dynamically", async () => {
    const updated = await updateGemstonePriceMatrix(
      baseline1ctId,
      {
        ratePerCaratCad: 6800.0,
      },
      orgId,
    );

    expect(updated.id).toBe(baseline1ctId);
    expect(updated.ratePerCaratCad).toBe(6800.0);
  });

  it("Scenario 5: resolves best-matching rate via specificity waterfall ranking", async () => {
    // 1. Exact match on cut/color/clarity in 1ct tier
    const resolvedTop = await resolveGemstoneRate({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratWeight: 1.25,
      cutGrade: "EXCELLENT",
      colorGrade: "D",
      clarityGrade: "VVS1",
    });
    expect(resolvedTop).not.toBeNull();
    expect(resolvedTop?.id).toBe(topGrade1ctId);
    expect(resolvedTop?.ratePerCaratCad).toBe(14500.0);

    // 2. Exact match on mid-grade
    const resolvedMid = await resolveGemstoneRate({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratWeight: 1.5,
      cutGrade: "VERY_GOOD",
      colorGrade: "G",
      clarityGrade: "VS1",
    });
    expect(resolvedMid).not.toBeNull();
    expect(resolvedMid?.id).toBe(midGrade1ctId);
    expect(resolvedMid?.ratePerCaratCad).toBe(9200.0);

    // 3. Fallback to general 1ct tier baseline when cut/color/clarity not in matrix
    const resolvedFallback = await resolveGemstoneRate({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratWeight: 1.1,
      cutGrade: "GOOD",
      colorGrade: "J",
      clarityGrade: "SI2",
    });
    expect(resolvedFallback).not.toBeNull();
    expect(resolvedFallback?.id).toBe(baseline1ctId);
    expect(resolvedFallback?.ratePerCaratCad).toBe(6800.0);

    // 4. Match in 0.50ct tier
    const resolvedHalf = await resolveGemstoneRate({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratWeight: 0.72,
    });
    expect(resolvedHalf).not.toBeNull();
    expect(resolvedHalf?.id).toBe(tierHalfCtId);
    expect(resolvedHalf?.ratePerCaratCad).toBe(3800.0);

    // 5. Outside of all configured ranges (5.0 carats) -> returns null
    const resolvedOutside = await resolveGemstoneRate({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratWeight: 5.0,
    });
    expect(resolvedOutside).toBeNull();
  });

  it("Scenario 6: lists gemstone price matrices with filtering", async () => {
    const list = await listGemstonePriceMatrices({
      organizationId: orgId,
      gemstoneId: diamondId,
    });

    expect(list.total).toBe(4);
    expect(list.data.length).toBe(4);
  });

  it("Scenario 7: enforces multi-tenant boundary isolation", async () => {
    const crossLookup = await getGemstonePriceMatrixById(
      baseline1ctId,
      altOrgId,
    );
    expect(crossLookup).toBeNull();
  });
});
