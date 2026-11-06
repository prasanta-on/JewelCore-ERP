import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("OpenAPI 3.0 & Swagger UI Integration (Developer Documentation)", () => {
  const app = createApp();

  it("serves valid OpenAPI 3.0 specification JSON on /api-docs/openapi.json", async () => {
    const res = await request(app).get("/api-docs/openapi.json");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.openapi).toBe("3.0.0");
    expect(res.body.info.title).toBe("JewelCore ERP API");
    expect(res.body.paths).toBeDefined();

    // Verify key paths are registered
    expect(res.body.paths["/api/v1/auth/login"]).toBeDefined();
    expect(res.body.paths["/api/v1/iam/organizations"]).toBeDefined();
    expect(res.body.paths["/api/v1/storage/vaults"]).toBeDefined();
    expect(res.body.paths["/api/v1/storage/directory"]).toBeDefined();
    expect(res.body.paths["/api/v1/taxonomy/categories"]).toBeDefined();
    expect(res.body.paths["/api/v1/taxonomy/materials"]).toBeDefined();
    expect(res.body.paths["/api/v1/taxonomy/gemstones"]).toBeDefined();

    // Verify schemas and security schemes
    expect(res.body.components.securitySchemes.BearerAuth).toBeDefined();
    expect(res.body.components.schemas.ProblemDocument).toBeDefined();
    expect(res.body.components.schemas.CreateMaterialInput).toBeDefined();
    expect(res.body.components.schemas.CreateGemstoneInput).toBeDefined();
  });

  it("serves OpenAPI specification on /api/v1/openapi.json alias", async () => {
    const res = await request(app).get("/api/v1/openapi.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.0");
    expect(res.body.info.title).toBe("JewelCore ERP API");
  });

  it("serves interactive Swagger UI HTML dashboard on /api-docs/", async () => {
    const res = await request(app).get("/api-docs/");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("swagger-ui");
  });

  it("redirects or serves /api-docs root URL", async () => {
    const res = await request(app).get("/api-docs");

    // swagger-ui-express typically issues 301/302 redirect from /api-docs to /api-docs/ or serves 200
    expect([200, 301, 302]).toContain(res.status);
  });
});
