import type { Pool, PoolClient } from "pg";
import type { Organization, CreateOrganizationInput } from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

interface OrganizationRow {
  id: string;
  code: string;
  name: string;
  currency: string;
  tax_identifier: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    currency: row.currency,
    taxIdentifier: row.tax_identifier,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createOrganization(
  input: CreateOrganizationInput & { id?: string },
  clientOverride?: Queryable,
): Promise<Organization> {
  const executor = clientOverride ?? getPool();
  const id = input.id ?? uuidv7();

  const result = await executor.query<OrganizationRow>(
    `
    INSERT INTO organizations (
      id, code, name, currency, tax_identifier, is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, code, name, currency, tax_identifier, is_active, created_at, updated_at;
    `,
    [
      id,
      input.code,
      input.name,
      input.currency ?? "CAD",
      input.taxIdentifier ?? null,
      input.isActive ?? true,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert organization record");
  }

  return mapRowToOrganization(row);
}

export async function getOrganizationById(
  id: string,
  clientOverride?: Queryable,
): Promise<Organization | null> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<OrganizationRow>(
    `
    SELECT id, code, name, currency, tax_identifier, is_active, created_at, updated_at
    FROM organizations
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToOrganization(row) : null;
}

export async function getOrganizationByCode(
  code: string,
  clientOverride?: Queryable,
): Promise<Organization | null> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<OrganizationRow>(
    `
    SELECT id, code, name, currency, tax_identifier, is_active, created_at, updated_at
    FROM organizations
    WHERE LOWER(code) = LOWER($1);
    `,
    [code],
  );

  const row = result.rows[0];
  return row ? mapRowToOrganization(row) : null;
}

export async function listOrganizations(
  clientOverride?: Queryable,
): Promise<Organization[]> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<OrganizationRow>(
    `
    SELECT id, code, name, currency, tax_identifier, is_active, created_at, updated_at
    FROM organizations
    ORDER BY created_at ASC;
    `,
  );

  return result.rows.map(mapRowToOrganization);
}
