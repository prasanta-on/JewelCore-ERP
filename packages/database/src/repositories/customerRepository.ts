import type { Pool, PoolClient } from "pg";
import {
  type CustomerRecord,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type ListCustomersQuery,
  type CustomerStatus,
  NotFoundError,
  ConflictError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface CustomerRow {
  id: string;
  organization_id: string;
  customer_code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string;
  tax_identifier: string | null;
  tags: string[] | null;
  notes: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapRowToCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerCode: row.customer_code,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    stateProvince: row.state_province,
    postalCode: row.postal_code,
    country: row.country,
    taxIdentifier: row.tax_identifier,
    tags: Array.isArray(row.tags) ? row.tags : [],
    notes: row.notes,
    status: row.status as CustomerStatus,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

/**
 * Creates a new customer profile record (Entity 48 - FEAT-SALES-01).
 */
export async function createCustomer(
  input: CreateCustomerInput & { organizationId: string },
  clientOverride?: Queryable,
): Promise<CustomerRecord> {
  const client = clientOverride || getPool();
  const id = uuidv7();

  try {
    const res = await client.query<CustomerRow>(
      `
      INSERT INTO customers (
        id,
        organization_id,
        customer_code,
        first_name,
        last_name,
        email,
        phone,
        address_line1,
        address_line2,
        city,
        state_province,
        postal_code,
        country,
        tax_identifier,
        tags,
        notes,
        status,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
      `,
      [
        id,
        input.organizationId,
        input.customerCode,
        input.firstName,
        input.lastName,
        input.email ?? null,
        input.phone ?? null,
        input.addressLine1 ?? null,
        input.addressLine2 ?? null,
        input.city ?? null,
        input.stateProvince ?? null,
        input.postalCode ?? null,
        input.country ?? "CA",
        input.taxIdentifier ?? null,
        input.tags ?? [],
        input.notes ?? null,
        input.status ?? "ACTIVE",
      ],
    );

    const row = res.rows[0];
    if (!row) {
      throw new Error("Failed to insert customer record");
    }

    return mapRowToCustomer(row);
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "uq_customers_org_code") {
      throw new ConflictError(
        `Customer code already exists: ${input.customerCode}`,
        "ERR_CUSTOMER_CODE_EXISTS",
      );
    }
    throw err;
  }
}

/**
 * Updates an existing customer profile record.
 */
export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<CustomerRecord> {
  const client = clientOverride || getPool();

  const updates: string[] = [];
  const values: any[] = [id, organizationId];

  if (input.firstName !== undefined) {
    values.push(input.firstName);
    updates.push(`first_name = $${values.length}`);
  }
  if (input.lastName !== undefined) {
    values.push(input.lastName);
    updates.push(`last_name = $${values.length}`);
  }
  if (input.email !== undefined) {
    values.push(input.email);
    updates.push(`email = $${values.length}`);
  }
  if (input.phone !== undefined) {
    values.push(input.phone);
    updates.push(`phone = $${values.length}`);
  }
  if (input.addressLine1 !== undefined) {
    values.push(input.addressLine1);
    updates.push(`address_line1 = $${values.length}`);
  }
  if (input.addressLine2 !== undefined) {
    values.push(input.addressLine2);
    updates.push(`address_line2 = $${values.length}`);
  }
  if (input.city !== undefined) {
    values.push(input.city);
    updates.push(`city = $${values.length}`);
  }
  if (input.stateProvince !== undefined) {
    values.push(input.stateProvince);
    updates.push(`state_province = $${values.length}`);
  }
  if (input.postalCode !== undefined) {
    values.push(input.postalCode);
    updates.push(`postal_code = $${values.length}`);
  }
  if (input.country !== undefined) {
    values.push(input.country);
    updates.push(`country = $${values.length}`);
  }
  if (input.taxIdentifier !== undefined) {
    values.push(input.taxIdentifier);
    updates.push(`tax_identifier = $${values.length}`);
  }
  if (input.tags !== undefined) {
    values.push(input.tags);
    updates.push(`tags = $${values.length}`);
  }
  if (input.notes !== undefined) {
    values.push(input.notes);
    updates.push(`notes = $${values.length}`);
  }
  if (input.status !== undefined) {
    values.push(input.status);
    updates.push(`status = $${values.length}`);
  }

  if (updates.length === 0) {
    const existing = await getCustomerById({ id, organizationId }, client);
    if (!existing) {
      throw new NotFoundError(`Customer not found: ${id}`, "ERR_NOT_FOUND");
    }
    return existing;
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  const res = await client.query<CustomerRow>(
    `
    UPDATE customers
    SET ${updates.join(", ")}
    WHERE id = $1 AND organization_id = $2
    RETURNING *
    `,
    values,
  );

  const row = res.rows[0];
  if (!row) {
    throw new NotFoundError(`Customer not found: ${id}`, "ERR_NOT_FOUND");
  }

  return mapRowToCustomer(row);
}

/**
 * Retrieves a customer profile by ID scoped to the organization.
 */
export async function getCustomerById(
  params: { id: string; organizationId: string },
  clientOverride?: Queryable,
): Promise<CustomerRecord | null> {
  const client = clientOverride || getPool();

  const res = await client.query<CustomerRow>(
    `
    SELECT *
    FROM customers
    WHERE id = $1 AND organization_id = $2
    `,
    [params.id, params.organizationId],
  );

  const row = res.rows[0];
  if (!row) return null;

  return mapRowToCustomer(row);
}

/**
 * Lists customer profiles with search and filtering.
 */
export async function listCustomers(
  params: ListCustomersQuery & { organizationId: string },
  clientOverride?: Queryable,
): Promise<{ data: CustomerRecord[]; total: number }> {
  const client = clientOverride || getPool();
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const conditions: string[] = ["organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.search) {
    values.push(`%${params.search}%`);
    const idx = values.length;
    conditions.push(
      `(customer_code ILIKE $${idx} OR first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx})`,
    );
  }

  if (params.status) {
    values.push(params.status);
    conditions.push(`status = $${values.length}`);
  }

  if (params.tag) {
    values.push(params.tag);
    conditions.push(`$${values.length} = ANY(tags)`);
  }

  const whereClause = conditions.join(" AND ");

  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM customers WHERE ${whereClause}`,
    values,
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  values.push(limit, offset);
  const dataRes = await client.query<CustomerRow>(
    `
    SELECT *
    FROM customers
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values,
  );

  return {
    data: dataRes.rows.map(mapRowToCustomer),
    total,
  };
}
