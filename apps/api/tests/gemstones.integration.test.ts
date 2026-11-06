import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createUser,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Gemstone Master Registry API Endpoints (FEAT-TAX-03)", () => {
  const app = createApp();

  let testOrgId: string;
  let managerToken: string;
  let salesToken: string;
  let diamondGemstoneId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "GEM_API_ORG",
      name: "Gemstone API Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Manager User (STORE_MANAGER role has taxonomy:write and taxonomy:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "gem_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Gem",
      lastName: "Manager",
      isActive: true,
    });

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(manager.id, managerRole.id);
    }

    managerToken = await signAccessToken({
      userId: manager.id,
      orgId: testOrgId,
      email: manager.email,
    });

    // 3. Sales User (SALES_ASSOCIATE role lacks taxonomy:write)
    const sales = await createUser({
      organizationId: testOrgId,
      email: "gem_sales@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Gem",
      lastName: "Sales",
      isActive: true,
    });

    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    if (salesRole) {
      await assignRoleToUser(sales.id, salesRole.id);
    }

    salesToken = await signAccessToken({
      userId: sales.id,
      orgId: testOrgId,
      email: sales.email,
    });
  });

  afterAll(async () => {
    await query("DELETE FROM gemstones WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM users WHERE email LIKE 'gem_%@jewelcore.local';");
    await query("DELETE FROM organizations WHERE code LIKE 'GEM_API_%';");
    await closePool();
  });

  // AC Scenario 1: Valid Gemstone Classification Master Registration
  it("Scenario 1: registers valid gemstone classification with default CARAT unit", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/gemstones")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "GEM-DIA",
        name: "Natural Diamond",
        gemstoneType: "PRECIOUS",
        defaultMeasurementUnit: "CARAT",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.code).toBe("GEM-DIA");
    expect(res.body.data.name).toBe("Natural Diamond");
    expect(res.body.data.gemstoneType).toBe("PRECIOUS");
    expect(res.body.data.defaultMeasurementUnit).toBe("CARAT");
    expect(res.body.data.isActive).toBe(true);
    diamondGemstoneId = res.body.data.id;
  });

  // AC Scenario 2: Duplicate Gemstone Code Rejection
  it("Scenario 2: rejects duplicate gemstone code within organization with 409 Conflict", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/gemstones")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "GEM-DIA",
        name: "Another Natural Diamond",
        gemstoneType: "PRECIOUS",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_GEMSTONE_CODE");
    expect(res.body.title).toBe("Conflict");
  });

  // AC Scenario 3: Invalid Gemstone Type Enumeration Rejection
  it("Scenario 3: rejects invalid gemstone type with 400 Bad Request (ERR_VALIDATION)", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/gemstones")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "GEM-PLASTIC",
        name: "Synthetic Plastic",
        gemstoneType: "SYNTHETIC_PLASTIC",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_VALIDATION");
    expect(res.body.title).toBe("Validation Error");
  });

  // AC Scenario 4: Unauthorized Gemstone Registration Rejection
  it("Scenario 4: rejects user without taxonomy:write with 403 Forbidden (ERR_INSUFFICIENT_PERMISSIONS)", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/gemstones")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        code: "GEM-RUB",
        name: "Burmese Ruby",
        gemstoneType: "PRECIOUS",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    expect(res.body.title).toBe("Forbidden");
  });

  // Scenario 5: Retrieval and Listing with Filters
  it("Scenario 5: retrieves gemstone by ID and filters by gemstoneType", async () => {
    // Also create a pearl (ORGANIC_PEARL)
    const pearlRes = await request(app)
      .post("/api/v1/taxonomy/gemstones")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "GEM-PRL",
        name: "Akoya Cultured Pearl",
        gemstoneType: "ORGANIC_PEARL",
        defaultMeasurementUnit: "PIECE",
      });
    expect(pearlRes.status).toBe(201);

    // Get diamond by ID
    const getRes = await request(app)
      .get(`/api/v1/taxonomy/gemstones/${diamondGemstoneId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(diamondGemstoneId);
    expect(getRes.body.data.code).toBe("GEM-DIA");

    // List all
    const listAllRes = await request(app)
      .get("/api/v1/taxonomy/gemstones")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(listAllRes.status).toBe(200);
    expect(listAllRes.body.data.length).toBeGreaterThanOrEqual(2);

    // Filter by ORGANIC_PEARL
    const filterRes = await request(app)
      .get("/api/v1/taxonomy/gemstones?gemstoneType=ORGANIC_PEARL")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(filterRes.status).toBe(200);
    expect(filterRes.body.data.length).toBe(1);
    expect(filterRes.body.data[0].code).toBe("GEM-PRL");
  });
});
