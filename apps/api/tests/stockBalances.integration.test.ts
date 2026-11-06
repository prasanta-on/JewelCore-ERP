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
  createVault,
  createLocker,
  createCompartment,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Bulk Quantity-Batch Stock Balances API (FEAT-INV-02 / BIZ-Q02, Entity 29)", () => {
  const app = createApp();

  let orgId: string;
  let storeId: string;
  let altStoreId: string;
  let batchSkuId: string;
  let serializedSkuId: string;
  let compartmentId: string;
  let altCompartmentId: string;

  let managerToken: string;
  let managerUserId: string;
  let viewerToken: string;
  let viewerUserId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_API');",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_API');",
    );
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-BAL-API-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_BAL_API_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_BAL_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_BAL_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_BAL_API_%';");
    await query("DELETE FROM compartments WHERE code LIKE 'CMP_BAL_API_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'LCK_BAL_API_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'VLT_BAL_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BAL_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_API');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'bal_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'bal_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_BAL_API_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_BAL_API';");

    // 1. Organization & Stores
    const org = await createOrganization({
      code: "ORG_BAL_API",
      name: "Stock Balance API Test Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_BAL_API_001",
      name: "Primary Central Store",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_BAL_API_002",
      name: "Secondary Branch Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    altStoreId = altStore.id;

    // 2. Storage hierarchy
    const vault = await createVault({
      storeId,
      code: "VLT_BAL_API_01",
      name: "Components Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_BAL_API_01",
      name: "Findings Locker A",
      lockerNumber: "LCK-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_BAL_API_01",
      name: "Earring Backs Tray 1",
      compartmentNumber: "CMP-01",
    });
    compartmentId = comp.id;

    const altVault = await createVault({
      storeId: altStoreId,
      code: "VLT_BAL_API_02",
      name: "Alt Components Vault",
      vaultType: "MAIN_VAULT",
    });

    const altLocker = await createLocker({
      vaultId: altVault.id,
      storeId: altStoreId,
      code: "LCK_BAL_API_02",
      name: "Alt Findings Locker B",
      lockerNumber: "LCK-02",
    });

    const altComp = await createCompartment({
      lockerId: altLocker.id,
      storeId: altStoreId,
      code: "CMP_BAL_API_02",
      name: "Alt Tray 2",
      compartmentNumber: "CMP-02",
    });
    altCompartmentId = altComp.id;

    // 3. Manager User (STORE_MANAGER with inventory:write, inventory:view)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "bal_api_manager@jewelcore.local",
      firstName: "Store",
      lastName: "Manager",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    managerUserId = managerUser.id;

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(managerUser.id, managerRole.id);
    }
    const mgrOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: managerUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: storeId,
      organizationMembershipId: mgrOrgMem.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: altStoreId,
      organizationMembershipId: mgrOrgMem.id,
      isDefault: false,
    });

    managerToken = await signAccessToken({
      userId: managerUser.id,
      email: managerUser.email,
      orgId: orgId,
    });

    // 4. Viewer User (SALES_ASSOCIATE with inventory:view but NO inventory:write)
    const viewerUser = await createUser({
      organizationId: orgId,
      email: "bal_api_viewer@jewelcore.local",
      firstName: "Sales",
      lastName: "Associate",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    viewerUserId = viewerUser.id;

    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    if (salesRole) {
      await assignRoleToUser(viewerUser.id, salesRole.id);
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

    viewerToken = await signAccessToken({
      userId: viewerUser.id,
      email: viewerUser.email,
      orgId: orgId,
    });

    // 5. Taxonomy & SKUs
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_BAL_API_FINDINGS",
      name: "Findings & Backings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_BAL_API_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_BAL_API_18K",
      name: "18 Karat Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    // Batch SKU
    const batchProduct = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_BAL_API_EARPOSTS",
      name: "18K Gold Earring Friction Posts",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "QUANTITY_BATCH",
    });

    const batchSku = await createProductSku({
      organizationId: orgId,
      productId: batchProduct.id,
      skuCode: "SKU-BAL-API-BATCH-001",
      name: "18K Gold Earring Friction Posts (Pack of 50)",
      variantName: "50-Pack",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 5.0,
      targetMetalWeightGrams: 5.0,
      trackingType: "QUANTITY_BATCH",
    });
    batchSkuId = batchSku.id;

    // Serialized SKU
    const serializedProduct = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_BAL_API_NECKLACES",
      name: "18K Gold Chain Necklace",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "SERIALIZED",
    });

    const serializedSku = await createProductSku({
      organizationId: orgId,
      productId: serializedProduct.id,
      skuCode: "SKU-BAL-API-SER-001",
      name: "18K Gold Chain Necklace - 18 inch",
      variantName: "18 inch",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 12.0,
      targetMetalWeightGrams: 12.0,
      trackingType: "SERIALIZED",
    });
    serializedSkuId = serializedSku.id;
  });

  afterAll(async () => {
    try {
      await query(
        "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_API');",
      );
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-BAL-API-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_BAL_API_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_BAL_API_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_BAL_API_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_BAL_API_%';");
      await query("DELETE FROM compartments WHERE code LIKE 'CMP_BAL_API_%';");
      await query("DELETE FROM lockers WHERE code LIKE 'LCK_BAL_API_%';");
      await query("DELETE FROM vaults WHERE code LIKE 'VLT_BAL_API_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BAL_API_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_API');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'bal_api_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'bal_api_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_BAL_API_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_BAL_API';");
    } finally {
      await closePool();
    }
  });

  let createdBalanceId: string;

  describe("POST /api/v1/inventory/balances (Create or Upsert Stock Balance)", () => {
    it("successfully creates a bulk stock balance and calculates quantity_available (Scenario 1 & 2)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          productSkuId: batchSkuId,
          compartmentId,
          quantityOnHand: 100,
          quantityReserved: 30,
          totalWeightGrams: 10.0,
          averageCostUnitCad: 3.5,
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.storeId).toBe(storeId);
      expect(res.body.productSkuId).toBe(batchSkuId);
      expect(res.body.compartmentId).toBe(compartmentId);
      expect(res.body.quantityOnHand).toBe(100);
      expect(res.body.quantityReserved).toBe(30);
      expect(res.body.quantityAvailable).toBe(70); // 100 - 30
      expect(Number(res.body.totalWeightGrams)).toBe(10.0);
      expect(Number(res.body.averageCostUnitCad)).toBe(3.5);
      expect(res.body.version).toBe(1);

      createdBalanceId = res.body.id;
    });

    it("updates existing stock balance via upsert on (store_id, product_sku_id, compartment_id)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          productSkuId: batchSkuId,
          compartmentId,
          quantityOnHand: 150,
          quantityReserved: 40,
          totalWeightGrams: 15.0,
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdBalanceId);
      expect(res.body.quantityOnHand).toBe(150);
      expect(res.body.quantityReserved).toBe(40);
      expect(res.body.quantityAvailable).toBe(110); // 150 - 40
      expect(res.body.version).toBe(2);
    });

    it("rejects request when quantityReserved exceeds quantityOnHand with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          productSkuId: batchSkuId,
          compartmentId,
          quantityOnHand: 20,
          quantityReserved: 50,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
    });

    it("rejects stock balance creation for SERIALIZED SKU tracking type with 422 (INV-06)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          productSkuId: serializedSkuId,
          compartmentId,
          quantityOnHand: 10,
          quantityReserved: 0,
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_INVALID_TRACKING_TYPE");
      expect(res.body.detail).toContain("QUANTITY_BATCH");
    });

    it("rejects compartment store mismatch with 422 (INV-11)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          productSkuId: batchSkuId,
          compartmentId: altCompartmentId, // In altStoreId
          quantityOnHand: 10,
          quantityReserved: 0,
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("ERR_COMPARTMENT_STORE_MISMATCH");
    });

    it("rejects cross-store request when payload storeId contradicts store context header with 403 (INV-11)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          storeId: altStoreId, // Contradicts X-Store-Id header
          productSkuId: batchSkuId,
          compartmentId,
          quantityOnHand: 10,
          quantityReserved: 0,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
    });

    it("rejects user lacking inventory:write permission with 403 Forbidden (Scenario 3)", async () => {
      const res = await request(app)
        .post("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          productSkuId: batchSkuId,
          compartmentId,
          quantityOnHand: 50,
          quantityReserved: 10,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    });

    it("rejects unauthenticated request with 401 Unauthorized", async () => {
      const res = await request(app).post("/api/v1/inventory/balances").send({
        productSkuId: batchSkuId,
        compartmentId,
        quantityOnHand: 50,
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/inventory/balances/:id (Lookup by ID)", () => {
    it("retrieves stock balance by ID for authorized viewer (inventory:view)", async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/balances/${createdBalanceId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdBalanceId);
      expect(res.body.quantityOnHand).toBe(150);
      expect(res.body.quantityReserved).toBe(40);
      expect(res.body.quantityAvailable).toBe(110);
    });

    it("returns 404 Not Found for non-existent stock balance UUID", async () => {
      const nonExistentId = "0192e301-0000-7000-8000-000000000777";
      const res = await request(app)
        .get(`/api/v1/inventory/balances/${nonExistentId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });

    it("returns 403 Forbidden when requesting under a different store context (INV-11)", async () => {
      const res = await request(app)
        .get(`/api/v1/inventory/balances/${createdBalanceId}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", altStoreId); // Manager is member of altStore, but balance is in storeId

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
    });
  });

  describe("PATCH /api/v1/inventory/balances/:id (Partial Update with OCC)", () => {
    it("updates quantities with matching expectedVersion", async () => {
      const current = await request(app)
        .get(`/api/v1/inventory/balances/${createdBalanceId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId);

      const currentVersion = current.body.version;

      const res = await request(app)
        .patch(`/api/v1/inventory/balances/${createdBalanceId}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          quantityOnHand: 180,
          quantityReserved: 50,
          expectedVersion: currentVersion,
        });

      expect(res.status).toBe(200);
      expect(res.body.quantityOnHand).toBe(180);
      expect(res.body.quantityReserved).toBe(50);
      expect(res.body.quantityAvailable).toBe(130); // 180 - 50
      expect(res.body.version).toBe(currentVersion + 1);
    });

    it("rejects stale expectedVersion with 409 Conflict (ERR_OCC_VERSION_MISMATCH)", async () => {
      const staleVersion = 1; // Current version is >= 3

      const res = await request(app)
        .patch(`/api/v1/inventory/balances/${createdBalanceId}`)
        .set("Authorization", `Bearer ${managerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          quantityOnHand: 200,
          expectedVersion: staleVersion,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ERR_OCC_VERSION_MISMATCH");
    });

    it("rejects unauthorized user without inventory:write with 403 Forbidden", async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/balances/${createdBalanceId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId)
        .send({
          quantityOnHand: 190,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    });
  });

  describe("GET /api/v1/inventory/balances (List & Query Stock Balances)", () => {
    it("lists stock balances for active store", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/balances")
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      for (const item of res.body) {
        expect(item.storeId).toBe(storeId);
      }
    });

    it("filters stock balances by productSkuId", async () => {
      const res = await request(app)
        .get("/api/v1/inventory/balances")
        .query({
          productSkuId: batchSkuId,
        })
        .set("Authorization", `Bearer ${viewerToken}`)
        .set("X-Store-Id", storeId);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      for (const item of res.body) {
        expect(item.productSkuId).toBe(batchSkuId);
      }
    });
  });
});
