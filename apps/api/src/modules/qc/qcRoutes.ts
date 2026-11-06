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
  createQualityCheckItemHandler,
  getQualityCheckItemHandler,
  addItemGemstoneHandler,
  listItemGemstonesHandler,
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

  // QC Inspection Items (Entity 24 - FEAT-QC-04)
  router.post(
    "/items",
    requirePermission("qc:create"),
    createQualityCheckItemHandler,
  );
  router.get("/items/:id", getQualityCheckItemHandler);

  // Mounted Gemstones & Parcels (Entity 26 - FEAT-QC-03 / DEC-05)
  router.post(
    "/items/:id/gemstones",
    requirePermission("qc:measure"),
    addItemGemstoneHandler,
  );
  router.get(
    "/items/:id/gemstones",
    requirePermission("qc:view"),
    listItemGemstonesHandler,
  );

  return router;
}
