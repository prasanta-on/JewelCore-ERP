import type { Pool, PoolClient } from "pg";
import type { Permission } from "@jewelcore/shared";
import { getPool } from "../pool.js";

type Queryable = Pool | PoolClient;

interface PermissionRow {
  id: string;
  code: string;
  module: string;
  description: string;
  created_at: Date;
}

function mapRowToPermission(row: PermissionRow): Permission {
  return {
    id: row.id,
    code: row.code,
    module: row.module,
    description: row.description,
    createdAt: row.created_at,
  };
}

export async function listPermissions(
  moduleFilter?: string,
  clientOverride?: Queryable,
): Promise<Permission[]> {
  const executor = clientOverride ?? getPool();

  if (moduleFilter) {
    const result = await executor.query<PermissionRow>(
      `
      SELECT id, code, module, description, created_at
      FROM permissions
      WHERE LOWER(module) = LOWER($1)
      ORDER BY code ASC;
      `,
      [moduleFilter],
    );
    return result.rows.map(mapRowToPermission);
  }

  const result = await executor.query<PermissionRow>(
    `
    SELECT id, code, module, description, created_at
    FROM permissions
    ORDER BY module ASC, code ASC;
    `,
  );
  return result.rows.map(mapRowToPermission);
}

export async function getPermissionByCode(
  code: string,
  clientOverride?: Queryable,
): Promise<Permission | null> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<PermissionRow>(
    `
    SELECT id, code, module, description, created_at
    FROM permissions
    WHERE code = $1;
    `,
    [code],
  );

  const row = result.rows[0];
  return row ? mapRowToPermission(row) : null;
}

export async function getPermissionsForRole(
  roleId: string,
  clientOverride?: Queryable,
): Promise<Permission[]> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<PermissionRow>(
    `
    SELECT p.id, p.code, p.module, p.description, p.created_at
    FROM permissions p
    INNER JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = $1
    ORDER BY p.code ASC;
    `,
    [roleId],
  );

  return result.rows.map(mapRowToPermission);
}

/**
 * Returns distinct active permission codes granted to a user across all assigned roles.
 */
export async function getUserPermissionCodes(
  userId: string,
  clientOverride?: Queryable,
): Promise<string[]> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<{ code: string }>(
    `
    SELECT DISTINCT p.code
    FROM permissions p
    INNER JOIN role_permissions rp ON rp.permission_id = p.id
    INNER JOIN user_roles ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = $1
    ORDER BY p.code ASC;
    `,
    [userId],
  );

  return result.rows.map((r) => r.code);
}
