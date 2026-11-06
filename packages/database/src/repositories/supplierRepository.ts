import type { Pool, PoolClient } from "pg";
import {
  type Supplier,
  ConflictError,
  NotFoundError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface SupplierRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  tax_identifier: string | null;
  currency_code: string;
  payment_terms: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    taxIdentifier: row.tax_identifier,
    currencyCode: row.currency_code,
    paymentTerms: row.payment_terms,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new supplier vendor profile (Entity 18) under an organization.
 * Enforces candidate business key (organization_id, code).
 */
export async function createSupplier(
  data: {
    id?: string;
    organizationId: string;
    code: string;
    name: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    taxIdentifier?: string | null;
    currencyCode?: string;
    paymentTerms?: string | null;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Supplier> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const currencyCode = data.currencyCode ?? "CAD";
  const isActive = data.isActive ?? true;

  try {
    const result = await executor.query<SupplierRow>(
      `
      INSERT INTO suppliers (
        id, organization_id, code, name, contact_name, email, phone,
        tax_identifier, currency_code, payment_terms, is_active,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, organization_id, code, name, contact_name, email, phone,
                tax_identifier, currency_code, payment_terms, is_active,
                created_at, updated_at;
      `,
      [
        id,
        data.organizationId,
        data.code,
        data.name,
        data.contactName ?? null,
        data.email ?? null,
        data.phone ?? null,
        data.taxIdentifier ?? null,
        currencyCode,
        data.paymentTerms ?? null,
        isActive,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert supplier record");
    }

    return mapRowToSupplier(row);
  } catch (err: any) {
    if (err.constraint === "uq_suppliers_org_code" || err.code === "23505") {
      throw new ConflictError(
        `Supplier with code '${data.code}' already exists in this organization`,
        "ERR_DUPLICATE_SUPPLIER_CODE",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a supplier by primary key ID.
 */
export async function getSupplierById(
  id: string,
  clientOverride?: Queryable,
): Promise<Supplier | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<SupplierRow>(
    `
    SELECT id, organization_id, code, name, contact_name, email, phone,
           tax_identifier, currency_code, payment_terms, is_active,
           created_at, updated_at
    FROM suppliers
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToSupplier(row) : null;
}

/**
 * Retrieves a supplier by organization ID and supplier code.
 */
export async function getSupplierByCode(
  organizationId: string,
  code: string,
  clientOverride?: Queryable,
): Promise<Supplier | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<SupplierRow>(
    `
    SELECT id, organization_id, code, name, contact_name, email, phone,
           tax_identifier, currency_code, payment_terms, is_active,
           created_at, updated_at
    FROM suppliers
    WHERE organization_id = $1 AND code = $2;
    `,
    [organizationId, code],
  );

  const row = result.rows[0];
  return row ? mapRowToSupplier(row) : null;
}

/**
 * Lists suppliers for an organization with optional active filter.
 */
export async function listSuppliers(
  params: {
    organizationId: string;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Supplier[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.isActive !== undefined) {
    values.push(params.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const query = `
    SELECT id, organization_id, code, name, contact_name, email, phone,
           tax_identifier, currency_code, payment_terms, is_active,
           created_at, updated_at
    FROM suppliers
    WHERE ${conditions.join(" AND ")}
    ORDER BY name ASC;
  `;

  const result = await executor.query<SupplierRow>(query, values);
  return result.rows.map(mapRowToSupplier);
}

/**
 * Updates an existing supplier record.
 */
export async function updateSupplier(
  id: string,
  data: {
    name?: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    taxIdentifier?: string | null;
    currencyCode?: string;
    paymentTerms?: string | null;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Supplier> {
  const executor = clientOverride ?? getPool();

  const existing = await getSupplierById(id, executor);
  if (!existing) {
    throw new NotFoundError("Supplier", id);
  }

  const updates: string[] = [];
  const values: any[] = [id];

  if (data.name !== undefined) {
    values.push(data.name);
    updates.push(`name = $${values.length}`);
  }
  if (data.contactName !== undefined) {
    values.push(data.contactName);
    updates.push(`contact_name = $${values.length}`);
  }
  if (data.email !== undefined) {
    values.push(data.email);
    updates.push(`email = $${values.length}`);
  }
  if (data.phone !== undefined) {
    values.push(data.phone);
    updates.push(`phone = $${values.length}`);
  }
  if (data.taxIdentifier !== undefined) {
    values.push(data.taxIdentifier);
    updates.push(`tax_identifier = $${values.length}`);
  }
  if (data.currencyCode !== undefined) {
    values.push(data.currencyCode);
    updates.push(`currency_code = $${values.length}`);
  }
  if (data.paymentTerms !== undefined) {
    values.push(data.paymentTerms);
    updates.push(`payment_terms = $${values.length}`);
  }
  if (data.isActive !== undefined) {
    values.push(data.isActive);
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE suppliers
    SET ${updates.join(", ")}
    WHERE id = $1
    RETURNING id, organization_id, code, name, contact_name, email, phone,
              tax_identifier, currency_code, payment_terms, is_active,
              created_at, updated_at;
  `;

  const result = await executor.query<SupplierRow>(query, values);
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("Supplier", id);
  }
  return mapRowToSupplier(row);
}
