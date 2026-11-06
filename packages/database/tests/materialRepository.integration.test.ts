import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getPool,
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createMaterial,
  getMaterialById,
  getMaterialByCode,
  listMaterials,
  createPurity,
  getPurityById,
  getPurityRaw,
  listPurities,
  getMaterialWithPurities,
} from "../src/index.js";
import { ConflictError, ValidationError } from "@jewelcore/shared";

describe("Materials & Purities Repository Integration Tests (FEAT-TAX-02 / DEC-05)", () => {
  let testOrg1Id: string;
  let testOrg2Id: string;

  beforeAll(async () => {
    await runAllMigrations();

    const org1 = await createOrganization({
      code: "MAT_TEST_ORG_1",
      name: "Metallurgy Enterprise 1",
    });
    testOrg1Id = org1.id;

    const org2 = await createOrganization({
      code: "MAT_TEST_ORG_2",
      name: "Metallurgy Enterprise 2",
    });
    testOrg2Id = org2.id;
  });

  afterAll(async () => {
    await query("DELETE FROM materials WHERE organization_id IN ($1, $2);", [testOrg1Id, testOrg2Id]);
    await query("DELETE FROM organizations WHERE code LIKE 'MAT_TEST_%';");
    await closePool();
  });

  it("creates precious materials and verifies candidate business keys", async () => {
    const gold = await createMaterial({
      organizationId: testOrg1Id,
      code: "AU",
      name: "Gold",
      baseMetalType: "AU",
      isPrecious: true,
    });

    expect(gold.id).toBeDefined();
    expect(gold.organizationId).toBe(testOrg1Id);
    expect(gold.code).toBe("AU");
    expect(gold.name).toBe("Gold");
    expect(gold.baseMetalType).toBe("AU");
    expect(gold.isPrecious).toBe(true);

    const platinum = await createMaterial({
      organizationId: testOrg1Id,
      code: "PT",
      name: "Platinum",
      baseMetalType: "PT",
      isPrecious: true,
    });
    expect(platinum.id).toBeDefined();

    // Org 2 can also have "AU" code (scoped per organization)
    const org2Gold = await createMaterial({
      organizationId: testOrg2Id,
      code: "AU",
      name: "Gold Org 2",
      baseMetalType: "AU",
    });
    expect(org2Gold.id).toBeDefined();

    // Duplicate in Org 1 rejected
    await expect(
      createMaterial({
        organizationId: testOrg1Id,
        code: "AU",
        name: "Duplicate Gold",
        baseMetalType: "AU",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("enforces DEC-05 numeric precision scales NUMERIC(7,4) and NUMERIC(5,4)", async () => {
    const gold = await getMaterialByCode(testOrg1Id, "AU");
    expect(gold).not.toBeNull();

    // Create 18K purity with exact 75.0000% and 0.7500 ratio
    const purity18K = await createPurity({
      materialId: gold!.id,
      code: "18K",
      name: "18 Karat Yellow Gold",
      karatage: "18K",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      hallmarkCode: "750",
    });

    expect(purity18K.id).toBeDefined();
    expect(purity18K.purityPercentage).toBe(75.0);
    expect(purity18K.purityRatio).toBe(0.75);

    // Verify raw PostgreSQL representation maintains exactly 4 decimal places without float drift
    const rawPurity = await getPurityRaw(purity18K.id);
    expect(rawPurity).not.toBeNull();
    expect(rawPurity!.purity_percentage).toBe("75.0000");
    expect(rawPurity!.purity_ratio).toBe("0.7500");

    // Also test 22K (91.6000% and 0.9160)
    const purity22K = await createPurity({
      materialId: gold!.id,
      code: "22K",
      name: "22 Karat Standard Gold",
      karatage: "22K",
      purityPercentage: 91.6,
      hallmarkCode: "916",
    });

    const raw22K = await getPurityRaw(purity22K.id);
    expect(raw22K!.purity_percentage).toBe("91.6000");
    expect(raw22K!.purity_ratio).toBe("0.9160");
  });

  it("rejects purity percentage exceeding 100.0000 via check constraint", async () => {
    const gold = await getMaterialByCode(testOrg1Id, "AU");
    expect(gold).not.toBeNull();

    await expect(
      createPurity({
        materialId: gold!.id,
        code: "INVALID_105",
        name: "Impossible Alloy",
        purityPercentage: 105.0,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects duplicate purity code within the same material", async () => {
    const gold = await getMaterialByCode(testOrg1Id, "AU");
    expect(gold).not.toBeNull();

    await expect(
      createPurity({
        materialId: gold!.id,
        code: "18K",
        name: "Duplicate 18K",
        purityPercentage: 75.0,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("retrieves material with all nested purities", async () => {
    const gold = await getMaterialByCode(testOrg1Id, "AU");
    expect(gold).not.toBeNull();

    const result = await getMaterialWithPurities(gold!.id);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("AU");
    expect(result!.purities.length).toBeGreaterThanOrEqual(2);
    // Verified ordered by purityPercentage descending
    expect(result!.purities[0]?.purityPercentage).toBeGreaterThanOrEqual(
      result!.purities[1]?.purityPercentage ?? 0,
    );
  });
});
