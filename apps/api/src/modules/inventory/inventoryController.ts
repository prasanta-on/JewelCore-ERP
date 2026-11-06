import type { Request, Response, NextFunction } from "express";
import {
  birthInventoryItemSchema,
  listInventoryItemsQuerySchema,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "@jewelcore/shared";
import {
  birthInventoryItem,
  getInventoryItemById,
  listInventoryItems,
  getQualityCheckItemById,
  getQualityCheckById,
} from "@jewelcore/database";

/**
 * Handles atomic birth of a serialized physical inventory piece from an approved QC item (FEAT-INV-01 / INV-14).
 *
 * Enforces:
 * - inventory:create permission
 * - Multi-store context isolation (INV-11)
 * - Approved QC item prerequisite (INV-14)
 * - Single-item duplicate birth prevention (409 Conflict)
 */
export async function birthInventoryItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = birthInventoryItemSchema.parse(req.body);

    // Verify QC item and session store context boundary (INV-11)
    const qcItem = await getQualityCheckItemById(input.qualityCheckItemId);
    if (!qcItem) {
      throw new NotFoundError(
        `Quality check item with ID '${input.qualityCheckItemId}' not found`,
        "ERR_QC_ITEM_NOT_FOUND",
      );
    }

    const session = await getQualityCheckById(qcItem.qualityCheckId);
    if (!session) {
      throw new NotFoundError(
        `Quality inspection session with ID '${qcItem.qualityCheckId}' not found`,
        "ERR_QC_NOT_FOUND",
      );
    }

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && activeStoreId !== session.storeId) {
      throw new ForbiddenError(
        `Cross-store access denied: inspection session belongs to store '${session.storeId}', but request is scoped to '${activeStoreId}'`,
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    const item = await birthInventoryItem(input, {
      userId: req.user!.userId,
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a physical serialized inventory item by primary UUID.
 */
export async function getInventoryItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Inventory item ID parameter is required");
    }

    const item = await getInventoryItemById(id);
    if (!item) {
      throw new NotFoundError(
        `Inventory item with ID '${id}' not found`,
        "ERR_INVENTORY_ITEM_NOT_FOUND",
      );
    }

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && activeStoreId !== item.storeId) {
      throw new ForbiddenError(
        "Access to the requested store context is denied",
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    res.status(200).json(item);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists physical inventory pieces with filters and pagination.
 */
export async function listInventoryItemsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listInventoryItemsQuerySchema.parse(req.query);

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && !query.storeId) {
      query.storeId = activeStoreId;
    }

    const items = await listInventoryItems(query);
    res.status(200).json(items);
  } catch (err) {
    next(err);
  }
}
