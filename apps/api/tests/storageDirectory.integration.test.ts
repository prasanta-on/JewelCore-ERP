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
  createVault,
  createLocker,
  createCompartment,
  computeCompartmentOccupancy,
} from "@jewelcore/database";
import { signAccessToken } from "../src/modules/auth/authUtils.js";
import { StoreType } from "@jewelcore/shared";

describe("Compartment Allocation & Storage Directory (FEAT-STOR-02)", () => {
  const app = createApp();

  let testOrgId: string;
  let store001Id: string;
  let store002Id: string;
  let operatorToken: string;

  let testCompId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // 1. Organization
    const org = await createOrganization({
      code: "DIR_TEST_ORG",
      name: "Directory Test Organization",
      currency: "CAD",
      isActive: true,
    });
    testOrgId = org.id;

    // 2. Stores
    const s1 = await createStore({
      organizationId: testOrgId,
      code: "DIR_STORE_01",
      name: "Downtown Branch",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    store001Id = s1.id;

    const s2 = await createStore({
      organizationId: testOrgId,
      code: "DIR_STORE_02",
      name: "Suburban Branch",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    store002Id = s2.id;

    // 3. Operator assigned strictly to STORE001
    const user = await createUser({
      organizationId: testOrgId,
      email: "dir_operator@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Directory",
      lastName: "Operator",
      isActive: true,
    });

    const orgMem = await createOrganizationMembership({
      organizationId: testOrgId,
      userId: user.id,
      isActive: true,
    });

    await createStoreMembership({
      organizationMembershipId: orgMem.id,
      storeId: store001Id,
      isDefault: true,
      isActive: true,
    });

    operatorToken = await signAccessToken({
      userId: user.id,
      orgId: testOrgId,
      email: user.email,
    });

    // 4. Physical Storage in STORE001: Vault -> Locker -> Compartment (capacity 10)
    const vault = await createVault({
      storeId: store001Id,
      code: "DIR_VLT_01",
      name: "Store 1 Main Vault",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId: store001Id,
      code: "DIR_LCK_01",
      name: "Safe A",
      lockerNumber: "LCK-A1",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId: store001Id,
      code: "DIR_CMP_C1",
      name: "Diamond Tray C1",
      compartmentNumber: "C1",
      maxItemCapacity: 10,
      maxWeightCapacityGrams: 500,
    });
    testCompId = comp.id;
  });

  afterAll(async () => {
    await query("DELETE FROM compartments WHERE code LIKE 'DIR_%';");
    await query("DELETE FROM lockers WHERE code LIKE 'DIR_%';");
    await query("DELETE FROM vaults WHERE code LIKE 'DIR_%';");
    await query("DELETE FROM users WHERE email LIKE 'dir_%@jewelcore.local';");
    await query("DELETE FROM stores WHERE code LIKE 'DIR_%';");
    await query("DELETE FROM organizations WHERE code LIKE 'DIR_%';");
    await closePool();
  });

  // AC Scenario 1: Real-Time Occupancy Visualizer
  it("Scenario 1: returns occupancy count, capacity percentage, and status chip for resident items", async () => {
    // Simulate 5 pieces resident in Compartment C1 (capacity: 10)
    const simParam = JSON.stringify({ [testCompId]: 5 });

    const res = await request(app)
      .get(`/api/v1/storage/hierarchy?simulateOccupancy=${encodeURIComponent(simParam)}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .set("x-store-id", store001Id);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const vault = res.body.data[0];
    const locker = vault.lockers[0];
    const comp = locker.compartments.find((c: any) => c.id === testCompId);

    expect(comp).toBeDefined();
    expect(comp.occupiedItemCount).toBe(5);
    expect(comp.occupancyPercentage).toBe(50);
    expect(comp.status).toBe("AVAILABLE");

    // Test Near Capacity threshold (e.g. 9 out of 10 = 90% -> NEAR_CAPACITY)
    const simNearParam = JSON.stringify({ [testCompId]: 9 });
    const resNear = await request(app)
      .get(`/api/v1/storage/hierarchy?simulateOccupancy=${encodeURIComponent(simNearParam)}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .set("x-store-id", store001Id);

    const compNear = resNear.body.data[0].lockers[0].compartments.find((c: any) => c.id === testCompId);
    expect(compNear.occupiedItemCount).toBe(9);
    expect(compNear.occupancyPercentage).toBe(90);
    expect(compNear.status).toBe("NEAR_CAPACITY");

    // Test Full threshold (10 out of 10 = 100% -> FULL)
    const simFullParam = JSON.stringify({ [testCompId]: 10 });
    const resFull = await request(app)
      .get(`/api/v1/storage/hierarchy?simulateOccupancy=${encodeURIComponent(simFullParam)}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .set("x-store-id", store001Id);

    const compFull = resFull.body.data[0].lockers[0].compartments.find((c: any) => c.id === testCompId);
    expect(compFull.occupiedItemCount).toBe(10);
    expect(compFull.occupancyPercentage).toBe(100);
    expect(compFull.status).toBe("FULL");
  });

  // AC Scenario 2: Cross-Store Storage Directory Access Rejection (INV-11)
  it("Scenario 2: rejects cross-store storage directory request with 403 ERR_STORE_ACCESS_DENIED", async () => {
    // Operator is strictly assigned to STORE001, requesting STORE002
    const res = await request(app)
      .get("/api/v1/storage/hierarchy")
      .set("Authorization", `Bearer ${operatorToken}`)
      .set("x-store-id", store002Id);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_STORE_ACCESS_DENIED");
    expect(res.body.title).toBe("Forbidden");
  });

  it("computes occupancy correctly for compartments with and without capacity limit", () => {
    const limitedComp = {
      id: "comp-1",
      lockerId: "lck-1",
      storeId: "store-1",
      code: "C-1",
      name: "Tray 1",
      compartmentNumber: "1",
      maxWeightCapacityGrams: 500,
      maxItemCapacity: 20,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const emptyOcc = computeCompartmentOccupancy(limitedComp, 0);
    expect(emptyOcc.occupancyPercentage).toBe(0);
    expect(emptyOcc.status).toBe("AVAILABLE");

    const halfOcc = computeCompartmentOccupancy(limitedComp, 10);
    expect(halfOcc.occupancyPercentage).toBe(50);
    expect(halfOcc.status).toBe("AVAILABLE");

    const nearOcc = computeCompartmentOccupancy(limitedComp, 17);
    expect(nearOcc.occupancyPercentage).toBe(85);
    expect(nearOcc.status).toBe("NEAR_CAPACITY");

    const fullOcc = computeCompartmentOccupancy(limitedComp, 20);
    expect(fullOcc.occupancyPercentage).toBe(100);
    expect(fullOcc.status).toBe("FULL");

    // Unlimited compartment (no max capacity limit)
    const unlimitedComp = { ...limitedComp, maxItemCapacity: null };
    const unlimOcc = computeCompartmentOccupancy(unlimitedComp, 50);
    expect(unlimOcc.occupancyPercentage).toBeNull();
    expect(unlimOcc.status).toBe("UNLIMITED");
  });
});
