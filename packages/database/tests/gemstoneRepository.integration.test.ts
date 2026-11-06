import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getPool,
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createGemstone,
  getGemstoneById,
  getGemstoneByCode,
  listGemstones,
} from "../src/index.js";
import { ConflictError, ValidationError } from "@jewelcore/shared";

describe("Gemstones Repository Integration Tests (FEAT-TAX-03)", () => {
  let testOrg1Id: string;
  let testOrg2Id: string;

  beforeAll(async () => {
    await runAllMigrations();

    const org1 = await createOrganization({
      code: "GEM_TEST_ORG_1",
      name: "Gemstone Enterprise 1",
    });
    testOrg1Id = org1.id;

    const org2 = await createOrganization({
      code: "GEM_TEST_ORG_2",
      name: "Gemstone Enterprise 2",
    });
    testOrg2Id = org2.id;
  });

  afterAll(async () => {
    await query("DELETE FROM gemstones WHERE organization_id IN ($1, $2);", [
      testOrg1Id,
      testOrg2Id,
    ]);
    await query("DELETE FROM organizations WHERE code LIKE 'GEM_TEST_%';");
    await closePool();
  });

  it("creates and retrieves gemstones with default CARAT unit", async () => {
    const diamond = await createGemstone({
      organizationId: testOrg1Id,
      code: "GEM-DIA",
      name: "Natural Diamond",
      gemstoneType: "PRECIOUS",
    });

    expect(diamond.id).toBeDefined();
    expect(diamond.organizationId).toBe(testOrg1Id);
    expect(diamond.code).toBe("GEM-DIA");
    expect(diamond.name).toBe("Natural Diamond");
    expect(diamond.gemstoneType).toBe("PRECIOUS");
    expect(diamond.defaultMeasurementUnit).toBe("CARAT");
    expect(diamond.isActive).toBe(true);

    const pearl = await createGemstone({
      organizationId: testOrg1Id,
      code: "GEM-PRL",
      name: "South Sea Pearl",
      gemstoneType: "ORGANIC_PEARL",
      defaultMeasurementUnit: "PIECE",
    });

    expect(pearl.id).toBeDefined();
    expect(pearl.gemstoneType).toBe("ORGANIC_PEARL");
    expect(pearl.defaultMeasurementUnit).toBe("PIECE");

    // Retrieve by ID
    const fetchedById = await getGemstoneById(diamond.id);
    expect(fetchedById).not.toBeNull();
    expect(fetchedById!.code).toBe("GEM-DIA");

    // Retrieve by Code
    const fetchedByCode = await getGemstoneByCode(testOrg1Id, "GEM-DIA");
    expect(fetchedByCode).not.toBeNull();
    expect(fetchedByCode!.id).toBe(diamond.id);
  });

  it("enforces candidate business key (organization_id, code) isolation", async () => {
    // Duplicate in Org 1 rejected
    await expect(
      createGemstone({
        organizationId: testOrg1Id,
        code: "GEM-DIA",
        name: "Duplicate Diamond",
        gemstoneType: "PRECIOUS",
      }),
    ).rejects.toThrow(ConflictError);

    // Org 2 can register GEM-DIA independently
    const org2Diamond = await createGemstone({
      organizationId: testOrg2Id,
      code: "GEM-DIA",
      name: "Org 2 Diamond",
      gemstoneType: "PRECIOUS",
    });
    expect(org2Diamond.id).toBeDefined();
    expect(org2Diamond.organizationId).toBe(testOrg2Id);
  });

  it("rejects invalid gemstone type with ValidationError", async () => {
    await expect(
      createGemstone({
        organizationId: testOrg1Id,
        code: "GEM-INV",
        name: "Invalid Mineral",
        gemstoneType: "SYNTHETIC_PLASTIC" as any,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("lists and filters gemstones by gemstoneType", async () => {
    await createGemstone({
      organizationId: testOrg1Id,
      code: "GEM-AMY",
      name: "Amethyst",
      gemstoneType: "SEMI_PRECIOUS",
    });

    // List all
    const allStones = await listGemstones({ organizationId: testOrg1Id });
    expect(allStones.length).toBeGreaterThanOrEqual(3);

    // Filter by PRECIOUS
    const preciousStones = await listGemstones({
      organizationId: testOrg1Id,
      gemstoneType: "PRECIOUS",
    });
    expect(preciousStones.length).toBeGreaterThanOrEqual(1);
    expect(preciousStones.every((s) => s.gemstoneType === "PRECIOUS")).toBe(
      true,
    );

    // Filter by ORGANIC_PEARL
    const pearls = await listGemstones({
      organizationId: testOrg1Id,
      gemstoneType: "ORGANIC_PEARL",
    });
    expect(pearls.length).toBe(1);
    expect(pearls[0]?.code).toBe("GEM-PRL");
  });
});
