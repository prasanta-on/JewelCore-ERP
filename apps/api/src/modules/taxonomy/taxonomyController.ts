import type { Request, Response, NextFunction } from "express";
import {
  createCategorySchema,
  createSubcategorySchema,
  createMaterialSchema,
  createPuritySchema,
  createGemstoneSchema,
  createProductSchema,
  type GemstoneType,
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
  createMaterial,
  getMaterialById,
  listMaterials,
  createPurity,
  getPurityById,
  listPurities,
  getMaterialWithPurities,
  createGemstone,
  getGemstoneById,
  listGemstones,
  createProduct,
  getProductById,
  listProducts,
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

// ==========================================
// Materials & Purities Handlers (FEAT-TAX-02)
// ==========================================

export async function createMaterialHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const validated = createMaterialSchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const material = await createMaterial(validated);
    res.status(201).json({
      data: material,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listMaterialsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const isActive = req.query.isActive !== undefined
      ? req.query.isActive === "true"
      : undefined;

    const materials = await listMaterials({ organizationId: orgId, isActive });
    res.status(200).json({
      data: materials,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getMaterialHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Material ID is required", "ERR_INVALID_ID");
    }

    const includePurities = req.query.includePurities === "true";

    const material = includePurities
      ? await getMaterialWithPurities(id)
      : await getMaterialById(id);

    if (!material) {
      throw new NotFoundError("Material", id);
    }

    res.status(200).json({
      data: material,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createPurityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const materialId = (req.params.materialId ?? req.body.materialId) as string | undefined;
    if (!materialId) {
      throw new BadRequestError("Material ID is required", "ERR_MISSING_MATERIAL_ID");
    }

    // Verify material exists
    const material = await getMaterialById(materialId);
    if (!material) {
      throw new NotFoundError("Material", materialId);
    }

    const validated = createPuritySchema.parse({
      ...req.body,
      materialId,
    });

    const purity = await createPurity(validated);
    res.status(201).json({
      data: purity,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listPuritiesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const materialId = (req.query.materialId ?? req.params.materialId) as string | undefined;
    const orgId = req.user?.orgId;

    const isActive = req.query.isActive !== undefined
      ? req.query.isActive === "true"
      : undefined;

    const purities = await listPurities({
      materialId,
      organizationId: orgId,
      isActive,
    });

    res.status(200).json({
      data: purities,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getPurityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Purity ID is required", "ERR_INVALID_ID");
    }

    const purity = await getPurityById(id);
    if (!purity) {
      throw new NotFoundError("Purity", id);
    }

    res.status(200).json({
      data: purity,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// Gemstones Handlers (FEAT-TAX-03)
// ==========================================

export async function createGemstoneHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const validated = createGemstoneSchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const gemstone = await createGemstone(validated);
    res.status(201).json({
      data: gemstone,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listGemstonesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const gemstoneType = req.query.gemstoneType as GemstoneType | undefined;
    const isActive = req.query.isActive !== undefined
      ? req.query.isActive === "true"
      : undefined;

    const gemstones = await listGemstones({
      organizationId: orgId,
      gemstoneType,
      isActive,
    });

    res.status(200).json({
      data: gemstones,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getGemstoneHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Gemstone ID is required", "ERR_INVALID_ID");
    }

    const gemstone = await getGemstoneById(id);
    if (!gemstone) {
      throw new NotFoundError("Gemstone", id);
    }

    res.status(200).json({
      data: gemstone,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// Product Master Styles Handlers (FEAT-TAX-04)
// ==========================================

export async function createProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const validated = createProductSchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const product = await createProduct(validated);
    res.status(201).json({
      data: product,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listProductsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const categoryId = req.query.categoryId as string | undefined;
    const materialId = req.query.materialId as string | undefined;
    const isActive = req.query.isActive !== undefined
      ? req.query.isActive === "true"
      : undefined;

    const products = await listProducts({
      organizationId: orgId,
      categoryId,
      materialId,
      isActive,
    });

    res.status(200).json({
      data: products,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getProductHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Product ID is required", "ERR_INVALID_ID");
    }

    const product = await getProductById(id);
    if (!product) {
      throw new NotFoundError("Product", id);
    }

    res.status(200).json({
      data: product,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}



