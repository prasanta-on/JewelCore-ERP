import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import { storeContextMiddleware } from "../../common/storeContextMiddleware.js";
import {
  createQualityCheckHandler,
  getQualityCheckHandler,
  listQualityChecksHandler,
  updateQualityCheckHandler,
} from "./qcController.js";

export function createQcRouter(): Router {
  const router = Router();

  // All QC endpoints require authentication
  router.use(authenticate);

  // Store-context scoping & multi-store isolation (INV-11)
  router.use(storeContextMiddleware);

  // Quality Inspection Sessions (Entity 23 - FEAT-QC-01)
  router.post(
    "/checks",
    requirePermission("qc:create"),
    createQualityCheckHandler,
  );
  router.get("/checks", listQualityChecksHandler);
  router.get("/checks/:id", getQualityCheckHandler);
  router.patch(
    "/checks/:id",
    requirePermission("qc:update"),
    updateQualityCheckHandler,
  );

  return router;
}
