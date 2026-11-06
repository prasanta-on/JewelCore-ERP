import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  createCategory,
  createMaterial,
  createPurity,
  createProduct,
  createProductSku,
  createGemstone,
  createSupplier,
  createGrn,
  createShipment,
  addShipmentItem,
  createQualityCheck,
  createQualityCheckItem,
  getQualityCheckItemById,
  addItemGemstone,
  listItemGemstonesByQcItemId,
  updateQualityCheck,
} from "../src/index.js";
import {
  StoreType,
  GemstoneType,
  StoneType,
  QualityCheckStatus,
} from "@jewelcore/shared";

describe("Mounted Gemstone Carat Parcel Grading Repository (FEAT-QC-03 / DEC-05)", () => {
  let orgId: string;
  let storeId: string;
  let userId: string;
  let gemstoneId: string;
  let materialId: string;
  let purityId: string;
  let shipmentId: string;
  let shipmentItemId: string;
  let qcId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale fixtures with GEM_REPO prefix
    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-GEM-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_GEM_REPO_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-GEM-REPO-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_GEM_REPO_%';",
    );
    await query("DELETE FROM gemstones WHERE code LIKE 'GEM_REPO_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_GEM_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_GEM_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_GEM_REPO_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'gem_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_GEM_REPO_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_GEM_REPO';");

    // 1. Organization & Store
    const org = await createOrganization({
      code: "ORG_GEM_REPO",
      name: "Gem Grading Repository Test Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_GEM_REPO_001",
      name: "Gem Grading Test Vault",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    // 2. User
    const user = await createUser({
      organizationId: orgId,
      email: "gem_repo_grader@jewelcore.local",
      firstName: "Gem",
      lastName: "Grader",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    userId = user.id;

    // 3. Taxonomy: Gemstone, Material, Purity, Category, Product, SKU
    const gemstone = await createGemstone({
      organizationId: orgId,
      code: "GEM_REPO_DIAMOND",
      name: "Natural Diamond",
      gemstoneType: GemstoneType.PRECIOUS,
      defaultMeasurementUnit: "CARAT",
      isActive: true,
    });
    gemstoneId = gemstone.id;

    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_GEM_REPO_RINGS",
      name: "Diamond Solitaire Rings",
      targetGender: "UNISEX",
      isActive: true,
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_GEM_REPO_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
      isActive: true,
    });
    materialId = material.id;

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_GEM_REPO_18K",
      name: "18 Karat",
      karatage: "18K",
      purityPercentage: 75.0,
      isActive: true,
    });
    purityId = purity.id;

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      materialId: material.id,
      defaultPurityId: purity.id,
      productCode: "PRD_GEM_REPO_SOLITAIRE",
      name: "Solitaire Diamond Engagement Ring",
      isActive: true,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-GEM-REPO-001",
      variantName: "Solitaire Ring 18K Yellow Gold 1.50ct",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 10.5,
      targetMetalWeightGrams: 10.0,
      isActive: true,
    });

    // 4. Procurement: Supplier, GRN, Shipment, ShipmentItem
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_GEM_REPO_001",
      name: "Antwerp Diamond Importers",
      isActive: true,
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId: storeId,
      supplierId: supplier.id,
      createdByUserId: userId,
      grnNumber: "GRN-GEM-REPO-001",
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-GEM-REPO-001",
      carrierName: "Brinks Armored",
      trackingNumber: "BRINKS-GEM-001",
      status: "RECEIVED",
      receivedByUserId: userId,
    });
    shipmentId = shipment.id;

    const item = await addShipmentItem(shipment.id, {
      productSkuId: sku.id,
      lineNumber: 1,
      supplierItemCode: "ANT-101",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.5,
    });
    shipmentItemId = item.id;

    // 5. Quality Check Session
    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId: storeId,
      inspectorUserId: userId,
    });
    qcId = qc.id;
  });

  afterAll(async () => {
    try {
      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-REPO-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-GEM-REPO-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_GEM_REPO_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-GEM-REPO-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_GEM_REPO_%';",
      );
      await query("DELETE FROM gemstones WHERE code LIKE 'GEM_REPO_%';");
      await query("DELETE FROM purities WHERE code LIKE 'PUR_GEM_REPO_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_GEM_REPO_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_GEM_REPO_%';");
      await query(
        "DELETE FROM users WHERE email LIKE 'gem_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_GEM_REPO_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_GEM_REPO';");
    } finally {
      await closePool();
    }
  });

  it("creates a draft quality check item with tare and gross weight", async () => {
    const qcItem = await createQualityCheckItem({
      qualityCheckId: qcId,
      shipmentItemId,
      grossWeightGrams: 10.5,
      tareWeightGrams: 0.5,
      verifiedMaterialId: materialId,
      verifiedPurityId: purityId,
    });

    expect(qcItem.id).toBeDefined();
    expect(qcItem.qualityCheckId).toBe(qcId);
    expect(qcItem.shipmentItemId).toBe(shipmentItemId);
    expect(qcItem.itemSequenceNumber).toBe(1);
    expect(qcItem.grossWeightGrams).toBe(10.5);
    expect(qcItem.tareWeightGrams).toBe(0.5);
    expect(qcItem.stoneWeightCarats).toBe(0);
    // Initial net before stones = 10.5 - 0.5 = 10.0000
    expect(qcItem.netWeightGrams).toBe(10.0);
    expect(qcItem.status).toBe("PENDING");
  });

  it("Scenario 1: Net Metal Weight Calculation Formula via Net = Gross - Tare - Stones", async () => {
    // Retrieve the QC item
    const qcItemBefore = (await getQualityCheckItemById(
      (
        await listItemGemstonesByQcItemId(
          "00000000-0000-0000-0000-000000000000",
        )
      ).length === 0
        ? (
            await query<{ id: string }>(
              "SELECT id FROM quality_check_items WHERE quality_check_id = $1 LIMIT 1",
              [qcId],
            )
          ).rows[0]!.id
        : "",
    ))!;

    // Gross = 10.5000g, Tare = 0.5000g, Add Solitaire Diamond 1.5000 ct (0.3000g)
    const { gemstone, qcItem: updatedQcItem } = await addItemGemstone({
      qualityCheckItemId: qcItemBefore.id,
      gemstoneId,
      stoneType: StoneType.PRIMARY_SOLITAIRE,
      stoneCount: 1,
      caratWeight: 1.5,
      shape: "ROUND_BRILLIANT",
      cutGrade: "EXCELLENT",
      colorGrade: "D",
      clarityGrade: "VVS1",
      certificateAuthority: "GIA",
      certificateNumber: "GIA-2026-987654",
      settingVerified: true,
    });

    expect(gemstone.id).toBeDefined();
    expect(gemstone.stoneType).toBe("PRIMARY_SOLITAIRE");
    expect(gemstone.stoneCount).toBe(1);
    expect(gemstone.caratWeight).toBe(1.5);
    expect(gemstone.settingVerified).toBe(true);

    // Formula Verification:
    // Net = Gross - Tare - Stones
    // Net = 10.5000 - 0.5000 - (1.5000 * 0.2000) = 10.5000 - 0.5000 - 0.3000 = 9.7000g
    expect(updatedQcItem.stoneWeightCarats).toBe(1.5);
    expect(updatedQcItem.netWeightGrams).toBe(9.7);

    // Verify database row reflects updated net weight
    const refetched = await getQualityCheckItemById(qcItemBefore.id);
    expect(refetched?.stoneWeightCarats).toBe(1.5);
    expect(refetched?.netWeightGrams).toBe(9.7);
  });

  it("accumulates multiple gemstone parcels into total carat and net weight", async () => {
    const qcItem = (
      await query<{ id: string }>(
        "SELECT id FROM quality_check_items WHERE quality_check_id = $1 LIMIT 1",
        [qcId],
      )
    ).rows[0]!;

    // Add Accent Melee Parcel: 10 melee stones totaling 0.5000 carats (0.1000g)
    const { gemstone: meleeStone, qcItem: updatedItem } = await addItemGemstone(
      {
        qualityCheckItemId: qcItem.id,
        gemstoneId,
        stoneType: StoneType.ACCENT_MELEE,
        stoneCount: 10,
        caratWeight: 0.5,
        shape: "ROUND_BRILLIANT",
        settingVerified: true,
      },
    );

    expect(meleeStone.stoneType).toBe("ACCENT_MELEE");
    expect(meleeStone.stoneCount).toBe(10);
    expect(meleeStone.caratWeight).toBe(0.5);

    // Total carats = 1.5000 + 0.5000 = 2.0000 ct
    // Total stone weight grams = 2.0000 * 0.2000 = 0.4000g
    // Net = 10.5000 - 0.5000 - 0.4000 = 9.6000g
    expect(updatedItem.stoneWeightCarats).toBe(2.0);
    expect(updatedItem.netWeightGrams).toBe(9.6);

    const stoneList = await listItemGemstonesByQcItemId(qcItem.id);
    expect(stoneList).toHaveLength(2);
  });

  it("enforces solitaire invariant: PRIMARY_SOLITAIRE must possess stone_count = 1", async () => {
    const qcItem = (
      await query<{ id: string }>(
        "SELECT id FROM quality_check_items WHERE quality_check_id = $1 LIMIT 1",
        [qcId],
      )
    ).rows[0]!;

    await expect(
      addItemGemstone({
        qualityCheckItemId: qcItem.id,
        gemstoneId,
        stoneType: StoneType.PRIMARY_SOLITAIRE,
        stoneCount: 2, // Violation: solitaire cannot have multiple stones
        caratWeight: 2.0,
      }),
    ).rejects.toThrow("Solitaire stones must possess stone_count = 1");
  });

  it("rejects non-positive gemstone carat weights (INV-02)", async () => {
    const qcItem = (
      await query<{ id: string }>(
        "SELECT id FROM quality_check_items WHERE quality_check_id = $1 LIMIT 1",
        [qcId],
      )
    ).rows[0]!;

    await expect(
      addItemGemstone({
        qualityCheckItemId: qcItem.id,
        gemstoneId,
        stoneType: StoneType.PARCEL,
        stoneCount: 5,
        caratWeight: 0,
      }),
    ).rejects.toThrow("strictly positive");

    await expect(
      addItemGemstone({
        qualityCheckItemId: qcItem.id,
        gemstoneId,
        stoneType: StoneType.PARCEL,
        stoneCount: 5,
        caratWeight: -1.2,
      }),
    ).rejects.toThrow("strictly positive");
  });

  it("enforces sealed session immutability gate: cannot add stones to sealed inspection sessions", async () => {
    // 1. Seal QC session
    await updateQualityCheck(qcId, {
      status: QualityCheckStatus.APPROVED,
    });

    const qcItem = (
      await query<{ id: string }>(
        "SELECT id FROM quality_check_items WHERE quality_check_id = $1 LIMIT 1",
        [qcId],
      )
    ).rows[0]!;

    // 2. Attempt adding stone to sealed session
    await expect(
      addItemGemstone({
        qualityCheckItemId: qcItem.id,
        gemstoneId,
        stoneType: StoneType.ACCENT_MELEE,
        stoneCount: 4,
        caratWeight: 0.2,
      }),
    ).rejects.toThrow(
      "Inspection session is APPROVED and sealed; gemstone additions are strictly prohibited",
    );
  });
});
