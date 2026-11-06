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
} from "./rfidController.js";

/**
 * RFID Infrastructure, Tracking & Hardware Gateway Router (FEAT-RFID-01).
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

  return router;
}
