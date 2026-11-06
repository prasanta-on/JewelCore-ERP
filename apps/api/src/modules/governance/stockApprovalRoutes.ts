import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import { storeContextMiddleware } from "../../common/storeContextMiddleware.js";
import {
  createStockApprovalHandler,
  getStockApprovalHandler,
  getLatestApprovalByItemHandler,
  listStockApprovalsHandler,
} from "./stockApprovalController.js";

export function createStockApprovalRouter(): Router {
  const router = Router();

  // Authentication and store context resolution
  router.use(authenticate);
  router.use(storeContextMiddleware);

  // Authorize stock approval: POST /api/v1/governance/stock-approvals (INV-01)
  router.post(
    "/stock-approvals",
    requirePermission("stock:approve"),
    createStockApprovalHandler,
  );

  // List stock approvals: GET /api/v1/governance/stock-approvals
  router.get(
    "/stock-approvals",
    requirePermission("stock:view"),
    listStockApprovalsHandler,
  );

  // Get stock approval by ID: GET /api/v1/governance/stock-approvals/:id
  router.get(
    "/stock-approvals/:id",
    requirePermission("stock:view"),
    getStockApprovalHandler,
  );

  // Get latest stock approval for piece: GET /api/v1/governance/items/:itemId/latest-approval
  router.get(
    "/items/:itemId/latest-approval",
    requirePermission("stock:view"),
    getLatestApprovalByItemHandler,
  );

  return router;
}
