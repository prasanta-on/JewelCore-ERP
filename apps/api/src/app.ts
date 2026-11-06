import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { correlationIdMiddleware } from "./common/correlationId.js";
import { createHttpLogger, logger } from "./common/logger.js";
import { errorHandler, notFoundHandler } from "./common/errorHandler.js";
import { createAuthRouter } from "./modules/auth/authRoutes.js";
import { createIamRouter } from "./modules/iam/iamRoutes.js";
import { createStorageRouter } from "./modules/storage/storageRoutes.js";
import { createTaxonomyRouter } from "./modules/taxonomy/taxonomyRoutes.js";
import { createProcurementRouter } from "./modules/procurement/procurementRoutes.js";
import { createGovernanceRouter } from "./modules/governance/governanceRoutes.js";
import { createQcRouter } from "./modules/qc/qcRoutes.js";
import { createInventoryRouter } from "./modules/inventory/inventoryRoutes.js";
import { createDocsRouter } from "./docs/docsRoutes.js";

export function createApp(configureRoutes?: (app: Express) => void): Express {
  const app = express();

  // 1. Correlation ID Middleware (must execute first to tag every request)
  app.use(correlationIdMiddleware);

  // 2. Structured HTTP Logger (Pino)
  app.use(createHttpLogger());

  // 3. Security & Body Parsing Middleware
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  // 4. Base Health Check
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "UP",
      service: "@jewelcore/api",
      timestamp: new Date().toISOString(),
    });
  });

  // 5. API v1 Health Check
  app.get("/api/v1/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "UP",
      version: "v1",
      service: "JewelCore ERP API",
      timestamp: new Date().toISOString(),
    });
  });

  // 6. Authentication Module (Top-Level Public Security Context)
  app.use("/api/v1/auth", createAuthRouter());

  // 7. Identity & Access Management Module (Administrative & Governance)
  app.use("/api/v1/iam", createIamRouter());

  // 8. Physical Storage & Vault Custody Module (FEAT-STOR-01)
  app.use("/api/v1/storage", createStorageRouter());

  // 9. Master Data Taxonomy Module (FEAT-TAX-01)
  app.use("/api/v1/taxonomy", createTaxonomyRouter());

  // 10. Inbound Procurement & Vendor Management Module (FEAT-PROC-01)
  app.use("/api/v1/procurement", createProcurementRouter());

  // 11. Polymorphic Document & Object Storage Module (FEAT-GOV-03)
  app.use("/api/v1/files", createGovernanceRouter());

  // 12. Quality Control & Metrology Module (FEAT-QC-01)
  app.use("/api/v1/qc", createQcRouter());

  // 13. Physical Inventory & Custody Ledger Module (FEAT-INV-01)
  app.use("/api/v1/inventory", createInventoryRouter());

  // 14. Interactive OpenAPI / Swagger Documentation
  app.use(createDocsRouter());

  // Custom route injection (useful for test harnesses and integration mocks)
  if (configureRoutes) {
    configureRoutes(app);
  }

  // 8. Unmatched Route Fallback (404 Not Found)
  app.use(notFoundHandler);

  // 9. Centralized RFC 7807 Error Handler (must be registered last)
  app.use(errorHandler);

  return app;
}

export { logger };
