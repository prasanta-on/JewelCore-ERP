import type { Request, Response, NextFunction } from "express";
import { posExchangeSchema, BadRequestError } from "@jewelcore/shared";
import { processPOSExchange } from "@jewelcore/database";

/**
 * Handles atomic POS exchange transactions (returns, buybacks, new invoice, and tender settlement) (FEAT-RET-04).
 */
export async function processPOSExchangeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to process an exchange",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId || typeof userId !== "string") {
      throw new BadRequestError(
        "Authenticated user ID is required to process an exchange",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const storeId =
      req.body.storeId ??
      req.storeContext?.storeId ??
      req.headers["x-store-id"];

    if (!storeId || typeof storeId !== "string") {
      throw new BadRequestError(
        "Store context is required to process an exchange",
        "ERR_MISSING_STORE_CONTEXT",
      );
    }

    const input = posExchangeSchema.parse({
      ...req.body,
      storeId,
    });

    const result = await processPOSExchange({
      ...input,
      organizationId: orgId,
      actorUserId: userId,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
