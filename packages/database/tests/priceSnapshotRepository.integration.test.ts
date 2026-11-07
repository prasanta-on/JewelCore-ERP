import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createMaterial,
  createPurity,
  createCategory,
  createProduct,
  createProductSku,
  createGemstone,
  recordDailyMarketRate,
  createPricingPolicy,
  createGemstonePriceMatrix,
  calculateItemValuation,
  calculateCustomValuation,
  snapshotPiecePrice,
  revalueStoreInventory,
  listPriceSnapshots,
  getPriceSnapshotById,
} from "../src/index.js";
import {
  StoreType,
  MetalType,
  MakingChargeType,
  RateSource,
} from "@jewelcore/shared";

describe("Dynamic Price Calculator & Snapshot Engine Repository (FEAT-PRICE-04, Entity 47)", () => {
  let orgId: string;
  let altOrgId: string;
  let storeId: string;
  let altStoreId: string;
  let userId: string;
  let categoryId: string;
  let productId: string;
  let skuId: string;
  let materialId: string;
  let purityId: string;
  let diamondId: string;
  let inventoryItemId: string;
  let secondItemId: string;
  let qcItemId: string;
  let secondQcItemId: string;

  let goldRateId: string;
  let policyId: string;
  let diamondMatrixId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE price_snapshots DISABLE TRIGGER trg_price_snapshots_immutability;",
    );
    await query(
      "DELETE FROM price_snapshots WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_REPO', 'ORG_PRC_REPO_ALT'));",
    );
    await query(
      "ALTER TABLE price_snapshots ENABLE TRIGGER trg_price_snapshots_immutability;",
    );

    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_REPO', 'ORG_PRC_REPO_ALT'));",
    );
    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-REPO-%'))));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-PRC-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_PRC_REPO_%';");
    await query(
      "DELETE FROM gemstone_price_matrices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_REPO', 'ORG_PRC_REPO_ALT'));",
    );
    await query(
      "DELETE FROM pricing_policies WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_REPO', 'ORG_PRC_REPO_ALT'));",
    );
    await query(
      "ALTER TABLE daily_market_rates DISABLE TRIGGER trg_daily_market_rates_immutability;",
    );
    await query(
      "DELETE FROM daily_market_rates WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_REPO', 'ORG_PRC_REPO_ALT'));",
    );
    await query(
      "ALTER TABLE daily_market_rates ENABLE TRIGGER trg_daily_market_rates_immutability;",
    );
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-PRC-REPO-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_PRC_REPO_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_PRC_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_PRC_REPO_%';");
    await query("DELETE FROM gemstones WHERE code LIKE 'GEM_PRC_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_PRC_REPO_%';");
    await query(
      "DELETE FROM stores WHERE code IN ('STR_PRC_REPO_MAIN', 'STR_PRC_REPO_ALT');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'prc_repo_%@jewelcore.local';",
    );
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_PRC_REPO', 'ORG_PRC_REPO_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_PRC_REPO",
      name: "Dynamic Pricing Corporation",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_PRC_REPO_ALT",
      name: "Competitor Jewellery Corp",
    });
    altOrgId = altOrg.id;

    // 2. Stores
    const store = await createStore({
      organizationId: orgId,
      code: "STR_PRC_REPO_MAIN",
      name: "Flagship Showroom Toronto",
      storeType: StoreType.RETAIL_STORE,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: altOrgId,
      code: "STR_PRC_REPO_ALT",
      name: "Competitor Vault Montreal",
      storeType: StoreType.RETAIL_STORE,
    });
    altStoreId = altStore.id;

    // 3. User
    const userRes = await query<{ id: string }>(
      `
      INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active)
      VALUES (gen_random_uuid(), $1, 'prc_repo_admin@jewelcore.local', 'hash', 'Pricing', 'Director', true)
      RETURNING id
      `,
      [orgId],
    );
    userId = userRes.rows[0]!.id;

    // 4. Materials & Purities (18K Gold = 0.7500 ratio)
    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_PRC_REPO_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });
    materialId = mat.id;

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_PRC_REPO_18K",
      name: "18 Karat Yellow Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });
    purityId = pur.id;

    // 5. Gemstones
    const gem = await createGemstone({
      organizationId: orgId,
      code: "GEM_PRC_REPO_DIA",
      name: "Natural Diamond Solitaire",
      gemstoneType: "PRECIOUS",
      defaultMeasurementUnit: "CARAT",
      isActive: true,
    });
    diamondId = gem.id;

    // 6. Taxonomy: Category, Product, SKU
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_PRC_REPO_RINGS",
      name: "Diamond Engagement Rings",
    });
    categoryId = cat.id;

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_PRC_REPO_SOLITAIRE",
      name: "Classic Solitaire Engagement Ring",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });
    productId = prod.id;

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-PRC-REPO-18K-1CT",
      variantName: "18K Gold 1ct Diamond Ring",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 10.2,
      targetMetalWeightGrams: 10.0,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // 7. QC session & QC item lineage
    const supRes = await query<{ id: string }>(
      `
      INSERT INTO suppliers (id, organization_id, code, name, is_active)
      VALUES (gen_random_uuid(), $1, 'SUP_PRC_REPO_01', 'Premier Master Craftsmen', true)
      RETURNING id
      `,
      [orgId],
    );
    const supplierId = supRes.rows[0]!.id;

    const grnRes = await query<{ id: string }>(
      `
      INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
      VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-PRC-REPO-001', 'RECEIVED', $4)
      RETURNING id
      `,
      [orgId, storeId, supplierId, userId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `
      INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
      VALUES (gen_random_uuid(), $1, 'SHIP-PRC-REPO-001', 'BRINKS', 'BR-001', 'RECEIVED', $2)
      RETURNING id
      `,
      [grnId, userId],
    );
    const shipmentId = shipRes.rows[0]!.id;

    const shipItemRes = await query<{ id: string }>(
      `
      INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
      VALUES (gen_random_uuid(), $1, $2, 1, 2, 2)
      RETURNING id
      `,
      [shipmentId, skuId],
    );
    const shipmentItemId = shipItemRes.rows[0]!.id;

    const qcRes = await query<{ id: string }>(
      `
      INSERT INTO quality_checks (id, shipment_id, store_id, inspector_user_id, session_sequence_number, status)
      VALUES (gen_random_uuid(), $1, $2, $3, 1, 'APPROVED')
      RETURNING id
      `,
      [shipmentId, storeId, userId],
    );
    const qcId = qcRes.rows[0]!.id;

    // Create 2 QC items
    const qcItem1 = await query<{ id: string }>(
      `
      INSERT INTO quality_check_items (
        id, quality_check_id, shipment_item_id, item_sequence_number, status,
        gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
        hallmark_verified, visual_inspection_passed, damage_detected
      )
      VALUES (
        gen_random_uuid(), $1, $2, 1, 'APPROVED',
        10.2000, 10.0000, $3, $4,
        true, true, false
      )
      RETURNING id
      `,
      [qcId, shipmentItemId, materialId, purityId],
    );
    qcItemId = qcItem1.rows[0]!.id;

    const qcItem2 = await query<{ id: string }>(
      `
      INSERT INTO quality_check_items (
        id, quality_check_id, shipment_item_id, item_sequence_number, status,
        gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
        hallmark_verified, visual_inspection_passed, damage_detected
      )
      VALUES (
        gen_random_uuid(), $1, $2, 2, 'APPROVED',
        12.2000, 12.0000, $3, $4,
        true, true, false
      )
      RETURNING id
      `,
      [qcId, shipmentItemId, materialId, purityId],
    );
    secondQcItemId = qcItem2.rows[0]!.id;

    // Attach 1.0ct Diamond to piece 1
    await query(
      `
      INSERT INTO item_gemstones (id, quality_check_item_id, gemstone_id, stone_type, stone_count, carat_weight, cut_grade, color_grade, clarity_grade)
      VALUES (gen_random_uuid(), $1, $2, 'PRIMARY_SOLITAIRE', 1, 1.0000, 'EXCELLENT', 'D', 'VVS1')
      `,
      [qcItemId, diamondId],
    );

    // Attach 1.0ct Diamond to piece 2
    await query(
      `
      INSERT INTO item_gemstones (id, quality_check_item_id, gemstone_id, stone_type, stone_count, carat_weight, cut_grade, color_grade, clarity_grade)
      VALUES (gen_random_uuid(), $1, $2, 'PRIMARY_SOLITAIRE', 1, 1.0000, 'EXCELLENT', 'D', 'VVS1')
      `,
      [secondQcItemId, diamondId],
    );

    // 8. Create Serialized Inventory Items
    const item1 = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 'SN-PRC-REPO-001', 'Solitaire Ring #1',
        10.2000, 10.0000, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE'
      )
      RETURNING id
      `,
      [orgId, storeId, skuId, qcItemId, purityId],
    );
    inventoryItemId = item1.rows[0]!.id;

    const item2 = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 'SN-PRC-REPO-002', 'Solitaire Ring #2',
        12.2000, 12.0000, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE'
      )
      RETURNING id
      `,
      [orgId, storeId, skuId, secondQcItemId, purityId],
    );
    secondItemId = item2.rows[0]!.id;

    // 9. Pricing Market Rate: Gold 24K Spot = $90.00 / gram CAD
    const rate = await recordDailyMarketRate({
      organizationId: orgId,
      metalType: MetalType.GOLD,
      ratePerGramCad: 90.0,
      currency: "CAD",
      rateSource: RateSource.LBMA_FEED,
      recordedByUserId: userId,
    });
    goldRateId = rate.id;

    // 10. Gemstone Matrix: 1.0ct - 1.9999ct D VVS1 Diamond = $4,000.00 / ct CAD
    const matrix = await createGemstonePriceMatrix({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratRangeMin: 1.0,
      caratRangeMax: 1.9999,
      colorGrade: "D",
      clarityGrade: "VVS1",
      ratePerCaratCad: 4000.0,
      currency: "CAD",
    });
    diamondMatrixId = matrix.id;

    // 11. Pricing Policy: PER_GRAM $15.00/g, wastage 3%, hallmarking $10, cert $50, margin 20%
    const pol = await createPricingPolicy({
      organizationId: orgId,
      categoryId,
      policyName: "Fine Rings Dynamic Formula",
      chargeType: MakingChargeType.PER_GRAM,
      chargeRate: 15.0,
      wastagePercentage: 0.03,
      hallmarkingFeeCad: 10.0,
      certificationFeeCad: 50.0,
      defaultMarginPercentage: 0.2,
    });
    policyId = pol.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: calculates full dynamic valuation breakdown for an existing inventory item", async () => {
    const calc = await calculateItemValuation({
      organizationId: orgId,
      inventoryItemId,
    });

    // Verification of formulas:
    // Metal: 10g net * 0.75 purity ratio = 7.5g pure gold * $90.00/g = $675.00
    expect(calc.metalComponentCad).toBe(675.0);
    expect(calc.priceBreakdown.metal.pureMetalWeightGrams).toBe(7.5);
    expect(calc.priceBreakdown.metal.spotRatePerGramCad).toBe(90.0);

    // Gemstone: 1.0ct * $4,000.00 = $4,000.00
    expect(calc.gemstoneComponentCad).toBe(4000.0);
    expect(calc.priceBreakdown.gemstones.stones).toHaveLength(1);
    expect(calc.priceBreakdown.gemstones.stones[0]!.ratePerCaratCad).toBe(
      4000.0,
    );

    // Making charge: PER_GRAM @ $15.00/g * 10g = $150.00
    expect(calc.makingChargeCad).toBe(150.0);

    // Wastage: 3% of metal ($675.00 * 0.03) = $20.25
    expect(calc.wastageComponentCad).toBe(20.25);

    // Ancillary: Hallmarking $10.00 + Cert $50.00 = $60.00
    expect(calc.ancillaryFeesCad).toBe(60.0);

    // Cost Price: 675.00 + 4000.00 + 150.00 + 20.25 + 60.00 = 4905.25
    expect(calc.costPriceCad).toBe(4905.25);

    // Margin: 20% of $4905.25 = $981.05
    expect(calc.marginComponentCad).toBe(981.05);

    // Selling Price: $4905.25 + $981.05 = $5886.30
    expect(calc.sellingPriceCad).toBe(5886.3);
  });

  it("Scenario 2: evaluates ad-hoc custom simulation without an inventory piece", async () => {
    const calc = await calculateCustomValuation(orgId, {
      categoryId,
      metalType: MetalType.GOLD,
      netWeightGrams: 5.0,
      purityRatio: 0.75,
      gemstones: [
        {
          gemstoneId: diamondId,
          caratWeight: 1.0,
          colorGrade: "D",
          clarityGrade: "VVS1",
        },
      ],
      marginPercentageOverride: 0.25, // 25% margin override
    });

    // Metal: 5g * 0.75 = 3.75g * 90 = 337.50
    expect(calc.metalComponentCad).toBe(337.5);
    // Gemstone: 1.0ct * 4000 = 4000.00
    expect(calc.gemstoneComponentCad).toBe(4000.0);
    // Making: 5g * 15 = 75.00
    expect(calc.makingChargeCad).toBe(75.0);
    // Wastage: 337.50 * 0.03 = 10.13
    expect(calc.wastageComponentCad).toBe(10.13);
    // Ancillary: 60.00
    expect(calc.ancillaryFeesCad).toBe(60.0);
    // Cost: 337.50 + 4000 + 75 + 10.13 + 60 = 4482.63
    expect(calc.costPriceCad).toBe(4482.63);
    // Margin @ 25%: 4482.63 * 0.25 = 1120.66
    expect(calc.marginComponentCad).toBe(1120.66);
    // Selling price: 4482.63 + 1120.66 = 5603.29
    expect(calc.sellingPriceCad).toBe(5603.29);
  });

  it("Scenario 3: snapshots piece price, storing ledger entry and updating inventory_items atomically", async () => {
    const res = await snapshotPiecePrice({
      organizationId: orgId,
      inventoryItemId,
      triggeredByUserId: userId,
    });

    expect(res.snapshot.id).toBeDefined();
    expect(res.snapshot.inventoryItemId).toBe(inventoryItemId);
    expect(res.snapshot.costPriceCad).toBe(4905.25);
    expect(res.snapshot.sellingPriceCad).toBe(5886.3);

    // Verify inventory item was updated
    expect(res.inventoryItem.costPriceCad).toBe(4905.25);
    expect(res.inventoryItem.sellingPriceCad).toBe(5886.3);
    expect(res.inventoryItem.version).toBe(2); // incremented from 1 to 2
  });

  it("Scenario 4: enforces ledger immutability on price_snapshots (INV-09)", async () => {
    const snapshots = await listPriceSnapshots({
      organizationId: orgId,
      inventoryItemId,
    });

    expect(snapshots.total).toBeGreaterThanOrEqual(1);
    const snapshotId = snapshots.data[0]!.id;

    // Attempting to update a snapshot must throw a PostgreSQL trigger exception
    await expect(
      query(
        "UPDATE price_snapshots SET selling_price_cad = 99999.00 WHERE id = $1;",
        [snapshotId],
      ),
    ).rejects.toThrow(/immutable financial ledger history/i);

    // Attempting to delete a snapshot must also fail
    await expect(
      query("DELETE FROM price_snapshots WHERE id = $1;", [snapshotId]),
    ).rejects.toThrow(/immutable financial ledger history/i);
  });

  it("Scenario 5: batch revalues store inventory upon market spot rate change", async () => {
    // Post updated market rate: Gold jumps from $90.00/g to $100.00/g CAD
    await recordDailyMarketRate({
      organizationId: orgId,
      metalType: MetalType.GOLD,
      ratePerGramCad: 100.0,
      currency: "CAD",
      rateSource: RateSource.MANUAL_OVERRIDE,
      recordedByUserId: userId,
    });

    const revalRes = await revalueStoreInventory({
      organizationId: orgId,
      storeId,
      triggeredByUserId: userId,
    });

    expect(revalRes.itemsRevalued).toBe(2);
    expect(revalRes.snapshots).toHaveLength(2);
    expect(revalRes.totalCostPriceCad).toBeGreaterThan(0);
    expect(revalRes.totalSellingPriceCad).toBeGreaterThan(
      revalRes.totalCostPriceCad,
    );

    // Piece 1 revaluation:
    // Metal: 10g * 0.75 = 7.5g * 100 = $750.00 (up from 675)
    // Making: 150.00, Wastage: 750 * 0.03 = 22.50, Gems: 4000, Ancillary: 60
    // Cost: 750 + 4000 + 150 + 22.50 + 60 = 4982.50
    // Selling: 4982.50 * 1.20 = 5979.00
    const item1Snapshot = revalRes.snapshots.find(
      (s) => s.inventoryItemId === inventoryItemId,
    );
    expect(item1Snapshot).toBeDefined();
    expect(item1Snapshot!.costPriceCad).toBe(4982.5);
    expect(item1Snapshot!.sellingPriceCad).toBe(5979.0);
  });

  it("Scenario 6: lists price snapshot history for an item with pagination", async () => {
    const listRes = await listPriceSnapshots({
      organizationId: orgId,
      inventoryItemId,
      limit: 10,
      offset: 0,
    });

    // We have 2 snapshots for inventoryItemId (initial snapshot + store revaluation)
    expect(listRes.total).toBe(2);
    expect(listRes.data).toHaveLength(2);
    // Ordered by created_at DESC
    expect(listRes.data[0]!.costPriceCad).toBe(4982.5);
    expect(listRes.data[1]!.costPriceCad).toBe(4905.25);
  });

  it("Scenario 7: enforces multi-tenant boundary isolation", async () => {
    // Attempting to calculate or snapshot item belonging to another org returns 404
    await expect(
      calculateItemValuation({
        organizationId: altOrgId,
        inventoryItemId,
      }),
    ).rejects.toThrow(/not found/i);

    // Querying snapshots with altOrgId returns empty
    const altSnapshots = await listPriceSnapshots({
      organizationId: altOrgId,
      inventoryItemId,
    });
    expect(altSnapshots.total).toBe(0);
    expect(altSnapshots.data).toHaveLength(0);
  });
});
