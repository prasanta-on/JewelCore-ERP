import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createUser,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import { signAccessToken } from "../src/modules/auth/authUtils.js";
import { authenticate, requirePermission } from "../src/common/authMiddleware.js";

describe("IAM RBAC Roles & Granular Permissions Endpoints (FEAT-IAM-03)", () => {
  // Register protected test endpoints via the configureRoutes hook before notFoundHandler
  const app = createApp((testApp) => {
    testApp.post(
      "/api/v1/test/inventory/movements",
      authenticate,
      requirePermission("inventory:transfer"),
      (_req, res) => {
        res.status(200).json({ message: "Inventory transfer authorized and executed" });
      },
    );

    testApp.post(
      "/api/v1/test/qc/items/approve",
      authenticate,
      requirePermission("qc:approve"),
      (_req, res) => {
        res.status(200).json({ message: "QC inspection approved" });
      },
    );
  });

  let testOrgId: string;
  let inventoryControllerToken: string;
  let salesAssociateToken: string;
  let testUserId: string;

  beforeAll(async () => {
    await runAllMigrations();

    const org = await createOrganization({
      code: "RBAC_TEST_ORG",
      name: "RBAC Test Showroom Inc",
    });
    testOrgId = org.id;

    // 1. Create user with INVENTORY_CONTROLLER role
    const invUser = await createUser({
      organizationId: testOrgId,
      email: "rbac_inv_controller@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Ian",
      lastName: "Inventory",
    });
    const invRole = await getRoleByCode("INVENTORY_CONTROLLER");
    await assignRoleToUser(invUser.id, invRole!.id);
    inventoryControllerToken = await signAccessToken({
      userId: invUser.id,
      orgId: testOrgId,
      email: invUser.email,
    });

    // 2. Create user with SALES_ASSOCIATE role
    const salesUser = await createUser({
      organizationId: testOrgId,
      email: "rbac_sales_associate@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Sally",
      lastName: "Sales",
    });
    testUserId = salesUser.id;
    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    await assignRoleToUser(salesUser.id, salesRole!.id);
    salesAssociateToken = await signAccessToken({
      userId: salesUser.id,
      orgId: testOrgId,
      email: salesUser.email,
    });
  });

  afterAll(async () => {
    await query("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'rbac_%@jewelcore.local');");
    await query("DELETE FROM users WHERE email LIKE 'rbac_%@jewelcore.local';");
    await query("DELETE FROM roles WHERE organization_id = $1;", [testOrgId]);
    await query("DELETE FROM organizations WHERE id = $1;", [testOrgId]);
    await closePool();
  });

  describe("Scenario 1: Permitted Action Execution", () => {
    it("authorizes user with INVENTORY_CONTROLLER role to execute inventory:transfer", async () => {
      const res = await request(app)
        .post("/api/v1/test/inventory/movements")
        .set("Authorization", `Bearer ${inventoryControllerToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Inventory transfer authorized and executed");
    });
  });

  describe("Scenario 2: Unauthorized Action Rejection", () => {
    it("rejects SALES_ASSOCIATE user without qc:approve immediately with 403 Forbidden and ERR_INSUFFICIENT_PERMISSIONS", async () => {
      const res = await request(app)
        .post("/api/v1/test/qc/items/approve")
        .set("Authorization", `Bearer ${salesAssociateToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
      expect(res.body.type).toContain("forbidden");
    });
  });

  describe("RBAC Administration Endpoints", () => {
    it("GET /api/v1/iam/permissions lists all domain permissions", async () => {
      const res = await request(app).get("/api/v1/iam/permissions");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(8);
      const codes = res.body.data.map((p: any) => p.code);
      expect(codes).toContain("iam:admin");
      expect(codes).toContain("inventory:transfer");
    });

    it("POST /api/v1/iam/roles creates a custom role with permissions", async () => {
      const payload = {
        organizationId: testOrgId,
        code: "CUSTOM_FLOOR_SUPERVISOR",
        name: "Floor Supervisor",
        scopeLevel: "STORE",
        permissionCodes: ["sales:invoice", "inventory:view"],
      };

      const res = await request(app)
        .post("/api/v1/iam/roles")
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe("CUSTOM_FLOOR_SUPERVISOR");
      expect(res.body.data.permissions.length).toBe(2);
    });

    it("POST /api/v1/iam/roles returns 409 Conflict on duplicate role code", async () => {
      const payload = {
        organizationId: testOrgId,
        code: "CUSTOM_FLOOR_SUPERVISOR",
        name: "Duplicate Supervisor",
      };

      const res = await request(app)
        .post("/api/v1/iam/roles")
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ERR_DUPLICATE_ROLE_CODE");
    });

    it("POST /api/v1/iam/users/:id/roles assigns a role to user", async () => {
      const role = await getRoleByCode("STORE_MANAGER");

      const res = await request(app)
        .post(`/api/v1/iam/users/${testUserId}/roles`)
        .send({ roleId: role!.id });

      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBe(testUserId);
      expect(res.body.data.roles.some((r: any) => r.code === "STORE_MANAGER")).toBe(true);
    });
  });
});
