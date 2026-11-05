import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getPool,
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createStore,
  createVault,
  getVaultById,
  getVaultByCode,
  listVaultsByStore,
  createLocker,
  getLockerById,
  listLockersByVault,
  createCompartment,
  getCompartmentById,
  listCompartmentsByLocker,
  getStorageHierarchy,
} from "../src/index.js";
import { StoreType, UnprocessableEntityError } from "@jewelcore/shared";

describe("Storage Hierarchy Repository Integration Tests (INV-05, INV-17)", () => {
  let testOrgId: string;
  let storeAId: string;
  let storeBId: string;

  beforeAll(async () => {
    await runAllMigrations();

    const org = await createOrganization({
      code: "STOR_TEST_ORG",
      name: "Storage Test Organization",
      currency: "CAD",
      isActive: true,
    });
    testOrgId = org.id;

    const storeA = await createStore({
      organizationId: testOrgId,
      code: "STOR_STORE_A",
      name: "Storage Branch A",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeAId = storeA.id;

    const storeB = await createStore({
      organizationId: testOrgId,
      code: "STOR_STORE_B",
      name: "Storage Branch B",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeBId = storeB.id;
  });

  afterAll(async () => {
    await query("DELETE FROM compartments WHERE code LIKE 'STOR_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'STOR_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'STOR_%';");
    await query("DELETE FROM stores WHERE code LIKE 'STOR_%';");
    await query("DELETE FROM organizations WHERE code LIKE 'STOR_%';");
    await closePool();
  });

  it("creates a complete 3-tier storage hierarchy (Vault -> Locker -> Compartment)", async () => {
    // 1. Vault
    const vault = await createVault({
      storeId: storeAId,
      code: "STOR_VLT_01",
      name: "Main Treasury Vault",
      vaultType: "MAIN_VAULT",
      accessLevelRequired: "STORE_MANAGER",
    });

    expect(vault.id).toBeDefined();
    expect(vault.storeId).toBe(storeAId);
    expect(vault.code).toBe("STOR_VLT_01");

    // 2. Locker inside Vault
    const locker = await createLocker({
      vaultId: vault.id,
      storeId: storeAId,
      code: "STOR_LCK_01",
      name: "High Security Safe 1",
      lockerNumber: "SAFE-A1",
      capacityRating: "50kg",
    });

    expect(locker.id).toBeDefined();
    expect(locker.vaultId).toBe(vault.id);
    expect(locker.storeId).toBe(storeAId);

    // 3. Compartment inside Locker
    const comp = await createCompartment({
      lockerId: locker.id,
      storeId: storeAId,
      code: "STOR_CMP_01",
      name: "Diamond Ring Tray 1",
      compartmentNumber: "TRAY-01",
      maxWeightCapacityGrams: 500.0,
      maxItemCapacity: 24,
    });

    expect(comp.id).toBeDefined();
    expect(comp.lockerId).toBe(locker.id);
    expect(comp.storeId).toBe(storeAId);
    expect(comp.maxItemCapacity).toBe(24);

    // Verify retrieval
    const fetchedVault = await getVaultById(vault.id);
    expect(fetchedVault).not.toBeNull();

    const fetchedLocker = await getLockerById(locker.id);
    expect(fetchedLocker).not.toBeNull();

    const fetchedComp = await getCompartmentById(comp.id);
    expect(fetchedComp).not.toBeNull();
  });

  it("enforces INV-05: rejects creating a locker inside a vault when store_id is mismatched", async () => {
    // Create a vault in Store A
    const vaultA = await createVault({
      storeId: storeAId,
      code: "STOR_VLT_INV05",
      name: "Store A Vault",
    });

    // Attempt to create a locker inside Vault A but with Store B's ID
    await expect(
      createLocker({
        vaultId: vaultA.id,
        storeId: storeBId, // Mismatched store!
        code: "STOR_LCK_ERR",
        name: "Mismatched Safe",
        lockerNumber: "SAFE-MISMATCH",
      }),
    ).rejects.toThrowError(UnprocessableEntityError);

    try {
      await createLocker({
        vaultId: vaultA.id,
        storeId: storeBId,
        code: "STOR_LCK_ERR",
        name: "Mismatched Safe",
        lockerNumber: "SAFE-MISMATCH",
      });
    } catch (err: any) {
      expect(err.code).toBe("ERR_STORAGE_STORE_MISMATCH");
    }
  });

  it("enforces INV-05: rejects creating a compartment inside a locker when store_id is mismatched", async () => {
    // Create vault and locker in Store A
    const vault = await createVault({
      storeId: storeAId,
      code: "STOR_VLT_CMP_INV",
      name: "Vault for Comp Test",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId: storeAId,
      code: "STOR_LCK_CMP_INV",
      name: "Locker for Comp Test",
      lockerNumber: "SAFE-CMP",
    });

    // Attempt to create compartment with Store B's ID inside Store A's locker
    await expect(
      createCompartment({
        lockerId: locker.id,
        storeId: storeBId, // Mismatched store!
        code: "STOR_CMP_ERR",
        name: "Mismatched Tray",
        compartmentNumber: "TRAY-MISMATCH",
      }),
    ).rejects.toThrowError(UnprocessableEntityError);

    try {
      await createCompartment({
        lockerId: locker.id,
        storeId: storeBId,
        code: "STOR_CMP_ERR",
        name: "Mismatched Tray",
        compartmentNumber: "TRAY-MISMATCH",
      });
    } catch (err: any) {
      expect(err.code).toBe("ERR_STORAGE_STORE_MISMATCH");
    }
  });

  it("retrieves the full 3-tier storage hierarchy tree for a store branch", async () => {
    const hierarchy = await getStorageHierarchy(storeAId);
    expect(hierarchy.length).toBeGreaterThan(0);

    const mainVault = hierarchy.find((v) => v.code === "STOR_VLT_01");
    expect(mainVault).toBeDefined();
    expect(mainVault?.lockers.length).toBeGreaterThan(0);

    const safe1 = mainVault?.lockers.find((l) => l.code === "STOR_LCK_01");
    expect(safe1).toBeDefined();
    expect(safe1?.compartments.length).toBeGreaterThan(0);

    const tray1 = safe1?.compartments.find((c) => c.code === "STOR_CMP_01");
    expect(tray1).toBeDefined();
    expect(tray1?.maxItemCapacity).toBe(24);
  });
});
