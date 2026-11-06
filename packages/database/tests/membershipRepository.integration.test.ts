import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getPool,
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createStore,
  createUser,
  createOrganizationMembership,
  getOrganizationMembership,
  createStoreMembership,
  getUserStoreMembership,
  getUserDefaultStoreMembership,
  getUserAccessibleStores,
  assignRoleToStoreMembership,
  getStoreMembershipRoles,
  getRoleByCode,
} from "../src/index.js";
import { StoreType } from "@jewelcore/shared";

describe("IAM Memberships Repository Integration Tests (INV-11)", () => {
  let testOrgId: string;
  let storeAId: string;
  let storeBId: string;
  let storeCId: string;
  let testUserId: string;
  let orgMembershipId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Create test Organization
    const org = await createOrganization({
      code: "MBR_TEST_ORG",
      name: "Membership Test Enterprise",
      currency: "CAD",
      isActive: true,
    });
    testOrgId = org.id;

    // 2. Create test Stores
    const storeA = await createStore({
      organizationId: testOrgId,
      code: "MBR_STORE_A",
      name: "Downtown Flagship",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeAId = storeA.id;

    const storeB = await createStore({
      organizationId: testOrgId,
      code: "MBR_STORE_B",
      name: "Airport Showroom",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    storeBId = storeB.id;

    const storeC = await createStore({
      organizationId: testOrgId,
      code: "MBR_STORE_C",
      name: "Central Vault",
      storeType: StoreType.VAULT_FACILITY,
      isActive: true,
    });
    storeCId = storeC.id;

    // 3. Create test User
    const user = await createUser({
      organizationId: testOrgId,
      email: "membership_staff@jewelcore.local",
      passwordHash: "argon2id_mock_hash",
      firstName: "Membership",
      lastName: "Staff",
      isActive: true,
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up in cascade order
    await query(
      "DELETE FROM users WHERE email LIKE 'membership_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'MBR_%';");
    await query("DELETE FROM organizations WHERE code LIKE 'MBR_%';");
    await closePool();
  });

  it("creates and retrieves an organization membership", async () => {
    const orgMembership = await createOrganizationMembership({
      organizationId: testOrgId,
      userId: testUserId,
      isActive: true,
    });

    expect(orgMembership.id).toBeDefined();
    expect(orgMembership.organizationId).toBe(testOrgId);
    expect(orgMembership.userId).toBe(testUserId);
    expect(orgMembership.isActive).toBe(true);
    orgMembershipId = orgMembership.id;

    const fetched = await getOrganizationMembership(testOrgId, testUserId);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(orgMembership.id);
  });

  it("creates store memberships and validates active user store membership", async () => {
    // Assign to Store A as default store
    const storeMemA = await createStoreMembership({
      organizationMembershipId: orgMembershipId,
      storeId: storeAId,
      isDefault: true,
      isActive: true,
    });

    expect(storeMemA.id).toBeDefined();
    expect(storeMemA.isDefault).toBe(true);

    // Assign to Store B as non-default store
    const storeMemB = await createStoreMembership({
      organizationMembershipId: orgMembershipId,
      storeId: storeBId,
      isDefault: false,
      isActive: true,
    });

    expect(storeMemB.id).toBeDefined();
    expect(storeMemB.isDefault).toBe(false);

    // Validate active access to Store A
    const accessA = await getUserStoreMembership(testUserId, storeAId);
    expect(accessA).not.toBeNull();
    expect(accessA?.storeId).toBe(storeAId);
    expect(accessA?.isDefault).toBe(true);
    expect(accessA?.organizationId).toBe(testOrgId);

    // Validate active access to Store B
    const accessB = await getUserStoreMembership(testUserId, storeBId);
    expect(accessB).not.toBeNull();
    expect(accessB?.storeId).toBe(storeBId);
    expect(accessB?.isDefault).toBe(false);

    // Validate NO access to Store C
    const accessC = await getUserStoreMembership(testUserId, storeCId);
    expect(accessC).toBeNull();
  });

  it("resolves the default store membership correctly", async () => {
    const defaultStore = await getUserDefaultStoreMembership(
      testUserId,
      testOrgId,
    );
    expect(defaultStore).not.toBeNull();
    expect(defaultStore?.storeId).toBe(storeAId);
    expect(defaultStore?.isDefault).toBe(true);
  });

  it("lists all accessible active stores ordered with default store first", async () => {
    const stores = await getUserAccessibleStores(testUserId);
    expect(stores.length).toBe(2);

    // First store in list should be the default one
    expect(stores[0]?.storeId).toBe(storeAId);
    expect(stores[0]?.isDefault).toBe(true);

    expect(stores[1]?.storeId).toBe(storeBId);
    expect(stores[1]?.isDefault).toBe(false);
  });

  it("enforces database constraint of at most one default store per organization membership", async () => {
    // Attempting to create another active store membership with isDefault=true should fail
    await expect(
      createStoreMembership({
        organizationMembershipId: orgMembershipId,
        storeId: storeCId,
        isDefault: true,
        isActive: true,
      }),
    ).rejects.toThrow();
  });

  it("assigns roles to store memberships and retrieves them", async () => {
    // Find system role STORE_MANAGER
    const role = await getRoleByCode("STORE_MANAGER");
    expect(role).not.toBeNull();

    // Get the store membership for Store A
    const accessA = await getUserStoreMembership(testUserId, storeAId);
    expect(accessA).not.toBeNull();

    const assigned = await assignRoleToStoreMembership({
      storeMembershipId: accessA!.id,
      roleId: role!.id,
      assignedByUserId: testUserId,
    });

    expect(assigned.id).toBeDefined();
    expect(assigned.roleId).toBe(role!.id);

    const roles = await getStoreMembershipRoles(accessA!.id);
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.some((r) => r.code === "STORE_MANAGER")).toBe(true);
  });
});
