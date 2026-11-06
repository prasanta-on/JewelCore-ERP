import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getPool,
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createCategory,
  createMaterial,
  createPurity,
  createProduct,
  getProductById,
  getProductByCode,
  listProducts,
} from "../src/index.js";
import { ConflictError, UnprocessableEntityError } from "@jewelcore/shared";

describe("Products Repository Integration Tests (FEAT-TAX-04)", () => {
  let testOrg1Id: string;
  let testOrg2Id: string;
  let categoryId: string;
  let materialId: string;
  let purityId: string;

  beforeAll(async () => {
    await runAllMigrations();

    const org1 = await createOrganization({
      code: "PRD_TEST_ORG_1",
      name: "Product Design Enterprise 1",
    });
    testOrg1Id = org1.id;

    const org2 = await createOrganization({
      code: "PRD_TEST_ORG_2",
      name: "Product Design Enterprise 2",
    });
    testOrg2Id = org2.id;

    const category = await createCategory({
      organizationId: testOrg1Id,
      code: "CAT_RINGS_PRD",
      name: "Rings",
    });
    categoryId = category.id;

    const material = await createMaterial({
      organizationId: testOrg1Id,
      code: "AU_PRD",
      name: "Yellow Gold",
      baseMetalType: "AU",
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "18K_PRD",
      name: "18 Karat Yellow Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
    });
    purityId = purity.id;
  });

  afterAll(async () => {
    await query("DELETE FROM products WHERE organization_id IN ($1, $2);", [testOrg1Id, testOrg2Id]);
    await query("DELETE FROM organizations WHERE code LIKE 'PRD_TEST_%';");
    await closePool();
  });

  it("creates and retrieves a product master style linked to category, material, and purity", async () => {
    const product = await createProduct({
      organizationId: testOrg1Id,
      categoryId,
      materialId,
      defaultPurityId: purityId,
      productCode: "PROD-SOL-001",
      name: "Classic Solitaire",
      description: "Timeless 4-prong solitaire engagement ring",
      gender: "UNISEX",
      collection: "2026 Bridal",
      defaultTrackingType: "SERIALIZED",
    });

    expect(product.id).toBeDefined();
    expect(product.organizationId).toBe(testOrg1Id);
    expect(product.categoryId).toBe(categoryId);
    expect(product.materialId).toBe(materialId);
    expect(product.defaultPurityId).toBe(purityId);
    expect(product.productCode).toBe("PROD-SOL-001");
    expect(product.name).toBe("Classic Solitaire");
    expect(product.gender).toBe("UNISEX");
    expect(product.collection).toBe("2026 Bridal");
    expect(product.defaultTrackingType).toBe("SERIALIZED");
    expect(product.isActive).toBe(true);

    // Retrieve by ID
    const byId = await getProductById(product.id);
    expect(byId).not.toBeNull();
    expect(byId!.productCode).toBe("PROD-SOL-001");

    // Retrieve by Code
    const byCode = await getProductByCode(testOrg1Id, "PROD-SOL-001");
    expect(byCode).not.toBeNull();
    expect(byCode!.id).toBe(product.id);
  });

  it("enforces candidate business key (organization_id, product_code) isolation", async () => {
    // Duplicate in Org 1 rejected
    await expect(
      createProduct({
        organizationId: testOrg1Id,
        categoryId,
        materialId,
        defaultPurityId: purityId,
        productCode: "PROD-SOL-001",
        name: "Duplicate Solitaire",
      }),
    ).rejects.toThrow(ConflictError);

    // Create prerequisite category and material for Org 2
    const org2Cat = await createCategory({
      organizationId: testOrg2Id,
      code: "ORG2_RINGS",
      name: "Org 2 Rings",
    });
    const org2Mat = await createMaterial({
      organizationId: testOrg2Id,
      code: "ORG2_AU",
      name: "Org 2 Gold",
      baseMetalType: "AU",
    });
    const org2Pur = await createPurity({
      materialId: org2Mat.id,
      code: "ORG2_18K",
      name: "Org 2 18K",
      purityPercentage: 75.0,
    });

    // Org 2 can use identical product_code
    const org2Product = await createProduct({
      organizationId: testOrg2Id,
      categoryId: org2Cat.id,
      materialId: org2Mat.id,
      defaultPurityId: org2Pur.id,
      productCode: "PROD-SOL-001",
      name: "Org 2 Solitaire",
    });

    expect(org2Product.id).toBeDefined();
    expect(org2Product.organizationId).toBe(testOrg2Id);
  });

  it("rejects non-existent category reference with ERR_CATEGORY_NOT_FOUND (422)", async () => {
    const nonExistentCategoryId = "0192e301-7000-7000-8000-000000000099";

    await expect(
      createProduct({
        organizationId: testOrg1Id,
        categoryId: nonExistentCategoryId,
        materialId,
        defaultPurityId: purityId,
        productCode: "PROD-INVALID-CAT",
        name: "Invalid Category Product",
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("rejects non-existent material reference with ERR_MATERIAL_NOT_FOUND (422)", async () => {
    const nonExistentMaterialId = "0192e301-7000-7000-8000-000000000099";

    await expect(
      createProduct({
        organizationId: testOrg1Id,
        categoryId,
        materialId: nonExistentMaterialId,
        defaultPurityId: purityId,
        productCode: "PROD-INVALID-MAT",
        name: "Invalid Material Product",
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("lists products and filters by categoryId", async () => {
    const list = await listProducts({ organizationId: testOrg1Id });
    expect(list.length).toBeGreaterThanOrEqual(1);

    const filtered = await listProducts({
      organizationId: testOrg1Id,
      categoryId,
    });
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.every((p) => p.categoryId === categoryId)).toBe(true);
  });
});
