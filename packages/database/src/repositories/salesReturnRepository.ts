import type { Pool, PoolClient } from "pg";
import {
  type SalesReturnRecord,
  type SalesReturnItemRecord,
  type CreateSalesReturnInput,
  type ListSalesReturnsQuery,
  type ReturnReason,
  type ReturnCondition,
  type ReturnDisposition,
  type RefundMethod,
  type SalesReturnStatus,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface SalesReturnRow {
  id: string;
  organization_id: string;
  store_id: string;
  sales_invoice_id: string;
  customer_id: string;
  processed_by_user_id: string;
  return_number: string;
  return_reason: string;
  status: string;
  refund_method: string;
  total_refund_amount_cad: string | number;
  restocking_fee_cad: string | number;
  net_refund_amount_cad: string | number;
  notes: string | null;
  created_at: Date | string;
  customer_name?: string | null;
  store_name?: string | null;
  invoice_number?: string | null;
}

export interface SalesReturnItemRow {
  id: string;
  organization_id: string;
  sales_return_id: string;
  sales_invoice_item_id: string;
  inventory_item_id: string;
  condition: string;
  disposition: string;
  target_compartment_id: string | null;
  refund_amount_cad: string | number;
  restocking_fee_cad: string | number;
  net_refund_amount_cad: string | number;
  inspection_notes: string | null;
  created_at: Date | string;
  item_serial_number?: string | null;
  item_name?: string | null;
}

function mapRowToSalesReturn(
  row: SalesReturnRow,
  items?: SalesReturnItemRecord[],
): SalesReturnRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    salesInvoiceId: row.sales_invoice_id,
    customerId: row.customer_id,
    processedByUserId: row.processed_by_user_id,
    returnNumber: row.return_number,
    returnReason: row.return_reason as ReturnReason,
    status: row.status as SalesReturnStatus,
    refundMethod: row.refund_method as RefundMethod,
    totalRefundAmountCad: Number(row.total_refund_amount_cad),
    restockingFeeCad: Number(row.restocking_fee_cad),
    netRefundAmountCad: Number(row.net_refund_amount_cad),
    notes: row.notes ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    customerName: row.customer_name ?? undefined,
    storeName: row.store_name ?? undefined,
    invoiceNumber: row.invoice_number ?? undefined,
    items,
  };
}

function mapRowToSalesReturnItem(
  row: SalesReturnItemRow,
): SalesReturnItemRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    salesReturnId: row.sales_return_id,
    salesInvoiceItemId: row.sales_invoice_item_id,
    inventoryItemId: row.inventory_item_id,
    condition: row.condition as ReturnCondition,
    disposition: row.disposition as ReturnDisposition,
    targetCompartmentId: row.target_compartment_id ?? null,
    refundAmountCad: Number(row.refund_amount_cad),
    restockingFeeCad: Number(row.restocking_fee_cad),
    netRefundAmountCad: Number(row.net_refund_amount_cad),
    inspectionNotes: row.inspection_notes ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    itemSerialNumber: row.item_serial_number ?? undefined,
    itemName: row.item_name ?? undefined,
  };
}

/**
 * Atomically processes a customer sales return, inspects pieces, and restocks or routes to repair/melt (FEAT-RET-01).
 * Transactional invariants:
 * 1. Invoice must exist, belong to org, and have physical custody already released (status = 'PAID' & released_at NOT NULL).
 * 2. Each line item must belong to the invoice and not have been returned before.
 * 3. Restocking fee must not exceed the line item price.
 * 4. Inventory item custody & commercial transitions:
 *    - RESTOCK_AS_NEW: AVAILABLE_FOR_SALE, IN_VAULT, target compartment set.
 *    - SEND_TO_REPAIR: UNREADY, IN_VAULT.
 *    - SEND_TO_MELT: UNREADY, IN_VAULT.
 * 5. Appends immutable records to inventory_movements and inventory_status_history.
 * 6. Appends audit event.
 */
