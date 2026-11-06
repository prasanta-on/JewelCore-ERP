import type { Pool, PoolClient } from "pg";
import {
  type GoodsReceiptNote,
  type GrnStatus,
  ConflictError,
  UnprocessableEntityError,
  NotFoundError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface GoodsReceiptNoteRow {
  id: string;
  organization_id: string;
  store_id: string;
  supplier_id: string;
  grn_number: string;
  status: GrnStatus;
  supplier_invoice_number: string | null;
  supplier_invoice_date: Date | null;
  received_date: Date;
  created_by_user_id: string;
  closed_by_user_id: string | null;
  closed_at: Date | null;
  remarks: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToGrn(row: GoodsReceiptNoteRow): GoodsReceiptNote {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    supplierId: row.supplier_id,
    grnNumber: row.grn_number,
    status: row.status,
    supplierInvoiceNumber: row.supplier_invoice_number,
    supplierInvoiceDate: row.supplier_invoice_date,
    receivedDate: row.received_date,
    createdByUserId: row.created_by_user_id,
    closedByUserId: row.closed_by_user_id,
    closedAt: row.closed_at,
    remarks: row.remarks,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new Goods Receipt Note (Entity 19) in DRAFT state.
 */
export async function createGrn(
  data: {
    id?: string;
    organizationId: string;
    storeId: string;
    supplierId: string;
    grnNumber?: string;
    supplierInvoiceNumber?: string | null;
    supplierInvoiceDate?: Date | null;
    receivedDate?: Date;
    createdByUserId: string;
    remarks?: string | null;
  },
  clientOverride?: Queryable,
): Promise<GoodsReceiptNote> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const grnNumber =
    data.grnNumber ??
    `GRN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const receivedDate = data.receivedDate ?? new Date();

  try {
    const result = await executor.query<GoodsReceiptNoteRow>(
      `
      INSERT INTO goods_receipt_notes (
        id, organization_id, store_id, supplier_id, grn_number,
        status, supplier_invoice_number, supplier_invoice_date, received_date,
        created_by_user_id, remarks, version,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, $8, $9, $10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, organization_id, store_id, supplier_id, grn_number,
                status, supplier_invoice_number, supplier_invoice_date, received_date,
                created_by_user_id, closed_by_user_id, closed_at, remarks, version,
                created_at, updated_at;
      `,
      [
        id,
        data.organizationId,
        data.storeId,
        data.supplierId,
        grnNumber,
        data.supplierInvoiceNumber ?? null,
        data.supplierInvoiceDate ?? null,
        receivedDate,
        data.createdByUserId,
        data.remarks ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert goods receipt note record");
    }

    return mapRowToGrn(row);
  } catch (err: any) {
    if (
      err.constraint === "goods_receipt_notes_grn_number_key" ||
      err.code === "23505"
    ) {
      throw new ConflictError(
        `GRN with number '${grnNumber}' already exists`,
        "ERR_DUPLICATE_GRN_NUMBER",
      );
    }
    if (err.constraint === "goods_receipt_notes_store_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced receiving store does not exist",
        "ERR_STORE_NOT_FOUND",
      );
    }
    if (err.constraint === "goods_receipt_notes_supplier_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced supplier does not exist",
        "ERR_SUPPLIER_NOT_FOUND",
      );
    }
    if (err.constraint === "goods_receipt_notes_created_by_user_id_fkey") {
      throw new UnprocessableEntityError(
        "Referenced user does not exist",
        "ERR_USER_NOT_FOUND",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a Goods Receipt Note by primary key ID.
 */
export async function getGrnById(
  id: string,
  clientOverride?: Queryable,
): Promise<GoodsReceiptNote | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<GoodsReceiptNoteRow>(
    `
    SELECT id, organization_id, store_id, supplier_id, grn_number,
           status, supplier_invoice_number, supplier_invoice_date, received_date,
           created_by_user_id, closed_by_user_id, closed_at, remarks, version,
           created_at, updated_at
    FROM goods_receipt_notes
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToGrn(row) : null;
}

/**
 * Retrieves a Goods Receipt Note by its unique GRN document number.
 */
export async function getGrnByNumber(
  grnNumber: string,
  clientOverride?: Queryable,
): Promise<GoodsReceiptNote | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<GoodsReceiptNoteRow>(
    `
    SELECT id, organization_id, store_id, supplier_id, grn_number,
           status, supplier_invoice_number, supplier_invoice_date, received_date,
           created_by_user_id, closed_by_user_id, closed_at, remarks, version,
           created_at, updated_at
    FROM goods_receipt_notes
    WHERE grn_number = $1;
    `,
    [grnNumber],
  );

  const row = result.rows[0];
  return row ? mapRowToGrn(row) : null;
}

/**
 * Lists Goods Receipt Notes for an organization with optional store, supplier, and status filters.
 */
export async function listGrns(
  params: {
    organizationId: string;
    storeId?: string;
    supplierId?: string;
    status?: GrnStatus;
  },
  clientOverride?: Queryable,
): Promise<GoodsReceiptNote[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = ["organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.storeId) {
    values.push(params.storeId);
    conditions.push(`store_id = $${values.length}`);
  }

  if (params.supplierId) {
    values.push(params.supplierId);
    conditions.push(`supplier_id = $${values.length}`);
  }

  if (params.status) {
    values.push(params.status);
    conditions.push(`status = $${values.length}`);
  }

  const query = `
    SELECT id, organization_id, store_id, supplier_id, grn_number,
           status, supplier_invoice_number, supplier_invoice_date, received_date,
           created_by_user_id, closed_by_user_id, closed_at, remarks, version,
           created_at, updated_at
    FROM goods_receipt_notes
    WHERE ${conditions.join(" AND ")}
    ORDER BY received_date DESC;
  `;

  const result = await executor.query<GoodsReceiptNoteRow>(query, values);
  return result.rows.map(mapRowToGrn);
}

/**
 * Updates a Goods Receipt Note in DRAFT or RECEIVED status.
 * Invariant: Once in CLOSED status, a GRN is strictly immutable and cannot be modified.
 */
export async function updateGrn(
  id: string,
  data: {
    supplierInvoiceNumber?: string | null;
    supplierInvoiceDate?: Date | null;
    remarks?: string | null;
    status?: GrnStatus;
  },
  clientOverride?: Queryable,
): Promise<GoodsReceiptNote> {
  const executor = clientOverride ?? getPool();

  const existing = await getGrnById(id, executor);
  if (!existing) {
    throw new NotFoundError("Goods Receipt Note", id);
  }

  if (existing.status === "CLOSED") {
    throw new UnprocessableEntityError(
      "Closed GRN is strictly immutable and cannot be modified",
      "ERR_GRN_IMMUTABLE",
    );
  }

  const updates: string[] = [];
  const values: any[] = [id];

  if (data.supplierInvoiceNumber !== undefined) {
    values.push(data.supplierInvoiceNumber);
    updates.push(`supplier_invoice_number = $${values.length}`);
  }
  if (data.supplierInvoiceDate !== undefined) {
    values.push(data.supplierInvoiceDate);
    updates.push(`supplier_invoice_date = $${values.length}`);
  }
  if (data.remarks !== undefined) {
    values.push(data.remarks);
    updates.push(`remarks = $${values.length}`);
  }
  if (data.status !== undefined) {
    values.push(data.status);
    updates.push(`status = $${values.length}`);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push(`version = version + 1`);
  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE goods_receipt_notes
    SET ${updates.join(", ")}
    WHERE id = $1
    RETURNING id, organization_id, store_id, supplier_id, grn_number,
              status, supplier_invoice_number, supplier_invoice_date, received_date,
              created_by_user_id, closed_by_user_id, closed_at, remarks, version,
              created_at, updated_at;
  `;

  const result = await executor.query<GoodsReceiptNoteRow>(query, values);
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("Goods Receipt Note", id);
  }

  return mapRowToGrn(row);
}

/**
 * Transitions a GRN to CLOSED status with an immutable lock and captures closing authorizer.
 */
export async function closeGrn(
  id: string,
  closedByUserId: string,
  remarks?: string | null,
  clientOverride?: Queryable,
): Promise<GoodsReceiptNote> {
  const executor = clientOverride ?? getPool();

  const existing = await getGrnById(id, executor);
  if (!existing) {
    throw new NotFoundError("Goods Receipt Note", id);
  }

  if (existing.status === "CLOSED") {
    throw new UnprocessableEntityError(
      "GRN is already closed and locked",
      "ERR_GRN_ALREADY_CLOSED",
    );
  }

  const result = await executor.query<GoodsReceiptNoteRow>(
    `
    UPDATE goods_receipt_notes
    SET status = 'CLOSED',
        closed_by_user_id = $2,
        closed_at = CURRENT_TIMESTAMP,
        remarks = COALESCE($3, remarks),
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, organization_id, store_id, supplier_id, grn_number,
              status, supplier_invoice_number, supplier_invoice_date, received_date,
              created_by_user_id, closed_by_user_id, closed_at, remarks, version,
              created_at, updated_at;
    `,
    [id, closedByUserId, remarks ?? null],
  );

  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError("Goods Receipt Note", id);
  }

  return mapRowToGrn(row);
}
