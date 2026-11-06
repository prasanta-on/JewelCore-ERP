import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import { storeContextMiddleware } from "../../common/storeContextMiddleware.js";
import {
  birthInventoryItemHandler,
  getInventoryItemHandler,
  listInventoryItemsHandler,
  upsertStockBalanceHandler,
  getStockBalanceHandler,
  updateStockBalanceHandler,
  listStockBalancesHandler,
  createInventoryMovementHandler,
  getInventoryMovementHandler,
  listInventoryMovementsHandler,
} from "./inventoryController.js";

export function createInventoryRouter(): Router {
  const router = Router();

  // All inventory endpoints require authentication
  router.use(authenticate);

  // Store-context scoping & multi-store isolation (INV-11)
  router.use(storeContextMiddleware);

  // Serialized Piece Birth & Lineage (Entity 28 - FEAT-INV-01 / INV-14)
  router.post(
    "/items/birth",
    requirePermission("inventory:create"),
    birthInventoryItemHandler,
  );
  router.get(
    "/items",
    requirePermission("inventory:view"),
    listInventoryItemsHandler,
  );
  router.get(
    "/items/:id",
    requirePermission("inventory:view"),
    getInventoryItemHandler,
  );

  // Bulk Quantity-Batch Stock Balances (Entity 29 - FEAT-INV-02 / BIZ-Q02)
  router.post(
    "/balances",
    requirePermission("inventory:write"),
    upsertStockBalanceHandler,
  );
  router.get(
    "/balances",
    requirePermission("inventory:view"),
    listStockBalancesHandler,
  );
  router.get(
    "/balances/:id",
    requirePermission("inventory:view"),
    getStockBalanceHandler,
  );
  router.patch(
    "/balances/:id",
    requirePermission("inventory:write"),
    updateStockBalanceHandler,
  );

  // Unified Custody Movement Ledger (Entity 30 - FEAT-INV-03 / INV-09, INV-13, INV-16)
  router.post(
    "/movements",
    requirePermission("inventory:transfer"),
    createInventoryMovementHandler,
  );
  router.get(
    "/movements",
    requirePermission("inventory:view"),
    listInventoryMovementsHandler,
  );
  router.get(
    "/movements/:id",
    requirePermission("inventory:view"),
    getInventoryMovementHandler,
  );

  return router;
}
