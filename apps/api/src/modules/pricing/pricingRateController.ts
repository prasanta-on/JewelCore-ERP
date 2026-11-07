import type { Request, Response, NextFunction } from "express";
import {
  createDailyMarketRateSchema,
  listDailyMarketRatesQuerySchema,
  MetalType,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  recordDailyMarketRate,
  getLatestEffectiveRate,
  getDailyMarketRateById,
  listDailyMarketRates,
} from "@jewelcore/database";

/**
 * Handles recording and publishing a new precious metal market spot rate (Entity 44 - FEAT-PRICE-01).
 *
 * Enforces:
 * - pricing:rate:create permission
 * - Multi-tenant isolation
 * - Store context validation (if storeId is explicitly specified)
 * - Atomic superseding of currently active rate
 */
export async function recordDailyMarketRateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId =
      req.user?.orgId ??
      req.storeContext?.organizationId ??
      (req.body.organizationId as string | undefined);

    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to publish market rates",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError("User authentication context is required");
    }

    const input = createDailyMarketRateSchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const rate = await recordDailyMarketRate({
      ...input,
      organizationId: orgId,
      recordedByUserId: userId,
    });

    res.status(201).json({
      success: true,
      data: rate,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the latest active spot rate for a metal.
 * Supports store-level rate board resolution with fallback to organization-wide default rate.
 */
export async function getLatestEffectiveRateHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const metalType = req.query.metalType as MetalType | undefined;
    if (!metalType || !Object.values(MetalType).includes(metalType)) {
      throw new BadRequestError(
        `Invalid or missing metalType query parameter. Valid values: ${Object.values(MetalType).join(", ")}`,
        "ERR_INVALID_METAL_TYPE",
      );
    }

    const storeId =
      (req.query.storeId as string | undefined) ??
      req.storeContext?.storeId ??
      (req.headers["x-store-id"] as string | undefined);

    const currency = (req.query.currency as string | undefined) ?? "CAD";
    const atDate = req.query.atDate
      ? new Date(String(req.query.atDate))
      : undefined;

    const rate = await getLatestEffectiveRate({
      organizationId: orgId,
      metalType,
      storeId: storeId ?? null,
      currency,
      atDate,
    });

    if (!rate) {
      throw new NotFoundError(
        `No active market rate found for metal ${metalType} and currency ${currency}`,
        "ERR_MARKET_RATE_NOT_FOUND",
      );
    }

    res.status(200).json({
      success: true,
      data: rate,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a daily market rate record by ID.
 */
export async function getDailyMarketRateHandler(
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
    const rate = await getDailyMarketRateById(id, orgId);

    if (!rate) {
      throw new NotFoundError(
        `Daily market rate '${id}' not found`,
        "ERR_MARKET_RATE_NOT_FOUND",
      );
    }

    res.status(200).json({
      success: true,
      data: rate,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists historical and active daily market spot rates with optional filters and pagination.
 */
export async function listDailyMarketRatesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError("Organization context is required");
    }

    const validatedQuery = listDailyMarketRatesQuerySchema.parse(req.query);

    const result = await listDailyMarketRates({
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
