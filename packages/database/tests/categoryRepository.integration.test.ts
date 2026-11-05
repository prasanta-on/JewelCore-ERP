import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getPool,
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createCategory,
  getCategoryById,
  getCategoryByCode,
  listCategoriesByOrg,
  createSubcategory,
  getSubcategoryById,
  getSubcategoryByCode,
  listSubcategoriesByCategory,
  getTaxonomyTree,
} from "../src/index.js";
import { ConflictError } from "@jewelcore/shared";

describe("Category & Subcategory Repository Integration Tests (FEAT-TAX-01)", () => {
  let testOrg1Id: string;
  let testOrg2Id: string;

  beforeAll(async () => {
    await runAllMigrations();

    const org1 = await createOrganization({
      code: "CAT_TEST_ORG_1",
      name: "Category Testing Enterprise 1",
    });
    testOrg1Id = org1.id;

    const org2 = await createOrganization({
      code: "CAT_TEST_ORG_2",
      name: "Category Testing Enterprise 2",
    });
    testOrg2Id = org2.id;
  });

  afterAll(async () => {
    await query("DELETE FROM categories WHERE code LIKE 'CAT_%';");
    await query("DELETE FROM organizations WHERE code LIKE 'CAT_TEST_%';");
    await closePool();
  });

  it("creates and retrieves categories and subcategories", async () => {
    // 1. Create root Category
    const category = await createCategory({
      organizationId: testOrg1Id,
      code: "CAT_RINGS",
      name: "Rings",
      description: "Fine jewellery rings collection",
    });

    expect(category.id).toBeDefined();
    expect(category.organizationId).toBe(testOrg1Id);
    expect(category.code).toBe("CAT_RINGS");
    expect(category.name).toBe("Rings");

    // 2. Create subcategory under Rings
    const subcat1 = await createSubcategory({
      categoryId: category.id,
      code: "SUBCAT_SOLITAIRE",
      name: "Solitaire Rings",
      description: "Single focal diamond/gemstone rings",
    });

    expect(subcat1.id).toBeDefined();
    expect(subcat1.categoryId).toBe(category.id);
    expect(subcat1.code).toBe("SUBCAT_SOLITAIRE");

    const subcat2 = await createSubcategory({
      categoryId: category.id,
      code: "SUBCAT_ETERNITY",
      name: "Eternity Bands",
      description: "Continuous line of gemstones",
    });

    expect(subcat2.id).toBeDefined();

    // 3. Retrieval assertions
    const fetchedCat = await getCategoryById(category.id);
    expect(fetchedCat).not.toBeNull();
    expect(fetchedCat?.code).toBe("CAT_RINGS");

    const fetchedByCode = await getCategoryByCode(testOrg1Id, "CAT_RINGS");
    expect(fetchedByCode?.id).toBe(category.id);

    const subcats = await listSubcategoriesByCategory(category.id);
    expect(subcats.length).toBe(2);
    expect(subcats.some((s) => s.code === "SUBCAT_SOLITAIRE")).toBe(true);
    expect(subcats.some((s) => s.code === "SUBCAT_ETERNITY")).toBe(true);
  });

  it("enforces unique category code within an organization (rejects duplicate with ConflictError)", async () => {
    await expect(
      createCategory({
        organizationId: testOrg1Id,
        code: "CAT_RINGS", // Duplicate in Org 1!
        name: "Duplicate Rings",
      }),
    ).rejects.toThrowError(ConflictError);

    try {
      await createCategory({
        organizationId: testOrg1Id,
        code: "CAT_RINGS",
        name: "Duplicate Rings",
      });
    } catch (err: any) {
      expect(err.code).toBe("ERR_DUPLICATE_CATEGORY_CODE");
    }

    // But same code in Org 2 should succeed!
    const org2Cat = await createCategory({
      organizationId: testOrg2Id,
      code: "CAT_RINGS",
      name: "Org 2 Rings",
    });
    expect(org2Cat.id).toBeDefined();
    expect(org2Cat.organizationId).toBe(testOrg2Id);
  });

  it("enforces unique subcategory code within a category (rejects duplicate with ConflictError)", async () => {
    const category = await getCategoryByCode(testOrg1Id, "CAT_RINGS");
    expect(category).not.toBeNull();

    await expect(
      createSubcategory({
        categoryId: category!.id,
        code: "SUBCAT_SOLITAIRE", // Duplicate in this category!
        name: "Another Solitaire",
      }),
    ).rejects.toThrowError(ConflictError);

    try {
      await createSubcategory({
        categoryId: category!.id,
        code: "SUBCAT_SOLITAIRE",
        name: "Another Solitaire",
      });
    } catch (err: any) {
      expect(err.code).toBe("ERR_DUPLICATE_SUBCATEGORY_CODE");
    }
  });

  it("retrieves the full recursive taxonomy tree with nested subcategories", async () => {
    // Add another category to Org 1
    const nckCategory = await createCategory({
      organizationId: testOrg1Id,
      code: "CAT_NECKLACES",
      name: "Necklaces",
    });

    await createSubcategory({
      categoryId: nckCategory.id,
      code: "SUBCAT_CHOKERS",
      name: "Chokers",
    });

    const tree = await getTaxonomyTree(testOrg1Id);
    expect(tree.length).toBeGreaterThanOrEqual(2);

    const ringsNode = tree.find((c) => c.code === "CAT_RINGS");
    expect(ringsNode).toBeDefined();
    expect(ringsNode?.subcategories.length).toBe(2);

    const nckNode = tree.find((c) => c.code === "CAT_NECKLACES");
    expect(nckNode).toBeDefined();
    expect(nckNode?.subcategories.length).toBe(1);
    expect(nckNode?.subcategories[0]?.code).toBe("SUBCAT_CHOKERS");
  });
});
