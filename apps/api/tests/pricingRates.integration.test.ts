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
import { StoreType, MetalType, RateSource } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Precious Metal Spot Rates Registry API (FEAT-PRICE-01, Entity 44 / INV-09)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let store1Id: string;
  let store2Id: string;

  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let otherOrgManagerToken: string;

  let recordedRateId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE daily_market_rates DISABLE TRIGGER trg_daily_market_rates_immutability;",
    );
    await query(
      "DELETE FROM daily_market_rates WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RATE_API', 'ORG_RATE_API_ALT'));",
    );
    await query(
      "ALTER TABLE daily_market_rates ENABLE TRIGGER trg_daily_market_rates_immutability;",
    );

    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RATE_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RATE_API', 'ORG_RATE_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'rate_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'rate_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RATE_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RATE_API', 'ORG_RATE_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Primary Organization & Stores
    const org = await createOrganization({
      code: "ORG_RATE_API",
      name: "Luxury Bullion & Jewellery Atelier",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_RATE_API_ALT",
      name: "Competing Luxury Atelier",
    });
    otherOrgId = altOrg.id;

    const store1 = await createStore({
      organizationId: orgId,
      code: "STORE_RATE_API_01",
      name: "Geneva Flagship Salon",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    store1Id = store1.id;

    const store2 = await createStore({
      organizationId: orgId,
      code: "STORE_RATE_API_02",
      name: "Zurich Airport Boutique",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    store2Id = store2.id;

    // 2. Manager User (pricing:rate:create, pricing:rate:view)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "rate_api_manager@jewelcore.local",
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
      storeId: store1Id,
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

    // 3. Associate User (pricing:rate:view only)
    const associateUser = await createUser({
      organizationId: orgId,
      email: "rate_api_assoc@jewelcore.local",
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
      storeId: store1Id,
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

    // 4. Competitor Alt Manager (Different Tenant)
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "rate_api_alt@jewelcore.local",
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

  describe("POST /api/v1/pricing/rates (Publish Spot Rate)", () => {
    it("successfully publishes a corporate default precious metal spot rate (pricing:rate:create)", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/rates")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          metalType: MetalType.GOLD,
          ratePerGramCad: 106.75,
          currency: "CAD",
          rateSource: RateSource.MANUAL_OVERRIDE,
          notes: "Morning 24K pure gold market benchmark",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.organizationId).toBe(orgId);
      expect(res.body.data.storeId).toBeNull();
      expect(res.body.data.metalType).toBe(MetalType.GOLD);
      expect(res.body.data.ratePerGramCad).toBe(106.75);
      expect(res.body.data.currency).toBe("CAD");
      expect(res.body.data.isActive).toBe(true);

      recordedRateId = res.body.data.id;
    });

    it("rejects unauthorized staff without pricing:rate:create with 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/rates")
        .set("Authorization", `Bearer ${associateToken}`)
        .send({
          metalType: MetalType.SILVER,
          ratePerGramCad: 1.45,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    });

    it("rejects unauthenticated caller with 401 Unauthorized", async () => {
      const res = await request(app).post("/api/v1/pricing/rates").send({
        metalType: MetalType.GOLD,
        ratePerGramCad: 100.0,
      });

      expect(res.status).toBe(401);
    });

    it("rejects invalid payload with negative rate or unsupported metal with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/rates")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          metalType: "COPPER", // Unsupported metal
          ratePerGramCad: -10.0, // Non-positive
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
    });
  });

  describe("GET /api/v1/pricing/rates/latest (Resolve Effective Rate)", () => {
    it("allows associate to view latest corporate active rate (pricing:rate:view)", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/rates/latest")
        .query({ metalType: MetalType.GOLD })
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metalType).toBe(MetalType.GOLD);
      expect(res.body.data.ratePerGramCad).toBe(106.75);
    });

    it("resolves store-specific rate override when defined for the store", async () => {
      // 1. Publish Store 1 specific rate (e.g., 112.5000 CAD/g)
      const storeRateRes = await request(app)
        .post("/api/v1/pricing/rates")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("x-store-id", store1Id)
        .send({
          storeId: store1Id,
          metalType: MetalType.GOLD,
          ratePerGramCad: 112.5,
          currency: "CAD",
          rateSource: RateSource.MANUAL_OVERRIDE,
          notes: "Geneva Flagship retail premium gold board",
        });

      expect(storeRateRes.status).toBe(201);

      // 2. Querying for Store 1 returns the store-specific rate 112.50
      const store1Res = await request(app)
        .get("/api/v1/pricing/rates/latest")
        .query({ metalType: MetalType.GOLD, storeId: store1Id })
        .set("Authorization", `Bearer ${managerToken}`);

      expect(store1Res.status).toBe(200);
      expect(store1Res.body.data.ratePerGramCad).toBe(112.5);
      expect(store1Res.body.data.storeId).toBe(store1Id);

      // 3. Querying for Store 2 (which has no store-specific rate) falls back to corporate rate 106.75
      const store2Res = await request(app)
        .get("/api/v1/pricing/rates/latest")
        .query({ metalType: MetalType.GOLD, storeId: store2Id })
        .set("Authorization", `Bearer ${managerToken}`);

      expect(store2Res.status).toBe(200);
      expect(store2Res.body.data.ratePerGramCad).toBe(106.75);
      expect(store2Res.body.data.storeId).toBeNull();
    });

    it("returns 404 when no rate is configured for the metal", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/rates/latest")
        .query({ metalType: MetalType.PALLADIUM })
        .set("Authorization", `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });
  });

  describe("GET /api/v1/pricing/rates/:id (Rate Lookup & Tenant Boundary)", () => {
    it("retrieves a rate record by ID for authorized tenant user", async () => {
      const res = await request(app)
        .get(`/api/v1/pricing/rates/${recordedRateId}`)
        .set("Authorization", `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(recordedRateId);
      expect(res.body.data.ratePerGramCad).toBe(106.75);
    });

    it("enforces multi-tenant isolation: alt tenant receives 404 Not Found", async () => {
      const res = await request(app)
        .get(`/api/v1/pricing/rates/${recordedRateId}`)
        .set("Authorization", `Bearer ${otherOrgManagerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/pricing/rates (List & Filter Rates)", () => {
    it("returns paginated list of spot rates filtered by metal type", async () => {
      const res = await request(app)
        .get("/api/v1/pricing/rates")
        .query({ metalType: MetalType.GOLD, limit: 10, offset: 0 })
        .set("Authorization", `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2); // Corporate + Store 1
      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(
        res.body.data.every((r: any) => r.metalType === MetalType.GOLD),
      ).toBe(true);
    });
  });
});
