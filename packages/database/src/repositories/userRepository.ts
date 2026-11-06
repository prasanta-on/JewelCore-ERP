import type { Pool, PoolClient } from "pg";
import type { User, UserPublic } from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toUserPublic(user: User): UserPublic {
  const { passwordHash: _hash, ...publicFields } = user;
  return publicFields;
}

export interface CreateUserData {
  id?: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  isActive?: boolean;
}

export async function createUser(
  data: CreateUserData,
  clientOverride?: Queryable,
): Promise<User> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();

  const result = await executor.query<UserRow>(
    `
    INSERT INTO users (
      id, organization_id, email, password_hash, first_name, last_name, phone, is_active,
      last_login_at, failed_login_attempts, locked_until, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, organization_id, email, password_hash, first_name, last_name, phone, is_active,
              last_login_at, failed_login_attempts, locked_until, created_at, updated_at;
    `,
    [
      id,
      data.organizationId,
      data.email.toLowerCase(),
      data.passwordHash,
      data.firstName,
      data.lastName,
      data.phone ?? null,
      data.isActive ?? true,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert user record");
  }

  return mapRowToUser(row);
}

export async function getUserById(
  id: string,
  clientOverride?: Queryable,
): Promise<User | null> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<UserRow>(
    `
    SELECT id, organization_id, email, password_hash, first_name, last_name, phone, is_active,
           last_login_at, failed_login_attempts, locked_until, created_at, updated_at
    FROM users
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToUser(row) : null;
}

export async function getUserByEmail(
  email: string,
  clientOverride?: Queryable,
): Promise<User | null> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<UserRow>(
    `
    SELECT id, organization_id, email, password_hash, first_name, last_name, phone, is_active,
           last_login_at, failed_login_attempts, locked_until, created_at, updated_at
    FROM users
    WHERE LOWER(email) = LOWER($1);
    `,
    [email],
  );

  const row = result.rows[0];
  return row ? mapRowToUser(row) : null;
}

export async function updateLastLogin(
  id: string,
  clientOverride?: Queryable,
): Promise<void> {
  const executor = clientOverride ?? getPool();

  await executor.query(
    `
    UPDATE users
    SET last_login_at = CURRENT_TIMESTAMP,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1;
    `,
    [id],
  );
}

export async function registerFailedLoginAttempt(
  id: string,
  maxAttempts: number = 5,
  lockMinutes: number = 15,
  clientOverride?: Queryable,
): Promise<{
  failedAttempts: number;
  isLocked: boolean;
  lockedUntil: Date | null;
}> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<{
    failed_login_attempts: number;
    locked_until: Date | null;
  }>(
    `
    UPDATE users
    SET failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE
          WHEN failed_login_attempts + 1 >= $2 THEN CURRENT_TIMESTAMP + ($3 || ' minutes')::INTERVAL
          ELSE locked_until
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING failed_login_attempts, locked_until;
    `,
    [id, maxAttempts, lockMinutes],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`User not found for failed login registration: ${id}`);
  }

  const isLocked =
    row.locked_until !== null && new Date(row.locked_until) > new Date();

  return {
    failedAttempts: row.failed_login_attempts,
    isLocked,
    lockedUntil: row.locked_until,
  };
}

export async function listUsersByOrganization(
  organizationId: string,
  clientOverride?: Queryable,
): Promise<User[]> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<UserRow>(
    `
    SELECT id, organization_id, email, password_hash, first_name, last_name, phone, is_active,
           last_login_at, failed_login_attempts, locked_until, created_at, updated_at
    FROM users
    WHERE organization_id = $1
    ORDER BY created_at ASC;
    `,
    [organizationId],
  );

  return result.rows.map(mapRowToUser);
}
