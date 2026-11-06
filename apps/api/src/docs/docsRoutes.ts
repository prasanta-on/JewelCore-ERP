import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { getOpenApiDocumentation } from "./openApiRegistry.js";

export function createDocsRouter(): Router {
  const router = Router();
  const openApiDoc = getOpenApiDocumentation();

  // Raw OpenAPI specification JSON endpoints
  router.get("/api-docs/openapi.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(openApiDoc);
  });

  router.get("/api/v1/openapi.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(openApiDoc);
  });

  // Interactive Swagger UI Documentation Dashboard
  router.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDoc, {
      customSiteTitle: "JewelCore ERP — Interactive API Documentation",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "none",
        filter: true,
      },
    }),
  );

  return router;
}