export async function processSalesReturn(
  input: CreateSalesReturnInput & {
    organizationId: string;
    processedByUserId: string;
  },
  clientOverride?: Queryable,
): Promise<SalesReturnRecord> {
  const runner = async (client: Queryable): Promise<SalesReturnRecord> => {
    // 1. Lock and verify sales invoice
    const invRes = await client.query<{
      id: string;
      organization_id: string;
      store_id: string;
      customer_id: string;
      invoice_number: string;
      status: string;
      released_at: Date | string | null;
      customer_name: string;
      store_name: string;
    }>(
      `
      SELECT
        si.id,
        si.organization_id,
        si.store_id,
        si.customer_id,
        si.invoice_number,
        si.status,
        si.released_at,
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

    if (invoice.status !== "PAID" || !invoice.released_at) {
      throw new UnprocessableEntityError(
        `Cannot process return for an unfinalized or unpaid sales invoice (status: ${invoice.status})`,
        "ERR_INVOICE_NOT_FINALIZED",
      );
    }

    // 2. Fetch and lock invoice line items
    const returnItemsData: Array<{
      invoiceItemId: string;
      inventoryItemId: string;
      condition: ReturnCondition;
      disposition: ReturnDisposition;
      targetCompartmentId: string;
      refundAmountCad: number;
      restockingFeeCad: number;
      netRefundAmountCad: number;
      inspectionNotes: string | null;
      serialNumber: string;
      itemName: string;
      grossWeightGrams: number;
      productSkuId: string;
      custodyState: string;
      commercialState: string;
    }> = [];

    let totalRefundAmountCad = 0;
    let totalRestockingFeeCad = 0;
    let totalNetRefundAmountCad = 0;

    for (const item of input.items) {
      // Fetch invoice line item with inventory details
      const itemRes = await client.query<{
        id: string;
        sales_invoice_id: string;
        inventory_item_id: string;
        line_total_cad: string | number;
        serial_number: string;
        item_name: string;
        gross_weight_grams: string | number;
        product_sku_id: string;
        custody_state: string;
        commercial_state: string;
      }>(
        `
        SELECT
          sii.id,
          sii.sales_invoice_id,
          sii.inventory_item_id,
          sii.line_total_cad,
          ii.serial_number,
          ii.item_name,
          ii.gross_weight_grams,
          ii.product_sku_id,
          ii.custody_state,
          ii.commercial_state
        FROM sales_invoice_items sii
        JOIN inventory_items ii ON ii.id = sii.inventory_item_id
        WHERE sii.id = $1 AND sii.sales_invoice_id = $2 AND sii.organization_id = $3
        FOR UPDATE OF ii
        `,
        [item.salesInvoiceItemId, input.salesInvoiceId, input.organizationId],
      );

      const invoiceItem = itemRes.rows[0];
      if (!invoiceItem) {
        throw new NotFoundError("SalesInvoiceItem", item.salesInvoiceItemId);
      }

      // Check if already returned
      const prevReturnRes = await client.query<{ id: string }>(
        `SELECT id FROM sales_return_items WHERE sales_invoice_item_id = $1`,
        [item.salesInvoiceItemId],
      );
      if (prevReturnRes.rows.length > 0) {
        throw new ConflictError(
          `Sales invoice item ${item.salesInvoiceItemId} has already been returned`,
          "ERR_ITEM_ALREADY_RETURNED",
        );
      }

      const refundAmount = Number(invoiceItem.line_total_cad);
      const restockingFee = Number(item.restockingFeeCad ?? 0);
      if (restockingFee > refundAmount) {
        throw new UnprocessableEntityError(
          `Restocking fee (${restockingFee}) cannot exceed item refund amount (${refundAmount})`,
          "ERR_INVALID_RESTOCKING_FEE",
        );
      }
      const netRefund = refundAmount - restockingFee;

      // Determine target compartment
      let targetCompId = item.targetCompartmentId ?? null;
      if (targetCompId) {
        const compRes = await client.query<{ id: string }>(
          `SELECT id FROM compartments WHERE id = $1 AND store_id = $2`,
          [targetCompId, input.storeId],
        );
        if (compRes.rows.length === 0) {
          throw new UnprocessableEntityError(
            `Target compartment ${targetCompId} does not belong to store ${input.storeId}`,
            "ERR_INVALID_COMPARTMENT",
          );
        }
      } else {
        // Fallback to any compartment in the store
        const fallbackRes = await client.query<{ id: string }>(
          `SELECT id FROM compartments WHERE store_id = $1 ORDER BY created_at ASC LIMIT 1`,
          [input.storeId],
        );
        const fallbackComp = fallbackRes.rows[0];
        if (!fallbackComp) {
          throw new UnprocessableEntityError(
            `Store ${input.storeId} has no compartments available for restocking`,
            "ERR_NO_COMPARTMENT",
          );
        }
        targetCompId = fallbackComp.id;
      }

      totalRefundAmountCad += refundAmount;
      totalRestockingFeeCad += restockingFee;
      totalNetRefundAmountCad += netRefund;

      returnItemsData.push({
        invoiceItemId: invoiceItem.id,
        inventoryItemId: invoiceItem.inventory_item_id,
        condition: item.condition,
        disposition: item.disposition,
        targetCompartmentId: targetCompId,
        refundAmountCad: refundAmount,
        restockingFeeCad: restockingFee,
        netRefundAmountCad: netRefund,
        inspectionNotes: item.inspectionNotes ?? null,
        serialNumber: invoiceItem.serial_number,
        itemName: invoiceItem.item_name,
        grossWeightGrams: Number(invoiceItem.gross_weight_grams),
        productSkuId: invoiceItem.product_sku_id,
        custodyState: invoiceItem.custody_state,
        commercialState: invoiceItem.commercial_state,
      });
    }

    // 3. Create Return Record
    const returnId = uuidv7();
    const returnNumber =
      input.returnNumber ??
      `RET-${Date.now()}-${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0")}`;

    const returnInsertRes = await client.query<SalesReturnRow>(
      `
      INSERT INTO sales_returns (
        id,
        organization_id,
        store_id,
        sales_invoice_id,
        customer_id,
        processed_by_user_id,
        return_number,
        return_reason,
        status,
        refund_method,
        total_refund_amount_cad,
        restocking_fee_cad,
        net_refund_amount_cad,
        notes,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', $9,
        $10, $11, $12, $13, clock_timestamp()
      )
      RETURNING *
      `,
      [
        returnId,
        input.organizationId,
        input.storeId,
        input.salesInvoiceId,
        invoice.customer_id,
        input.processedByUserId,
        returnNumber,
        input.returnReason,
        input.refundMethod,
        totalRefundAmountCad.toFixed(4),
        totalRestockingFeeCad.toFixed(4),
        totalNetRefundAmountCad.toFixed(4),
        input.notes ?? null,
      ],
    );

    const createdReturnRow = returnInsertRes.rows[0];
    if (!createdReturnRow) {
      throw new Error("Failed to create sales return record");
    }

    // 4. Insert Return Items & perform inventory transitions
    const createdItemRecords: SalesReturnItemRecord[] = [];

    for (const itemData of returnItemsData) {
      const returnItemId = uuidv7();

      const itemInsertRes = await client.query<SalesReturnItemRow>(
        `
        INSERT INTO sales_return_items (
          id,
          organization_id,
          sales_return_id,
          sales_invoice_item_id,
          inventory_item_id,
          condition,
          disposition,
          target_compartment_id,
          refund_amount_cad,
          restocking_fee_cad,
          net_refund_amount_cad,
          inspection_notes,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp()
        )
        RETURNING *
        `,
        [
          returnItemId,
          input.organizationId,
          returnId,
          itemData.invoiceItemId,
          itemData.inventoryItemId,
          itemData.condition,
          itemData.disposition,
          itemData.targetCompartmentId,
          itemData.refundAmountCad.toFixed(4),
          itemData.restockingFeeCad.toFixed(4),
          itemData.netRefundAmountCad.toFixed(4),
          itemData.inspectionNotes,
        ],
      );

      const createdItemRow = itemInsertRes.rows[0];
      if (!createdItemRow) {
        throw new Error("Failed to create sales return item record");
      }
      createdItemRow.item_serial_number = itemData.serialNumber;
      createdItemRow.item_name = itemData.itemName;
      createdItemRecords.push(mapRowToSalesReturnItem(createdItemRow));

      // Determine new commercial state
      const newCommercialState =
        itemData.disposition === "RESTOCK_AS_NEW"
          ? "AVAILABLE_FOR_SALE"
          : "UNREADY";

      const reasonCode =
        itemData.disposition === "RESTOCK_AS_NEW"
          ? "CUSTOMER_RETURN_RESTOCK"
          : itemData.disposition === "SEND_TO_REPAIR"
            ? "CUSTOMER_RETURN_REPAIR"
            : "CUSTOMER_RETURN_MELT";

      // 4a. Append-only custody return movement (Entity 30 / INV-09)
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
          $1, $2, $3, $4, $5, 'INTAKE_PLACEMENT',
          NULL, $6, 'RELEASED', 'IN_VAULT', 1, $7,
          $8, $9, 'SALES_RETURN', $10,
          clock_timestamp(), clock_timestamp()
        )
        `,
        [
          uuidv7(),
          input.organizationId,
          input.storeId,
          itemData.inventoryItemId,
          itemData.productSkuId,
          itemData.targetCompartmentId,
          itemData.grossWeightGrams,
          input.processedByUserId,
          reasonCode,
          returnId,
        ],
      );

      // 4b. Status history - Commercial Dimension (SOLD -> AVAILABLE_FOR_SALE or UNREADY)
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
          $1, $2, $3, 'COMMERCIAL', $4, $5, $6,
          $7, clock_timestamp(), clock_timestamp()
        )
        `,
        [
          uuidv7(),
          input.organizationId,
          itemData.inventoryItemId,
          itemData.commercialState,
          newCommercialState,
          input.processedByUserId,
          `Customer return ${returnNumber} (disposition: ${itemData.disposition})`,
        ],
      );

      // 4c. Status history - Custody Dimension (RELEASED -> IN_VAULT)
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
          $1, $2, $3, 'CUSTODY', $4, 'IN_VAULT', $5,
          $6, clock_timestamp(), clock_timestamp()
        )
        `,
        [
          uuidv7(),
          input.organizationId,
          itemData.inventoryItemId,
          itemData.custodyState,
          input.processedByUserId,
          `Piece returned to store vault compartment ${itemData.targetCompartmentId}`,
        ],
      );

      // 4d. Update physical piece in inventory_items
      await client.query(
        `
        UPDATE inventory_items
        SET
          commercial_state = $1,
          custody_state = 'IN_VAULT',
          current_compartment_id = $2,
          version = version + 1,
          updated_at = clock_timestamp()
        WHERE id = $3 AND organization_id = $4
        `,
        [
          newCommercialState,
          itemData.targetCompartmentId,
          itemData.inventoryItemId,
          input.organizationId,
        ],
      );
    }

    // 5. Append tamper-evident audit event (Entity 36 - FEAT-GOV-02)
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
        occurred_at,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, 'SALES_RETURN_PROCESSED', 'SALES_RETURN',
        $5, NULL, $6, clock_timestamp(), clock_timestamp()
      )
      `,
      [
        uuidv7(),
        input.organizationId,
        input.storeId,
        input.processedByUserId,
        returnId,
        JSON.stringify({
          returnId,
          returnNumber,
          salesInvoiceId: input.salesInvoiceId,
          returnedItemsCount: returnItemsData.length,
          totalRefundAmountCad,
          totalRestockingFeeCad,
          totalNetRefundAmountCad,
          refundMethod: input.refundMethod,
        }),
      ],
    );

    createdReturnRow.customer_name = invoice.customer_name;
    createdReturnRow.store_name = invoice.store_name;
    createdReturnRow.invoice_number = invoice.invoice_number;

    return mapRowToSalesReturn(createdReturnRow, createdItemRecords);
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Retrieves a single customer return by ID with its line items (FEAT-RET-01).
 */
export async function getSalesReturnById(
  params: { id: string; organizationId: string },
  clientOverride?: Queryable,
): Promise<SalesReturnRecord> {
  const client = clientOverride ?? getPool();

  const retRes = await client.query<SalesReturnRow>(
    `
    SELECT
      sr.*,
      c.first_name || ' ' || c.last_name AS customer_name,
      s.name AS store_name,
      si.invoice_number
    FROM sales_returns sr
    JOIN customers c ON c.id = sr.customer_id
    JOIN stores s ON s.id = sr.store_id
    JOIN sales_invoices si ON si.id = sr.sales_invoice_id
    WHERE sr.id = $1 AND sr.organization_id = $2
    `,
    [params.id, params.organizationId],
  );

  const row = retRes.rows[0];
  if (!row) {
    throw new NotFoundError("SalesReturn", params.id);
  }

  const itemsRes = await client.query<SalesReturnItemRow>(
    `
    SELECT
      sri.*,
      ii.serial_number AS item_serial_number,
      ii.item_name
    FROM sales_return_items sri
    JOIN inventory_items ii ON ii.id = sri.inventory_item_id
    WHERE sri.sales_return_id = $1
    ORDER BY sri.created_at ASC
    `,
    [params.id],
  );

  const items = itemsRes.rows.map(mapRowToSalesReturnItem);
  return mapRowToSalesReturn(row, items);
}

/**
 * Lists customer sales returns with filtering and pagination (FEAT-RET-01).
 */
export async function listSalesReturns(
  params: ListSalesReturnsQuery & { organizationId: string },
  clientOverride?: Queryable,
): Promise<{
  data: SalesReturnRecord[];
  total: number;
  limit: number;
  offset: number;
}> {
  const client = clientOverride ?? getPool();
  const conditions: string[] = ["sr.organization_id = $1"];
  const values: unknown[] = [params.organizationId];
  let paramIdx = 2;

  if (params.storeId) {
    conditions.push(`sr.store_id = $${paramIdx++}`);
    values.push(params.storeId);
  }

  if (params.salesInvoiceId) {
    conditions.push(`sr.sales_invoice_id = $${paramIdx++}`);
    values.push(params.salesInvoiceId);
  }

  if (params.customerId) {
    conditions.push(`sr.customer_id = $${paramIdx++}`);
    values.push(params.customerId);
  }

  if (params.status) {
    conditions.push(`sr.status = $${paramIdx++}`);
    values.push(params.status);
  }

  if (params.search) {
    conditions.push(
      `(sr.return_number ILIKE $${paramIdx} OR si.invoice_number ILIKE $${paramIdx} OR c.first_name ILIKE $${paramIdx} OR c.last_name ILIKE $${paramIdx})`,
    );
    values.push(`%${params.search}%`);
    paramIdx++;
  }

  const whereClause = conditions.join(" AND ");

  // Count total
  const countRes = await client.query<{ total: string }>(
    `
    SELECT COUNT(*)::text AS total
    FROM sales_returns sr
    JOIN customers c ON c.id = sr.customer_id
    JOIN sales_invoices si ON si.id = sr.sales_invoice_id
    WHERE ${whereClause}
    `,
    values,
  );
  const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

  // Fetch page
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const pageValues = [...values, limit, offset];

  const dataRes = await client.query<SalesReturnRow>(
    `
    SELECT
      sr.*,
      c.first_name || ' ' || c.last_name AS customer_name,
      s.name AS store_name,
      si.invoice_number
    FROM sales_returns sr
    JOIN customers c ON c.id = sr.customer_id
    JOIN stores s ON s.id = sr.store_id
    JOIN sales_invoices si ON si.id = sr.sales_invoice_id
    WHERE ${whereClause}
    ORDER BY sr.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `,
    pageValues,
  );

  const data = dataRes.rows.map((row) => mapRowToSalesReturn(row));

  return {
    data,
    total,
    limit,
    offset,
  };
}
