import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
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
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import {
  StoreType,
  MetalType,
  MakingChargeType,
  RateSource,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Dynamic Price Calculator & Snapshot Engine API (FEAT-PRICE-04, Entity 47)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;

  let managerToken: string;
  let managerUserId: string;
  let associateToken: string;
  let associateUserId: string;
  let otherOrgManagerToken: string;

  let categoryId: string;
  let productId: string;
  let skuId: string;
  let materialId: string;
  let purityId: string;
  let diamondId: string;

  let inventoryItemId: string;
  let snapshotId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE price_snapshots DISABLE TRIGGER trg_price_snapshots_immutability;",
    );
    await query(
      "DELETE FROM price_snapshots WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_API', 'ORG_PRC_API_ALT'));",
    );
    await query(
      "ALTER TABLE price_snapshots ENABLE TRIGGER trg_price_snapshots_immutability;",
    );

    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_API', 'ORG_PRC_API_ALT'));",
    );
    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-API-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-PRC-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-PRC-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_PRC_API_%';");

    await query(
      "DELETE FROM gemstone_price_matrices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_API', 'ORG_PRC_API_ALT'));",
    );
    await query(
      "DELETE FROM pricing_policies WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_API', 'ORG_PRC_API_ALT'));",
    );
    await query(
      "ALTER TABLE daily_market_rates DISABLE TRIGGER trg_daily_market_rates_immutability;",
    );
    await query(
      "DELETE FROM daily_market_rates WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_API', 'ORG_PRC_API_ALT'));",
    );
    await query(
      "ALTER TABLE daily_market_rates ENABLE TRIGGER trg_daily_market_rates_immutability;",
    );

    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-PRC-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_PRC_API_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_PRC_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_PRC_API_%';");
    await query("DELETE FROM gemstones WHERE code LIKE 'GEM_PRC_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_PRC_API_%';");

    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STR_PRC_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PRC_API', 'ORG_PRC_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'prc_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'prc_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STR_PRC_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_PRC_API', 'ORG_PRC_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_PRC_API",
      name: "Dynamic Valuation API Org",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_PRC_API_ALT",
      name: "Competitor Valuation API Org",
    });
    otherOrgId = altOrg.id;

    // 2. Stores
    const store = await createStore({
      organizationId: orgId,
      code: "STR_PRC_API_MAIN",
      name: "Flagship Toronto API Store",
      storeType: StoreType.RETAIL_STORE,
    });
    storeId = store.id;

    const otherStore = await createStore({
      organizationId: otherOrgId,
      code: "STR_PRC_API_ALT",
      name: "Competitor Store Montreal",
      storeType: StoreType.RETAIL_STORE,
    });
    otherStoreId = otherStore.id;

    // 3. Users and Memberships
    const mgrUser = await createUser({
      organizationId: orgId,
      email: "prc_api_manager@jewelcore.local",
      passwordHash: "hash_pw",
      firstName: "Store",
      lastName: "Manager",
      isActive: true,
    });
    managerUserId = mgrUser.id;

    const mgrRole = await getRoleByCode("STORE_MANAGER");
    if (mgrRole) await assignRoleToUser(mgrUser.id, mgrRole.id);
    const mgrOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: mgrUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId,
      organizationMembershipId: mgrOrgMem.id,
      isDefault: true,
    });

    managerToken = await signAccessToken({
      userId: mgrUser.id,
      email: mgrUser.email,
      orgId,
    });

    const assocUser = await createUser({
      organizationId: orgId,
      email: "prc_api_associate@jewelcore.local",
      passwordHash: "hash_pw",
      firstName: "Sales",
      lastName: "Associate",
      isActive: true,
    });
    associateUserId = assocUser.id;

    const assocRole = await getRoleByCode("SALES_ASSOCIATE");
    if (assocRole) await assignRoleToUser(assocUser.id, assocRole.id);
    const assocOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: assocUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId,
      organizationMembershipId: assocOrgMem.id,
      isDefault: true,
    });

    associateToken = await signAccessToken({
      userId: assocUser.id,
      email: assocUser.email,
      orgId,
    });

    const otherMgr = await createUser({
      organizationId: otherOrgId,
      email: "prc_api_other_mgr@jewelcore.local",
      passwordHash: "hash_pw",
      firstName: "Other",
      lastName: "Manager",
      isActive: true,
    });
    if (mgrRole) await assignRoleToUser(otherMgr.id, mgrRole.id);
    const otherOrgMem = await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: otherMgr.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: otherStoreId,
      organizationMembershipId: otherOrgMem.id,
      isDefault: true,
    });

    otherOrgManagerToken = await signAccessToken({
      userId: otherMgr.id,
      email: otherMgr.email,
      orgId: otherOrgId,
    });

    // 4. Taxonomy: Material, Purity, Category, Product, SKU
    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_PRC_API_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });
    materialId = mat.id;

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_PRC_API_18K",
      name: "18 Karat Yellow Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });
    purityId = pur.id;

    const gem = await createGemstone({
      organizationId: orgId,
      code: "GEM_PRC_API_DIA",
      name: "Natural Brilliant Diamond",
      gemstoneType: "PRECIOUS",
      defaultMeasurementUnit: "CARAT",
      isActive: true,
    });
    diamondId = gem.id;

    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_PRC_API_RINGS",
      name: "Engagement Rings",
    });
    categoryId = cat.id;

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_PRC_API_RING01",
      name: "Crown Solitaire Ring",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });
    productId = prod.id;

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-PRC-API-18K-1CT",
      variantName: "18K Gold Solitaire Ring 1ct",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 10.2,
      targetMetalWeightGrams: 10.0,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // 5. Procurement & QC Lineage
    const supRes = await query<{ id: string }>(
      `
      INSERT INTO suppliers (id, organization_id, code, name, is_active)
      VALUES (gen_random_uuid(), $1, 'SUP_PRC_API_01', 'Artisan Supplier', true)
      RETURNING id
      `,
      [orgId],
    );
    const supplierId = supRes.rows[0]!.id;

    const grnRes = await query<{ id: string }>(
      `
      INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
      VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-PRC-API-001', 'RECEIVED', $4)
      RETURNING id
      `,
      [orgId, storeId, supplierId, managerUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `
      INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
      VALUES (gen_random_uuid(), $1, 'SHIP-PRC-API-001', 'MALCA-AMIT', 'MA-001', 'RECEIVED', $2)
      RETURNING id
      `,
      [grnId, managerUserId],
    );
    const shipmentId = shipRes.rows[0]!.id;

    const shipItemRes = await query<{ id: string }>(
      `
      INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
      VALUES (gen_random_uuid(), $1, $2, 1, 1, 1)
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
      [shipmentId, storeId, managerUserId],
    );
    const qcId = qcRes.rows[0]!.id;

    const qcItemRes = await query<{ id: string }>(
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
    const qcItemId = qcItemRes.rows[0]!.id;

    // Mounted Diamond
    await query(
      `
      INSERT INTO item_gemstones (id, quality_check_item_id, gemstone_id, stone_type, stone_count, carat_weight, cut_grade, color_grade, clarity_grade)
      VALUES (gen_random_uuid(), $1, $2, 'PRIMARY_SOLITAIRE', 1, 1.0000, 'EXCELLENT', 'E', 'VS1')
      `,
      [qcItemId, diamondId],
    );

    // Serialized Inventory Item
    const itemRes = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 'SN-PRC-API-001', 'Crown Solitaire Ring #1',
        10.2000, 10.0000, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE'
      )
      RETURNING id
      `,
      [orgId, storeId, skuId, qcItemId, purityId],
    );
    inventoryItemId = itemRes.rows[0]!.id;

    // 6. Pricing Reference Data
    // Gold spot rate: $95.00/g CAD
    await recordDailyMarketRate({
      organizationId: orgId,
      metalType: MetalType.GOLD,
      ratePerGramCad: 95.0,
      currency: "CAD",
      rateSource: RateSource.LBMA_FEED,
      recordedByUserId: managerUserId,
    });

    // Diamond matrix: 1ct - 2ct E VS1 = $3,500.00/ct CAD
    await createGemstonePriceMatrix({
      organizationId: orgId,
      gemstoneId: diamondId,
      caratRangeMin: 1.0,
      caratRangeMax: 1.9999,
      colorGrade: "E",
      clarityGrade: "VS1",
      ratePerCaratCad: 3500.0,
      currency: "CAD",
    });

    // Pricing Policy: PER_GRAM $12/g, wastage 2%, hallmarking $15, cert $40, margin 25%
    await createPricingPolicy({
      organizationId: orgId,
      categoryId,
      policyName: "Engagement Rings Policy",
      chargeType: MakingChargeType.PER_GRAM,
      chargeRate: 12.0,
      wastagePercentage: 0.02,
      hallmarkingFeeCad: 15.0,
      certificationFeeCad: 40.0,
      defaultMarginPercentage: 0.25,
    });
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  describe("POST /api/v1/pricing/calculate (Dynamic Price Simulation)", () => {
    it("simulates price calculation for custom specs without creating an item record", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/calculate")
        .set("Authorization", `Bearer ${associateToken}`)
        .send({
          categoryId,
          metalType: MetalType.GOLD,
          netWeightGrams: 8.0,
          purityRatio: 0.75,
          gemstones: [
            {
              gemstoneId: diamondId,
              caratWeight: 1.0,
              colorGrade: "E",
              clarityGrade: "VS1",
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.metalComponentCad).toBeGreaterThan(0);
      expect(res.body.data.gemstoneComponentCad).toBe(3500.0);
      expect(res.body.data.costPriceCad).toBeGreaterThan(0);
      expect(res.body.data.sellingPriceCad).toBeGreaterThan(
        res.body.data.costPriceCad,
      );
      expect(res.body.data.priceBreakdown).toBeDefined();
    });

    it("previews valuation for an existing serialized piece by inventoryItemId", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/calculate")
        .set("Authorization", `Bearer ${associateToken}`)
        .send({
          inventoryItemId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Metal: 10g * 0.75 = 7.5g * 95 = $712.50
      expect(res.body.data.metalComponentCad).toBe(712.5);
      // Gemstone: 1.0ct * 3500 = $3500.00
      expect(res.body.data.gemstoneComponentCad).toBe(3500.0);
      // Making charge: 10g * 12 = $120.00
      expect(res.body.data.makingChargeCad).toBe(120.0);
      // Wastage: 712.50 * 0.02 = $14.25
      expect(res.body.data.wastageComponentCad).toBe(14.25);
      // Ancillary: 15 + 40 = $55.00
      expect(res.body.data.ancillaryFeesCad).toBe(55.0);
      // Cost: 712.50 + 3500 + 120 + 14.25 + 55 = 4401.75
      expect(res.body.data.costPriceCad).toBe(4401.75);
      // Margin: 25% = 1100.44
      expect(res.body.data.marginComponentCad).toBe(1100.44);
      // Selling price: 5502.19
      expect(res.body.data.sellingPriceCad).toBe(5502.19);
    });

    it("rejects unauthenticated caller with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/calculate")
        .send({ inventoryItemId });

      expect(res.status).toBe(401);
    });

    it("rejects invalid request with neither inventoryItemId nor metal specs with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/calculate")
        .set("Authorization", `Bearer ${associateToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
    });
  });

  describe("POST /api/v1/pricing/items/:id/snapshot (Snapshot Piece Price)", () => {
    it("successfully creates a price snapshot and updates piece prices atomically", async () => {
      const res = await request(app)
        .post(`/api/v1/pricing/items/${inventoryItemId}/snapshot`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.snapshot.id).toBeDefined();
      snapshotId = res.body.data.snapshot.id;
      expect(res.body.data.snapshot.costPriceCad).toBe(4401.75);
      expect(res.body.data.snapshot.sellingPriceCad).toBe(5502.19);

      // Verify inventory item prices and version
      expect(res.body.data.inventoryItem.costPriceCad).toBe(4401.75);
      expect(res.body.data.inventoryItem.sellingPriceCad).toBe(5502.19);
      expect(res.body.data.inventoryItem.version).toBe(2);
    });

    it("returns 404 when inventory item ID does not exist", async () => {
      const fakeId = "0192e301-ffff-7000-8000-000000000099";
      const res = await request(app)
        .post(`/api/v1/pricing/items/${fakeId}/snapshot`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });

    it("enforces multi-tenant isolation: other org manager receives 404 Not Found", async () => {
      const res = await request(app)
        .post(`/api/v1/pricing/items/${inventoryItemId}/snapshot`)
        .set("Authorization", `Bearer ${otherOrgManagerToken}`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });
  });

  describe("POST /api/v1/pricing/revalue-store (Batch Store Revaluation)", () => {
    it("batch revalues store inventory for authorized manager (pricing:revalue)", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/revalue-store")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          storeId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.itemsRevalued).toBe(1);
      expect(res.body.data.totalCostPriceCad).toBe(4401.75);
      expect(res.body.data.totalSellingPriceCad).toBe(5502.19);
      expect(res.body.data.snapshots).toHaveLength(1);
    });

    it("rejects sales associate without pricing:revalue with 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/pricing/revalue-store")
        .set("Authorization", `Bearer ${associateToken}`)
        .send({
          storeId,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    });
  });

  describe("GET /api/v1/pricing/items/:id/snapshots & GET /api/v1/pricing/snapshots/:id", () => {
    it("retrieves price snapshot history for an item", async () => {
      const res = await request(app)
        .get(`/api/v1/pricing/items/${inventoryItemId}/snapshots`)
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it("retrieves a single price snapshot by ID", async () => {
      const res = await request(app)
        .get(`/api/v1/pricing/snapshots/${snapshotId}`)
        .set("Authorization", `Bearer ${associateToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(snapshotId);
      expect(res.body.data.priceBreakdownJson).toBeDefined();
    });

    it("enforces multi-tenant isolation: cross-tenant snapshot lookup returns 404", async () => {
      const res = await request(app)
        .get(`/api/v1/pricing/snapshots/${snapshotId}`)
        .set("Authorization", `Bearer ${otherOrgManagerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });
  });
});
