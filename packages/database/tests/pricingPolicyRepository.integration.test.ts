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
  createProduct,
  createPricingPolicy,
  updatePricingPolicy,
  getPricingPolicyById,
  listPricingPolicies,
  resolvePricingPolicy,
} from "../src/index.js";
import { StoreType, MakingChargeType } from "@jewelcore/shared";

describe("Making Charge Rules & Pricing Policies Repository (FEAT-PRICE-02, Entity 45)", () => {
  let orgId: string;
  let altOrgId: string;
  let store1Id: string;
  let store2Id: string;
  let catId: string;
  let altCatId: string;
  let prodId: string;

  let corpDefaultPolicyId: string;
  let catPolicyId: string;
  let store1PolicyId: string;
  let prodPolicyId: string;

  async function cleanFixtures() {
    await query(
      "DELETE FROM pricing_policies WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_POLICY_REPO', 'ORG_POLICY_REPO_ALT'));",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_POLICY_REPO_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_POLICY_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_POLICY_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_POLICY_REPO_%';");
    await query("DELETE FROM stores WHERE code LIKE 'STORE_POLICY_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_POLICY_REPO', 'ORG_POLICY_REPO_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_POLICY_REPO",
      name: "Pricing Policy Master Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_POLICY_REPO_ALT",
      name: "Competitor Policy Enterprise",
    });
    altOrgId = altOrg.id;

    const store1 = await createStore({
      organizationId: orgId,
      code: "STORE_POLICY_REPO_01",
      name: "Downtown High Salon",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    store1Id = store1.id;

    const store2 = await createStore({
      organizationId: orgId,
      code: "STORE_POLICY_REPO_02",
      name: "Suburban Retail Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    store2Id = store2.id;

    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_POLICY_REPO_NECK",
      name: "Necklaces",
    });
    catId = cat.id;

    const altCat = await createCategory({
      organizationId: orgId,
      code: "CAT_POLICY_REPO_RINGS",
      name: "Rings",
    });
    altCatId = altCat.id;

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_POLICY_REPO_GOLD",
      name: "Gold Material",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_POLICY_REPO_18K",
      name: "18 Karat",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: catId,
      productCode: "PRD_POLICY_REPO_ROYAL",
      name: "Royal Diamond Choker",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });
    prodId = prod.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: creates a corporate default pricing policy (storeId = null, categoryId = null, productId = null)", async () => {
    const policy = await createPricingPolicy({
      organizationId: orgId,
      policyName: "Corporate Standard Jewellery Baseline",
      chargeType: MakingChargeType.PER_GRAM,
      chargeRate: 8.5,
      wastagePercentage: 0.03,
      hallmarkingFeeCad: 10.0,
      certificationFeeCad: 0,
      defaultMarginPercentage: 0.2,
      minRetailPriceCad: 100.0,
    });

    expect(policy.id).toBeDefined();
    expect(policy.organizationId).toBe(orgId);
    expect(policy.storeId).toBeNull();
    expect(policy.categoryId).toBeNull();
    expect(policy.productId).toBeNull();
    expect(policy.policyName).toBe("Corporate Standard Jewellery Baseline");
    expect(policy.chargeType).toBe(MakingChargeType.PER_GRAM);
    expect(policy.chargeRate).toBe(8.5);
    expect(policy.wastagePercentage).toBe(0.03);
    expect(policy.hallmarkingFeeCad).toBe(10.0);
    expect(policy.defaultMarginPercentage).toBe(0.2);
    expect(policy.minRetailPriceCad).toBe(100.0);
    expect(policy.isActive).toBe(true);

    corpDefaultPolicyId = policy.id;
  });

  it("Scenario 2: creates category-specific, store-specific, and product-specific policies", async () => {
    // Category policy for Necklaces (Percentage of metal making charge: 14%)
    const catPolicy = await createPricingPolicy({
      organizationId: orgId,
      categoryId: catId,
      policyName: "High Jewellery Necklaces Making Charge",
      chargeType: MakingChargeType.PERCENTAGE_OF_METAL,
      chargeRate: 0.14,
      wastagePercentage: 0.05,
      hallmarkingFeeCad: 15.0,
      certificationFeeCad: 50.0,
      defaultMarginPercentage: 0.25,
    });
    catPolicyId = catPolicy.id;
    expect(catPolicy.categoryId).toBe(catId);

    // Store 1 default policy (Fixed piece charge: 150.00 CAD)
    const storePolicy = await createPricingPolicy({
      organizationId: orgId,
      storeId: store1Id,
      policyName: "Downtown Flagship Boutique Making Charge",
      chargeType: MakingChargeType.FIXED_PIECE,
      chargeRate: 150.0,
      wastagePercentage: 0.02,
      hallmarkingFeeCad: 12.0,
      defaultMarginPercentage: 0.3,
    });
    store1PolicyId = storePolicy.id;
    expect(storePolicy.storeId).toBe(store1Id);

    // Product-specific policy for Royal Choker (Per gram: 25.00 CAD/g master craftsmanship)
    const prodPolicy = await createPricingPolicy({
      organizationId: orgId,
      productId: prodId,
      policyName: "Royal Choker Haute Joaillerie Making Charge",
      chargeType: MakingChargeType.PER_GRAM,
      chargeRate: 25.0,
      wastagePercentage: 0.06,
      hallmarkingFeeCad: 20.0,
      certificationFeeCad: 150.0,
      defaultMarginPercentage: 0.35,
    });
    prodPolicyId = prodPolicy.id;
    expect(prodPolicy.productId).toBe(prodId);
  });

  it("Scenario 3: updates policy attributes dynamically", async () => {
    const updated = await updatePricingPolicy(
      corpDefaultPolicyId,
      {
        chargeRate: 9.25,
        defaultMarginPercentage: 0.22,
      },
      orgId,
    );

    expect(updated.id).toBe(corpDefaultPolicyId);
    expect(updated.chargeRate).toBe(9.25);
    expect(updated.defaultMarginPercentage).toBe(0.22);
  });

  it("Scenario 4: resolves policy via hierarchical priority waterfall (FEAT-PRICE-02)", async () => {
    // 1. Product priority: Looking up royal choker -> returns product-specific policy
    const resolvedProd = await resolvePricingPolicy({
      organizationId: orgId,
      storeId: store1Id,
      categoryId: catId,
      productId: prodId,
    });
    expect(resolvedProd).not.toBeNull();
    expect(resolvedProd?.id).toBe(prodPolicyId);
    expect(resolvedProd?.chargeRate).toBe(25.0);

    // 2. Category priority: Looking up non-specific product in Necklaces at Store 2 -> returns category policy
    const resolvedCat = await resolvePricingPolicy({
      organizationId: orgId,
      storeId: store2Id,
      categoryId: catId,
      productId: null,
    });
    expect(resolvedCat).not.toBeNull();
    expect(resolvedCat?.id).toBe(catPolicyId);
    expect(resolvedCat?.chargeRate).toBe(0.14);

    // 3. Store priority: Looking up Rings category at Store 1 (where store policy exists, but no ring policy) -> returns Store 1 policy
    const resolvedStore = await resolvePricingPolicy({
      organizationId: orgId,
      storeId: store1Id,
      categoryId: altCatId,
      productId: null,
    });
    expect(resolvedStore).not.toBeNull();
    expect(resolvedStore?.id).toBe(store1PolicyId);
    expect(resolvedStore?.chargeRate).toBe(150.0);

    // 4. Corporate default priority: Looking up Rings at Store 2 (no ring policy, no store policy) -> returns corporate default policy
    const resolvedCorp = await resolvePricingPolicy({
      organizationId: orgId,
      storeId: store2Id,
      categoryId: altCatId,
      productId: null,
    });
    expect(resolvedCorp).not.toBeNull();
    expect(resolvedCorp?.id).toBe(corpDefaultPolicyId);
    expect(resolvedCorp?.chargeRate).toBe(9.25);
  });

  it("Scenario 5: lists pricing policies with filtering and pagination", async () => {
    const list = await listPricingPolicies({
      organizationId: orgId,
      isActive: true,
      limit: 10,
      offset: 0,
    });

    expect(list.total).toBe(4);
    expect(list.data.length).toBe(4);

    const storeOnlyList = await listPricingPolicies({
      organizationId: orgId,
      storeId: store1Id,
    });
    expect(storeOnlyList.total).toBe(1);
    expect(storeOnlyList.data[0].id).toBe(store1PolicyId);
  });

  it("Scenario 6: enforces multi-tenant boundary isolation", async () => {
    const crossLookup = await getPricingPolicyById(
      corpDefaultPolicyId,
      altOrgId,
    );
    expect(crossLookup).toBeNull();
  });
});
