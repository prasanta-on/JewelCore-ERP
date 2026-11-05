import type { Request, Response, NextFunction } from "express";
import {
  createCategorySchema,
  createSubcategorySchema,
  NotFoundError,
  BadRequestError,
} from "@jewelcore/shared";
import {
  createCategory,
  getCategoryById,
  listCategoriesByOrg,
  createSubcategory,
  getSubcategoryById,
  listSubcategoriesByCategory,
  getTaxonomyTree,
} from "@jewelcore/database";

export async function createCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const validated = createCategorySchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const category = await createCategory(validated);
    res.status(201).json({
      data: category,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listCategoriesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const categories = await listCategoriesByOrg(orgId);
    res.status(200).json({
      data: categories,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getCategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Category ID is required", "ERR_INVALID_ID");
    }

    const category = await getCategoryById(id);
    if (!category) {
      throw new NotFoundError("Category", id);
    }

    res.status(200).json({
      data: category,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createSubcategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = createSubcategorySchema.parse(req.body);
    const subcategory = await createSubcategory(validated);
    res.status(201).json({
      data: subcategory,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getSubcategoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Subcategory ID is required", "ERR_INVALID_ID");
    }

    const subcategory = await getSubcategoryById(id);
    if (!subcategory) {
      throw new NotFoundError("Subcategory", id);
    }

    res.status(200).json({
      data: subcategory,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listSubcategoriesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawCatId = req.params.categoryId;
    const categoryId = Array.isArray(rawCatId) ? rawCatId[0] : rawCatId;
    if (!categoryId) {
      throw new BadRequestError("Category ID is required", "ERR_INVALID_ID");
    }

    const subcategories = await listSubcategoriesByCategory(categoryId);
    res.status(200).json({
      data: subcategories,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getTaxonomyTreeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const tree = await getTaxonomyTree(orgId);
    res.status(200).json({
      data: tree,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
