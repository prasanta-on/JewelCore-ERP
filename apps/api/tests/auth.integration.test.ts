import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
} from "@jewelcore/database";

describe("IAM Authentication & User Endpoints (FEAT-IAM-02)", () => {
  const app = createApp();
  let testOrgId: string;

  beforeAll(async () => {
    await runAllMigrations();
    const org = await createOrganization({
      code: "AUTH_API_ORG",
      name: "Auth API Testing Inc",
    });
    testOrgId = org.id;
  });

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE 'auth_%@jewelcore.local';");
    await query("DELETE FROM organizations WHERE code = 'AUTH_API_ORG';");
    await closePool();
  });

  describe("POST /api/v1/auth/register", () => {
    it("successfully registers a user with Argon2id hashed password and returns public profile", async () => {
      const payload = {
        organizationId: testOrgId,
        email: "auth_user1@jewelcore.local",
        password: "SuperSecretPassword123",
        firstName: "Victoria",
        lastName: "Crown",
        phone: "+1-416-555-0188",
      };

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.email).toBe("auth_user1@jewelcore.local");
      expect(res.body.data.firstName).toBe("Victoria");
      expect(res.body.data.isActive).toBe(true);

      // Verify password hash is never exposed to API response
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.password).toBeUndefined();

      // Verify in DB that hash starts with $argon2id$
      const dbCheck = await query<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE id = $1;",
        [res.body.data.id],
      );
      expect(dbCheck.rows[0]?.password_hash.startsWith("$argon2id$")).toBe(true);
    });

    it("returns 409 Conflict with ERR_DUPLICATE_EMAIL when email is already registered", async () => {
      const payload = {
        organizationId: testOrgId,
        email: "auth_user1@jewelcore.local",
        password: "SuperSecretPassword123",
        firstName: "Duplicate",
        lastName: "User",
      };

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ERR_DUPLICATE_EMAIL");
    });

    it("returns 400 Bad Request with ERR_VALIDATION when password is too weak", async () => {
      const payload = {
        organizationId: testOrgId,
        email: "auth_weak@jewelcore.local",
        password: "weak", // fails min length and complexity
        firstName: "Weak",
        lastName: "Pass",
      };

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ERR_VALIDATION");
      expect(res.body.invalidParams).toBeDefined();
    });

    it("returns 404 Not Found when organizationId does not exist", async () => {
      const payload = {
        organizationId: "0192e212-3456-7890-abcd-ef0123456789",
        email: "auth_orphan@jewelcore.local",
        password: "SuperSecretPassword123",
        firstName: "Orphan",
        lastName: "User",
      };

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ERR_NOT_FOUND");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    let accessToken: string;

    it("authenticates valid credentials, sets HTTP-only refresh cookie and returns access JWT", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "auth_user1@jewelcore.local",
          password: "SuperSecretPassword123",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe("auth_user1@jewelcore.local");

      // Verify HTTP-only cookie
      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const hasHttpOnlyRefresh = cookies.some((c: string) =>
        c.includes("refreshToken=") && c.includes("HttpOnly"),
      );
      expect(hasHttpOnlyRefresh).toBe(true);

      accessToken = res.body.data.accessToken;
    });

    it("rejects invalid password credentials with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "auth_user1@jewelcore.local",
          password: "WrongPassword999",
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("ERR_INVALID_CREDENTIALS");
    });

    it("triggers temporary account lockout after repeated brute-force failures", async () => {
      // Create user for lockout test
      await request(app)
        .post("/api/v1/auth/register")
        .send({
          organizationId: testOrgId,
          email: "auth_lockout@jewelcore.local",
          password: "TargetPassword123",
          firstName: "Brute",
          lastName: "Target",
        });

      // 4 failures: 401 Unauthorized
      for (let i = 0; i < 4; i++) {
        const failRes = await request(app)
          .post("/api/v1/auth/login")
          .send({
            email: "auth_lockout@jewelcore.local",
            password: "InvalidPasswordAttempt",
          });
        expect(failRes.status).toBe(401);
      }

      // 5th failure: triggers 403 Forbidden with ERR_ACCOUNT_LOCKED
      const lockRes = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "auth_lockout@jewelcore.local",
          password: "InvalidPasswordAttempt",
        });
      expect(lockRes.status).toBe(403);
      expect(lockRes.body.code).toBe("ERR_ACCOUNT_LOCKED");

      // Subsequent attempt even with correct password is blocked until lock expires
      const blockedRes = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "auth_lockout@jewelcore.local",
          password: "TargetPassword123",
        });
      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body.code).toBe("ERR_ACCOUNT_LOCKED");
    });

    describe("GET /api/v1/auth/me", () => {
      it("returns current user profile when valid Bearer JWT is provided", async () => {
        const res = await request(app)
          .get("/api/v1/auth/me")
          .set("Authorization", `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe("auth_user1@jewelcore.local");
        expect(res.body.data.firstName).toBe("Victoria");
      });

      it("returns 401 Unauthorized when Authorization header is missing", async () => {
        const res = await request(app).get("/api/v1/auth/me");

        expect(res.status).toBe(401);
        expect(res.body.code).toBe("ERR_UNAUTHORIZED");
      });
    });
  });
});

