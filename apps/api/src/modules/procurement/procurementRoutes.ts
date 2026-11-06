import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import { storeContextMiddleware } from "../../common/storeContextMiddleware.js";
import {
  createSupplierHandler,
  listSuppliersHandler,
  getSupplierHandler,
  updateSupplierHandler,
  createGrnHandler,
  listGrnsHandler,
  getGrnHandler,
  updateGrnHandler,
  closeGrnHandler,
} from "./procurementController.js";

export function createProcurementRouter(): Router {
  const router = Router();

  // All procurement endpoints require authentication
  router.use(authenticate);

  // Optional store-context extraction for store-scoped operations
  router.use(storeContextMiddleware);

  // Suppliers Master (Entity 18 - FEAT-PROC-01)
  router.post(
    "/suppliers",
    requirePermission("procurement:write"),
    createSupplierHandler,
  );
  router.get("/suppliers", listSuppliersHandler);
  router.get("/suppliers/:id", getSupplierHandler);
  router.patch(
    "/suppliers/:id",
    requirePermission("procurement:write"),
    updateSupplierHandler,
  );

  // Goods Receipt Notes (GRN, Entity 19 - FEAT-PROC-02)
  router.post(
    "/grns",
    requirePermission("procurement:write"),
    createGrnHandler,
  );
  router.get("/grns", listGrnsHandler);
  router.get("/grns/:id", getGrnHandler);
  router.patch(
    "/grns/:id",
    requirePermission("procurement:write"),
    updateGrnHandler,
  );
  router.post(
    "/grns/:id/close",
    requirePermission("procurement:write"),
    closeGrnHandler,
  );

  return router;
}
