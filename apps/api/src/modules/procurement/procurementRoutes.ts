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
  createShipmentHandler,
  listShipmentsHandler,
  getShipmentHandler,
  updateShipmentHandler,
  addShipmentItemHandler,
  updateShipmentItemHandler,
  createStaffAssignmentHandler,
  listStaffAssignmentsHandler,
  getStaffAssignmentHandler,
  deleteStaffAssignmentHandler,
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

  // Inbound Shipments & Line Items Manifest (Entities 20, 21 - FEAT-PROC-03)
  router.post(
    "/shipments",
    requirePermission("procurement:write"),
    createShipmentHandler,
  );
  router.get("/shipments", listShipmentsHandler);
  router.get("/shipments/:id", getShipmentHandler);
  router.patch(
    "/shipments/:id",
    requirePermission("procurement:write"),
    updateShipmentHandler,
  );
  router.post(
    "/shipments/:id/items",
    requirePermission("procurement:write"),
    addShipmentItemHandler,
  );
  router.patch(
    "/shipments/:id/items/:itemId",
    requirePermission("procurement:write"),
    updateShipmentItemHandler,
  );

  // Receiving Staff Assignments (Entity 22 - FEAT-PROC-04)
  router.post(
    "/assignments",
    requirePermission("procurement:write"),
    createStaffAssignmentHandler,
  );
  router.get("/assignments", listStaffAssignmentsHandler);
  router.get("/assignments/:id", getStaffAssignmentHandler);
  router.delete(
    "/assignments/:id",
    requirePermission("procurement:write"),
    deleteStaffAssignmentHandler,
  );

  return router;
}
