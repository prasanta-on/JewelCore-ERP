import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createRfidTag,
  getRfidTagById,
  getRfidTagByEpc,
  updateRfidTagStatus,
  listRfidTags,
} from "../src/index.js";
import {
  RfidTagStatus,
  RfidFrequencyBand,
  ConflictError,
  NotFoundError,
  BadRequestError,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("RFID Tag Master Registry Repository (FEAT-RFID-01, Entity 35)", () => {
  let org1Id: string;
  let org2Id: string;
  let sampleTagId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up stale test fixtures
    await query(
      "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code LIKE 'ORG_RFID_REPO_%');",
    );
    await query("DELETE FROM organizations WHERE code LIKE 'ORG_RFID_REPO_%';");

    const org1 = await createOrganization({
      code: "ORG_RFID_REPO_01",
      name: "RFID Repo Primary Org",
    });
    org1Id = org1.id;

    const org2 = await createOrganization({
      code: "ORG_RFID_REPO_02",
      name: "RFID Repo Secondary Org",
    });
    org2Id = org2.id;
  });

  afterAll(async () => {
    try {
      await query(
        "DELETE FROM rfid_tags WHERE organization_id IN (SELECT id FROM organizations WHERE code LIKE 'ORG_RFID_REPO_%');",
      );
      await query(
        "DELETE FROM organizations WHERE code LIKE 'ORG_RFID_REPO_%';",
      );
    } finally {
      await closePool();
    }
  });

  it("Scenario 1: registers a new RFID tag with EPC and TID in initial status UNENCODED", async () => {
    const tag = await createRfidTag({
      organizationId: org1Id,
      epc: "urn:epc:tag:sgtin-96:3.0614141.812345.0001",
      tid: "E280116060000201",
      frequencyBand: RfidFrequencyBand.UHF_860_960_MHZ,
    });

    expect(tag.id).toBeDefined();
    expect(tag.organizationId).toBe(org1Id);
    expect(tag.epc).toBe("urn:epc:tag:sgtin-96:3.0614141.812345.0001");
    expect(tag.tid).toBe("E280116060000201");
    expect(tag.status).toBe(RfidTagStatus.UNENCODED);
    expect(tag.frequencyBand).toBe(RfidFrequencyBand.UHF_860_960_MHZ);
    expect(tag.encodedAt).toBeNull();
    expect(tag.retiredAt).toBeNull();

    sampleTagId = tag.id;
  });

  it("Scenario 2: rejects duplicate EPC within the same organization (409 Conflict / ERR_DUPLICATE_EPC)", async () => {
    await expect(
      createRfidTag({
        organizationId: org1Id,
        epc: "urn:epc:tag:sgtin-96:3.0614141.812345.0001",
        tid: "E280116060000999",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("Scenario 3: allows identical EPC across different organizations (multi-tenant boundary)", async () => {
    const org2Tag = await createRfidTag({
      organizationId: org2Id,
      epc: "urn:epc:tag:sgtin-96:3.0614141.812345.0001",
      tid: "E280116060000202",
    });

    expect(org2Tag.id).toBeDefined();
    expect(org2Tag.organizationId).toBe(org2Id);
    expect(org2Tag.epc).toBe("urn:epc:tag:sgtin-96:3.0614141.812345.0001");
  });

  it("Scenario 4: advances tag lifecycle from UNENCODED to ACTIVE and sets encoded_at", async () => {
    const updated = await updateRfidTagStatus(sampleTagId, {
      status: RfidTagStatus.ACTIVE,
      reason: "Zebra RFID encoding completed and verified",
    });

    expect(updated.status).toBe(RfidTagStatus.ACTIVE);
    expect(updated.encodedAt).toBeInstanceOf(Date);
    expect(updated.retiredAt).toBeNull();
  });

  it("Scenario 5: advances tag lifecycle from ACTIVE to RETIRED and sets retired_at", async () => {
    const updated = await updateRfidTagStatus(sampleTagId, {
      status: RfidTagStatus.RETIRED,
      reason: "Asset sold to customer; physical tag decommissioned",
    });

    expect(updated.status).toBe(RfidTagStatus.RETIRED);
    expect(updated.encodedAt).toBeInstanceOf(Date);
    expect(updated.retiredAt).toBeInstanceOf(Date);
  });

  it("Scenario 6: rejects state transition from terminal status RETIRED (422 Unprocessable Entity)", async () => {
    await expect(
      updateRfidTagStatus(sampleTagId, {
        status: RfidTagStatus.ACTIVE,
        reason: "Attempting reactivation",
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("Scenario 7: rejects no-op state transition (400 Bad Request)", async () => {
    const freshTag = await createRfidTag({
      organizationId: org1Id,
      epc: "urn:epc:tag:sgtin-96:3.0614141.812345.0002",
    });

    await expect(
      updateRfidTagStatus(freshTag.id, {
        status: RfidTagStatus.UNENCODED,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it("Scenario 8: retrieves tag by primary ID and by EPC identifier", async () => {
    const tagById = await getRfidTagById(sampleTagId);
    expect(tagById).not.toBeNull();
    expect(tagById!.id).toBe(sampleTagId);

    const tagByEpc = await getRfidTagByEpc(
      org1Id,
      "urn:epc:tag:sgtin-96:3.0614141.812345.0001",
    );
    expect(tagByEpc).not.toBeNull();
    expect(tagByEpc!.id).toBe(sampleTagId);

    const nonExistent = await getRfidTagById(
      "0192e301-ffff-7000-8000-000000000099",
    );
    expect(nonExistent).toBeNull();
  });

  it("Scenario 9: lists RFID tags with status and pagination filters", async () => {
    const tags = await listRfidTags({
      organizationId: org1Id,
      status: RfidTagStatus.RETIRED,
      limit: 10,
      offset: 0,
    });

    expect(tags.length).toBeGreaterThanOrEqual(1);
    expect(tags[0].status).toBe(RfidTagStatus.RETIRED);
    expect(tags[0].organizationId).toBe(org1Id);
  });
});
