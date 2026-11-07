import type { Request, Response, NextFunction } from "express";
import {
  createPricingPolicySchema,
  updatePricingPolicySchema,
  listPricingPoliciesQuerySchema,
  resolvePricingPolicyQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  createPricingPolicy,
  updatePricingPolicy,
  getPricingPolicyById,
  listPricingPolicies,
  resolvePricingPolicy,
} from "@jewelcore/database";

/**
 * Handles creation of a making charge and pricing policy (Entity 45 - FEAT-PRICE-02).
 */
export async function createPricingPolicyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to create a pricing policy",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const input = createPricingPolicySchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const policy = await createPricingPolicy({
      ...input,
      organizationId: orgId,
    });

    res.status(201).json({
      success: true,
      data: policy,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles partial update of an existing pricing policy.
 */
export async function updatePricingPolicyHandler(
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
    const input = updatePricingPolicySchema.parse(req.body);

    const policy = await updatePricingPolicy(id, input, orgId);

    res.status(200).json({
      success: true,
      data: policy,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a pricing policy by ID.
 */
export async function getPricingPolicyHandler(
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
    const policy = await getPricingPolicyById(id, orgId);

    if (!policy) {
      throw new NotFoundError("PricingPolicy", id);
    }

    res.status(200).json({
      success: true,
      data: policy,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists pricing policies with filtering and pagination.
 */
export async function listPricingPoliciesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const validatedQuery = listPricingPoliciesQuerySchema.parse(req.query);

    const result = await listPricingPolicies({
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
 * Resolves the highest-priority matching pricing policy for a given product, category, and store context.
 */
export async function resolvePricingPolicyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const validated = resolvePricingPolicyQuerySchema.parse(req.query);

    const storeId =
      validated.storeId ??
      req.storeContext?.storeId ??
      (req.headers["x-store-id"] as string | undefined);

    const policy = await resolvePricingPolicy({
      organizationId: orgId,
      storeId: storeId ?? null,
      categoryId: validated.categoryId ?? null,
      productId: validated.productId ?? null,
    });

    if (!policy) {
      throw new NotFoundError(
        "PricingPolicy",
        `context (store: ${storeId}, category: ${validated.categoryId}, product: ${validated.productId})`,
      );
    }

    res.status(200).json({
      success: true,
      data: policy,
    });
  } catch (err) {
    next(err);
  }
}
