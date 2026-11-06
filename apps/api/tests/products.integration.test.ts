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
} from "@jewelcore/database";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Product Master Styles API Endpoints (FEAT-TAX-04)", () => {
  const app = createApp();

  let testOrgId: string;
  let managerToken: string;
  let qcToken: string;
  let testCategoryId: string;
  let testMaterialId: string;
  let testPurityId: string;
  let createdProductId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "PROD_API_ORG",
      name: "Product API Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Manager User (STORE_MANAGER role has taxonomy:write and taxonomy:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "prod_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Product",
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
      email: "prod_qc@jewelcore.local",
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
      code: "API_CAT_RINGS",
      name: "Rings",
    });
    testCategoryId = category.id;

    const material = await createMaterial({
      organizationId: testOrgId,
      code: "API_AU",
      name: "Yellow Gold",
      baseMetalType: "AU",
    });
    testMaterialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "API_18K",
      name: "18 Karat Yellow Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
    });
    testPurityId = purity.id;
  });

  afterAll(async () => {
    await query("DELETE FROM products WHERE organization_id = $1;", [testOrgId]);
    await query("DELETE FROM materials WHERE organization_id = $1;", [testOrgId]);
    await query("DELETE FROM categories WHERE organization_id = $1;", [testOrgId]);
    await query("DELETE FROM users WHERE email LIKE 'prod_%@jewelcore.local';");
    await query("DELETE FROM organizations WHERE code LIKE 'PROD_API_%';");
    await closePool();
  });

  // AC Scenario 1: Product Style Creation Linked to Category
  it("Scenario 1: creates product style Classic Solitaire linked to category, material, and purity", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/products")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        categoryId: testCategoryId,
        materialId: testMaterialId,
        defaultPurityId: testPurityId,
        code: "PROD-SOL-001",
        name: "Classic Solitaire",
        gender: "UNISEX",
        collection: "2026 Bridal",
        defaultTrackingType: "SERIALIZED",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.productCode).toBe("PROD-SOL-001");
    expect(res.body.data.name).toBe("Classic Solitaire");
    expect(res.body.data.categoryId).toBe(testCategoryId);
    expect(res.body.data.gender).toBe("UNISEX");
    expect(res.body.data.collection).toBe("2026 Bridal");
    expect(res.body.data.defaultTrackingType).toBe("SERIALIZED");
    createdProductId = res.body.data.id;
  });

  // AC Scenario 2: Non-Existent Category Reference Rejection
  it("Scenario 2: rejects non-existent category reference with 422 Unprocessable Entity (ERR_CATEGORY_NOT_FOUND)", async () => {
    const nonExistentId = "0192e301-7000-7000-8000-000000000099";

    const res = await request(app)
      .post("/api/v1/taxonomy/products")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        categoryId: nonExistentId,
        materialId: testMaterialId,
        defaultPurityId: testPurityId,
        code: "PROD-INV-CAT",
        name: "Invalid Category Product",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_CATEGORY_NOT_FOUND");
    expect(res.body.title).toBe("Unprocessable Entity");
  });

  // AC Scenario 3: Duplicate Product Code Rejection
  it("Scenario 3: rejects duplicate product code within organization with 409 Conflict (ERR_DUPLICATE_PRODUCT_CODE)", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/products")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        categoryId: testCategoryId,
        materialId: testMaterialId,
        defaultPurityId: testPurityId,
        code: "PROD-SOL-001",
        name: "Duplicate Solitaire Ring",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_PRODUCT_CODE");
    expect(res.body.title).toBe("Conflict");
  });

  // AC Scenario 4: Unauthorized Product Style Creation Rejection
  it("Scenario 4: rejects user without taxonomy:write with 403 Forbidden (ERR_INSUFFICIENT_PERMISSIONS)", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/products")
      .set("Authorization", `Bearer ${qcToken}`)
      .send({
        categoryId: testCategoryId,
        materialId: testMaterialId,
        defaultPurityId: testPurityId,
        code: "PROD-UNAUTH",
        name: "Unauthorized Ring",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    expect(res.body.title).toBe("Forbidden");
  });

  // Scenario 5: Retrieval and Listing with Filters
  it("Scenario 5: retrieves product by ID and lists products filtered by categoryId", async () => {
    // Get by ID
    const getRes = await request(app)
      .get(`/api/v1/taxonomy/products/${createdProductId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(createdProductId);
    expect(getRes.body.data.productCode).toBe("PROD-SOL-001");

    // List with category filter
    const listRes = await request(app)
      .get(`/api/v1/taxonomy/products?categoryId=${testCategoryId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.data.some((p: any) => p.id === createdProductId)).toBe(true);
  });
});
