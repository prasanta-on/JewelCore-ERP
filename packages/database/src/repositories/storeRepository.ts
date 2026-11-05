import type { Pool, PoolClient } from "pg";
import type { Store, CreateStoreInput, StoreType } from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

interface StoreRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  store_type: StoreType;
  address_json: Record<string, unknown>;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToStore(row: StoreRow): Store {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    storeType: row.store_type,
    addressJson: row.address_json,
    phone: row.phone,
    email: row.email,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createStore(
  input: CreateStoreInput & { id?: string },
  clientOverride?: Queryable,
): Promise<Store> {
  const executor = clientOverride ?? getPool();
  const id = input.id ?? uuidv7();

  const result = await executor.query<StoreRow>(
    `
    INSERT INTO stores (
      id, organization_id, code, name, store_type, address_json, phone, email, is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, organization_id, code, name, store_type, address_json, phone, email, is_active, created_at, updated_at;
    `,
    [
      id,
      input.organizationId,
      input.code,
      input.name,
      input.storeType,
      JSON.stringify(input.addressJson ?? {}),
      input.phone ?? null,
      input.email ?? null,
      input.isActive ?? true,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert store record");
  }

  return mapRowToStore(row);
}

export async function getStoreById(
  id: string,
  clientOverride?: Queryable,
): Promise<Store | null> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<StoreRow>(
    `
    SELECT id, organization_id, code, name, store_type, address_json, phone, email, is_active, created_at, updated_at
    FROM stores
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToStore(row) : null;
}

export async function getStoreByCode(
  code: string,
  clientOverride?: Queryable,
): Promise<Store | null> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<StoreRow>(
    `
    SELECT id, organization_id, code, name, store_type, address_json, phone, email, is_active, created_at, updated_at
    FROM stores
    WHERE LOWER(code) = LOWER($1);
    `,
    [code],
  );

  const row = result.rows[0];
  return row ? mapRowToStore(row) : null;
}

export async function listStoresByOrganization(
  organizationId: string,
  clientOverride?: Queryable,
): Promise<Store[]> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<StoreRow>(
    `
    SELECT id, organization_id, code, name, store_type, address_json, phone, email, is_active, created_at, updated_at
    FROM stores
    WHERE organization_id = $1
    ORDER BY created_at ASC;
    `,
    [organizationId],
  );

  return result.rows.map(mapRowToStore);
}

export async function listAllStores(
  clientOverride?: Queryable,
): Promise<Store[]> {
  const executor = clientOverride ?? getPool();

  const result = await executor.query<StoreRow>(
    `
    SELECT id, organization_id, code, name, store_type, address_json, phone, email, is_active, created_at, updated_at
    FROM stores
    ORDER BY created_at ASC;
    `,
  );

  return result.rows.map(mapRowToStore);
}
