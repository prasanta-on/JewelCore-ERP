import type { Request, Response, NextFunction } from "express";
import {
  calculatePriceRequestSchema,
  snapshotPiecePriceSchema,
  revalueStoreInventorySchema,
  listPriceSnapshotsQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  calculateCustomValuation,
  snapshotPiecePrice,
  revalueStoreInventory,
  listPriceSnapshots,
  getPriceSnapshotById,
} from "@jewelcore/database";

/**
 * Simulates or computes dynamic piece valuation (FEAT-PRICE-04).
 */
export async function calculatePriceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required for price calculation",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const input = calculatePriceRequestSchema.parse(req.body);
    const storeId = input.storeId ?? req.storeContext?.storeId;

    const result = await calculateCustomValuation(orgId, {
      ...input,
      storeId,
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
 * Snapshots the dynamic price of a serialized inventory piece, writing to price_snapshots
 * and atomically updating inventory_items (cost_price_cad, selling_price_cad, version).
 */
export async function snapshotPiecePriceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to snapshot piece price",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const inventoryItemId = req.params.id as string;
    const body = snapshotPiecePriceSchema.parse(req.body || {});

    const result = await snapshotPiecePrice({
      organizationId: orgId,
      inventoryItemId,
      marginPercentageOverride: body.marginPercentageOverride,
      triggeredByUserId: req.user?.userId ?? null,
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
 * Batch revalues all sellable inventory items in a store branch upon spot rate changes.
 */
export async function revalueStoreInventoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required for store revaluation",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const input = revalueStoreInventorySchema.parse(req.body);
    const storeId = input.storeId ?? req.storeContext?.storeId;

    if (!storeId) {
      throw new BadRequestError(
        "Store ID is required for inventory revaluation",
        "ERR_MISSING_STORE_ID",
      );
    }

    const result = await revalueStoreInventory({
      organizationId: orgId,
      storeId,
      categoryId: input.categoryId,
      triggeredByUserId: req.user?.userId ?? null,
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
 * Lists historical price snapshots for an inventory piece or store branch.
 */
export async function listPriceSnapshotsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const query = listPriceSnapshotsQuerySchema.parse(req.query);
    const inventoryItemId = req.params.id as string | undefined;

    const result = await listPriceSnapshots({
      organizationId: orgId,
      inventoryItemId,
      storeId: query.storeId,
      limit: query.limit,
      offset: query.offset,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a single price snapshot record by ID.
 */
export async function getPriceSnapshotByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const id = req.params.id as string;
    const snapshot = await getPriceSnapshotById({
      organizationId: orgId,
      id,
    });

    if (!snapshot) {
      throw new NotFoundError(
        `Price snapshot not found: ${id}`,
        "ERR_NOT_FOUND",
      );
    }

    res.status(200).json({
      success: true,
      data: snapshot,
    });
  } catch (err) {
    next(err);
  }
}
