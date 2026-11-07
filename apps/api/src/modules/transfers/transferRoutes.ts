import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import {
  createTransferOrderHandler,
  addTransferOrderItemHandler,
  removeTransferOrderItemHandler,
  submitTransferOrderHandler,
  approveTransferOrderHandler,
  rejectTransferOrderHandler,
  cancelTransferOrderHandler,
  getTransferOrderHandler,
  listTransferOrdersHandler,
} from "./transferOrderController.js";

/**
 * Express router for Multi-Branch Inter-Store Transfers & Logistics (Sprint 10).
 */
export function createTransfersRouter(): Router {
  const router = Router();

  // All transfer endpoints require authentication
  router.use(authenticate);

  // ==========================================
  // FEAT-XFR-01: Transfer Orders & Approvals
  // ==========================================
  router.post(
    "/orders",
    requirePermission("transfer:order:create"),
    createTransferOrderHandler,
  );

  router.get(
    "/orders",
    requirePermission("transfer:order:view"),
    listTransferOrdersHandler,
  );

  router.get(
    "/orders/:id",
    requirePermission("transfer:order:view"),
    getTransferOrderHandler,
  );

  router.post(
    "/orders/:id/items",
    requirePermission("transfer:order:create"),
    addTransferOrderItemHandler,
  );

  router.delete(
    "/orders/:id/items/:itemId",
    requirePermission("transfer:order:create"),
    removeTransferOrderItemHandler,
  );

  router.post(
    "/orders/:id/submit",
    requirePermission("transfer:order:create"),
    submitTransferOrderHandler,
  );

  router.post(
    "/orders/:id/approve",
    requirePermission("transfer:order:approve"),
    approveTransferOrderHandler,
  );

  router.post(
    "/orders/:id/reject",
    requirePermission("transfer:order:approve"),
    rejectTransferOrderHandler,
  );

  router.post(
    "/orders/:id/cancel",
    requirePermission("transfer:order:create"),
    cancelTransferOrderHandler,
  );

  return router;
}
