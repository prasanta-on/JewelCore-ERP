import type { Pool, PoolClient } from "pg";
import {
  type SalesInvoiceRecord,
  type SalesInvoiceItemRecord,
  type FinalizeSaleAndReleaseResult,
  type CreateSalesInvoiceInput,
  type ListSalesInvoicesQuery,
  type SalesInvoiceStatus,
  NotFoundError,
  ConflictError,
  BadRequestError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface SalesInvoiceRow {
  id: string;
  organization_id: string;
  store_id: string;
  customer_id: string;
  created_by_user_id: string;
  invoice_number: string;
  status: string;
  currency: string;
  subtotal_cad: string | number;
  tax_amount_cad: string | number;
  discount_amount_cad: string | number;
  total_amount_cad: string | number;
  paid_amount_cad: string | number;
  balance_due_cad: string | number;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  released_at?: Date | string | null;
  released_by_user_id?: string | null;
  customer_name?: string;
  store_name?: string;
}

export interface SalesInvoiceItemRow {
  id: string;
  organization_id: string;
  sales_invoice_id: string;
  inventory_item_id: string;
  price_snapshot_id: string | null;
  unit_price_cad: string | number;
  discount_amount_cad: string | number;
  final_price_cad: string | number;
  tax_rate: string | number;
  tax_amount_cad: string | number;
  line_total_cad: string | number;
  notes: string | null;
  created_at: Date | string;
  item_serial_number?: string;
  item_name?: string;
}

export function mapRowToSalesInvoiceItem(
  row: SalesInvoiceItemRow,
): SalesInvoiceItemRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    salesInvoiceId: row.sales_invoice_id,
    inventoryItemId: row.inventory_item_id,
    priceSnapshotId: row.price_snapshot_id,
    unitPriceCad: Number(row.unit_price_cad),
    discountAmountCad: Number(row.discount_amount_cad),
    finalPriceCad: Number(row.final_price_cad),
    taxRate: Number(row.tax_rate),
    taxAmountCad: Number(row.tax_amount_cad),
    lineTotalCad: Number(row.line_total_cad),
    notes: row.notes,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    itemSerialNumber: row.item_serial_number,
    itemName: row.item_name,
  };
}

export function mapRowToSalesInvoice(
  row: SalesInvoiceRow,
  items?: SalesInvoiceItemRecord[],
): SalesInvoiceRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    customerId: row.customer_id,
    createdByUserId: row.created_by_user_id,
    invoiceNumber: row.invoice_number,
    status: row.status as SalesInvoiceStatus,
    currency: row.currency,
    subtotalCad: Number(row.subtotal_cad),
    taxAmountCad: Number(row.tax_amount_cad),
    discountAmountCad: Number(row.discount_amount_cad),
    totalAmountCad: Number(row.total_amount_cad),
    paidAmountCad: Number(row.paid_amount_cad),
    balanceDueCad: Number(row.balance_due_cad),
    notes: row.notes,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at
        : new Date(row.updated_at),
    releasedAt: row.released_at
      ? row.released_at instanceof Date
        ? row.released_at
        : new Date(row.released_at)
      : null,
    releasedByUserId: row.released_by_user_id ?? null,
    items,
    customerName: row.customer_name,
    storeName: row.store_name,
  };
}

/**
 * Creates a new sales invoice with line items (Entities 49 & 50 - FEAT-SALES-02).
 * Atomically reserves the physical pieces to prevent floor double-selling.
 */
