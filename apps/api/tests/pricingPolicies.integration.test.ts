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
  createProduct,
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import { StoreType, MakingChargeType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Making Charge Rules & Pricing Policies API (FEAT-PRICE-02, Entity 45)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let catId: string;
  let prodId: string;

  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let otherOrgManagerToken: string;

  let createdPolicyId: string;
  let catPolicyId: string;
  let prodPolicyId: string;

  async function cleanFixtures() {
    await query(
      "DELETE FROM pricing_policies WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_POLICY_API', 'ORG_POLICY_API_ALT'));",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_POLICY_API_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_POLICY_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_POLICY_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_POLICY_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_POLICY_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_POLICY_API', 'ORG_POLICY_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'policy_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'policy_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_POLICY_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_POLICY_API', 'ORG_POLICY_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Primary Organization & Store
    const org = await createOrganization({
      code: "ORG_POLICY_API",
      name: "Luxury Pricing Policy Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_POLICY_API_ALT",
      name: "Competing Luxury Atelier",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_POLICY_API_01",
      name: "Geneva Flagship Salon",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    // 2. Category, Material, Purity, Product fixtures
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_POLICY_API_NECK",
      name: "High Jewellery Necklaces",
    });
    catId = cat.id;

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_POLICY_API_GOLD",
      name: "18K Gold Alloy",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_POLICY_API_18K",
      name: "18 Karat",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: catId,
      productCode: "PRD_POLICY_API_CHOKER",
      name: "Royal Diamond Choker",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });
    prodId = prod.id;

    // 3. Manager User (pricing:policy:manage, pricing:policy:view)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "policy_api_manager@jewelcore.local",
      firstName: "Geneva",
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
      orgId,
    });

    // 4. Associate User (pricing:policy:view only, no manage)
    const associateUser = await createUser({
      organizationId: orgId,
      email: "policy_api_assoc@jewelcore.local",
      firstName: "Salon",
      lastName: "Associate",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    associateUserId = associateUser.id;

    const assocOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: associateUserId,
      isDefault: true,
    });

    await createStoreMembership({
      storeId,
      organizationMembershipId: assocOrgMem.id,
      isDefault: true,
    });

    const assocRole = await getRoleByCode("SALES_ASSOCIATE");
    if (assocRole) {
      await assignRoleToUser(associateUserId, assocRole.id);
    }

    associateToken = await signAccessToken({
      userId: associateUserId,
      email: associateUser.email,
      orgId,
    });

    // 5. Cross-tenant Alt Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "policy_api_alt@jewelcore.local",
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
    await cleanFixtures();
    await closePool();
  });

  describe("POST /api/v1/pricing/policies (Create Policy)", () => {
    it("successfully creates a corporate baseline pricing policy (pricing:policy:manage)", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/policies")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          policyName: "Corporate Fine Jewellery Baseline Making Charge",
          chargeType: MakingChargeType.PER_GRAM,
          chargeRate: 8.5,
          wastagePercentage: 0.03,
          hallmarkingFeeCad: 10.0,
          certificationFeeCad: 0,
          defaultMarginPercentage: 0.2,
          minRetailPriceCad: 150.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.organizationId).toBe(orgId);
      expect(res.body.data.chargeType).toBe(MakingChargeType.PER_GRAM);
      expect(res.body.data.chargeRate).toBe(8.5);
      expect(res.body.data.wastagePercentage).toBe(0.03);
      expect(res.body.data.hallmarkingFeeCad).toBe(10.0);
      expect(res.body.data.defaultMarginPercentage).toBe(0.2);
      expect(res.body.data.minRetailPriceCad).toBe(150.0);

      createdPolicyId = res.body.data.id;
    });

    it("rejects unauthorized staff without pricing:policy:manage with 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/policies")
        .set("Authorization", `Bearer ${associateToken}`)
        .send({
          policyName: "Unauthorized Policy",
          chargeType: MakingChargeType.PER_GRAM,
          chargeRate: 10.0,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    });

    it("rejects unauthenticated caller with 401 Unauthorized", async () => {
      const res = await request(app).post("/api/v1/pricing/policies").send({
        policyName: "Unauthenticated Policy",
        chargeType: MakingChargeType.PER_GRAM,
        chargeRate: 10.0,
      });

      expect(res.status).toBe(401);
    });

    it("rejects invalid payload with negative rates with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/policies")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          policyName: "Invalid Policy",
          chargeType: "INVALID_CHARGE_TYPE",
          chargeRate: -5.0,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
    });
  });

  describe("GET /api/v1/pricing/policies/resolve (Hierarchical Resolution)", () => {
    beforeAll(async () => {
      // 1. Create Category-specific policy (Percentage of metal 14%)
      const catRes = await request(app)
        .post("/api/v1/pricing/policies")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          categoryId: catId,
          policyName: "Necklaces Making Charge Policy",
          chargeType: MakingChargeType.PERCENTAGE_OF_METAL,
          chargeRate: 0.14,
          wastagePercentage: 0.05,
          defaultMarginPercentage: 0.25,
        });
      catPolicyId = catRes.body.data.id;

      // 2. Create Product-specific policy (Per-gram 28.00 CAD/g)
      const prodRes = await request(app)
        .post("/api/v1/pricing/policies")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          productId: prodId,
          policyName: "Royal Choker Atelier Craftsmanship Policy",
          chargeType: MakingChargeType.PER_GRAM,
          chargeRate: 28.0,
          wastagePercentage: 0.06,
          hallmarkingFeeCad: 25.0,
          certificationFeeCad: 100.0,
          defaultMarginPercentage: 0.35,
        });
      prodPolicyId = prodRes.body.data.id;
    });

    it("resolves product-specific policy when productId matches", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/policies/resolve")
        .query({ storeId, categoryId: catId, productId: prodId })
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(prodPolicyId);
      expect(res.body.data.chargeRate).toBe(28.0);
      expect(res.body.data.chargeType).toBe(MakingChargeType.PER_GRAM);
    });

    it("falls back to category-specific policy when item has no product-specific rule", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/policies/resolve")
        .query({ storeId, categoryId: catId })
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(catPolicyId);
      expect(res.body.data.chargeRate).toBe(0.14);
      expect(res.body.data.chargeType).toBe(
        MakingChargeType.PERCENTAGE_OF_METAL,
      );
    });

    it("falls back to corporate default policy when neither product nor category match", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/policies/resolve")
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdPolicyId);
      expect(res.body.data.chargeRate).toBe(8.5);
    });
  });

  describe("PATCH /api/v1/pricing/policies/:id (Update Policy)", () => {
    it("updates policy attributes for authorized manager", async () => {
      const res = await request(app)
        .patch(`/api/v1/pricing/policies/${createdPolicyId}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          chargeRate: 9.75,
          defaultMarginPercentage: 0.24,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chargeRate).toBe(9.75);
      expect(res.body.data.defaultMarginPercentage).toBe(0.24);
    });

    it("rejects unauthorized staff with 403 Forbidden", async () => {
      const res = await request(app)
        .patch(`/api/v1/pricing/policies/${createdPolicyId}`)
        .set("Authorization", `Bearer ${associateToken}`)
        .send({ chargeRate: 10.0 });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/v1/pricing/policies/:id (Policy Lookup & Tenant Isolation)", () => {
    it("retrieves policy by ID for tenant user", async () => {
      const res = await request(app)
        .get(`/api/v1/pricing/policies/${createdPolicyId}`)
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdPolicyId);
    });

    it("enforces multi-tenant isolation: alt tenant receives 404 Not Found", async () => {
      const res = await request(app)
        .get(`/api/v1/pricing/policies/${createdPolicyId}`)
        .set("Authorization", `Bearer ${otherOrgManagerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/pricing/policies (List Policies)", () => {
    it("lists all pricing policies with pagination", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/policies")
        .query({ limit: 10, offset: 0 })
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
      expect(res.body.total).toBeGreaterThanOrEqual(3);
    });
  });
});
