import type { Request, Response, NextFunction } from "express";
import {
  birthInventoryItemSchema,
  listInventoryItemsQuerySchema,
  createStockBalanceSchema,
  updateStockBalanceSchema,
  listStockBalancesQuerySchema,
  createInventoryMovementSchema,
  listInventoryMovementsQuerySchema,
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
  upsertStockBalance,
  getStockBalanceById,
  updateStockBalance,
  listStockBalances,
  createInventoryMovement,
  getInventoryMovementById,
  listInventoryMovements,
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

/**
 * Creates or updates a bulk quantity-batch stock balance (Entity 29 - FEAT-INV-02 / BIZ-Q02).
 */
export async function upsertStockBalanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = createStockBalanceSchema.parse(req.body);

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && input.storeId && activeStoreId !== input.storeId) {
      throw new ForbiddenError(
        `Cross-store access denied: payload store '${input.storeId}' does not match active store context '${activeStoreId}'`,
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    if (!input.storeId && activeStoreId) {
      input.storeId = activeStoreId;
    }

    const balance = await upsertStockBalance(input, {
      userId: req.user!.userId,
    });

    res.status(200).json(balance);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a stock balance by ID.
 */
export async function getStockBalanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Stock balance ID parameter is required");
    }

    const balance = await getStockBalanceById(id);
    if (!balance) {
      throw new NotFoundError(
        `Stock balance with ID '${id}' not found`,
        "ERR_STOCK_BALANCE_NOT_FOUND",
      );
    }

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && activeStoreId !== balance.storeId) {
      throw new ForbiddenError(
        "Access to the requested store context is denied",
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    res.status(200).json(balance);
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing stock balance by ID with optional OCC check.
 */
export async function updateStockBalanceHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Stock balance ID parameter is required");
    }

    const balance = await getStockBalanceById(id);
    if (!balance) {
      throw new NotFoundError(
        `Stock balance with ID '${id}' not found`,
        "ERR_STOCK_BALANCE_NOT_FOUND",
      );
    }

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && activeStoreId !== balance.storeId) {
      throw new ForbiddenError(
        "Access to the requested store context is denied",
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    const input = updateStockBalanceSchema.parse(req.body);

    const updated = await updateStockBalance(id, input, {
      userId: req.user!.userId,
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists stock balances with query filtering.
 */
export async function listStockBalancesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listStockBalancesQuerySchema.parse(req.query);

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && !query.storeId) {
      query.storeId = activeStoreId;
    }

    const balances = await listStockBalances(query);
    res.status(200).json(balances);
  } catch (err) {
    next(err);
  }
}

/**
 * Records an immutable physical inventory custody movement (Entity 30 - FEAT-INV-03).
 */
export async function createInventoryMovementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = createInventoryMovementSchema.parse(req.body);

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && input.storeId && activeStoreId !== input.storeId) {
      throw new ForbiddenError(
        `Cross-store access denied: payload store '${input.storeId}' does not match active store context '${activeStoreId}'`,
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    const movement = await createInventoryMovement(
      {
        ...input,
        storeId: input.storeId ?? activeStoreId,
      },
      {
        userId: req.user!.userId,
      },
    );

    res.status(201).json(movement);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves an immutable inventory movement record by ID.
 */
export async function getInventoryMovementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Inventory movement ID parameter is required");
    }

    const movement = await getInventoryMovementById(id);
    if (!movement) {
      throw new NotFoundError(
        `Inventory movement with ID '${id}' not found`,
        "ERR_INVENTORY_MOVEMENT_NOT_FOUND",
      );
    }

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && activeStoreId !== movement.storeId) {
      throw new ForbiddenError(
        "Access to the requested store context is denied",
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    res.status(200).json(movement);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists immutable inventory movements with query filtering and pagination.
 */
export async function listInventoryMovementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listInventoryMovementsQuerySchema.parse(req.query);

    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && !query.storeId) {
      query.storeId = activeStoreId;
    }

    const movements = await listInventoryMovements(query);
    res.status(200).json(movements);
  } catch (err) {
    next(err);
  }
}
