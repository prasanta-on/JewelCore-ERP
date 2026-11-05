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

  return router;
}
