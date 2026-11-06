import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createCategory,
  createMaterial,
  createPurity,
  createGemstone,
  createProduct,
  createProductSku,
  getProductSkuById,
  getProductSkuByCode,
  listProductSkus,
  updateProductSku,
  createProductGemstoneSpec,
  listGemstoneSpecsBySku,
  getProductSkuWithSpecs,
} from "../src/index.js";
import { ConflictError, UnprocessableEntityError } from "@jewelcore/shared";

describe("SKU & Gemstone Specs Repository Integration Tests (FEAT-TAX-05)", () => {
  let testOrg1Id: string;
  let testOrg2Id: string;
  let categoryId: string;
  let materialId: string;
  let purityId: string;
  let gemstoneId: string;
  let productId: string;

  beforeAll(async () => {
    await runAllMigrations();

    const org1 = await createOrganization({
      code: "SKU_TEST_ORG_1",
      name: "SKU Test Enterprise 1",
    });
    testOrg1Id = org1.id;

    const org2 = await createOrganization({
      code: "SKU_TEST_ORG_2",
      name: "SKU Test Enterprise 2",
    });
    testOrg2Id = org2.id;

    const category = await createCategory({
      organizationId: testOrg1Id,
      code: "CAT_SKU_RINGS",
      name: "SKU Rings",
    });
    categoryId = category.id;

    const material = await createMaterial({
      organizationId: testOrg1Id,
      code: "AU_SKU",
      name: "Gold SKU",
      baseMetalType: "AU",
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "18K_SKU",
      name: "18K Gold SKU",
      purityPercentage: 75.0,
      purityRatio: 0.75,
    });
    purityId = purity.id;

    const gemstone = await createGemstone({
      organizationId: testOrg1Id,
      code: "DIA_SKU",
      name: "Diamond SKU",
      gemstoneType: "PRECIOUS",
      mohsHardness: 10.0,
      refractiveIndex: 2.417,
      specificGravity: 3.52,
    });
    gemstoneId = gemstone.id;

    const product = await createProduct({
      organizationId: testOrg1Id,
      categoryId,
      materialId,
      defaultPurityId: purityId,
      productCode: "STYLE-SOL-101",
      name: "Solitaire 101",
      defaultTrackingType: "SERIALIZED",
    });
    productId = product.id;
  });

  afterAll(async () => {
    await query("DELETE FROM product_gemstone_specs;");
    await query("DELETE FROM product_skus WHERE organization_id IN ($1, $2);", [testOrg1Id, testOrg2Id]);
    await query("DELETE FROM products WHERE organization_id IN ($1, $2);", [testOrg1Id, testOrg2Id]);
    await query("DELETE FROM gemstones WHERE organization_id IN ($1, $2);", [testOrg1Id, testOrg2Id]);
    await query("DELETE FROM organizations WHERE code LIKE 'SKU_TEST_%';");
    await closePool();
  });

  it("creates and retrieves a commercial SKU inheriting tracking type from product style", async () => {
    const sku = await createProductSku({
      organizationId: testOrg1Id,
      productId,
      skuCode: "SKU-SOL-18K-050",
      variantName: "Solitaire 18K Yellow Gold 0.50ct Size 6",
      targetPurityId: purityId,
      targetGrossWeightGrams: 4.85,
      targetMetalWeightGrams: 4.75,
      attributesJson: { ringSize: 6, finish: "High Polish" },
    });

    expect(sku.id).toBeDefined();
    expect(sku.organizationId).toBe(testOrg1Id);
    expect(sku.productId).toBe(productId);
    expect(sku.skuCode).toBe("SKU-SOL-18K-050");
    expect(sku.variantName).toBe("Solitaire 18K Yellow Gold 0.50ct Size 6");
    expect(sku.targetGrossWeightGrams).toBe(4.85);
    expect(sku.targetMetalWeightGrams).toBe(4.75);
    expect(sku.trackingType).toBe("SERIALIZED"); // Inherited from parent product
    expect(sku.attributesJson).toEqual({ ringSize: 6, finish: "High Polish" });
    expect(sku.isActive).toBe(true);

    // Retrieve by ID
    const byId = await getProductSkuById(sku.id);
    expect(byId).not.toBeNull();
    expect(byId!.skuCode).toBe("SKU-SOL-18K-050");

    // Retrieve by Code
    const byCode = await getProductSkuByCode(testOrg1Id, "SKU-SOL-18K-050");
    expect(byCode).not.toBeNull();
    expect(byCode!.id).toBe(sku.id);
  });

  it("enforces INV-06: tracking_type immutability on SKU updates", async () => {
    const sku = await createProductSku({
      organizationId: testOrg1Id,
      productId,
      skuCode: "SKU-SOL-IMMUT-01",
      variantName: "Immutability Test SKU",
      targetPurityId: purityId,
      targetGrossWeightGrams: 5.0,
      targetMetalWeightGrams: 5.0,
      trackingType: "SERIALIZED",
    });

    // Attempting to change tracking_type to QUANTITY_BATCH must abort with 422 ERR_TRACKING_TYPE_IMMUTABLE
    await expect(
      updateProductSku(sku.id, {
        trackingType: "QUANTITY_BATCH",
      }),
    ).rejects.toThrow(UnprocessableEntityError);

    try {
      await updateProductSku(sku.id, {
        trackingType: "QUANTITY_BATCH",
      });
    } catch (err: any) {
      expect(err.code).toBe("ERR_TRACKING_TYPE_IMMUTABLE");
    }

    // Updating other fields is allowed
    const updated = await updateProductSku(sku.id, {
      variantName: "Updated Immutability Test SKU",
      targetGrossWeightGrams: 5.5,
      targetMetalWeightGrams: 5.2,
    });

    expect(updated.variantName).toBe("Updated Immutability Test SKU");
    expect(updated.targetGrossWeightGrams).toBe(5.5);
    expect(updated.targetMetalWeightGrams).toBe(5.2);
    expect(updated.trackingType).toBe("SERIALIZED"); // Unchanged
  });

  it("rejects gross weight less than net metal weight", async () => {
    await expect(
      createProductSku({
        organizationId: testOrg1Id,
        productId,
        skuCode: "SKU-SOL-INVALID-WEIGHT",
        variantName: "Invalid Weight SKU",
        targetPurityId: purityId,
        targetGrossWeightGrams: 3.0,
        targetMetalWeightGrams: 4.0, // gross < metal!
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("enforces candidate business key (organization_id, sku_code) uniqueness", async () => {
    // Duplicate in Org 1 rejected
    await expect(
      createProductSku({
        organizationId: testOrg1Id,
        productId,
        skuCode: "SKU-SOL-18K-050",
        variantName: "Duplicate Code SKU",
        targetPurityId: purityId,
        targetGrossWeightGrams: 5.0,
        targetMetalWeightGrams: 5.0,
      }),
    ).rejects.toThrow(ConflictError);

    // Create prerequisite category, material, purity, product in Org 2
    const org2Cat = await createCategory({
      organizationId: testOrg2Id,
      code: "ORG2_CAT",
      name: "Org 2 Category",
    });
    const org2Mat = await createMaterial({
      organizationId: testOrg2Id,
      code: "ORG2_AU_SKU",
      name: "Org 2 Material",
      baseMetalType: "AU",
    });
    const org2Pur = await createPurity({
      materialId: org2Mat.id,
      code: "ORG2_18K_SKU",
      name: "Org 2 Purity",
      purityPercentage: 75.0,
    });
    const org2Prod = await createProduct({
      organizationId: testOrg2Id,
      categoryId: org2Cat.id,
      materialId: org2Mat.id,
      defaultPurityId: org2Pur.id,
      productCode: "ORG2_PROD",
      name: "Org 2 Product",
    });

    // Same skuCode in Org 2 is allowed
    const org2Sku = await createProductSku({
      organizationId: testOrg2Id,
      productId: org2Prod.id,
      skuCode: "SKU-SOL-18K-050",
      variantName: "Org 2 Solitaire SKU",
      targetPurityId: org2Pur.id,
      targetGrossWeightGrams: 5.0,
      targetMetalWeightGrams: 5.0,
    });

    expect(org2Sku.id).toBeDefined();
    expect(org2Sku.organizationId).toBe(testOrg2Id);
  });

  it("creates gemstone specifications and retrieves SKU with specs", async () => {
    const sku = await createProductSku({
      organizationId: testOrg1Id,
      productId,
      skuCode: "SKU-SOL-GEM-001",
      variantName: "Solitaire with Accent Stones",
      targetPurityId: purityId,
      targetGrossWeightGrams: 4.5,
      targetMetalWeightGrams: 4.2,
    });

    // Add primary center diamond spec
    const centerSpec = await createProductGemstoneSpec({
      productSkuId: sku.id,
      gemstoneId,
      expectedStoneCount: 1,
      targetTotalCaratWeight: 0.5,
      shape: "Round Brilliant",
      cutGrade: "Excellent",
      colorGrade: "F",
      clarityGrade: "VS1",
      settingType: "4-Prong",
      isPrimary: true,
    });

    expect(centerSpec.id).toBeDefined();
    expect(centerSpec.productSkuId).toBe(sku.id);
    expect(centerSpec.expectedStoneCount).toBe(1);
    expect(centerSpec.targetTotalCaratWeight).toBe(0.5);
    expect(centerSpec.isPrimary).toBe(true);

    // Add side stones spec
    const sideSpec = await createProductGemstoneSpec({
      productSkuId: sku.id,
      gemstoneId,
      expectedStoneCount: 12,
      targetTotalCaratWeight: 0.24,
      shape: "Pave Round",
      settingType: "Micro-Pave",
      isPrimary: false,
    });

    expect(sideSpec.id).toBeDefined();
    expect(sideSpec.expectedStoneCount).toBe(12);
    expect(sideSpec.targetTotalCaratWeight).toBe(0.24);

    // List specs
    const specs = await listGemstoneSpecsBySku(sku.id);
    expect(specs.length).toBe(2);
    // Primary first
    expect(specs[0].isPrimary).toBe(true);
    expect(specs[0].shape).toBe("Round Brilliant");

    // Get SKU with specs
    const skuWithSpecs = await getProductSkuWithSpecs(sku.id);
    expect(skuWithSpecs).not.toBeNull();
    expect(skuWithSpecs!.gemstoneSpecs.length).toBe(2);

    // Reject duplicate gemstone spec for same stone and shape
    await expect(
      createProductGemstoneSpec({
        productSkuId: sku.id,
        gemstoneId,
        expectedStoneCount: 1,
        targetTotalCaratWeight: 0.5,
        shape: "Round Brilliant",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("lists SKUs filtered by organizationId and productId", async () => {
    const list = await listProductSkus({
      organizationId: testOrg1Id,
      productId,
    });
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((s) => s.productId === productId)).toBe(true);
  });
});
