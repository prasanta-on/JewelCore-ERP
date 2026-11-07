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
import {
  dispatchTransferOrderHandler,
  getTransferManifestHandler,
  listTransferManifestsHandler,
} from "./transferDispatchController.js";
import {
  receiveTransferManifestHandler,
  createTransferDisputeHandler,
  resolveTransferDisputeHandler,
  getTransferDisputeHandler,
  listTransferDisputesHandler,
} from "./transferReceivingController.js";

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

  // ==========================================
  // FEAT-XFR-02: Manifests & Security Dispatch
  // ==========================================
  router.post(
    "/manifests",
    requirePermission("transfer:manifest:create"),
    dispatchTransferOrderHandler,
  );

  router.get(
    "/manifests",
    requirePermission("transfer:manifest:view"),
    listTransferManifestsHandler,
  );

  router.get(
    "/manifests/:id",
    requirePermission("transfer:manifest:view"),
    getTransferManifestHandler,
  );

  // ==========================================
  // FEAT-XFR-03: Receiving Intake & Dispute Engine
  // ==========================================
  router.post(
    "/manifests/:id/receive",
    requirePermission("transfer:receive"),
    receiveTransferManifestHandler,
  );

  router.post(
    "/disputes",
    requirePermission("transfer:dispute:create"),
    createTransferDisputeHandler,
  );

  router.post(
    "/disputes/:id/resolve",
    requirePermission("transfer:dispute:resolve"),
    resolveTransferDisputeHandler,
  );

  router.get(
    "/disputes",
    requirePermission("transfer:order:view"),
    listTransferDisputesHandler,
  );

  router.get(
    "/disputes/:id",
    requirePermission("transfer:order:view"),
    getTransferDisputeHandler,
  );

  return router;
}
