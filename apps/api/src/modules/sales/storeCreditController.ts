import type { Request, Response, NextFunction } from "express";
import {
  adjustStoreCreditSchema,
  redeemStoreCreditSchema,
  listStoreCreditTransactionsQuerySchema,
  BadRequestError,
} from "@jewelcore/shared";
import {
  getStoreCreditAccountByCustomerId,
  getStoreCreditAccountById,
  adjustStoreCredit,
  listStoreCreditTransactions,
} from "@jewelcore/database";

/**
 * Retrieves a customer's store credit account (lazily created if not exists) (FEAT-RET-03).
 */
export async function getStoreCreditAccountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to view store credit",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const customerId = req.params.customerId as string;
    const account = await getStoreCreditAccountByCustomerId({
      customerId,
      organizationId: orgId,
    });

    res.status(200).json({
      success: true,
      data: account,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Adjusts customer store credit (manual issuance, promotion, or adjustment) (FEAT-RET-03).
 */
export async function adjustStoreCreditHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to adjust store credit",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId || typeof userId !== "string") {
      throw new BadRequestError(
        "Authenticated user ID is required to adjust store credit",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const storeId =
      req.body.storeId ??
      req.storeContext?.storeId ??
      req.headers["x-store-id"];

    if (!storeId || typeof storeId !== "string") {
      throw new BadRequestError(
        "Store context is required to adjust store credit",
        "ERR_MISSING_STORE_CONTEXT",
      );
    }

    const input = adjustStoreCreditSchema.parse({
      ...req.body,
      storeId,
    });

    const result = await adjustStoreCredit({
      customerId: input.customerId,
      storeId: input.storeId,
      organizationId: orgId,
      performedByUserId: userId,
      transactionType: input.transactionType,
      amountCad: input.amountCad,
      notes: input.notes ?? undefined,
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
 * Redeems customer store credit against an invoice or purchase (FEAT-RET-03).
 */
export async function redeemStoreCreditHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to redeem store credit",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId || typeof userId !== "string") {
      throw new BadRequestError(
        "Authenticated user ID is required to redeem store credit",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const storeId =
      req.body.storeId ??
      req.storeContext?.storeId ??
      req.headers["x-store-id"];

    if (!storeId || typeof storeId !== "string") {
      throw new BadRequestError(
        "Store context is required to redeem store credit",
        "ERR_MISSING_STORE_CONTEXT",
      );
    }

    const input = redeemStoreCreditSchema.parse({
      ...req.body,
      storeId,
    });

    const result = await adjustStoreCredit({
      customerId: input.customerId,
      storeId: input.storeId,
      organizationId: orgId,
      performedByUserId: userId,
      transactionType: "REDEEM_PURCHASE",
      amountCad: input.amountCad,
      referenceDocumentType: input.salesInvoiceId ? "SALES_INVOICE" : undefined,
      referenceDocumentId: input.salesInvoiceId ?? undefined,
      notes: input.notes ?? undefined,
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
 * Lists store credit transactions for an account with pagination (FEAT-RET-03 / INV-09).
 */
export async function listStoreCreditTransactionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to list store credit transactions",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const accountId = req.params.accountId as string;
    const query = listStoreCreditTransactionsQuerySchema.parse(req.query);

    // Verify account belongs to org
    await getStoreCreditAccountById({
      id: accountId,
      organizationId: orgId,
    });

    const result = await listStoreCreditTransactions({
      ...query,
      storeCreditAccountId: accountId,
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
