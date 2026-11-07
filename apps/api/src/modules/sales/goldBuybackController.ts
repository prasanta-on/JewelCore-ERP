import type { Request, Response, NextFunction } from "express";
import {
  createGoldBuybackOrderSchema,
  settleGoldBuybackOrderSchema,
  listGoldBuybackOrdersQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  createGoldBuybackOrder,
  settleGoldBuybackOrder,
  getGoldBuybackOrderById,
  listGoldBuybackOrders,
} from "@jewelcore/database";

/**
 * Creates and appraises an old gold and scrap buyback order (FEAT-RET-02).
 */
export async function createGoldBuybackOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to create a buyback order",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId || typeof userId !== "string") {
      throw new BadRequestError(
        "Authenticated user ID is required to create a buyback order",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const storeId =
      req.body.storeId ??
      req.storeContext?.storeId ??
      req.headers["x-store-id"];

    if (!storeId || typeof storeId !== "string") {
      throw new BadRequestError(
        "Store context is required to create a buyback order",
        "ERR_MISSING_STORE_CONTEXT",
      );
    }

    const input = createGoldBuybackOrderSchema.parse({
      ...req.body,
      storeId,
    });

    const result = await createGoldBuybackOrder({
      ...input,
      organizationId: orgId,
      createdByUserId: userId,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Settles and finalizes payout of an evaluated gold buyback order (FEAT-RET-02).
 */
export async function settleGoldBuybackOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to settle a buyback order",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId || typeof userId !== "string") {
      throw new BadRequestError(
        "Authenticated user ID is required to settle a buyback order",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const id = req.params.id as string;
    const body = settleGoldBuybackOrderSchema.parse(req.body ?? {});

    const result = await settleGoldBuybackOrder({
      id,
      organizationId: orgId,
      settledByUserId: userId,
      input: body,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a gold buyback order by ID with line items.
 */
export async function getGoldBuybackOrderByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to retrieve a buyback order",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const id = req.params.id as string;
    const order = await getGoldBuybackOrderById({
      id,
      organizationId: orgId,
    });

    if (!order) {
      throw new NotFoundError("GoldBuybackOrder", id);
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists gold buyback orders with multi-criteria filtering and pagination.
 */
export async function listGoldBuybackOrdersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to list buyback orders",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const query = listGoldBuybackOrdersQuerySchema.parse(req.query);

    const result = await listGoldBuybackOrders({
      ...query,
      organizationId: orgId,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (err) {
    next(err);
  }
}
nput & {
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