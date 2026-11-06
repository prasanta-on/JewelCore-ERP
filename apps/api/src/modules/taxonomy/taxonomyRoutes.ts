import { Router } from "express";
import { authenticate, requirePermission } from "../../common/authMiddleware.js";
import {
  createCategoryHandler,
  listCategoriesHandler,
  getCategoryHandler,
  createSubcategoryHandler,
  getSubcategoryHandler,
  listSubcategoriesHandler,
  getTaxonomyTreeHandler,
  createMaterialHandler,
  listMaterialsHandler,
  getMaterialHandler,
  createPurityHandler,
  listPuritiesHandler,
  getPurityHandler,
} from "./taxonomyController.js";

export function createTaxonomyRouter(): Router {
  const router = Router();

  // All taxonomy endpoints require authentication
  router.use(authenticate);

  // Recursive Taxonomy Tree
  router.get("/tree", getTaxonomyTreeHandler);

  // Categories (Entity 10)
  router.post("/categories", requirePermission("taxonomy:write"), createCategoryHandler);
  router.get("/categories", listCategoriesHandler);
  router.get("/categories/:id", getCategoryHandler);
  router.get("/categories/:categoryId/subcategories", listSubcategoriesHandler);

  // Subcategories (Entity 11)
  router.post("/subcategories", requirePermission("taxonomy:write"), createSubcategoryHandler);
  router.get("/subcategories/:id", getSubcategoryHandler);

  // Materials (Entity 12 - FEAT-TAX-02)
  router.post("/materials", requirePermission("taxonomy:write"), createMaterialHandler);
  router.get("/materials", listMaterialsHandler);
  router.get("/materials/:id", getMaterialHandler);

  // Purities (Entity 13 - FEAT-TAX-02 / DEC-05)
  router.post("/materials/:materialId/purities", requirePermission("taxonomy:write"), createPurityHandler);
  router.post("/purities", requirePermission("taxonomy:write"), createPurityHandler);
  router.get("/purities", listPuritiesHandler);
  router.get("/purities/:id", getPurityHandler);

  return router;
}
