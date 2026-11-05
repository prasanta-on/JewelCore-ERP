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
} from "@jewelcore/database";
import { signAccessToken } from "../src/modules/auth/authUtils.js";
import { StoreType } from "@jewelcore/shared";

describe("Physical Storage Hierarchy API Endpoints (FEAT-STOR-01 / INV-05, INV-17)", () => {
  const app = createApp();

  let testOrgId: string;
  let store001Id: string;
  let store002Id: string;

  let storeManagerToken: string;
  let salesAssociateToken: string;

  let createdVaultId: string;
  let createdLockerId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "STOR_API_ORG",
      name: "Storage API Enterprise Inc",
      currency: "CAD",
      isActive: true,
    });
    testOrgId = org.id;

    // 2. Stores
    const s1 = await createStore({
      organizationId: testOrgId,
      code: "STOR_API_001",
      name: "Flagship Vault Store 1",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    store001Id = s1.id;

    const s2 = await createStore({
      organizationId: testOrgId,
      code: "STOR_API_002",
      name: "Showroom Store 2",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    store002Id = s2.id;

    // 3. Store Manager User (has STORE_MANAGER role with storage:write permission)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "stor_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Store",
      lastName: "Manager",
      isActive: true,
    });

    const storeManagerRole = await getRoleByCode("STORE_MANAGER");
    if (storeManagerRole) {
      await assignRoleToUser(manager.id, storeManagerRole.id);
    }

    const managerOrgMem = await createOrganizationMembership({
      organizationId: testOrgId,
      userId: manager.id,
      isActive: true,
    });

    await createStoreMembership({
      organizationMembershipId: managerOrgMem.id,
      storeId: store001Id,
      isDefault: true,
      isActive: true,
    });

    storeManagerToken = await signAccessToken({
      userId: manager.id,
      orgId: testOrgId,
      email: manager.email,
    });

    // 4. Sales Associate User (has SALES_ASSOCIATE role WITHOUT storage:write)
    const sales = await createUser({
      organizationId: testOrgId,
      email: "stor_sales@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Sales",
      lastName: "Associate",
      isActive: true,
    });

    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    if (salesRole) {
      await assignRoleToUser(sales.id, salesRole.id);
    }

    const salesOrgMem = await createOrganizationMembership({
      organizationId: testOrgId,
      userId: sales.id,
      isActive: true,
    });

    await createStoreMembership({
      organizationMembershipId: salesOrgMem.id,
      storeId: store001Id,
      isDefault: true,
      isActive: true,
    });

    salesAssociateToken = await signAccessToken({
      userId: sales.id,
      orgId: testOrgId,
      email: sales.email,
    });
  });

  afterAll(async () => {
    await query("DELETE FROM compartments WHERE code LIKE 'API_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'API_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'API_%';");
    await query("DELETE FROM users WHERE email LIKE 'stor_%@jewelcore.local';");
    await query("DELETE FROM stores WHERE code LIKE 'STOR_API_%';");
    await query("DELETE FROM organizations WHERE code LIKE 'STOR_API_%';");
    await closePool();
  });

  // AC Scenario 1: Valid 3-Tier Hierarchy Creation
  it("Scenario 1: Store Manager creates Vault, Locker, and Compartment sharing store_id = STORE001", async () => {
    // 1. Create Vault
    const vaultRes = await request(app)
      .post("/api/v1/storage/vaults")
      .set("Authorization", `Bearer ${storeManagerToken}`)
      .set("x-store-id", store001Id)
      .send({
        code: "API_VLT_01",
        name: "Main Treasury Vault",
        vaultType: "MAIN_VAULT",
        accessLevelRequired: "STORE_MANAGER",
      });

    expect(vaultRes.status).toBe(201);
    expect(vaultRes.body.data.id).toBeDefined();
    expect(vaultRes.body.data.storeId).toBe(store001Id);
    expect(vaultRes.body.data.code).toBe("API_VLT_01");
    createdVaultId = vaultRes.body.data.id;

    // 2. Create Locker inside Vault
    const lockerRes = await request(app)
      .post("/api/v1/storage/lockers")
      .set("Authorization", `Bearer ${storeManagerToken}`)
      .set("x-store-id", store001Id)
      .send({
        vaultId: createdVaultId,
        storeId: store001Id,
        code: "API_LCK_01",
        name: "Inner Safe Locker 1",
        lockerNumber: "LCK-01",
        capacityRating: "100kg",
      });

    expect(lockerRes.status).toBe(201);
    expect(lockerRes.body.data.id).toBeDefined();
    expect(lockerRes.body.data.vaultId).toBe(createdVaultId);
    expect(lockerRes.body.data.storeId).toBe(store001Id);
    createdLockerId = lockerRes.body.data.id;

    // 3. Create Compartment inside Locker
    const compRes = await request(app)
      .post("/api/v1/storage/compartments")
      .set("Authorization", `Bearer ${storeManagerToken}`)
      .set("x-store-id", store001Id)
      .send({
        lockerId: createdLockerId,
        storeId: store001Id,
        code: "API_CMP_01",
        name: "Diamond Solitaire Tray 1",
        compartmentNumber: "TRAY-01",
        maxWeightCapacityGrams: 250.5,
        maxItemCapacity: 12,
      });

    expect(compRes.status).toBe(201);
    expect(compRes.body.data.id).toBeDefined();
    expect(compRes.body.data.lockerId).toBe(createdLockerId);
    expect(compRes.body.data.storeId).toBe(store001Id);
    expect(compRes.body.data.maxItemCapacity).toBe(12);
  });

  // AC Scenario 2: Mismatched Store Placement Rejection (INV-05)
  it("Scenario 2: rejects creating Locker inside Vault with mismatched store_id with 422 ERR_STORAGE_STORE_MISMATCH", async () => {
    const res = await request(app)
      .post("/api/v1/storage/lockers")
      .set("Authorization", `Bearer ${storeManagerToken}`)
      .set("x-store-id", store001Id)
      .send({
        vaultId: createdVaultId, // Belongs to STORE001
        storeId: store002Id,    // Mismatched STORE002!
        code: "API_LCK_MISMATCH",
        name: "Mismatched Locker",
        lockerNumber: "LCK-ERR",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_STORAGE_STORE_MISMATCH");
    expect(res.body.title).toBe("Unprocessable Entity");
  });

  it("rejects creating Compartment inside Locker with mismatched store_id with 422 ERR_STORAGE_STORE_MISMATCH (INV-05)", async () => {
    const res = await request(app)
      .post("/api/v1/storage/compartments")
      .set("Authorization", `Bearer ${storeManagerToken}`)
      .set("x-store-id", store001Id)
      .send({
        lockerId: createdLockerId, // Belongs to STORE001
        storeId: store002Id,      // Mismatched STORE002!
        code: "API_CMP_MISMATCH",
        name: "Mismatched Compartment",
        compartmentNumber: "CMP-ERR",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_STORAGE_STORE_MISMATCH");
  });

  // AC Scenario 3: Unauthorized Storage Hierarchy Creation Rejection
  it("Scenario 3: rejects user without storage:write permission with 403 ERR_INSUFFICIENT_PERMISSIONS", async () => {
    const res = await request(app)
      .post("/api/v1/storage/vaults")
      .set("Authorization", `Bearer ${salesAssociateToken}`)
      .set("x-store-id", store001Id)
      .send({
        code: "API_VLT_UNAUTH",
        name: "Unauthorized Vault",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    expect(res.body.title).toBe("Forbidden");
  });

  // Cross-Store Isolation (INV-11)
  it("rejects accessing storage hierarchy for unassigned store with 403 ERR_STORE_ACCESS_DENIED (INV-11)", async () => {
    const res = await request(app)
      .get("/api/v1/storage/hierarchy")
      .set("Authorization", `Bearer ${storeManagerToken}`)
      .set("x-store-id", store002Id); // User has no membership in STORE002

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
  });

  // Hierarchy Tree Query
  it("retrieves the complete 3-tier storage hierarchy tree for the store", async () => {
    const res = await request(app)
      .get("/api/v1/storage/hierarchy")
      .set("Authorization", `Bearer ${storeManagerToken}`)
      .set("x-store-id", store001Id);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const vault = res.body.data.find((v: any) => v.id === createdVaultId);
    expect(vault).toBeDefined();
    expect(vault.lockers.length).toBeGreaterThan(0);

    const locker = vault.lockers.find((l: any) => l.id === createdLockerId);
    expect(locker).toBeDefined();
    expect(locker.compartments.length).toBeGreaterThan(0);

    const comp = locker.compartments.find((c: any) => c.code === "API_CMP_01");
    expect(comp).toBeDefined();
    expect(comp.maxItemCapacity).toBe(12);
  });
});
