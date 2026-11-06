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
  createWeightMeasurementHandler,
  getWeightMeasurementHandler,
  listWeightMeasurementsHandler,
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

  // Analytical Balance Metrology (Entity 25 - FEAT-QC-02 / INV-02, INV-09)
  router.post(
    "/measurements",
    requirePermission("qc:measure"),
    createWeightMeasurementHandler,
  );
  router.get("/measurements", listWeightMeasurementsHandler);
  router.get("/measurements/:id", getWeightMeasurementHandler);

  return router;
}
