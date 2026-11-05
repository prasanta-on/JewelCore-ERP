import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { correlationIdMiddleware } from "./common/correlationId.js";
import { createHttpLogger, logger } from "./common/logger.js";
import { errorHandler, notFoundHandler } from "./common/errorHandler.js";
import { createAuthRouter } from "./modules/auth/authRoutes.js";
import { createIamRouter } from "./modules/iam/iamRoutes.js";

export function createApp(): Express {
  const app = express();

  // 1. Correlation ID Middleware (must execute first to tag every request)
  app.use(correlationIdMiddleware);

  // 2. Structured HTTP Logger (Pino)
  app.use(createHttpLogger());

  // 3. Security & Body Parsing Middleware
  app.use(cors());
  app.use(express.json());

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

  // 8. Unmatched Route Fallback (404 Not Found)
  app.use(notFoundHandler);

  // 9. Centralized RFC 7807 Error Handler (must be registered last)
  app.use(errorHandler);



  return app;
}

export { logger };
