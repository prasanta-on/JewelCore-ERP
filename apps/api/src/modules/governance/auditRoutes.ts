import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import { storeContextMiddleware } from "../../common/storeContextMiddleware.js";
import {
  recordAuditEventHandler,
  getAuditEventHandler,
  listAuditEventsHandler,
} from "./auditController.js";

/**
 * Compliance Audit Trail Engine Router (Entity 40 - FEAT-GOV-02 / INV-09).
 */
export function createAuditRouter(): Router {
  const router = Router();

  // All audit operations require authentication
  router.use(authenticate);
  router.use(storeContextMiddleware);

  // Capture material mutation audit event: POST /api/v1/governance/audit-events
  router.post(
    "/audit-events",
    requirePermission("audit:read"),
    recordAuditEventHandler,
  );

  // Query compliance audit events: GET /api/v1/governance/audit-events
  router.get(
    "/audit-events",
    requirePermission("audit:read"),
    listAuditEventsHandler,
  );

  // Retrieve audit event by ID: GET /api/v1/governance/audit-events/:id
  router.get(
    "/audit-events/:id",
    requirePermission("audit:read"),
    getAuditEventHandler,
  );

  return router;
}
