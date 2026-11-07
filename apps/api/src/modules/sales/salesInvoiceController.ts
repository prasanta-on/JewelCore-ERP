import type { Request, Response, NextFunction } from "express";
import {
  createSalesInvoiceSchema,
  listSalesInvoicesQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  createSalesInvoice,
  getSalesInvoiceById,
  listSalesInvoices,
  cancelSalesInvoice,
} from "@jewelcore/database";

/**
 * Generates a new point-of-sale invoice with serialized pieces (Entity 49 - FEAT-SALES-02).
 */
export async function createSalesInvoiceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to generate a sales invoice",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId || typeof userId !== "string") {
      throw new BadRequestError(
        "Authenticated user ID is required to generate a sales invoice",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const storeId =
      req.body.storeId ??
      req.storeContext?.storeId ??
      req.headers["x-store-id"];

    const input = createSalesInvoiceSchema.parse({
      ...req.body,
      organizationId: orgId,
      storeId,
    });

    const invoice = await createSalesInvoice({
      ...input,
      organizationId: orgId,
      createdByUserId: userId,
    });

    res.status(201).json({
      success: true,
      data: invoice,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a sales invoice with line items and enriched details.
 */
export async function getSalesInvoiceByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to retrieve a sales invoice",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const id = req.params.id as string;
    const invoice = await getSalesInvoiceById({ id, organizationId: orgId });

    if (!invoice) {
      throw new NotFoundError("SalesInvoice", id);
    }

    res.status(200).json({
      success: true,
      data: invoice,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists sales invoices with multi-criteria filtering and pagination.
 */
export async function listSalesInvoicesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to list sales invoices",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const query = listSalesInvoicesQuerySchema.parse(req.query);

    const result = await listSalesInvoices({
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

/**
 * Cancels a pending sales invoice and reverts physical piece reservations.
 */
export async function cancelSalesInvoiceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to cancel a sales invoice",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const id = req.params.id as string;
    const reason = req.body?.reason as string | undefined;

    const cancelled = await cancelSalesInvoice({
      id,
      organizationId: orgId,
      reason,
    });

    res.status(200).json({
      success: true,
      data: cancelled,
    });
  } catch (err) {
    next(err);
  }
}
