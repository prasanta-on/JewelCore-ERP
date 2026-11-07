import type { Request, Response, NextFunction } from "express";
import {
  createGemstonePriceMatrixSchema,
  updateGemstonePriceMatrixSchema,
  listGemstonePriceMatricesQuerySchema,
  resolveGemstoneRateQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  createGemstonePriceMatrix,
  updateGemstonePriceMatrix,
  getGemstonePriceMatrixById,
  listGemstonePriceMatrices,
  resolveGemstoneRate,
} from "@jewelcore/database";

/**
 * Handles creation of a gemstone valuation matrix entry (Entity 46 - FEAT-PRICE-03).
 */
export async function createGemstonePriceMatrixHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to create a gemstone price matrix",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const input = createGemstonePriceMatrixSchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const matrix = await createGemstonePriceMatrix({
      ...input,
      organizationId: orgId,
    });

    res.status(201).json({
      success: true,
      data: matrix,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles updating an existing gemstone price matrix entry.
 */
export async function updateGemstonePriceMatrixHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const id = req.params.id as string;
    const input = updateGemstonePriceMatrixSchema.parse(req.body);

    const matrix = await updateGemstonePriceMatrix(id, input, orgId);

    res.status(200).json({
      success: true,
      data: matrix,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a gemstone price matrix record by ID.
 */
export async function getGemstonePriceMatrixHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const id = req.params.id as string;
    const matrix = await getGemstonePriceMatrixById(id, orgId);

    if (!matrix) {
      throw new NotFoundError("GemstonePriceMatrix", id);
    }

    res.status(200).json({
      success: true,
      data: matrix,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists gemstone price matrices with filtering and pagination.
 */
export async function listGemstonePriceMatricesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const validatedQuery = listGemstonePriceMatricesQuerySchema.parse(
      req.query,
    );

    const result = await listGemstonePriceMatrices({
      ...validatedQuery,
      organizationId: orgId,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      total: result.total,
      limit: validatedQuery.limit,
      offset: validatedQuery.offset,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Resolves the best-matching rate per carat for a mounted gemstone.
 */
export async function resolveGemstoneRateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const validated = resolveGemstoneRateQuerySchema.parse(req.query);

    const matrix = await resolveGemstoneRate({
      organizationId: orgId,
      gemstoneId: validated.gemstoneId,
      caratWeight: validated.caratWeight,
      cutGrade: validated.cutGrade ?? null,
      colorGrade: validated.colorGrade ?? null,
      clarityGrade: validated.clarityGrade ?? null,
      currency: validated.currency,
    });

    if (!matrix) {
      throw new NotFoundError(
        "GemstonePriceMatrix",
        `criteria (gemstoneId: ${validated.gemstoneId}, carat: ${validated.caratWeight}, cut: ${validated.cutGrade}, color: ${validated.colorGrade}, clarity: ${validated.clarityGrade})`,
      );
    }

    res.status(200).json({
      success: true,
      data: matrix,
    });
  } catch (err) {
    next(err);
  }
}
