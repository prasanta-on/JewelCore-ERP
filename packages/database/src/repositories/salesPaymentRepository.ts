import type { Pool, PoolClient } from "pg";
import {
  type SalesPaymentRecord,
  type SalesInvoiceRecord,
  type RecordSalesPaymentInput,
  type ListSalesPaymentsQuery,
  type PaymentMethod,
  type PaymentStatus,
  NotFoundError,
  BadRequestError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";
import {
  type SalesInvoiceRow,
  mapRowToSalesInvoice,
} from "./salesInvoiceRepository.js";

type Queryable = Pool | PoolClient;

export interface SalesPaymentRow {
  id: string;
  organization_id: string;
  store_id: string;
  sales_invoice_id: string;
  received_by_user_id: string;
  payment_method: string;
  amount_cad: string | number;
  currency: string;
  status: string;
  reference_number: string | null;
  card_last4: string | null;
  notes: string | null;
  created_at: Date | string;
  received_by_user_name?: string;
  invoice_number?: string;
}

export function mapRowToSalesPayment(row: SalesPaymentRow): SalesPaymentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    salesInvoiceId: row.sales_invoice_id,
    receivedByUserId: row.received_by_user_id,
    paymentMethod: row.payment_method as PaymentMethod,
    amountCad: Number(row.amount_cad),
    currency: row.currency,
    status: row.status as PaymentStatus,
    referenceNumber: row.reference_number,
    cardLast4: row.card_last4,
    notes: row.notes,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    receivedByUserName: row.received_by_user_name,
    invoiceNumber: row.invoice_number,
  };
}

/**
 * Records a customer tender payment against an active sales invoice (Entity 51 - FEAT-SALES-03).
 * Supports multi-mode split tender, protects against overpayment, and updates invoice balances.
 */
