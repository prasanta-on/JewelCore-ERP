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
  createCategory,
  createMaterial,
  createPurity,
  createGemstone,
  createProduct,
} from "@jewelcore/database";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Commercial SKUs & Gemstone Specs API Endpoints (FEAT-TAX-05)", () => {
  const app = createApp();

  let testOrgId: string;
  let managerToken: string;
  let qcToken: string;
  let testCategoryId: string;
  let testMaterialId: string;
  let testPurityId: string;
  let testGemstoneId: string;
  let testProductId: string;
  let createdSkuId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "SKU_API_ORG",
      name: "SKU API Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Manager User (STORE_MANAGER role has taxonomy:write and taxonomy:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "sku_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "SKU",
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

    // 3. QC Technician User (QC_TECHNICIAN role lacks taxonomy:write)
    const qcUser = await createUser({
      organizationId: testOrgId,
      email: "sku_qc@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "QC",
      lastName: "Technician",
      isActive: true,
    });

    const qcRole = await getRoleByCode("QC_TECHNICIAN");
    if (qcRole) {
      await assignRoleToUser(qcUser.id, qcRole.id);
    }

    qcToken = await signAccessToken({
      userId: qcUser.id,
      orgId: testOrgId,
      email: qcUser.email,
    });

    // 4. Prerequisite Taxonomy Master Data
    const category = await createCategory({
      organizationId: testOrgId,
      code: "API_SKU_CAT",
      name: "Rings",
    });
    testCategoryId = category.id;

    const material = await createMaterial({
      organizationId: testOrgId,
      code: "API_SKU_AU",
      name: "Yellow Gold",
      baseMetalType: "AU",
    });
    testMaterialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "API_SKU_18K",
      name: "18 Karat Yellow Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
    });
    testPurityId = purity.id;

    const gemstone = await createGemstone({
      organizationId: testOrgId,
      code: "API_SKU_DIA",
      name: "Natural Diamond",
      gemstoneType: "PRECIOUS",
      mohsHardness: 10.0,
      refractiveIndex: 2.417,
      specificGravity: 3.52,
    });
    testGemstoneId = gemstone.id;

    const product = await createProduct({
      organizationId: testOrgId,
      categoryId: testCategoryId,
      materialId: testMaterialId,
      defaultPurityId: testPurityId,
      productCode: "STYLE-SOL-2026",
      name: "Solitaire 2026",
      defaultTrackingType: "SERIALIZED",
    });
    testProductId = product.id;
  });

  afterAll(async () => {
    await query("DELETE FROM product_gemstone_specs;");
    await query("DELETE FROM product_skus WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM products WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM gemstones WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM materials WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM categories WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM users WHERE email LIKE 'sku_%@jewelcore.local';");
    await query("DELETE FROM organizations WHERE code LIKE 'SKU_API_%';");
    await closePool();
  });

  // AC Scenario 1: Commercial SKU Creation inheriting tracking type
  it("Scenario 1: creates commercial SKU linked to product style, inheriting SERIALIZED tracking type", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/skus")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        productId: testProductId,
        skuCode: "SKU-SOL-18K-075-SZ7",
        variantName: "18K Gold Solitaire Ring 0.75ct Size 7",
        targetPurityId: testPurityId,
        targetGrossWeightGrams: 5.25,
        targetMetalWeightGrams: 5.1,
        attributesJson: { ringSize: 7, metalColor: "Yellow" },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.skuCode).toBe("SKU-SOL-18K-075-SZ7");
    expect(res.body.data.variantName).toBe(
      "18K Gold Solitaire Ring 0.75ct Size 7",
    );
    expect(res.body.data.targetGrossWeightGrams).toBe(5.25);
    expect(res.body.data.targetMetalWeightGrams).toBe(5.1);
    expect(res.body.data.trackingType).toBe("SERIALIZED");
    expect(res.body.data.attributesJson).toEqual({
      ringSize: 7,
      metalColor: "Yellow",
    });
    createdSkuId = res.body.data.id;
  });

  // AC Scenario 2: Tracking Type Immutability (INV-06)
  it("Scenario 2: rejects update mutating tracking_type with 422 Unprocessable Entity (ERR_TRACKING_TYPE_IMMUTABLE)", async () => {
    const res = await request(app)
      .patch(`/api/v1/taxonomy/skus/${createdSkuId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        trackingType: "QUANTITY_BATCH",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_TRACKING_TYPE_IMMUTABLE");
    expect(res.body.title).toBe("Unprocessable Entity");
  });

  // AC Scenario 3: Candidate Business Key Uniqueness (organization_id, sku_code)
  it("Scenario 3: rejects duplicate SKU code within organization with 409 Conflict (ERR_DUPLICATE_SKU_CODE)", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/skus")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        productId: testProductId,
        skuCode: "SKU-SOL-18K-075-SZ7",
        variantName: "Duplicate Variant",
        targetPurityId: testPurityId,
        targetGrossWeightGrams: 5.0,
        targetMetalWeightGrams: 4.8,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_SKU_CODE");
    expect(res.body.title).toBe("Conflict");
  });

  // AC Scenario 4: Unauthorized SKU Creation Rejection
  it("Scenario 4: rejects SKU creation for user without taxonomy:write with 403 Forbidden (ERR_INSUFFICIENT_PERMISSIONS)", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/skus")
      .set("Authorization", `Bearer ${qcToken}`)
      .send({
        productId: testProductId,
        skuCode: "SKU-UNAUTH",
        variantName: "Unauthorized SKU",
        targetPurityId: testPurityId,
        targetGrossWeightGrams: 5.0,
        targetMetalWeightGrams: 4.8,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    expect(res.body.title).toBe("Forbidden");
  });

  // AC Scenario 5: Gross weight < metal weight rejection
  it("Scenario 5: rejects gross weight < metal weight with validation error (400)", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/skus")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        productId: testProductId,
        skuCode: "SKU-INVALID-WT",
        variantName: "Invalid Weights SKU",
        targetPurityId: testPurityId,
        targetGrossWeightGrams: 4.0,
        targetMetalWeightGrams: 5.0,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_VALIDATION");
  });

  // AC Scenario 6: Adding Gemstone Specification to SKU
  it("Scenario 6: registers gemstone specifications for SKU and rejects duplicate stone/shape", async () => {
    // Add primary diamond spec
    const res = await request(app)
      .post(`/api/v1/taxonomy/skus/${createdSkuId}/gemstone-specs`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        gemstoneId: testGemstoneId,
        expectedStoneCount: 1,
        targetTotalCaratWeight: 0.75,
        shape: "Round Brilliant",
        cutGrade: "Ideal",
        colorGrade: "E",
        clarityGrade: "VVS1",
        settingType: "6-Prong",
        isPrimary: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.productSkuId).toBe(createdSkuId);
    expect(res.body.data.expectedStoneCount).toBe(1);
    expect(res.body.data.targetTotalCaratWeight).toBe(0.75);
    expect(res.body.data.isPrimary).toBe(true);

    // Duplicate gemstone spec with same shape on same SKU rejected
    const dupRes = await request(app)
      .post(`/api/v1/taxonomy/skus/${createdSkuId}/gemstone-specs`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        gemstoneId: testGemstoneId,
        expectedStoneCount: 1,
        targetTotalCaratWeight: 0.75,
        shape: "Round Brilliant",
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.code).toBe("ERR_DUPLICATE_GEMSTONE_SPEC");
  });

  // AC Scenario 7: Retrieval of SKU with Gemstone Specs
  it("Scenario 7: retrieves SKU with included gemstone specs array", async () => {
    const res = await request(app)
      .get(`/api/v1/taxonomy/skus/${createdSkuId}?includeSpecs=true`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdSkuId);
    expect(res.body.data.gemstoneSpecs).toBeDefined();
    expect(Array.isArray(res.body.data.gemstoneSpecs)).toBe(true);
    expect(res.body.data.gemstoneSpecs.length).toBe(1);
    expect(res.body.data.gemstoneSpecs[0].shape).toBe("Round Brilliant");
  });

  // AC Scenario 8: Listing SKUs with filters
  it("Scenario 8: lists SKUs filtered by productId", async () => {
    const res = await request(app)
      .get(`/api/v1/taxonomy/skus?productId=${testProductId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((s: any) => s.id === createdSkuId)).toBe(true);
  });
});
