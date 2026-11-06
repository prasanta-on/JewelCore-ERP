import { Router } from "express";
import { authenticate, requirePermission } from "../../common/authMiddleware.js";
import {
  createSupplierHandler,
  listSuppliersHandler,
  getSupplierHandler,
  updateSupplierHandler,
} from "./procurementController.js";

export function createProcurementRouter(): Router {
  const router = Router();

  // All procurement endpoints require authentication
  router.use(authenticate);

  // Suppliers Master (Entity 18 - FEAT-PROC-01)
  router.post("/suppliers", requirePermission("procurement:write"), createSupplierHandler);
  router.get("/suppliers", listSuppliersHandler);
  router.get("/suppliers/:id", getSupplierHandler);
  router.patch("/suppliers/:id", requirePermission("procurement:write"), updateSupplierHandler);

  return router;
}
