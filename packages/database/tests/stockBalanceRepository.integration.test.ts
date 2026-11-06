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
  createVault,
  createLocker,
  createCompartment,
  upsertStockBalance,
  getStockBalanceById,
  getStockBalanceBySkuAndCompartment,
  updateStockBalance,
  listStockBalances,
} from "../src/index.js";
import {
  StoreType,
  UnprocessableEntityError,
  ConflictError,
  BadRequestError,
} from "@jewelcore/shared";

describe("Bulk Quantity-Batch Stock Balances Repository (FEAT-INV-02 / BIZ-Q02, Entity 29)", () => {
  let orgId: string;
  let storeId: string;
  let altStoreId: string;
  let userId: string;
  let batchSkuId: string;
  let serializedSkuId: string;
  let compartmentId: string;
  let altCompartmentId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_REPO');",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_REPO');",
    );
    await query(
      "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-BAL-REPO-%';",
    );
    await query(
      "DELETE FROM products WHERE product_code LIKE 'PRD_BAL_REPO_%';",
    );
    await query("DELETE FROM purities WHERE code LIKE 'PUR_BAL_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_BAL_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_BAL_REPO_%';");
    await query("DELETE FROM compartments WHERE code LIKE 'CMP_BAL_REPO_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'LCK_BAL_REPO_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'VLT_BAL_REPO_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BAL_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_REPO');",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'bal_repo_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'bal_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_BAL_REPO_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_BAL_REPO';");

    // 1. Organization & Stores
    const org = await createOrganization({
      code: "ORG_BAL_REPO",
      name: "Stock Balance Repository Enterprise",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_BAL_REPO_001",
      name: "Primary Warehouse Store",
      storeType: StoreType.CENTRAL_WAREHOUSE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: orgId,
      code: "STORE_BAL_REPO_002",
      name: "Secondary Branch Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    altStoreId = altStore.id;

    // 2. User
    const user = await createUser({
      organizationId: orgId,
      email: "bal_repo_controller@jewelcore.local",
      firstName: "Inventory",
      lastName: "Controller",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    userId = user.id;

    // 3. Storage Hierarchy
    const vault = await createVault({
      storeId,
      code: "VLT_BAL_REPO_01",
      name: "Findings Storage Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId,
      code: "LCK_BAL_REPO_01",
      name: "Findings Locker 1",
      lockerNumber: "LCK-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId,
      code: "CMP_BAL_REPO_01",
      name: "Gold Findings Bin A",
      compartmentNumber: "CMP-01",
    });
    compartmentId = comp.id;

    const altVault = await createVault({
      storeId: altStoreId,
      code: "VLT_BAL_REPO_02",
      name: "Alt Vault",
      vaultType: "MAIN_VAULT",
    });

    const altLocker = await createLocker({
      vaultId: altVault.id,
      storeId: altStoreId,
      code: "LCK_BAL_REPO_02",
      name: "Alt Locker 2",
      lockerNumber: "LCK-02",
    });

    const altComp = await createCompartment({
      lockerId: altLocker.id,
      storeId: altStoreId,
      code: "CMP_BAL_REPO_02",
      name: "Alt Bin B",
      compartmentNumber: "CMP-02",
    });
    altCompartmentId = altComp.id;

    // 4. Taxonomy & SKUs
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_BAL_REPO_FINDINGS",
      name: "Jewellery Findings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_BAL_REPO_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_BAL_REPO_14K",
      name: "14 Karat Gold",
      purityPercentage: 58.5,
      purityRatio: 0.585,
      isHallmarkPurity: true,
    });

    // Batch SKU (QUANTITY_BATCH)
    const batchProduct = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_BAL_REPO_BACKINGS",
      name: "14K Gold Butterfly Earring Backings",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "QUANTITY_BATCH",
    });

    const batchSku = await createProductSku({
      organizationId: orgId,
      productId: batchProduct.id,
      skuCode: "SKU-BAL-REPO-BATCH-001",
      name: "14K Gold Butterfly Backs (Pack of 100)",
      variantName: "100-Pack",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 15.0,
      targetMetalWeightGrams: 15.0,
      trackingType: "QUANTITY_BATCH",
    });
    batchSkuId = batchSku.id;

    // Serialized SKU (SERIALIZED)
    const serializedProduct = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_BAL_REPO_RINGS",
      name: "14K Gold Solitaire Ring",
      materialId: material.id,
      defaultPurityId: purity.id,
      trackingType: "SERIALIZED",
    });

    const serializedSku = await createProductSku({
      organizationId: orgId,
      productId: serializedProduct.id,
      skuCode: "SKU-BAL-REPO-SER-001",
      name: "14K Gold Solitaire Ring - Size 7",
      variantName: "Size 7",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 4.5,
      targetMetalWeightGrams: 4.5,
      trackingType: "SERIALIZED",
    });
    serializedSkuId = serializedSku.id;
  });

  afterAll(async () => {
    try {
      await query(
        "DELETE FROM inventory_stock_balances WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_REPO');",
      );
      await query(
        "DELETE FROM product_skus WHERE sku_code LIKE 'SKU-BAL-REPO-%';",
      );
      await query(
        "DELETE FROM products WHERE product_code LIKE 'PRD_BAL_REPO_%';",
      );
      await query("DELETE FROM purities WHERE code LIKE 'PUR_BAL_REPO_%';");
      await query("DELETE FROM materials WHERE code LIKE 'MAT_BAL_REPO_%';");
      await query("DELETE FROM categories WHERE code LIKE 'CAT_BAL_REPO_%';");
      await query("DELETE FROM compartments WHERE code LIKE 'CMP_BAL_REPO_%';");
      await query("DELETE FROM lockers WHERE code LIKE 'LCK_BAL_REPO_%';");
      await query("DELETE FROM vaults WHERE code LIKE 'VLT_BAL_REPO_%';");
      await query(
        "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_BAL_REPO_%');",
      );
      await query(
        "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_BAL_REPO');",
      );
      await query(
        "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'bal_repo_%@jewelcore.local');",
      );
      await query(
        "DELETE FROM users WHERE email LIKE 'bal_repo_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code LIKE 'STORE_BAL_REPO_%';");
      await query("DELETE FROM organizations WHERE code = 'ORG_BAL_REPO';");
    } finally {
      await closePool();
    }
  });

  let createdBalanceId: string;

  it("Scenario 1: creates a new bulk stock balance for a QUANTITY_BATCH SKU", async () => {
    const balance = await upsertStockBalance(
      {
        storeId,
        productSkuId: batchSkuId,
        compartmentId,
        quantityOnHand: 100,
        quantityReserved: 30,
        totalWeightGrams: 15.0,
        averageCostUnitCad: 2.5,
      },
      { userId },
    );

    expect(balance.id).toBeDefined();
    expect(balance.organizationId).toBe(orgId);
    expect(balance.storeId).toBe(storeId);
    expect(balance.productSkuId).toBe(batchSkuId);
    expect(balance.compartmentId).toBe(compartmentId);
    expect(balance.quantityOnHand).toBe(100);
    expect(balance.quantityReserved).toBe(30);
    expect(balance.quantityAvailable).toBe(70); // 100 - 30
    expect(balance.totalWeightGrams).toBe(15.0);
    expect(balance.averageCostUnitCad).toBe(2.5);
    expect(balance.version).toBe(1);

    createdBalanceId = balance.id;
  });

  it("Scenario 2: updates existing stock balance via upsert on (store_id, product_sku_id, compartment_id)", async () => {
    const updated = await upsertStockBalance(
      {
        storeId,
        productSkuId: batchSkuId,
        compartmentId,
        quantityOnHand: 150,
        quantityReserved: 50,
        totalWeightGrams: 22.5,
      },
      { userId },
    );

    expect(updated.id).toBe(createdBalanceId);
    expect(updated.quantityOnHand).toBe(150);
    expect(updated.quantityReserved).toBe(50);
    expect(updated.quantityAvailable).toBe(100); // 150 - 50
    expect(updated.totalWeightGrams).toBe(22.5);
    expect(updated.version).toBe(2);
  });

  it("Scenario 3: enforces distinct non-negative constraints and quantity_on_hand >= quantity_reserved", async () => {
    // Negative quantityOnHand rejection
    await expect(
      upsertStockBalance(
        {
          storeId,
          productSkuId: batchSkuId,
          compartmentId,
          quantityOnHand: -10,
          quantityReserved: 0,
        },
        { userId },
      ),
    ).rejects.toThrow(BadRequestError);

    // quantityReserved > quantityOnHand rejection
    await expect(
      upsertStockBalance(
        {
          storeId,
          productSkuId: batchSkuId,
          compartmentId,
          quantityOnHand: 20,
          quantityReserved: 50,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);

    // Direct SQL check constraint validation: chk_stock_balances_qty_available
    await expect(
      query(
        `
        INSERT INTO inventory_stock_balances (
          id, organization_id, store_id, product_sku_id, compartment_id,
          quantity_on_hand, quantity_reserved, total_weight_grams
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, 10, 25, 5.0
        )
        `,
        [orgId, altStoreId, batchSkuId, altCompartmentId],
      ),
    ).rejects.toThrow(/chk_stock_balances_qty_available/);
  });

  it("Scenario 4: rejects stock balance for SERIALIZED SKU tracking type (INV-06)", async () => {
    await expect(
      upsertStockBalance(
        {
          storeId,
          productSkuId: serializedSkuId,
          compartmentId,
          quantityOnHand: 5,
          quantityReserved: 0,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 5: rejects compartment belonging to a different store (INV-11)", async () => {
    await expect(
      upsertStockBalance(
        {
          storeId,
          productSkuId: batchSkuId,
          compartmentId: altCompartmentId, // Compartment in altStoreId
          quantityOnHand: 10,
          quantityReserved: 0,
        },
        { userId },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 6: updates stock balance with Optimistic Concurrency Control (OCC)", async () => {
    const current = await getStockBalanceById(createdBalanceId);
    expect(current).not.null;
    const currentVersion = current!.version;

    // Successful update with matching expectedVersion
    const updated = await updateStockBalance(
      createdBalanceId,
      {
        quantityOnHand: 200,
        quantityReserved: 60,
        expectedVersion: currentVersion,
      },
      { userId },
    );

    expect(updated.quantityOnHand).toBe(200);
    expect(updated.quantityReserved).toBe(60);
    expect(updated.quantityAvailable).toBe(140);
    expect(updated.version).toBe(currentVersion + 1);

    // Stale expectedVersion rejected with 409 Conflict
    await expect(
      updateStockBalance(
        createdBalanceId,
        {
          quantityOnHand: 250,
          expectedVersion: currentVersion, // Stale version
        },
        { userId },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("Scenario 7: retrieves stock balance by ID and by composite key", async () => {
    const byId = await getStockBalanceById(createdBalanceId);
    expect(byId).not.null;
    expect(byId!.id).toBe(createdBalanceId);

    const byKey = await getStockBalanceBySkuAndCompartment(
      storeId,
      batchSkuId,
      compartmentId,
    );
    expect(byKey).not.null;
    expect(byKey!.id).toBe(createdBalanceId);

    // Non-existent key returns null
    const nonExistent = await getStockBalanceBySkuAndCompartment(
      altStoreId,
      batchSkuId,
      compartmentId,
    );
    expect(nonExistent).toBeNull();
  });

  it("Scenario 8: lists stock balances with filtering by store, sku, compartment", async () => {
    const allStoreBalances = await listStockBalances({
      storeId,
      limit: 10,
      offset: 0,
    });

    expect(allStoreBalances).toBeInstanceOf(Array);
    expect(allStoreBalances.length).toBeGreaterThanOrEqual(1);
    expect(allStoreBalances[0].storeId).toBe(storeId);

    const filteredBySku = await listStockBalances({
      storeId,
      productSkuId: batchSkuId,
      limit: 10,
      offset: 0,
    });

    expect(filteredBySku.length).toBeGreaterThanOrEqual(1);
    expect(filteredBySku[0].productSkuId).toBe(batchSkuId);
  });
});
