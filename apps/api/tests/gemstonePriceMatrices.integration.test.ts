import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createGemstone,
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Gemstone Valuation Matrix API (FEAT-PRICE-03, Entity 46)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let diamondId: string;

  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let otherOrgManagerToken: string;

  let baselineMatrixId: string;
  let gradedMatrixId: string;

  async function cleanFixtures() {
    await query(
      "DELETE FROM gemstone_price_matrices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_GEM_API', 'ORG_GEM_API_ALT'));",
    );
    await query("DELETE FROM gemstones WHERE code LIKE 'GEM_PRICE_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_GEM_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_GEM_API', 'ORG_GEM_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'gem_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'gem_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_GEM_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_GEM_API', 'ORG_GEM_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_GEM_API",
      name: "Luxury Diamond Valuation Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_GEM_API_ALT",
      name: "Competing Diamond Valuation Enterprise",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_GEM_API_01",
      name: "Zurich Diamond Salon",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    const diamond = await createGemstone({
      organizationId: orgId,
      code: "GEM_PRICE_API_DIA",
      name: "Natural Brilliant Cut Diamond",
      gemstoneType: "PRECIOUS",
      defaultMeasurementUnit: "CARAT",
      isActive: true,
    });
    diamondId = diamond.id;

    // Manager User (pricing:matrix:manage, pricing:matrix:view)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "gem_api_manager@jewelcore.local",
      firstName: "Zurich",
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

    // Associate User (pricing:matrix:view only)
    const associateUser = await createUser({
      organizationId: orgId,
      email: "gem_api_assoc@jewelcore.local",
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

    // Cross-tenant Alt Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "gem_api_alt@jewelcore.local",
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

  describe("POST /api/v1/pricing/gemstone-matrices (Create Matrix Entry)", () => {
    it("successfully creates a gemstone valuation matrix entry (pricing:matrix:manage)", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/gemstone-matrices")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          gemstoneId: diamondId,
          caratRangeMin: 1.0,
          caratRangeMax: 1.9999,
          ratePerCaratCad: 6800.0,
          currency: "CAD",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.organizationId).toBe(orgId);
      expect(res.body.data.gemstoneId).toBe(diamondId);
      expect(res.body.data.caratRangeMin).toBe(1.0);
      expect(res.body.data.caratRangeMax).toBe(1.9999);
      expect(res.body.data.ratePerCaratCad).toBe(6800.0);
      expect(res.body.data.currency).toBe("CAD");

      baselineMatrixId = res.body.data.id;
    });

    it("rejects unauthorized staff without pricing:matrix:manage with 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/gemstone-matrices")
        .set("Authorization", `Bearer ${associateToken}`)
        .send({
          gemstoneId: diamondId,
          caratRangeMin: 1.0,
          caratRangeMax: 1.9999,
          ratePerCaratCad: 7000.0,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    });

    it("rejects unauthenticated caller with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/gemstone-matrices")
        .send({
          gemstoneId: diamondId,
          caratRangeMin: 1.0,
          caratRangeMax: 1.9999,
          ratePerCaratCad: 7000.0,
        });

      expect(res.status).toBe(401);
    });

    it("rejects invalid payload where min > max with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/gemstone-matrices")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          gemstoneId: diamondId,
          caratRangeMin: 2.0,
          caratRangeMax: 1.0, // Invalid: max < min
          ratePerCaratCad: 8000.0,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
    });
  });

  describe("GET /api/v1/pricing/gemstone-matrices/resolve (Rate Resolution)", () => {
    beforeAll(async () => {
      // Create high-grade matrix: D / VVS1 / EXCELLENT in 1ct tier -> 14,800.00 CAD/ct
      const gradedRes = await request(app)
        .post("/api/v1/pricing/gemstone-matrices")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          gemstoneId: diamondId,
          caratRangeMin: 1.0,
          caratRangeMax: 1.9999,
          cutGrade: "EXCELLENT",
          colorGrade: "D",
          clarityGrade: "VVS1",
          ratePerCaratCad: 14800.0,
          currency: "CAD",
        });
      gradedMatrixId = gradedRes.body.data.id;
    });

    it("resolves specific grade matrix when cut/color/clarity match exactly", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/gemstone-matrices/resolve")
        .query({
          gemstoneId: diamondId,
          caratWeight: 1.35,
          cutGrade: "EXCELLENT",
          colorGrade: "D",
          clarityGrade: "VVS1",
        })
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(gradedMatrixId);
      expect(res.body.data.ratePerCaratCad).toBe(14800.0);
    });

    it("falls back to general carat tier baseline when stone grades are unmatrixed", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/gemstone-matrices/resolve")
        .query({
          gemstoneId: diamondId,
          caratWeight: 1.35,
          cutGrade: "FAIR",
          colorGrade: "K",
          clarityGrade: "I1",
        })
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(baselineMatrixId);
      expect(res.body.data.ratePerCaratCad).toBe(6800.0);
    });

    it("returns 404 when carat weight has no matching matrix bracket", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/gemstone-matrices/resolve")
        .query({
          gemstoneId: diamondId,
          caratWeight: 4.5, // Unconfigured carat tier
        })
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });
  });

  describe("PATCH /api/v1/pricing/gemstone-matrices/:id (Update Matrix)", () => {
    it("updates rate per carat for authorized manager", async () => {
      const res = await request(app)
        .patch(`/api/v1/pricing/gemstone-matrices/${baselineMatrixId}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          ratePerCaratCad: 7200.0,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ratePerCaratCad).toBe(7200.0);
    });

    it("rejects unauthorized staff with 403 Forbidden", async () => {
      const res = await request(app)
        .patch(`/api/v1/pricing/gemstone-matrices/${baselineMatrixId}`)
        .set("Authorization", `Bearer ${associateToken}`)
        .send({ ratePerCaratCad: 8000.0 });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/v1/pricing/gemstone-matrices/:id (Lookup & Multi-Tenant)", () => {
    it("retrieves matrix entry by ID for authorized tenant user", async () => {
      const res = await request(app)
        .get(`/api/v1/pricing/gemstone-matrices/${baselineMatrixId}`)
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(baselineMatrixId);
    });

    it("enforces multi-tenant isolation: alt tenant receives 404 Not Found", async () => {
      const res = await request(app)
        .get(`/api/v1/pricing/gemstone-matrices/${baselineMatrixId}`)
        .set("Authorization", `Bearer ${otherOrgManagerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/pricing/gemstone-matrices (List Matrices)", () => {
    it("returns paginated list of matrices filtered by gemstoneId", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/gemstone-matrices")
        .query({ gemstoneId: diamondId, limit: 10, offset: 0 })
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });
  });
});
