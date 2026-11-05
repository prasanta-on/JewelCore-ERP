import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getPool,
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  getOrganizationById,
  getOrganizationByCode,
  listOrganizations,
  createStore,
  getStoreById,
  getStoreByCode,
  listStoresByOrganization,
} from "../src/index.js";
import { StoreType } from "@jewelcore/shared";

describe("IAM Organizations & Stores Repository Integration Tests", () => {
  beforeAll(async () => {
    // Run schema migrations to ensure organizations and stores tables exist
    await runAllMigrations();
    await query("DELETE FROM stores WHERE code LIKE 'TEST_STORE_%';");
    await query("DELETE FROM organizations WHERE code LIKE 'TEST_ORG_%';");
  });

  afterAll(async () => {
    // Clean up test records
    await query("DELETE FROM stores WHERE code LIKE 'TEST_STORE_%';");
    await query("DELETE FROM organizations WHERE code LIKE 'TEST_ORG_%';");
    await closePool();
  });

  it("creates and retrieves an organization by ID and code", async () => {
    const org = await createOrganization({
      code: "TEST_ORG_01",
      name: "Test Royal Jewelers Inc.",
      currency: "CAD",
      taxIdentifier: "TX-998877",
      isActive: true,
    });

    expect(org.id).toBeDefined();
    expect(org.code).toBe("TEST_ORG_01");
    expect(org.name).toBe("Test Royal Jewelers Inc.");
    expect(org.currency).toBe("CAD");

    const fetchedById = await getOrganizationById(org.id);
    expect(fetchedById).not.toBeNull();
    expect(fetchedById?.name).toBe("Test Royal Jewelers Inc.");

    const fetchedByCode = await getOrganizationByCode("TEST_ORG_01");
    expect(fetchedByCode).not.toBeNull();
    expect(fetchedByCode?.id).toBe(org.id);
  });

  it("lists organizations including newly created entries", async () => {
    const list = await listOrganizations();
    expect(list.length).toBeGreaterThan(0);
    const found = list.find((o) => o.code === "TEST_ORG_01");
    expect(found).toBeDefined();
  });

  it("creates and retrieves branch stores under an organization", async () => {
    const org = await createOrganization({
      code: "TEST_ORG_02",
      name: "Test Gems & Gold",
      currency: "USD",
      isActive: true,
    });

    const store = await createStore({
      organizationId: org.id,
      code: "TEST_STORE_DOWNTOWN",
      name: "Downtown Flagship Showroom",
      storeType: StoreType.SHOWROOM,
      addressJson: {
        street: "123 Jewelry Way",
        city: "Vancouver",
        province: "BC",
        postalCode: "V6B 1A1",
        country: "CA",
      },
      phone: "+1-604-555-0199",
      email: "downtown@testroyal.com",
      isActive: true,
    });

    expect(store.id).toBeDefined();
    expect(store.organizationId).toBe(org.id);
    expect(store.code).toBe("TEST_STORE_DOWNTOWN");
    expect(store.storeType).toBe("SHOWROOM");

    const fetchedStore = await getStoreById(store.id);
    expect(fetchedStore).not.toBeNull();
    expect(fetchedStore?.name).toBe("Downtown Flagship Showroom");

    const fetchedByCode = await getStoreByCode("TEST_STORE_DOWNTOWN");
    expect(fetchedByCode).not.toBeNull();
    expect(fetchedByCode?.id).toBe(store.id);

    const storeList = await listStoresByOrganization(org.id);
    expect(storeList.length).toBe(1);
    expect(storeList[0]?.code).toBe("TEST_STORE_DOWNTOWN");
  });

  it("rejects duplicate organization code at database level", async () => {
    await expect(
      createOrganization({
        code: "TEST_ORG_01",
        name: "Duplicate Org Attempt",
      }),
    ).rejects.toThrow();
  });

  it("rejects duplicate store code at database level", async () => {
    const org = await getOrganizationByCode("TEST_ORG_01");
    expect(org).not.toBeNull();

    await createStore({
      organizationId: org!.id,
      code: "TEST_STORE_UNIQUE_01",
      name: "Store Alpha",
      storeType: StoreType.RETAIL_STORE,
    });

    await expect(
      createStore({
        organizationId: org!.id,
        code: "TEST_STORE_UNIQUE_01",
        name: "Store Beta Collision",
        storeType: StoreType.RETAIL_STORE,
      }),
    ).rejects.toThrow();
  });
});
