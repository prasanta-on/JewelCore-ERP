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
  getPurityRaw,
} from "@jewelcore/database";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Precious Metals & Purity API Endpoints (FEAT-TAX-02 / DEC-05)", () => {
  const app = createApp();

  let testOrgId: string;
  let managerToken: string;
  let salesToken: string;
  let goldMaterialId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "MAT_API_ORG",
      name: "Materials API Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Manager User (STORE_MANAGER role has taxonomy:write and taxonomy:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "mat_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Metal",
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
      email: "mat_sales@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Metal",
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
    await query("DELETE FROM materials WHERE organization_id = $1;", [testOrgId]);
    await query("DELETE FROM users WHERE email LIKE 'mat_%@jewelcore.local';");
    await query("DELETE FROM organizations WHERE code LIKE 'MAT_API_%';");
    await closePool();
  });

  // AC Scenario 1: Purity Decimal Integrity
  it("Scenario 1: creates Material Gold and Purity 18K with exact decimal scales NUMERIC(7, 4) and NUMERIC(5, 4)", async () => {
    // 1. Create Material 'AU' (Gold)
    const matRes = await request(app)
      .post("/api/v1/taxonomy/materials")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "AU",
        name: "Gold",
        baseMetalType: "AU",
        isPrecious: true,
      });

    expect(matRes.status).toBe(201);
    expect(matRes.body.data.id).toBeDefined();
    expect(matRes.body.data.code).toBe("AU");
    expect(matRes.body.data.isPrecious).toBe(true);
    goldMaterialId = matRes.body.data.id;

    // 2. Create Purity 18K with 75.0000% and 0.7500 ratio
    const purityRes = await request(app)
      .post(`/api/v1/taxonomy/materials/${goldMaterialId}/purities`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "18K",
        name: "18 Karat Yellow Gold",
        karatage: "18K",
        purityPercentage: 75.0,
        purityRatio: 0.75,
        hallmarkCode: "750",
      });

    expect(purityRes.status).toBe(201);
    expect(purityRes.body.data.id).toBeDefined();
    expect(purityRes.body.data.code).toBe("18K");
    expect(purityRes.body.data.purityPercentage).toBe(75.0);
    expect(purityRes.body.data.purityRatio).toBe(0.75);

    // 3. Verify DEC-05 storage precision at database level
    const rawPurity = await getPurityRaw(purityRes.body.data.id);
    expect(rawPurity).not.toBeNull();
    expect(rawPurity!.purity_percentage).toBe("75.0000");
    expect(rawPurity!.purity_ratio).toBe("0.7500");
  });

  // AC Scenario 2: Purity Exceeding 100% Rejection
  it("Scenario 2: rejects purity percentage exceeding 100.0000% with 400 Bad Request", async () => {
    const res = await request(app)
      .post(`/api/v1/taxonomy/materials/${goldMaterialId}/purities`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "105K",
        name: "Impossible Purity",
        purityPercentage: 105.0,
      });

    expect(res.status).toBe(400);
    expect(res.body.title).toBe("Validation Error");
    expect(res.body.code).toBe("ERR_VALIDATION");
  });

  // AC Scenario 3: Unauthorized Metal/Purity Registration Rejection
  it("Scenario 3: rejects user without taxonomy:write with 403 Forbidden (ERR_INSUFFICIENT_PERMISSIONS)", async () => {
    const matRes = await request(app)
      .post("/api/v1/taxonomy/materials")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        code: "PT",
        name: "Platinum",
        baseMetalType: "PT",
        isPrecious: true,
      });

    expect(matRes.status).toBe(403);
    expect(matRes.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");

    const purityRes = await request(app)
      .post(`/api/v1/taxonomy/materials/${goldMaterialId}/purities`)
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        code: "22K",
        name: "22 Karat Gold",
        purityPercentage: 91.6,
      });

    expect(purityRes.status).toBe(403);
    expect(purityRes.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  // Scenario 4: Duplicate Material Code Rejection
  it("Scenario 4: rejects duplicate material code within organization with 409 Conflict", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/materials")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "AU",
        name: "Duplicate Gold",
        baseMetalType: "AU",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_MATERIAL_CODE");
  });

  // Scenario 5: Duplicate Purity Code Rejection
  it("Scenario 5: rejects duplicate purity code under same material with 409 Conflict", async () => {
    const res = await request(app)
      .post(`/api/v1/taxonomy/materials/${goldMaterialId}/purities`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "18K",
        name: "Another 18K",
        purityPercentage: 75.0,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_PURITY_CODE");
  });

  // Scenario 6: Retrieval of Materials and Purities
  it("Scenario 6: lists materials and retrieves material with nested purities", async () => {
    // List materials
    const listRes = await request(app)
      .get("/api/v1/taxonomy/materials")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.some((m: any) => m.code === "AU")).toBe(true);

    // Get material with purities
    const getRes = await request(app)
      .get(`/api/v1/taxonomy/materials/${goldMaterialId}?includePurities=true`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(goldMaterialId);
    expect(Array.isArray(getRes.body.data.purities)).toBe(true);
    expect(getRes.body.data.purities.length).toBeGreaterThanOrEqual(1);
    expect(getRes.body.data.purities[0].code).toBe("18K");
  });
});
