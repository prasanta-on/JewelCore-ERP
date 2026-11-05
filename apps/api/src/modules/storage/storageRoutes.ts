import { Router } from "express";
import { authenticate, requirePermission } from "../../common/authMiddleware.js";
import { requireStoreContext } from "../../common/storeContextMiddleware.js";
import {
  createVaultHandler,
  listVaultsHandler,
  getVaultHandler,
  createLockerHandler,
  getLockerHandler,
  createCompartmentHandler,
  getCompartmentHandler,
  getHierarchyHandler,
} from "./storageController.js";

export function createStorageRouter(): Router {
  const router = Router();

  // All storage endpoints require authentication and active store context scoping (INV-11)
  router.use(authenticate);
  router.use(requireStoreContext());

  // 3-Tier Hierarchy Aggregation View (INV-05, INV-17)
  router.get("/hierarchy", getHierarchyHandler);

  // Vault Endpoints (Entity 32)
  router.post("/vaults", requirePermission("storage:write"), createVaultHandler);
  router.get("/vaults", listVaultsHandler);
  router.get("/vaults/:id", getVaultHandler);

  // Locker Endpoints (Entity 33)
  router.post("/lockers", requirePermission("storage:write"), createLockerHandler);
  router.get("/lockers/:id", getLockerHandler);

  // Compartment Endpoints (Entity 34)
  router.post("/compartments", requirePermission("storage:write"), createCompartmentHandler);
  router.get("/compartments/:id", getCompartmentHandler);

  return router;
}