export async function createSalesInvoice(
  input: CreateSalesInvoiceInput & {
    organizationId: string;
    createdByUserId: string;
  },
  clientOverride?: Queryable,
): Promise<SalesInvoiceRecord> {
  const runner = async (client: Queryable): Promise<SalesInvoiceRecord> => {
    // 1. Verify Customer
    const custRes = await client.query<{
      id: string;
      status: string;
      first_name: string;
      last_name: string;
    }>(
      `SELECT id, status, first_name, last_name FROM customers WHERE id = $1 AND organization_id = $2`,
      [input.customerId, input.organizationId],
    );

    const customer = custRes.rows[0];
    if (!customer) {
      throw new NotFoundError("Customer", input.customerId);
    }
    if (customer.status !== "ACTIVE") {
      throw new UnprocessableEntityError(
        `Cannot issue invoice to ${customer.status.toLowerCase()} customer`,
        "ERR_CUSTOMER_INACTIVE",
      );
    }

    // 2. Verify Store
    const storeRes = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM stores WHERE id = $1 AND organization_id = $2 AND is_active = true`,
      [input.storeId, input.organizationId],
    );

    const store = storeRes.rows[0];
    if (!store) {
      throw new NotFoundError("Store", input.storeId);
    }

    // 3. Check for duplicate inventory item IDs in input
    const itemIds = input.items.map((i) => i.inventoryItemId);
    const uniqueIds = new Set(itemIds);
    if (uniqueIds.size !== itemIds.length) {
      throw new BadRequestError(
        "Duplicate inventory items specified in invoice lines",
        "ERR_DUPLICATE_LINE_ITEM",
      );
    }

    // 4. Validate and lock each inventory item with SELECT FOR UPDATE
    const validatedItems: Array<{
      id: string;
      inventoryItemId: string;
      priceSnapshotId: string | null;
      unitPriceCad: number;
      discountAmountCad: number;
      finalPriceCad: number;
      taxRate: number;
      taxAmountCad: number;
      lineTotalCad: number;
      notes: string | null;
      itemSerialNumber: string;
      itemName: string;
    }> = [];

    for (const itemInput of input.items) {
      const pieceRes = await client.query<{
        id: string;
        store_id: string;
        serial_number: string;
        item_name: string;
        commercial_state: string;
        custody_state: string;
        selling_price_cad: string | number | null;
      }>(
        `
        SELECT id, store_id, serial_number, item_name, commercial_state, custody_state, selling_price_cad
        FROM inventory_items
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE
        `,
        [itemInput.inventoryItemId, input.organizationId],
      );

      const piece = pieceRes.rows[0];
      if (!piece) {
        throw new NotFoundError("InventoryItem", itemInput.inventoryItemId);
      }

      if (piece.store_id !== input.storeId) {
        throw new BadRequestError(
          `Inventory piece ${piece.serial_number} is not in store ${store.name}`,
          "ERR_STORE_MISMATCH",
        );
      }

      if (piece.commercial_state !== "AVAILABLE_FOR_SALE") {
        throw new UnprocessableEntityError(
          `Inventory piece ${piece.serial_number} is not available for sale (current state: ${piece.commercial_state})`,
          "ERR_ITEM_NOT_AVAILABLE_FOR_SALE",
        );
      }

      const unitPriceCad = itemInput.unitPriceCad;
      const discountAmountCad = itemInput.discountAmountCad ?? 0;
      const finalPriceCad = Math.max(0, unitPriceCad - discountAmountCad);
      const taxRate = itemInput.taxRate ?? 0.13;
      const taxAmountCad =
        Math.round(finalPriceCad * taxRate * 10000) / 10000;
      const lineTotalCad =
        Math.round((finalPriceCad + taxAmountCad) * 10000) / 10000;

      validatedItems.push({
        id: uuidv7(),
        inventoryItemId: piece.id,
        priceSnapshotId: itemInput.priceSnapshotId ?? null,
        unitPriceCad,
        discountAmountCad,
        finalPriceCad,
        taxRate,
        taxAmountCad,
        lineTotalCad,
        notes: itemInput.notes ?? null,
        itemSerialNumber: piece.serial_number,
        itemName: piece.item_name,
      });
    }

    // 5. Compute Invoice Totals
    const subtotalCad = validatedItems.reduce(
      (sum, item) => sum + item.finalPriceCad,
      0,
    );
    const taxAmountCad = validatedItems.reduce(
      (sum, item) => sum + item.taxAmountCad,
      0,
    );
    const invoiceDiscountAmountCad = input.discountAmountCad ?? 0;
    const totalAmountCad = Math.max(
      0,
      subtotalCad + taxAmountCad - invoiceDiscountAmountCad,
    );
    const paidAmountCad = 0;
    const balanceDueCad = totalAmountCad;

    const invoiceId = uuidv7();
    const invoiceNumber =
      input.invoiceNumber ??
      `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${invoiceId.slice(0, 8).toUpperCase()}`;

    // 6. Insert Sales Invoice
    try {
      const invRes = await client.query<SalesInvoiceRow>(
        `
        INSERT INTO sales_invoices (
          id,
          organization_id,
          store_id,
          customer_id,
          created_by_user_id,
          invoice_number,
          status,
          currency,
          subtotal_cad,
          tax_amount_cad,
          discount_amount_cad,
          total_amount_cad,
          paid_amount_cad,
          balance_due_cad,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, 'PENDING_PAYMENT', 'CAD',
          $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
        `,
        [
          invoiceId,
          input.organizationId,
          input.storeId,
          input.customerId,
          input.createdByUserId,
          invoiceNumber,
          subtotalCad,
          taxAmountCad,
          invoiceDiscountAmountCad,
          totalAmountCad,
          paidAmountCad,
          balanceDueCad,
          input.notes ?? null,
        ],
      );

      const invoiceRow = invRes.rows[0];
      if (!invoiceRow) {
        throw new Error("Failed to insert sales invoice record");
      }

      // 7. Insert Line Items
      const createdItems: SalesInvoiceItemRecord[] = [];
      for (const item of validatedItems) {
        const itemRes = await client.query<SalesInvoiceItemRow>(
          `
          INSERT INTO sales_invoice_items (
            id,
            organization_id,
            sales_invoice_id,
            inventory_item_id,
            price_snapshot_id,
            unit_price_cad,
            discount_amount_cad,
            final_price_cad,
            tax_rate,
            tax_amount_cad,
            line_total_cad,
            notes,
            created_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP
          )
          RETURNING *
          `,
          [
            item.id,
            input.organizationId,
            invoiceId,
            item.inventoryItemId,
            item.priceSnapshotId,
            item.unitPriceCad,
            item.discountAmountCad,
            item.finalPriceCad,
            item.taxRate,
            item.taxAmountCad,
            item.lineTotalCad,
            item.notes,
          ],
        );

        const row = itemRes.rows[0];
        if (row) {
          createdItems.push({
            ...mapRowToSalesInvoiceItem(row),
            itemSerialNumber: item.itemSerialNumber,
            itemName: item.itemName,
          });
        }
      }

      // 8. Reserve the physical pieces to prevent concurrent sales
      await client.query(
        `
        UPDATE inventory_items
        SET commercial_state = 'RESERVED', updated_at = clock_timestamp()
        WHERE id = ANY($1::uuid[])
        `,
        [itemIds],
      );

      return {
        ...mapRowToSalesInvoice(invoiceRow, createdItems),
        customerName: `${customer.first_name} ${customer.last_name}`,
        storeName: store.name,
      };
    } catch (err: any) {
      if (
        err.code === "23505" &&
        err.constraint === "uq_sales_invoices_org_number"
      ) {
        throw new ConflictError(
          `Invoice number already exists: ${invoiceNumber}`,
          "ERR_INVOICE_NUMBER_EXISTS",
        );
      }
      throw err;
    }
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Retrieves a sales invoice with its line items.
 */
export async function getSalesInvoiceById(
  params: { id: string; organizationId: string },
  clientOverride?: Queryable,
): Promise<SalesInvoiceRecord | null> {
  const client = clientOverride || getPool();

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
    `,
    [params.id, params.organizationId],
  );

  const invRow = invRes.rows[0];
  if (!invRow) return null;

  const itemsRes = await client.query<SalesInvoiceItemRow>(
    `
    SELECT
      sii.*,
      ii.serial_number AS item_serial_number,
      ii.item_name
    FROM sales_invoice_items sii
    JOIN inventory_items ii ON ii.id = sii.inventory_item_id
    WHERE sii.sales_invoice_id = $1
    ORDER BY sii.created_at ASC
    `,
    [params.id],
  );

  const items = itemsRes.rows.map(mapRowToSalesInvoiceItem);
  return mapRowToSalesInvoice(invRow, items);
}

/**
 * Lists sales invoices with search and filtering.
 */
export async function listSalesInvoices(
  params: ListSalesInvoicesQuery & { organizationId: string },
  clientOverride?: Queryable,
): Promise<{ data: SalesInvoiceRecord[]; total: number }> {
  const client = clientOverride || getPool();
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const conditions: string[] = ["si.organization_id = $1"];
  const values: any[] = [params.organizationId];

  if (params.storeId) {
    values.push(params.storeId);
    conditions.push(`si.store_id = $${values.length}`);
  }

  if (params.customerId) {
    values.push(params.customerId);
    conditions.push(`si.customer_id = $${values.length}`);
  }

  if (params.status) {
    values.push(params.status);
    conditions.push(`si.status = $${values.length}`);
  }

  if (params.search) {
    values.push(`%${params.search}%`);
    const idx = values.length;
    conditions.push(
      `(si.invoice_number ILIKE $${idx} OR c.first_name ILIKE $${idx} OR c.last_name ILIKE $${idx})`,
    );
  }

  const whereClause = conditions.join(" AND ");

  const countRes = await client.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM sales_invoices si
    JOIN customers c ON c.id = si.customer_id
    WHERE ${whereClause}
    `,
    values,
  );
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  values.push(limit, offset);
  const dataRes = await client.query<SalesInvoiceRow>(
    `
    SELECT
      si.*,
      c.first_name || ' ' || c.last_name AS customer_name,
      s.name AS store_name
    FROM sales_invoices si
    JOIN customers c ON c.id = si.customer_id
    JOIN stores s ON s.id = si.store_id
    WHERE ${whereClause}
    ORDER BY si.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values,
  );

  return {
    data: dataRes.rows.map((r) => mapRowToSalesInvoice(r)),
    total,
  };
}

