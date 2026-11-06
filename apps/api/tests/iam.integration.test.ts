import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { runAllMigrations, closePool, query } from "@jewelcore/database";

describe("IAM Organizations & Stores API Endpoints (FEAT-IAM-01)", () => {
  const app = createApp();
  let createdOrgId: string;

  beforeAll(async () => {
    await runAllMigrations();
  });

  afterAll(async () => {
    await query("DELETE FROM stores WHERE code LIKE 'API_%';");
    await query("DELETE FROM organizations WHERE code LIKE 'API_%';");
    await closePool();
  });

  describe("POST /api/v1/iam/organizations", () => {
    it("creates a new organization with 201 Created", async () => {
      const payload = {
        code: "API_ORG_01",
        name: "Apex Luxury Diamonds",
        currency: "CAD",
        taxIdentifier: "TX-CA-12345",
      };

      const res = await request(app)
        .post("/api/v1/iam/organizations")
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.code).toBe("API_ORG_01");
      expect(res.body.data.currency).toBe("CAD");

      createdOrgId = res.body.data.id;
    });

    it("returns 409 Conflict with ERR_DUPLICATE_ORG_CODE when code already exists", async () => {
      const payload = {
        code: "API_ORG_01",
        name: "Duplicate Org Name",
        currency: "CAD",
      };

      const res = await request(app)
        .post("/api/v1/iam/organizations")
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ERR_DUPLICATE_ORG_CODE");
      expect(res.body.type).toContain("conflict");
    });

    it("returns 400 Bad Request with ERR_VALIDATION when payload is invalid", async () => {
      const res = await request(app).post("/api/v1/iam/organizations").send({
        code: "", // invalid empty code
        name: "Invalid Corp",
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
      expect(res.body.invalidParams).toBeDefined();
    });
  });

  describe("GET /api/v1/iam/organizations/:id", () => {
    it("returns 200 OK and organization data for valid ID", async () => {
      const res = await request(app).get(
        `/api/v1/iam/organizations/${createdOrgId}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdOrgId);
      expect(res.body.data.code).toBe("API_ORG_01");
    });

    it("returns 404 Not Found for non-existent ID", async () => {
      const res = await request(app).get(
        "/api/v1/iam/organizations/0192e212-3456-7890-abcd-ef0123456789",
      );

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });
  });

  describe("POST /api/v1/iam/stores", () => {
    it("creates a branch store under an existing organization with 201 Created", async () => {
      const payload = {
        organizationId: createdOrgId,
        code: "API_STORE_001",
        name: "Metro Central Vault & Showroom",
        storeType: "SHOWROOM",
        phone: "+1-416-555-0144",
        email: "metro@apexdiamonds.com",
        addressJson: {
          street: "500 Bay St",
          city: "Toronto",
          province: "ON",
          country: "CA",
        },
      };

      const res = await request(app).post("/api/v1/iam/stores").send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.code).toBe("API_STORE_001");
      expect(res.body.data.organizationId).toBe(createdOrgId);
      expect(res.body.data.storeType).toBe("SHOWROOM");
    });

    it("returns 409 Conflict with ERR_DUPLICATE_STORE_CODE on duplicate store code", async () => {
      const payload = {
        organizationId: createdOrgId,
        code: "API_STORE_001",
        name: "Colliding Store",
        storeType: "RETAIL_STORE",
      };

      const res = await request(app).post("/api/v1/iam/stores").send(payload);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ERR_DUPLICATE_STORE_CODE");
    });

    it("returns 404 Not Found if parent organization does not exist", async () => {
      const payload = {
        organizationId: "0192e212-3456-7890-abcd-ef0123456789",
        code: "API_STORE_ORPHAN",
        name: "Orphan Store",
        storeType: "RETAIL_STORE",
      };

      const res = await request(app).post("/api/v1/iam/stores").send(payload);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });
  });

  describe("GET /api/v1/iam/stores", () => {
    it("lists all stores or filtered by organizationId", async () => {
      const res = await request(app).get(
        `/api/v1/iam/stores?organizationId=${createdOrgId}`,
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].code).toBe("API_STORE_001");
    });
  });
});