export async function recordSalesPayment(
  input: RecordSalesPaymentInput & {
    organizationId: string;
    storeId: string;
    receivedByUserId: string;
  },
  clientOverride?: Queryable,
): Promise<{ payment: SalesPaymentRecord; invoice: SalesInvoiceRecord }> {
  const runner = async (
    client: Queryable,
  ): Promise<{ payment: SalesPaymentRecord; invoice: SalesInvoiceRecord }> => {
    // 1. Lock sales invoice with SELECT FOR UPDATE
    const invRes = await client.query<SalesInvoiceRow>(
      `
      SELECT
        si.*,
        c.first_name || ' ' || c.last_name AS customer_name,
        s.name AS store_name
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      JOIN stores s ON s.id = si.store_id
      WHERE si.id = $1 AND si.organization_id = $2
      FOR UPDATE
      `,
      [input.salesInvoiceId, input.organizationId],
    );

    const invoice = invRes.rows[0];
    if (!invoice) {
      throw new NotFoundError("SalesInvoice", input.salesInvoiceId);
    }

    if (invoice.status === "CANCELLED") {
      throw new UnprocessableEntityError(
        "Cannot record payment for a cancelled sales invoice",
        "ERR_INVOICE_CANCELLED",
      );
    }

    const currentBalanceDue = Number(invoice.balance_due_cad);
    if (invoice.status === "PAID" || currentBalanceDue <= 0) {
      throw new UnprocessableEntityError(
        "Sales invoice is already fully paid and settled",
        "ERR_INVOICE_ALREADY_PAID",
      );
    }

    // 2. Validate payment amount does not exceed balance due
    if (input.amountCad > currentBalanceDue + 0.0001) {
      throw new BadRequestError(
        `Payment amount CAD ${input.amountCad.toFixed(2)} exceeds remaining invoice balance of CAD ${currentBalanceDue.toFixed(2)}`,
        "ERR_PAYMENT_EXCEEDS_BALANCE",
      );
    }

    // 3. Insert append-only payment record (Entity 51 / INV-09)
    const paymentId = uuidv7();
    const paymentRes = await client.query<SalesPaymentRow>(
      `
      INSERT INTO sales_payments (
        id,
        organization_id,
        store_id,
        sales_invoice_id,
        received_by_user_id,
        payment_method,
        amount_cad,
        currency,
        status,
        reference_number,
        card_last4,
        notes,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'CAD', 'SUCCESS', $8, $9, $10, CURRENT_TIMESTAMP
      )
      RETURNING *
      `,
      [
        paymentId,
        input.organizationId,
        input.storeId,
        input.salesInvoiceId,
        input.receivedByUserId,
        input.paymentMethod,
        input.amountCad,
        input.referenceNumber ?? null,
        input.cardLast4 ?? null,
        input.notes ?? null,
      ],
    );

    const paymentRow = paymentRes.rows[0];
    if (!paymentRow) {
      throw new Error("Failed to insert sales payment record");
    }

    // 4. Compute updated invoice balance & status
    const currentPaid = Number(invoice.paid_amount_cad);
    const invoiceTotal = Number(invoice.total_amount_cad);
    const updatedPaid =
      Math.round((currentPaid + input.amountCad) * 10000) / 10000;
    const updatedBalance = Math.max(
      0,
      Math.round((invoiceTotal - updatedPaid) * 10000) / 10000,
    );
    const updatedStatus = updatedBalance === 0 ? "PAID" : "PARTIALLY_PAID";

    // 5. Update invoice
    const updatedInvRes = await client.query<SalesInvoiceRow>(
      `
      UPDATE sales_invoices
      SET
        paid_amount_cad = $1,
        balance_due_cad = $2,
        status = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND organization_id = $5
      RETURNING *
      `,
      [
        updatedPaid,
        updatedBalance,
        updatedStatus,
        input.salesInvoiceId,
        input.organizationId,
      ],
    );

    const updatedInvRow = updatedInvRes.rows[0]!;

    return {
      payment: {
        ...mapRowToSalesPayment(paymentRow),
        invoiceNumber: invoice.invoice_number,
      },
      invoice: {
        ...mapRowToSalesInvoice(updatedInvRow),
        customerName: invoice.customer_name,
        storeName: invoice.store_name,
      },
    };
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Retrieves a payment record by ID scoped to the organization.
 */
export async function getSalesPaymentById(
  params: { id: string; organizationId: string },
  clientOverride?: Queryable,
): Promise<SalesPaymentRecord | null> {
  const client = clientOverride || getPool();

  const res = await client.query<SalesPaymentRow>(
    `
    SELECT
      sp.*,
      u.first_name || ' ' || u.last_name AS received_by_user_name,
      si.invoice_number
    FROM sales_payments sp
    JOIN users u ON u.id = sp.received_by_user_id
    JOIN sales_invoices si ON si.id = sp.sales_invoice_id
    WHERE sp.id = $1 AND sp.organization_id = $2
    `,
    [params.id, params.organizationId],
  );

  const row = res.rows[0];
  if (!row) return null;

  return mapRowToSalesPayment(row);
}

/**
 * Lists sales payments with filtering by invoice, payment method, and status.
 */
export async function listSalesPayments(
  params: ListSalesPaymentsQuery & { organizationId: string },
  clientOverride?: Queryable,
): Promise<{ data: SalesPaymentRecord[]; total: number }> {
  const client = clientOverride || getPool();
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const conditions: string[] = ["sp.organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.salesInvoiceId) {
    values.push(params.salesInvoiceId);
    conditions.push(`sp.sales_invoice_id = $${values.length}`);
  }

  if (params.paymentMethod) {
    values.push(params.paymentMethod);
    conditions.push(`sp.payment_method = $${values.length}`);
  }

  if (params.status) {
    values.push(params.status);
    conditions.push(`sp.status = $${values.length}`);
  }

  const whereClause = conditions.join(" AND ");

  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM sales_payments sp WHERE ${whereClause}`,
    values,
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  values.push(limit, offset);
  const dataRes = await client.query<SalesPaymentRow>(
    `
    SELECT
      sp.*,
      u.first_name || ' ' || u.last_name AS received_by_user_name,
      si.invoice_number
    FROM sales_payments sp
    JOIN users u ON u.id = sp.received_by_user_id
    JOIN sales_invoices si ON si.id = sp.sales_invoice_id
    WHERE ${whereClause}
    ORDER BY sp.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values,
  );

  return {
    data: dataRes.rows.map(mapRowToSalesPayment),
    total,
  };
}
