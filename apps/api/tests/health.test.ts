import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Express 5 API Health Endpoints", () => {
  const app = createApp();

  it("responds with 200 UP on /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("UP");
    expect(res.body.service).toBe("@jewelcore/api");
    expect(res.body.timestamp).toBeDefined();
  });

  it("responds with 200 UP on /api/v1/health", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("UP");
    expect(res.body.version).toBe("v1");
    expect(res.body.service).toBe("JewelCore ERP API");
  });
});
