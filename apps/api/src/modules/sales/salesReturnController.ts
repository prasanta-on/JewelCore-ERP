import type { Request, Response, NextFunction } from "express";
import {
  createSalesReturnSchema,
  listSalesReturnsQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  processSalesReturn,
  getSalesReturnById,
  listSalesReturns,
} from "@jewelcore/database";

/**
 * Processes a customer sales return, inspects pieces, and routes to restocking/repair/melt (FEAT-RET-01).
 */
export async function createSalesReturnHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to process a return",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId || typeof userId !== "string") {
      throw new BadRequestError(
        "Authenticated user ID is required to process a return",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const storeId =
      req.body.storeId ??
      req.storeContext?.storeId ??
      req.headers["x-store-id"];

    if (!storeId || typeof storeId !== "string") {
      throw new BadRequestError(
        "Store context is required to process a return",
        "ERR_MISSING_STORE_CONTEXT",
      );
    }

    const input = createSalesReturnSchema.parse({
      ...req.body,
      storeId,
    });

    const result = await processSalesReturn({
      ...input,
      organizationId: orgId,
      processedByUserId: userId,
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
 * Retrieves a customer sales return by ID.
 */
export async function getSalesReturnByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to retrieve a return record",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const id = req.params.id as string;
    const returnRecord = await getSalesReturnById({
      id,
      organizationId: orgId,
    });

    if (!returnRecord) {
      throw new NotFoundError("SalesReturn", id);
    }

    res.status(200).json({
      success: true,
      data: returnRecord,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists customer returns with multi-criteria filtering and pagination.
 */
export async function listSalesReturnsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to list return records",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const query = listSalesReturnsQuerySchema.parse(req.query);

    const result = await listSalesReturns({
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
