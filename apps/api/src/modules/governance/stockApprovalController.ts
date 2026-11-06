import type { Request, Response, NextFunction } from "express";
import {
  createStockApprovalSchema,
  listStockApprovalsQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  createStockApproval,
  getStockApprovalById,
  getLatestApprovalByItemId,
  listStockApprovals,
} from "@jewelcore/database";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Handles authorization of managerial stock approval for an inventory piece (Entity 39 - FEAT-GOV-01).
 *
 * Enforces:
 * - stock:approve permission
 * - Root aggregate locking on parent item (INV-08)
 * - Multi-store context isolation (INV-11)
 * - Quad-prerequisite gate for commercial availability (INV-01):
 *   1. quality_state = 'QC_APPROVED'
 *   2. custody_state IN ('IN_VAULT', 'IN_DISPLAY')
 *   3. Active RFID tag transponder bound
 */
export async function createStockApprovalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId =
      req.user?.orgId ??
      req.storeContext?.organizationId ??
      (req.body.organizationId as string | undefined);

    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to authorize stock approval",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const storeId =
      req.storeContext?.storeId ??
      (req.body.storeId as string | undefined) ??
      (req.headers["x-store-id"] as string | undefined);

    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError("User authentication context is required");
    }

    const validated = createStockApprovalSchema.parse({
      ...req.body,
      organizationId: orgId,
      storeId,
    });

    const approval = await createStockApproval(
      {
        ...validated,
        organizationId: orgId,
        storeId,
      },
      { userId },
    );

    res.status(201).json({
      success: true,
      data: approval,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a stock approval record by ID.
 *
 * Enforces:
 * - stock:view permission
 * - Multi-tenant isolation
 */
export async function getStockApprovalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestError("Valid stock approval UUID is required");
    }

    const orgId =
      req.user?.orgId ??
      req.storeContext?.organizationId ??
      (req.query.organizationId as string | undefined);

    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const approval = await getStockApprovalById(id, orgId);
    if (!approval) {
      throw new NotFoundError(
        `Stock approval record '${id}' not found`,
        "ERR_NOT_FOUND",
      );
    }

    res.status(200).json({
      success: true,
      data: approval,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the latest stock approval record for a specific inventory piece.
 */
export async function getLatestApprovalByItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const itemId = Array.isArray(req.params.itemId)
      ? req.params.itemId[0]
      : req.params.itemId;
    if (!itemId || !UUID_REGEX.test(itemId)) {
      throw new BadRequestError("Valid inventory piece UUID is required");
    }

    const orgId =
      req.user?.orgId ??
      req.storeContext?.organizationId ??
      (req.query.organizationId as string | undefined);

    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const approval = await getLatestApprovalByItemId(itemId, orgId);
    if (!approval) {
      throw new NotFoundError(
        `No stock approval record found for inventory piece '${itemId}'`,
        "ERR_NOT_FOUND",
      );
    }

    res.status(200).json({
      success: true,
      data: approval,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists stock approvals matching query parameters with pagination.
 */
export async function listStockApprovalsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId =
      req.user?.orgId ??
      req.storeContext?.organizationId ??
      (req.query.organizationId as string | undefined);

    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const validatedQuery = listStockApprovalsQuerySchema.parse({
      ...req.query,
      organizationId: orgId,
    });

    const approvals = await listStockApprovals(validatedQuery);

    res.status(200).json({
      success: true,
      data: approvals,
      meta: {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        count: approvals.length,
      },
    });
  } catch (err) {
    next(err);
  }
}
