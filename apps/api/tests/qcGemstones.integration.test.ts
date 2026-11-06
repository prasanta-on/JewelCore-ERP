import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
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
  updateQualityCheck,
} from "@jewelcore/database";
import {
  StoreType,
  GemstoneType,
  StoneType,
  QualityCheckStatus,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Mounted Gemstone Carat Parcel Grading API (FEAT-QC-03 / DEC-05)", () => {
  const app = createApp();

  let orgId: string;
  let storeId: string;
  let gemstoneId: string;
  let qcId: string;
  let qcItemId: string;
  let authorizedToken: string;
  let unauthorizedToken: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%')));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-GEM-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_GEM_API_%';");
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-GEM-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_GEM_API_%';",
    );
    await query("DELETE FROM gemstones WHERE code LIKE 'GEM_API_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_GEM_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_GEM_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_GEM_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_GEM_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_GEM_API');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'gem_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'gem_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_GEM_API_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_GEM_API';");

    // 1. Organization & Store
    const org = await createOrganization({
      code: "ORG_GEM_API",
      name: "Gem Grading API Test Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_GEM_API_001",
      name: "Intake Gemology Laboratory",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeId = store.id;

    // 2. Authorized Technician (STORE_MANAGER with qc:measure)
    const graderUser = await createUser({
      organizationId: orgId,
      email: "gem_api_grader@jewelcore.local",
      firstName: "Gemmologist",
      lastName: "Specialist",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(graderUser.id, managerRole.id);
    }
    const orgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: graderUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: storeId,
      organizationMembershipId: orgMem.id,
      isDefault: true,
    });

    authorizedToken = await signAccessToken({
      userId: graderUser.id,
      email: graderUser.email,
      orgId: orgId,
    });

    // 3. Unauthorized User (VIEWER without qc:measure)
    const viewerUser = await createUser({
      organizationId: orgId,
      email: "gem_api_viewer@jewelcore.local",
      firstName: "Staff",
      lastName: "Viewer",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const viewerRole = await getRoleByCode("VIEWER");
    if (viewerRole) {
      await assignRoleToUser(viewerUser.id, viewerRole.id);
    }
    const viewerOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: viewerUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: storeId,
      organizationMembershipId: viewerOrgMem.id,
      isDefault: true,
    });

    unauthorizedToken = await signAccessToken({
      userId: viewerUser.id,
      email: viewerUser.email,
      orgId: orgId,
    });

    // 4. Taxonomy: Gemstone, Material, Purity, Product, SKU
    const gemstone = await createGemstone({
      organizationId: orgId,
      code: "GEM_API_DIAMOND",
      name: "Graded Diamond",
      gemstoneType: GemstoneType.PRECIOUS,
      defaultMeasurementUnit: "CARAT",
      isActive: true,
    });
    gemstoneId = gemstone.id;

    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_GEM_API_RINGS",
      name: "Graded Rings",
      targetGender: "UNISEX",
      isActive: true,
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_GEM_API_GOLD",
      name: "White Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
      isActive: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_GEM_API_18K",
      name: "18 Karat White Gold",
      karatage: "18K",
      purityPercentage: 75.0,
      isActive: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      materialId: material.id,
      defaultPurityId: purity.id,
      productCode: "PRD_GEM_API_RING",
      name: "Diamond Halo Ring",
      isActive: true,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-GEM-API-001",
      variantName: "Diamond Halo Ring 18K",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 10.5,
      targetMetalWeightGrams: 9.7,
      isActive: true,
    });

    // 5. Procurement: Supplier, GRN, Shipment, ShipmentItem
    const supplier = await createSupplier({
      organizationId: orgId,
      code: "SUP_GEM_API_001",
      name: "Gems Direct Ltd",
      isActive: true,
    });

    const grn = await createGrn({
      organizationId: orgId,
      storeId: storeId,
      supplierId: supplier.id,
      createdByUserId: graderUser.id,
      grnNumber: "GRN-GEM-API-001",
    });

    const shipment = await createShipment({
      goodsReceiptNoteId: grn.id,
      shipmentNumber: "SHIP-GEM-API-001",
      carrierName: "Malca-Amit",
      trackingNumber: "MALCA-GEM-001",
      status: "RECEIVED",
      receivedByUserId: graderUser.id,
    });

    const item = await addShipmentItem(shipment.id, {
      productSkuId: sku.id,
      lineNumber: 1,
      supplierItemCode: "GEMS-101",
      declaredPieceCount: 1,
      declaredGrossWeightGrams: 10.5,
    });

    // 6. Quality Check Session & QC Item with Gross 10.5000g, Tare 0.5000g
    const qc = await createQualityCheck({
      shipmentId: shipment.id,
      storeId: storeId,
      inspectorUserId: graderUser.id,
    });
    qcId = qc.id;

    const qcItem = await createQualityCheckItem({
      qualityCheckId: qc.id,
      shipmentItemId: item.id,
      grossWeightGrams: 10.5,
      tareWeightGrams: 0.5,
      verifiedMaterialId: material.id,
      verifiedPurityId: purity.id,
    });
    qcItemId = qcItem.id;
  });

  afterAll(async () => {
    try {
      await query(
        "DELETE FROM item_gemstones WHERE quality_check_item_id IN (SELECT id FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%')));",
      );
      await query(
        "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%'));",
      );
      await query(
        "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%');",
      );
      await query(
        "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%');",
      );
      await query(
        "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-GEM-API-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-GEM-API-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_GEM_API_%';");
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-GEM-API-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_GEM_API_%';",
      );
      await query("DELETE FROM gemstones WHERE code LIKE 'GEM_API_%';");
      await query("DELETE FROM purities WHERE code LIKE 'PUR_GEM_API_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_GEM_API_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_GEM_API_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_GEM_API_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_GEM_API');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'gem_api_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'gem_api_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_GEM_API_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_GEM_API';");
    } finally {
      await closePool();
    }
  });

  it("Scenario 2: Unauthorized Gemstone Parcel Grading Rejection (403 Forbidden)", async () => {
    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/gemstones`)
      .set("Authorization", `Bearer ${unauthorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        gemstoneId,
        stoneType: StoneType.PRIMARY_SOLITAIRE,
        stoneCount: 1,
        caratWeight: 1.5,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    expect(res.body.status).toBe(403);
  });

  it("Scenario 1: Net Metal Weight Calculation Formula via Net = Gross - Tare - Stones", async () => {
    // Given item with gross_weight = 10.5000g, tare_weight = 0.5000g, mounted diamond 1.5000 ct (0.3000g)
    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/gemstones`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        gemstoneId,
        stoneType: StoneType.PRIMARY_SOLITAIRE,
        stoneCount: 1,
        caratWeight: 1.5,
        shape: "ROUND_BRILLIANT",
        cutGrade: "EXCELLENT",
        colorGrade: "D",
        clarityGrade: "VVS1",
        certificateAuthority: "GIA",
        certificateNumber: "GIA-2026-112233",
        settingVerified: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.gemstone).toBeDefined();
    expect(res.body.gemstone.stoneType).toBe("PRIMARY_SOLITAIRE");
    expect(res.body.gemstone.stoneCount).toBe(1);
    expect(res.body.gemstone.caratWeight).toBe(1.5);
    expect(res.body.gemstone.certificateAuthority).toBe("GIA");
    expect(res.body.gemstone.certificateNumber).toBe("GIA-2026-112233");

    // Formula Check:
    // Net = Gross (10.5000) - Tare (0.5000) - Stones (1.5000 ct * 0.2000 g/ct = 0.3000) = 9.7000g
    expect(res.body.qcItem).toBeDefined();
    expect(res.body.qcItem.grossWeightGrams).toBe(10.5);
    expect(res.body.qcItem.tareWeightGrams).toBe(0.5);
    expect(res.body.qcItem.stoneWeightCarats).toBe(1.5);
    expect(res.body.qcItem.netWeightGrams).toBe(9.7);
  });

  it("retrieves mounted gemstones for the inspected piece", async () => {
    const res = await request(app)
      .get(`/api/v1/qc/items/${qcItemId}/gemstones`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].caratWeight).toBe(1.5);
    expect(res.body[0].stoneType).toBe("PRIMARY_SOLITAIRE");
  });

  it("enforces solitaire single stone invariant: PRIMARY_SOLITAIRE requires stoneCount = 1", async () => {
    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/gemstones`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        gemstoneId,
        stoneType: StoneType.PRIMARY_SOLITAIRE,
        stoneCount: 3, // Invariant violation
        caratWeight: 3.0,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_VALIDATION");
  });

  it("returns 404 for non-existent QC item", async () => {
    const fakeId = "0192e301-0000-7000-8000-000000000099";
    const res = await request(app)
      .post(`/api/v1/qc/items/${fakeId}/gemstones`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        gemstoneId,
        stoneType: StoneType.PARCEL,
        stoneCount: 5,
        caratWeight: 0.8,
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ERR_NOT_FOUND");
  });

  it("enforces Sealed Session Immutability Gate (ERR_SESSION_SEALED, 422)", async () => {
    // 1. Seal QC session
    await updateQualityCheck(qcId, {
      status: QualityCheckStatus.APPROVED,
    });

    // 2. Attempt adding gemstone
    const res = await request(app)
      .post(`/api/v1/qc/items/${qcItemId}/gemstones`)
      .set("Authorization", `Bearer ${authorizedToken}`)
      .set("x-store-id", storeId)
      .send({
        gemstoneId,
        stoneType: StoneType.ACCENT_MELEE,
        stoneCount: 8,
        caratWeight: 0.4,
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_SESSION_SEALED");
  });
});
