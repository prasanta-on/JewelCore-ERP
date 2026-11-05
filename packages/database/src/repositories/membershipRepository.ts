import type { Pool, PoolClient } from "pg";
import type {
  OrganizationMembership,
  StoreMembership,
  MembershipRole,
  UserStoreAccess,
  Role,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

interface OrgMembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  is_active: boolean;
  joined_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface StoreMembershipRow {
  id: string;
  organization_membership_id: string;
  store_id: string;
  is_default: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface StoreMembershipWithOrgRow extends StoreMembershipRow {
  organization_id: string;
}

interface MembershipRoleRow {
  id: string;
  store_membership_id: string;
  role_id: string;
  assigned_by_user_id: string | null;
  assigned_at: Date;
  created_at: Date;
}

function mapRowToOrgMembership(row: OrgMembershipRow): OrganizationMembership {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    isActive: row.is_active,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToStoreMembership(row: StoreMembershipRow): StoreMembership {
  return {
    id: row.id,
    organizationMembershipId: row.organization_membership_id,
    storeId: row.store_id,
    isDefault: row.is_default,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToMembershipRole(row: MembershipRoleRow): MembershipRole {
  return {
    id: row.id,
    storeMembershipId: row.store_membership_id,
    roleId: row.role_id,
    assignedByUserId: row.assigned_by_user_id,
    assignedAt: row.assigned_at,
    createdAt: row.created_at,
  };
}

/**
 * Creates an organization membership for a user.
 */
export async function createOrganizationMembership(
  data: {
    id?: string;
    organizationId: string;
    userId: string;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<OrganizationMembership> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const isActive = data.isActive ?? true;

  const result = await executor.query<OrgMembershipRow>(
    `
    INSERT INTO organization_memberships (
      id, organization_id, user_id, is_active, joined_at, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, organization_id, user_id, is_active, joined_at, created_at, updated_at;
    `,
    [id, data.organizationId, data.userId, isActive],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert organization membership");
  }

  return mapRowToOrgMembership(row);
}

/**
 * Finds an organization membership by org ID and user ID.
 */
export async function getOrganizationMembership(
  organizationId: string,
  userId: string,
  clientOverride?: Queryable,
): Promise<OrganizationMembership | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<OrgMembershipRow>(
    `
    SELECT id, organization_id, user_id, is_active, joined_at, created_at, updated_at
    FROM organization_memberships
    WHERE organization_id = $1 AND user_id = $2;
    `,
    [organizationId, userId],
  );

  const row = result.rows[0];
  return row ? mapRowToOrgMembership(row) : null;
}

/**
 * Finds an organization membership by primary key ID.
 */
export async function getOrganizationMembershipById(
  id: string,
  clientOverride?: Queryable,
): Promise<OrganizationMembership | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<OrgMembershipRow>(
    `
    SELECT id, organization_id, user_id, is_active, joined_at, created_at, updated_at
    FROM organization_memberships
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToOrgMembership(row) : null;
}

/**
 * Creates a store membership linking an organization member to a physical store.
 */
export async function createStoreMembership(
  data: {
    id?: string;
    organizationMembershipId: string;
    storeId: string;
    isDefault?: boolean;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<StoreMembership> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const isDefault = data.isDefault ?? false;
  const isActive = data.isActive ?? true;

  const result = await executor.query<StoreMembershipRow>(
    `
    INSERT INTO store_memberships (
      id, organization_membership_id, store_id, is_default, is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, organization_membership_id, store_id, is_default, is_active, created_at, updated_at;
    `,
    [id, data.organizationMembershipId, data.storeId, isDefault, isActive],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert store membership");
  }

  return mapRowToStoreMembership(row);
}

/**
 * Finds a store membership by organization membership ID and store ID.
 */
export async function getStoreMembership(
  organizationMembershipId: string,
  storeId: string,
  clientOverride?: Queryable,
): Promise<StoreMembership | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<StoreMembershipRow>(
    `
    SELECT id, organization_membership_id, store_id, is_default, is_active, created_at, updated_at
    FROM store_memberships
    WHERE organization_membership_id = $1 AND store_id = $2;
    `,
    [organizationMembershipId, storeId],
  );

  const row = result.rows[0];
  return row ? mapRowToStoreMembership(row) : null;
}

/**
 * Finds a store membership by primary key ID.
 */
export async function getStoreMembershipById(
  id: string,
  clientOverride?: Queryable,
): Promise<StoreMembership | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<StoreMembershipRow>(
    `
    SELECT id, organization_membership_id, store_id, is_default, is_active, created_at, updated_at
    FROM store_memberships
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToStoreMembership(row) : null;
}

/**
 * Validates whether a user holds active store membership in a specific store.
 * Returns the store membership and parent organization ID if valid.
 */
export async function getUserStoreMembership(
  userId: string,
  storeId: string,
  clientOverride?: Queryable,
): Promise<(StoreMembership & { organizationId: string }) | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<StoreMembershipWithOrgRow>(
    `
    SELECT sm.id, sm.organization_membership_id, sm.store_id, sm.is_default, sm.is_active,
           sm.created_at, sm.updated_at, om.organization_id
    FROM store_memberships sm
    JOIN organization_memberships om ON sm.organization_membership_id = om.id
    WHERE om.user_id = $1
      AND sm.store_id = $2
      AND om.is_active = true
      AND sm.is_active = true;
    `,
    [userId, storeId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...mapRowToStoreMembership(row),
    organizationId: row.organization_id,
  };
}

/**
 * Finds a user's active default store membership across an organization or globally.
 */
export async function getUserDefaultStoreMembership(
  userId: string,
  organizationId?: string,
  clientOverride?: Queryable,
): Promise<(StoreMembership & { organizationId: string }) | null> {
  const executor = clientOverride ?? getPool();

  const query = organizationId
    ? `
      SELECT sm.id, sm.organization_membership_id, sm.store_id, sm.is_default, sm.is_active,
             sm.created_at, sm.updated_at, om.organization_id
      FROM store_memberships sm
      JOIN organization_memberships om ON sm.organization_membership_id = om.id
      WHERE om.user_id = $1
        AND om.organization_id = $2
        AND sm.is_default = true
        AND om.is_active = true
        AND sm.is_active = true
      LIMIT 1;
    `
    : `
      SELECT sm.id, sm.organization_membership_id, sm.store_id, sm.is_default, sm.is_active,
             sm.created_at, sm.updated_at, om.organization_id
      FROM store_memberships sm
      JOIN organization_memberships om ON sm.organization_membership_id = om.id
      WHERE om.user_id = $1
        AND sm.is_default = true
        AND om.is_active = true
        AND sm.is_active = true
      LIMIT 1;
    `;

  const params = organizationId ? [userId, organizationId] : [userId];
  const result = await executor.query<StoreMembershipWithOrgRow>(query, params);

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...mapRowToStoreMembership(row),
    organizationId: row.organization_id,
  };
}

/**
 * Lists all active store branches accessible to a user.
 */
export async function getUserAccessibleStores(
  userId: string,
  clientOverride?: Queryable,
): Promise<UserStoreAccess[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<{
    store_id: string;
    store_code: string;
    store_name: string;
    store_type: any;
    organization_id: string;
    organization_membership_id: string;
    store_membership_id: string;
    is_default: boolean;
    is_active: boolean;
  }>(
    `
    SELECT
      s.id as store_id,
      s.code as store_code,
      s.name as store_name,
      s.store_type as store_type,
      om.organization_id as organization_id,
      om.id as organization_membership_id,
      sm.id as store_membership_id,
      sm.is_default as is_default,
      sm.is_active as is_active
    FROM store_memberships sm
    JOIN organization_memberships om ON sm.organization_membership_id = om.id
    JOIN stores s ON sm.store_id = s.id
    WHERE om.user_id = $1
      AND om.is_active = true
      AND sm.is_active = true
      AND s.is_active = true
    ORDER BY sm.is_default DESC, s.name ASC;
    `,
    [userId],
  );

  return result.rows.map((row) => ({
    storeId: row.store_id,
    storeCode: row.store_code,
    storeName: row.store_name,
    storeType: row.store_type,
    organizationId: row.organization_id,
    organizationMembershipId: row.organization_membership_id,
    storeMembershipId: row.store_membership_id,
    isDefault: row.is_default,
    isActive: row.is_active,
  }));
}

/**
 * Assigns a role to a store membership.
 */
export async function assignRoleToStoreMembership(
  data: {
    id?: string;
    storeMembershipId: string;
    roleId: string;
    assignedByUserId?: string | null;
  },
  clientOverride?: Queryable,
): Promise<MembershipRole> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();

  const result = await executor.query<MembershipRoleRow>(
    `
    INSERT INTO membership_roles (
      id, store_membership_id, role_id, assigned_by_user_id, assigned_at, created_at
    )
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, store_membership_id, role_id, assigned_by_user_id, assigned_at, created_at;
    `,
    [id, data.storeMembershipId, data.roleId, data.assignedByUserId ?? null],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert membership role");
  }

  return mapRowToMembershipRole(row);
}


/**
 * Retrieves all roles assigned to a store membership.
 */
export async function getStoreMembershipRoles(
  storeMembershipId: string,
  clientOverride?: Queryable,
): Promise<Role[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<{
    id: string;
    organization_id: string | null;
    code: string;
    name: string;
    scope_level: any;
    is_system: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `
    SELECT r.id, r.organization_id, r.code, r.name, r.scope_level, r.is_system, r.created_at, r.updated_at
    FROM membership_roles mr
    JOIN roles r ON mr.role_id = r.id
    WHERE mr.store_membership_id = $1
    ORDER BY r.name ASC;
    `,
    [storeMembershipId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    scopeLevel: row.scope_level,
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
