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

describe("Master Data Taxonomy API Endpoints (FEAT-TAX-01)", () => {
  const app = createApp();

  let testOrgId: string;
  let managerToken: string;
  let salesToken: string;
  let createdCategoryId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "TAX_API_ORG",
      name: "Taxonomy Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Manager User (STORE_MANAGER role has taxonomy:write and taxonomy:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "tax_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Taxonomy",
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

    // 3. Sales Associate User (SALES_ASSOCIATE role lacks taxonomy:write)
    const sales = await createUser({
      organizationId: testOrgId,
      email: "tax_sales@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Taxonomy",
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
    await query("DELETE FROM categories WHERE code LIKE 'API_CAT_%';");
    await query("DELETE FROM users WHERE email LIKE 'tax_%@jewelcore.local';");
    await query("DELETE FROM organizations WHERE code LIKE 'TAX_API_%';");
    await closePool();
  });

  // AC Scenario 1: Recursive Category Tree Creation
  it("Scenario 1: Manager creates root Category and nested Subcategory", async () => {
    // 1. Create root Category
    const catRes = await request(app)
      .post("/api/v1/taxonomy/categories")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "API_CAT_RINGS",
        name: "Rings",
        description: "Fine jewellery finger rings",
      });

    expect(catRes.status).toBe(201);
    expect(catRes.body.data.id).toBeDefined();
    expect(catRes.body.data.code).toBe("API_CAT_RINGS");
    expect(catRes.body.data.organizationId).toBe(testOrgId);
    createdCategoryId = catRes.body.data.id;

    // 2. Create nested Subcategory
    const subcatRes = await request(app)
      .post("/api/v1/taxonomy/subcategories")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        categoryId: createdCategoryId,
        code: "API_SUBCAT_SOLITAIRE",
        name: "Solitaire Engagement Rings",
        description: "Classic four/six prong solitaires",
      });

    expect(subcatRes.status).toBe(201);
    expect(subcatRes.body.data.id).toBeDefined();
    expect(subcatRes.body.data.categoryId).toBe(createdCategoryId);
    expect(subcatRes.body.data.code).toBe("API_SUBCAT_SOLITAIRE");
  });

  // AC Scenario 2: Duplicate Category Code Rejection
  it("Scenario 2: rejects duplicate category code within the organization with 409 ERR_DUPLICATE_CATEGORY_CODE", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/categories")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        code: "API_CAT_RINGS", // Already created above!
        name: "Duplicate Rings Category",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_CATEGORY_CODE");
    expect(res.body.title).toBe("Conflict");
  });

  it("rejects duplicate subcategory code within the same category with 409 ERR_DUPLICATE_SUBCATEGORY_CODE", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/subcategories")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        categoryId: createdCategoryId,
        code: "API_SUBCAT_SOLITAIRE", // Already created above!
        name: "Duplicate Solitaire",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_SUBCATEGORY_CODE");
  });

  // AC Scenario 3: Unauthorized Category Creation Rejection
  it("Scenario 3: rejects user without taxonomy:write with 403 ERR_INSUFFICIENT_PERMISSIONS", async () => {
    const res = await request(app)
      .post("/api/v1/taxonomy/categories")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        code: "API_CAT_UNAUTH",
        name: "Unauthorized Category",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    expect(res.body.title).toBe("Forbidden");
  });

  // Retrieval & Full Tree
  it("Scenario 4: retrieves the complete recursive taxonomy tree", async () => {
    const res = await request(app)
      .get("/api/v1/taxonomy/tree")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const ringsCat = res.body.data.find((c: any) => c.id === createdCategoryId);
    expect(ringsCat).toBeDefined();
    expect(ringsCat.code).toBe("API_CAT_RINGS");
    expect(ringsCat.subcategories.length).toBeGreaterThan(0);
    expect(ringsCat.subcategories[0].code).toBe("API_SUBCAT_SOLITAIRE");
  });
});
