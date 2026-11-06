import type { Pool, PoolClient } from "pg";
import type {
  Role,
  RoleScopeLevel,
  RoleWithPermissions,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";
import { getPermissionsForRole } from "./permissionRepository.js";

type Queryable = Pool | PoolClient;

interface RoleRow {
  id: string;
  organization_id: string | null;
  code: string;
  name: string;
  scope_level: RoleScopeLevel;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    scopeLevel: row.scope_level,
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateRoleData {
  id?: string;
  organizationId?: string | null;
  code: string;
  name: string;
  scopeLevel?: RoleScopeLevel;
  isSystem?: boolean;
  permissionCodes?: string[];
}

export async function createRole(
  data: CreateRoleData,
  clientOverride?: Queryable,
): Promise<RoleWithPermissions> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();

  const result = await executor.query<RoleRow>(
    `
    INSERT INTO roles (
      id, organization_id, code, name, scope_level, is_system, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, organization_id, code, name, scope_level, is_system, created_at, updated_at;
    `,
    [
      id,
      data.organizationId ?? null,
      data.code,
      data.name,
      data.scopeLevel ?? "STORE",
      data.isSystem ?? false,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert role record");
  }

  const role = mapRowToRole(row);

  if (data.permissionCodes && data.permissionCodes.length > 0) {
    await assignPermissionsToRole(role.id, data.permissionCodes, executor);
  }

  const permissions = await getPermissionsForRole(role.id, executor);

  return {
    ...role,
    permissions,
  };
}

export async function getRoleById(
  id: string,
  clientOverride?: Queryable,
): Promise<RoleWithPermissions | null> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<RoleRow>(
    `
    SELECT id, organization_id, code, name, scope_level, is_system, created_at, updated_at
    FROM roles
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  if (!row) return null;

  const role = mapRowToRole(row);
  const permissions = await getPermissionsForRole(role.id, executor);

  return {
    ...role,
    permissions,
  };
}

export async function getRoleByCode(
  code: string,
  organizationId?: string | null,
  clientOverride?: Queryable,
): Promise<RoleWithPermissions | null> {
  const executor = clientOverride ?? getPool();

  const result = organizationId
    ? await executor.query<RoleRow>(
        `
        SELECT id, organization_id, code, name, scope_level, is_system, created_at, updated_at
        FROM roles
        WHERE code = $1 AND (organization_id = $2 OR organization_id IS NULL)
        ORDER BY organization_id DESC NULLS LAST
        LIMIT 1;
        `,
        [code, organizationId],
      )
    : await executor.query<RoleRow>(
        `
        SELECT id, organization_id, code, name, scope_level, is_system, created_at, updated_at
        FROM roles
        WHERE code = $1
        LIMIT 1;
        `,
        [code],
      );

  const row = result.rows[0];
  if (!row) return null;

  const role = mapRowToRole(row);
  const permissions = await getPermissionsForRole(role.id, executor);

  return {
    ...role,
    permissions,
  };
}

export async function listRoles(
  organizationId?: string | null,
  clientOverride?: Queryable,
): Promise<Role[]> {
  const executor = clientOverride ?? getPool();

  const result = organizationId
    ? await executor.query<RoleRow>(
        `
        SELECT id, organization_id, code, name, scope_level, is_system, created_at, updated_at
        FROM roles
        WHERE organization_id = $1 OR is_system = true
        ORDER BY is_system DESC, name ASC;
        `,
        [organizationId],
      )
    : await executor.query<RoleRow>(
        `
        SELECT id, organization_id, code, name, scope_level, is_system, created_at, updated_at
        FROM roles
        ORDER BY is_system DESC, name ASC;
        `,
      );

  return result.rows.map(mapRowToRole);
}

export async function assignPermissionsToRole(
  roleId: string,
  permissionCodes: string[],
  clientOverride?: Queryable,
): Promise<void> {
  if (permissionCodes.length === 0) return;
  const executor = clientOverride ?? getPool();

  await executor.query(
    `
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT gen_random_uuid(), $1, p.id, CURRENT_TIMESTAMP
    FROM permissions p
    WHERE p.code = ANY($2::text[])
    ON CONFLICT (role_id, permission_id) DO NOTHING;
    `,
    [roleId, permissionCodes],
  );
}

export async function assignRoleToUser(
  userId: string,
  roleId: string,
  clientOverride?: Queryable,
): Promise<void> {
  const executor = clientOverride ?? getPool();

  await executor.query(
    `
    INSERT INTO user_roles (id, user_id, role_id, created_at)
    VALUES (gen_random_uuid(), $1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, role_id) DO NOTHING;
    `,
    [userId, roleId],
  );
}

export async function getUserRoles(
  userId: string,
  clientOverride?: Queryable,
): Promise<Role[]> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<RoleRow>(
    `
    SELECT r.id, r.organization_id, r.code, r.name, r.scope_level, r.is_system, r.created_at, r.updated_at
    FROM roles r
    INNER JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = $1
    ORDER BY r.code ASC;
    `,
    [userId],
  );

  return result.rows.map(mapRowToRole);
}