/**
 * Cancels a pending sales invoice and returns reserved pieces back to AVAILABLE_FOR_SALE.
 */
export async function cancelSalesInvoice(
  params: {
    id: string;
    organizationId: string;
    reason?: string;
  },
  clientOverride?: Queryable,
): Promise<SalesInvoiceRecord> {
  const runner = async (client: Queryable): Promise<SalesInvoiceRecord> => {
    // 1. Lock invoice with SELECT FOR UPDATE
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
      [params.id, params.organizationId],
    );

    const invoice = invRes.rows[0];
    if (!invoice) {
      throw new NotFoundError("SalesInvoice", params.id);
    }

    if (invoice.status === "CANCELLED") {
      throw new ConflictError(
        "Sales invoice is already cancelled",
        "ERR_INVOICE_ALREADY_CANCELLED",
      );
    }

    if (invoice.status === "PAID") {
      throw new UnprocessableEntityError(
        "Cannot cancel an already fully settled invoice",
        "ERR_INVOICE_ALREADY_PAID",
      );
    }

    if (invoice.status === "PARTIALLY_PAID") {
      throw new UnprocessableEntityError(
        "Cannot cancel an invoice with partial payments without refunding tender first",
        "ERR_INVOICE_PARTIALLY_PAID",
      );
    }

    const cancelNote = params.reason
      ? `Cancellation reason: ${params.reason}`
      : "Invoice cancelled";

    // 2. Update Invoice Status to CANCELLED
    const updateRes = await client.query<SalesInvoiceRow>(
      `
      UPDATE sales_invoices
      SET
        status = 'CANCELLED',
        notes = CASE WHEN notes IS NULL THEN $3 ELSE notes || E'\n' || $3 END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND organization_id = $2
      RETURNING *
      `,
      [params.id, params.organizationId, cancelNote],
    );

    // 3. Return reserved pieces to AVAILABLE_FOR_SALE
    await client.query(
      `
      UPDATE inventory_items
      SET
        commercial_state = 'AVAILABLE_FOR_SALE',
        updated_at = clock_timestamp()
      WHERE id IN (
        SELECT inventory_item_id
        FROM sales_invoice_items
        WHERE sales_invoice_id = $1
      )
      `,
      [params.id],
    );

    // 4. Fetch line items
    const itemsRes = await client.query<SalesInvoiceItemRow>(
      `
      SELECT
        sii.*,
        ii.serial_number AS item_serial_number,
        ii.item_name
      FROM sales_invoice_items sii
      JOIN inventory_items ii ON ii.id = sii.inventory_item_id
      WHERE sii.sales_invoice_id = $1
      ORDER BY sii.created_at ASC
      `,
      [params.id],
    );

    const items = itemsRes.rows.map(mapRowToSalesInvoiceItem);
    return {
      ...mapRowToSalesInvoice(updateRes.rows[0]!, items),
      customerName: invoice.customer_name,
      storeName: invoice.store_name,
    };
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Atomically finalizes a sale and releases physical custody of serialized pieces (FEAT-SALES-04).
 * Enforces strict transactional invariants:
 * 1. Invoice must be in PAID status with zero balance due.
 * 2. Custody of invoice pieces has not been previously released.
 * 3. Locks all piece records with SELECT FOR UPDATE.
 * 4. Transitions commercial_state to SOLD and custody_state to RELEASED.
 * 5. Appends immutable CUSTODY_DEPARTURE movement records to inventory_movements (INV-09).
 * 6. Appends audit history to inventory_status_history and audit_events.
 * 7. Marks invoice with released_at timestamp and releasing actor.
 */
export async function finalizeSaleAndReleaseCustody(
  params: {
    invoiceId: string;
    organizationId: string;
    actorUserId: string;
    reason?: string;
  },
  clientOverride?: Queryable,
): Promise<FinalizeSaleAndReleaseResult> {
  const runner = async (
    client: Queryable,
  ): Promise<FinalizeSaleAndReleaseResult> => {
    // 1. Lock invoice with SELECT FOR UPDATE
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
      [params.invoiceId, params.organizationId],
    );

    const invoice = invRes.rows[0];
    if (!invoice) {
      throw new NotFoundError("SalesInvoice", params.invoiceId);
    }

    if (invoice.status !== "PAID" || Number(invoice.balance_due_cad) > 0) {
      throw new UnprocessableEntityError(
        `Cannot release physical custody for an unpaid or partially settled invoice (status: ${invoice.status}, balance due: ${invoice.balance_due_cad})`,
        "ERR_INVOICE_NOT_PAID",
      );
    }

    if (invoice.released_at) {
      throw new ConflictError(
        "Physical custody of pieces on this invoice has already been released",
        "ERR_CUSTODY_ALREADY_RELEASED",
      );
    }

    // 2. Fetch line items
    const itemsRes = await client.query<SalesInvoiceItemRow>(
      `
      SELECT
        sii.*,
        ii.serial_number AS item_serial_number,
        ii.item_name
      FROM sales_invoice_items sii
      JOIN inventory_items ii ON ii.id = sii.inventory_item_id
      WHERE sii.sales_invoice_id = $1
      ORDER BY sii.created_at ASC
      `,
      [params.invoiceId],
    );

    if (itemsRes.rows.length === 0) {
      throw new UnprocessableEntityError(
        "Sales invoice contains no line items to release",
        "ERR_EMPTY_INVOICE",
      );
    }

    const itemRecords = itemsRes.rows.map(mapRowToSalesInvoiceItem);
    const itemIds = itemRecords.map((i) => i.inventoryItemId);

    // 3. Lock and retrieve inventory pieces
    const piecesRes = await client.query<{
      id: string;
      organization_id: string;
      store_id: string;
      product_sku_id: string;
      serial_number: string;
      current_compartment_id: string | null;
      custody_state: string;
      commercial_state: string;
      gross_weight_grams: string | number;
    }>(
      `
      SELECT
        id,
        organization_id,
        store_id,
        product_sku_id,
        serial_number,
        current_compartment_id,
        custody_state,
        commercial_state,
        gross_weight_grams
      FROM inventory_items
      WHERE id = ANY($1::uuid[]) AND organization_id = $2
      FOR UPDATE
      `,
      [itemIds, params.organizationId],
    );

    const pieces = piecesRes.rows;
    if (pieces.length !== itemIds.length) {
      throw new NotFoundError(
        "Some physical inventory pieces could not be found for custody release",
      );
    }

    const movementIds: string[] = [];

    // 4. Record movements and status history for each piece
    for (const piece of pieces) {
      const movementId = uuidv7();
      movementIds.push(movementId);

      // 4a. Append-only custody departure movement (Entity 30 / INV-09)
      await client.query(
        `
        INSERT INTO inventory_movements (
          id,
          organization_id,
          store_id,
          inventory_item_id,
          product_sku_id,
          movement_type,
          from_compartment_id,
          to_compartment_id,
          from_custody_state,
          to_custody_state,
          quantity,
          weight_grams,
          actor_user_id,
          reason_code,
          reference_document_type,
          reference_document_id,
          moved_at,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, 'CUSTODY_DEPARTURE',
          $6, NULL, $7, 'RELEASED', 1, $8,
          $9, 'POINT_OF_SALE_RELEASE', 'SALES_INVOICE', $10,
          clock_timestamp(), clock_timestamp()
        )
        `,
        [
          movementId,
          params.organizationId,
          invoice.store_id,
          piece.id,
          piece.product_sku_id,
          piece.current_compartment_id,
          piece.custody_state,
          Number(piece.gross_weight_grams),
          params.actorUserId,
          invoice.id,
        ],
      );

      // 4b. Status history - Commercial Dimension (RESERVED -> SOLD)
      await client.query(
        `
        INSERT INTO inventory_status_history (
          id,
          organization_id,
          inventory_item_id,
          dimension_changed,
          old_state,
          new_state,
          actor_user_id,
          reason,
          transitioned_at,
          created_at
        )
        VALUES (
          $1, $2, $3, 'COMMERCIAL', $4, 'SOLD', $5,
          $6, clock_timestamp(), clock_timestamp()
        )
        `,
        [
          uuidv7(),
          params.organizationId,
          piece.id,
          piece.commercial_state,
          params.actorUserId,
          `Sale finalized on invoice ${invoice.invoice_number}`,
        ],
      );

      // 4c. Status history - Custody Dimension (IN_VAULT / IN_DISPLAY -> RELEASED)
      await client.query(
        `
        INSERT INTO inventory_status_history (
          id,
          organization_id,
          inventory_item_id,
          dimension_changed,
          old_state,
          new_state,
          actor_user_id,
          reason,
          transitioned_at,
          created_at
        )
        VALUES (
          $1, $2, $3, 'CUSTODY', $4, 'RELEASED', $5,
          $6, clock_timestamp(), clock_timestamp()
        )
        `,
        [
          uuidv7(),
          params.organizationId,
          piece.id,
          piece.custody_state,
          params.actorUserId,
          `Customer physical handover on invoice ${invoice.invoice_number}`,
        ],
      );
    }

    // 5. Update all pieces to SOLD & RELEASED
    await client.query(
      `
      UPDATE inventory_items
      SET
        commercial_state = 'SOLD',
        custody_state = 'RELEASED',
        current_compartment_id = NULL,
        version = version + 1,
        updated_at = clock_timestamp()
      WHERE id = ANY($1::uuid[]) AND organization_id = $2
      `,
      [itemIds, params.organizationId],
    );

    // 6. Append tamper-evident audit event (Entity 36 - FEAT-GOV-02)
    const auditEventId = uuidv7();
    await client.query(
      `
      INSERT INTO audit_events (
        id,
        organization_id,
        store_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        payload_before_json,
        payload_after_json,
        reason,
        occurred_at,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, 'FINALIZE_AND_RELEASE_CUSTODY', 'sales_invoices', $5,
        $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      `,
      [
        auditEventId,
        params.organizationId,
        invoice.store_id,
        params.actorUserId,
        invoice.id,
        JSON.stringify({
          invoiceNumber: invoice.invoice_number,
          status: invoice.status,
          releasedAt: null,
        }),
        JSON.stringify({
          invoiceNumber: invoice.invoice_number,
          status: invoice.status,
          releasedAt: new Date().toISOString(),
          releasedPieceCount: itemIds.length,
          itemIds,
        }),
        params.reason ?? "Customer handover at point of sale",
      ],
    );

    // 7. Update Sales Invoice with released_at timestamp & user
    const updatedInvRes = await client.query<SalesInvoiceRow>(
      `
      UPDATE sales_invoices
      SET
        released_at = CURRENT_TIMESTAMP,
        released_by_user_id = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND organization_id = $3
      RETURNING *
      `,
      [params.actorUserId, invoice.id, params.organizationId],
    );

    const updatedInvRow = updatedInvRes.rows[0]!;

    return {
      invoice: {
        ...mapRowToSalesInvoice(updatedInvRow, itemRecords),
        customerName: invoice.customer_name,
        storeName: invoice.store_name,
      },
      releasedPieceIds: itemIds,
      movementIds,
      releasedAt: new Date(updatedInvRow.released_at!),
    };
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}
