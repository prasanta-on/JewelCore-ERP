import type { Request, Response, NextFunction } from "express";
import {
  recordSalesPaymentSchema,
  listSalesPaymentsQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  recordSalesPayment,
  getSalesPaymentById,
  listSalesPayments,
} from "@jewelcore/database";

/**
 * Records customer payment tender against an invoice (Entity 51 - FEAT-SALES-03).
 */
export async function recordSalesPaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to record a payment tender",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId || typeof userId !== "string") {
      throw new BadRequestError(
        "Authenticated user ID is required to record a payment tender",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const storeId =
      req.body.storeId ??
      req.storeContext?.storeId ??
      req.headers["x-store-id"];

    if (!storeId || typeof storeId !== "string") {
      throw new BadRequestError(
        "Store context is required to record a payment tender",
        "ERR_MISSING_STORE_CONTEXT",
      );
    }

    const input = recordSalesPaymentSchema.parse(req.body);

    const result = await recordSalesPayment({
      ...input,
      organizationId: orgId,
      storeId,
      receivedByUserId: userId,
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
 * Retrieves an individual payment record by ID.
 */
export async function getSalesPaymentByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to retrieve a payment record",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const id = req.params.id as string;
    const payment = await getSalesPaymentById({ id, organizationId: orgId });

    if (!payment) {
      throw new NotFoundError("SalesPayment", id);
    }

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists payment transactions with multi-criteria filtering and pagination.
 */
export async function listSalesPaymentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to list payment records",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const query = listSalesPaymentsQuerySchema.parse(req.query);

    const result = await listSalesPayments({
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
