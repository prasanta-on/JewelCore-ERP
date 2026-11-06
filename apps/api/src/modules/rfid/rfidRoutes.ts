import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import {
  createRfidTagHandler,
  getRfidTagHandler,
  updateRfidTagStatusHandler,
  listRfidTagsHandler,
  createRfidAssignmentHandler,
  retireRfidAssignmentHandler,
  getRfidAssignmentHandler,
  listRfidAssignmentsHandler,
  getActiveItemAssignmentHandler,
} from "./rfidController.js";

/**
 * RFID Infrastructure, Tracking & Hardware Gateway Router (FEAT-RFID-01, FEAT-RFID-02).
 */
export function createRfidRouter(): Router {
  const router = Router();

  // All RFID endpoints require authentication
  router.use(authenticate);

  // EPC Tag Master Registry & Lifecycle (Entity 35 - FEAT-RFID-01)
  router.post("/tags", requirePermission("rfid:write"), createRfidTagHandler);
  router.get("/tags", requirePermission("rfid:view"), listRfidTagsHandler);
  router.get("/tags/:id", requirePermission("rfid:view"), getRfidTagHandler);
  router.patch(
    "/tags/:id/status",
    requirePermission("rfid:write"),
    updateRfidTagStatusHandler,
  );

  // Single-Active Tag Binding & Detachment Lifecycle (Entity 36 - FEAT-RFID-02)
  router.post(
    "/assignments",
    requirePermission("rfid:write"),
    createRfidAssignmentHandler,
  );
  router.patch(
    "/assignments/:id/retire",
    requirePermission("rfid:write"),
    retireRfidAssignmentHandler,
  );
  router.get(
    "/assignments/:id",
    requirePermission("rfid:view"),
    getRfidAssignmentHandler,
  );
  router.get(
    "/assignments",
    requirePermission("rfid:view"),
    listRfidAssignmentsHandler,
  );
  router.get(
    "/items/:itemId/assignment",
    requirePermission("rfid:view"),
    getActiveItemAssignmentHandler,
  );

  return router;
}
