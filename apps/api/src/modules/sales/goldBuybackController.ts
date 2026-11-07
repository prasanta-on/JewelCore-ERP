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
