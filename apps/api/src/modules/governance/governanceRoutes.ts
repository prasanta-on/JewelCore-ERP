import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import { storeContextMiddleware } from "../../common/storeContextMiddleware.js";
import {
  uploadFileHandler,
  getFileHandler,
  getFileContentHandler,
  verifyFileChecksumHandler,
  createFileAssociationHandler,
  getFileAssociationsHandler,
  deleteFileAssociationHandler,
} from "./governanceController.js";

export function createGovernanceRouter(): Router {
  const router = Router();

  // All document & file operations require authentication
  router.use(authenticate);

  // Store context middleware for active branch context
  router.use(storeContextMiddleware);

  // Entity query associations: GET /api/v1/files/associations?entityType=...&entityId=...
  router.get(
    "/associations",
    requirePermission("documents:read"),
    getFileAssociationsHandler,
  );

  // Delete association: DELETE /api/v1/files/associations/:id
  router.delete(
    "/associations/:id",
    requirePermission("documents:write"),
    deleteFileAssociationHandler,
  );

  // File Upload: POST /api/v1/files (Scenario 1 & 5)
  router.post("/", requirePermission("documents:write"), uploadFileHandler);

  // File Metadata: GET /api/v1/files/:id
  router.get("/:id", requirePermission("documents:read"), getFileHandler);

  // File Binary Content: GET /api/v1/files/:id/content (Scenario 4)
  router.get(
    "/:id/content",
    requirePermission("documents:read"),
    getFileContentHandler,
  );

  // Checksum Verification: GET /api/v1/files/:id/verify
  router.get(
    "/:id/verify",
    requirePermission("documents:read"),
    verifyFileChecksumHandler,
  );

  // Polymorphic Association: POST /api/v1/files/:id/associations (Scenario 2)
  router.post(
    "/:id/associations",
    requirePermission("documents:write"),
    createFileAssociationHandler,
  );

  // File Associations: GET /api/v1/files/:id/associations
  router.get(
    "/:id/associations",
    requirePermission("documents:read"),
    getFileAssociationsHandler,
  );

  return router;
}
