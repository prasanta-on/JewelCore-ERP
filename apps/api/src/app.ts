import express, { type Express, type Request, type Response } from "express";
import cors from "cors";

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Base Health Check
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "UP",
      service: "@jewelcore/api",
      timestamp: new Date().toISOString(),
    });
  });

  // API v1 Health Check
  app.get("/api/v1/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "UP",
      version: "v1",
      service: "JewelCore ERP API",
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
