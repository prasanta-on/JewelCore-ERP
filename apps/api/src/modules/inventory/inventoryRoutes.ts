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

  return router;
}
