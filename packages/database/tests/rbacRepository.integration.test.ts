import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  closePool,
  query,
  runAllMigrations,
  createOrganization,
  createUser,
  createRole,
  getRoleById,
  getRoleByCode,
  listRoles,
  listPermissions,
  assignRoleToUser,
  getUserPermissionCodes,
  getUserRoles,
} from "../src/index.js";
import { RoleScopeLevel } from "@jewelcore/shared";

describe("IAM RBAC Roles & Permissions Repository Integration Tests", () => {
  let testOrgId: string;
  let testUserId: string;

  beforeAll(async () => {
    await runAllMigrations();
    const org = await createOrganization({
      code: "RBAC_REPO_ORG",
      name: "RBAC Testing Org",
    });
    testOrgId = org.id;

    const user = await createUser({
      organizationId: testOrgId,
      email: "rbac_repo_user@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Test",
      lastName: "Rbac",
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await query("DELETE FROM user_roles WHERE user_id = $1;", [testUserId]);
    await query("DELETE FROM users WHERE id = $1;", [testUserId]);
    await query("DELETE FROM roles WHERE organization_id = $1;", [testOrgId]);
    await query("DELETE FROM organizations WHERE id = $1;", [testOrgId]);
    await closePool();
  });

  it("seeds and lists standard domain permissions", async () => {
    const allPerms = await listPermissions();
    expect(allPerms.length).toBeGreaterThanOrEqual(8);

    const codes = allPerms.map((p) => p.code);
    expect(codes).toContain("iam:admin");
    expect(codes).toContain("inventory:transfer");
    expect(codes).toContain("qc:approve");
    expect(codes).toContain("vault:access");
    expect(codes).toContain("sales:invoice");
  });

  it("seeds built-in system roles with predefined permissions", async () => {
    const systemAdmin = await getRoleByCode("SYSTEM_ADMIN");
    expect(systemAdmin).not.toBeNull();
    expect(systemAdmin?.isSystem).toBe(true);
    expect(systemAdmin?.permissions.length).toBeGreaterThanOrEqual(8);

    const inventoryController = await getRoleByCode("INVENTORY_CONTROLLER");
    expect(inventoryController).not.toBeNull();
    const invPermCodes = inventoryController?.permissions.map((p) => p.code);
    expect(invPermCodes).toContain("inventory:transfer");
    expect(invPermCodes).toContain("inventory:view");
    expect(invPermCodes).not.toContain("qc:approve");
  });

  it("creates custom organization-scoped role with assigned permissions", async () => {
    const customRole = await createRole({
      organizationId: testOrgId,
      code: "VAULT_ASSAYER",
      name: "Vault Assayer",
      scopeLevel: RoleScopeLevel.STORE,
      permissionCodes: ["vault:access", "qc:inspect"],
    });

    expect(customRole.id).toBeDefined();
    expect(customRole.code).toBe("VAULT_ASSAYER");
    expect(customRole.permissions.length).toBe(2);

    const permCodes = customRole.permissions.map((p) => p.code);
    expect(permCodes).toContain("vault:access");
    expect(permCodes).toContain("qc:inspect");

    const fetchedById = await getRoleById(customRole.id);
    expect(fetchedById).not.toBeNull();
    expect(fetchedById?.permissions.length).toBe(2);
  });

  it("assigns role to user and evaluates effective permission codes", async () => {
    const invController = await getRoleByCode("INVENTORY_CONTROLLER");
    expect(invController).not.toBeNull();

    await assignRoleToUser(testUserId, invController!.id);

    const userRoles = await getUserRoles(testUserId);
    expect(userRoles.some((r) => r.code === "INVENTORY_CONTROLLER")).toBe(true);

    const effectivePerms = await getUserPermissionCodes(testUserId);
    expect(effectivePerms).toContain("inventory:transfer");
    expect(effectivePerms).toContain("vault:access");
    expect(effectivePerms).not.toContain("qc:approve");
  });
});
