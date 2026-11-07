import { z } from "zod";

/**
 * Precious metal types supported by the market rate and pricing engines.
 */
export const MetalType = {
  GOLD: "GOLD",
  SILVER: "SILVER",
  PLATINUM: "PLATINUM",
  PALLADIUM: "PALLADIUM",
} as const;

export type MetalType = (typeof MetalType)[keyof typeof MetalType];

/**
 * Sources for market spot rate ingestion.
 */
export const RateSource = {
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
  LBMA_FEED: "LBMA_FEED",
  SIMULATED_FEED: "SIMULATED_FEED",
  API_FEED: "API_FEED",
} as const;

export type RateSource = (typeof RateSource)[keyof typeof RateSource];

/**
 * Zod schema for recording a precious metal spot market rate (Entity 44 - FEAT-PRICE-01).
 */
export const createDailyMarketRateSchema = z.object({
  organizationId: z
    .string()
    .uuid("Invalid organization UUID format")
    .optional(),
  storeId: z.string().uuid("Invalid store UUID format").optional().nullable(),
  metalType: z.nativeEnum(MetalType),
  ratePerGramCad: z
    .number()
    .positive("Rate per gram must be strictly positive")
    .max(1000000, "Rate per gram cannot exceed 1,000,000"),
  currency: z.string().min(3).max(10).default("CAD"),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional().nullable(),
  rateSource: z.nativeEnum(RateSource).default(RateSource.MANUAL_OVERRIDE),
  notes: z.string().max(500).optional().nullable(),
});

export type CreateDailyMarketRateInput = z.infer<
  typeof createDailyMarketRateSchema
>;

/**
 * In-memory representation of an immutable daily market spot rate (Entity 44).
 */
export interface DailyMarketRateRecord {
  id: string;
  organizationId: string;
  storeId: string | null;
  metalType: MetalType;
  ratePerGramCad: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  rateSource: RateSource;
  isActive: boolean;
  recordedByUserId: string;
  notes: string | null;
  createdAt: Date;
}

/**
 * Zod schema for querying precious metal spot rates.
 */
export const listDailyMarketRatesQuerySchema = z.object({
  storeId: z.string().uuid("Invalid store UUID format").optional(),
  metalType: z.nativeEnum(MetalType).optional(),
  isActive: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      return val === "true" || val === "1";
    }),
  effectiveAt: z.coerce.date().optional(),
  currency: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListDailyMarketRatesQuery = z.infer<
  typeof listDailyMarketRatesQuerySchema
>;

/**
 * Making / labour charge calculation models (FEAT-PRICE-02, Entity 45).
 */
export const MakingChargeType = {
  PER_GRAM: "PER_GRAM",
  FIXED_PIECE: "FIXED_PIECE",
  PERCENTAGE_OF_METAL: "PERCENTAGE_OF_METAL",
} as const;

export type MakingChargeType =
  (typeof MakingChargeType)[keyof typeof MakingChargeType];

/**
 * Zod schema for creating a pricing policy (Entity 45 - FEAT-PRICE-02).
 */
export const createPricingPolicySchema = z.object({
  organizationId: z
    .string()
    .uuid("Invalid organization UUID format")
    .optional(),
  storeId: z.string().uuid("Invalid store UUID format").optional().nullable(),
  categoryId: z
    .string()
    .uuid("Invalid category UUID format")
    .optional()
    .nullable(),
  productId: z
    .string()
    .uuid("Invalid product UUID format")
    .optional()
    .nullable(),
  policyName: z.string().min(1, "policyName must not be empty").max(150),
  chargeType: z.nativeEnum(MakingChargeType),
  chargeRate: z.number().min(0, "chargeRate must be non-negative"),
  wastagePercentage: z
    .number()
    .min(0, "wastagePercentage must be non-negative")
    .max(1, "wastagePercentage cannot exceed 1.0 (100%)")
    .default(0),
  hallmarkingFeeCad: z
    .number()
    .min(0, "hallmarkingFeeCad must be non-negative")
    .default(0),
  certificationFeeCad: z
    .number()
    .min(0, "certificationFeeCad must be non-negative")
    .default(0),
  defaultMarginPercentage: z
    .number()
    .min(0, "defaultMarginPercentage must be non-negative")
    .max(10, "defaultMarginPercentage cannot exceed 10.0 (1000%)")
    .default(0.2),
  minRetailPriceCad: z
    .number()
    .min(0, "minRetailPriceCad must be non-negative")
    .optional()
    .nullable(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional().nullable(),
});

export type CreatePricingPolicyInput = z.infer<
  typeof createPricingPolicySchema
>;

/**
 * Zod schema for updating a pricing policy.
 */
export const updatePricingPolicySchema = z.object({
  policyName: z
    .string()
    .min(1, "policyName must not be empty")
    .max(150)
    .optional(),
  chargeType: z.nativeEnum(MakingChargeType).optional(),
  chargeRate: z.number().min(0, "chargeRate must be non-negative").optional(),
  wastagePercentage: z
    .number()
    .min(0, "wastagePercentage must be non-negative")
    .max(1, "wastagePercentage cannot exceed 1.0 (100%)")
    .optional(),
  hallmarkingFeeCad: z
    .number()
    .min(0, "hallmarkingFeeCad must be non-negative")
    .optional(),
  certificationFeeCad: z
    .number()
    .min(0, "certificationFeeCad must be non-negative")
    .optional(),
  defaultMarginPercentage: z
    .number()
    .min(0, "defaultMarginPercentage must be non-negative")
    .max(10, "defaultMarginPercentage cannot exceed 10.0 (1000%)")
    .optional(),
  minRetailPriceCad: z
    .number()
    .min(0, "minRetailPriceCad must be non-negative")
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
  effectiveTo: z.coerce.date().optional().nullable(),
});

export type UpdatePricingPolicyInput = z.infer<
  typeof updatePricingPolicySchema
>;

/**
 * In-memory representation of a making charge and pricing policy (Entity 45).
 */
export interface PricingPolicyRecord {
  id: string;
  organizationId: string;
  storeId: string | null;
  categoryId: string | null;
  productId: string | null;
  policyName: string;
  chargeType: MakingChargeType;
  chargeRate: number;
  wastagePercentage: number;
  hallmarkingFeeCad: number;
  certificationFeeCad: number;
  defaultMarginPercentage: number;
  minRetailPriceCad: number | null;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for querying pricing policies with filters and pagination.
 */
export const listPricingPoliciesQuerySchema = z.object({
  storeId: z.string().uuid("Invalid store UUID format").optional().nullable(),
  categoryId: z
    .string()
    .uuid("Invalid category UUID format")
    .optional()
    .nullable(),
  productId: z
    .string()
    .uuid("Invalid product UUID format")
    .optional()
    .nullable(),
  isActive: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      return val === "true" || val === "1";
    }),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListPricingPoliciesQuery = z.infer<
  typeof listPricingPoliciesQuerySchema
>;

/**
 * Zod schema for resolving the best-match pricing policy for an item.
 */
export const resolvePricingPolicyQuerySchema = z.object({
  storeId: z.string().uuid("Invalid store UUID format").optional().nullable(),
  categoryId: z
    .string()
    .uuid("Invalid category UUID format")
    .optional()
    .nullable(),
  productId: z
    .string()
    .uuid("Invalid product UUID format")
    .optional()
    .nullable(),
});

export type ResolvePricingPolicyQuery = z.infer<
  typeof resolvePricingPolicyQuerySchema
>;

/**
 * Zod schema for creating a gemstone valuation matrix entry (Entity 46 - FEAT-PRICE-03).
 */
export const createGemstonePriceMatrixSchema = z
  .object({
    organizationId: z
      .string()
      .uuid("Invalid organization UUID format")
      .optional(),
    gemstoneId: z.string().uuid("Invalid gemstone UUID format"),
    caratRangeMin: z
      .number()
      .min(0, "caratRangeMin must be non-negative")
      .default(0),
    caratRangeMax: z
      .number()
      .positive("caratRangeMax must be strictly positive"),
    cutGrade: z.string().trim().max(30).optional().nullable(),
    colorGrade: z.string().trim().max(30).optional().nullable(),
    clarityGrade: z.string().trim().max(30).optional().nullable(),
    ratePerCaratCad: z
      .number()
      .positive("ratePerCaratCad must be strictly positive"),
    currency: z.string().min(3).max(10).default("CAD"),
    effectiveFrom: z.coerce.date().optional(),
    effectiveTo: z.coerce.date().optional().nullable(),
  })
  .refine((data) => data.caratRangeMax >= data.caratRangeMin, {
    message: "caratRangeMax must be greater than or equal to caratRangeMin",
    path: ["caratRangeMax"],
  });

export type CreateGemstonePriceMatrixInput = z.infer<
  typeof createGemstonePriceMatrixSchema
>;

/**
 * Zod schema for updating a gemstone valuation matrix entry.
 */
export const updateGemstonePriceMatrixSchema = z.object({
  cutGrade: z.string().trim().max(30).optional().nullable(),
  colorGrade: z.string().trim().max(30).optional().nullable(),
  clarityGrade: z.string().trim().max(30).optional().nullable(),
  ratePerCaratCad: z
    .number()
    .positive("ratePerCaratCad must be strictly positive")
    .optional(),
  currency: z.string().min(3).max(10).optional(),
  isActive: z.boolean().optional(),
  effectiveTo: z.coerce.date().optional().nullable(),
});

export type UpdateGemstonePriceMatrixInput = z.infer<
  typeof updateGemstonePriceMatrixSchema
>;

/**
 * In-memory representation of a gemstone valuation matrix record (Entity 46).
 */
export interface GemstonePriceMatrixRecord {
  id: string;
  organizationId: string;
  gemstoneId: string;
  caratRangeMin: number;
  caratRangeMax: number;
  cutGrade: string | null;
  colorGrade: string | null;
  clarityGrade: string | null;
  ratePerCaratCad: number;
  currency: string;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for querying gemstone price matrices.
 */
export const listGemstonePriceMatricesQuerySchema = z.object({
  gemstoneId: z.string().uuid("Invalid gemstone UUID format").optional(),
  isActive: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      return val === "true" || val === "1";
    }),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListGemstonePriceMatricesQuery = z.infer<
  typeof listGemstonePriceMatricesQuerySchema
>;

/**
 * Zod schema for resolving the best-matching rate per carat for a mounted gemstone.
 */
export const resolveGemstoneRateQuerySchema = z.object({
  gemstoneId: z.string().uuid("Invalid gemstone UUID format"),
  caratWeight: z.coerce
    .number()
    .positive("caratWeight must be strictly positive"),
  cutGrade: z.string().trim().max(30).optional().nullable(),
  colorGrade: z.string().trim().max(30).optional().nullable(),
  clarityGrade: z.string().trim().max(30).optional().nullable(),
  currency: z.string().default("CAD"),
});

export type ResolveGemstoneRateQuery = z.infer<
  typeof resolveGemstoneRateQuerySchema
>;

/**
 * Breakdown item for each evaluated gemstone mounted on a piece.
 */
export interface PriceBreakdownGemstoneItem {
  itemGemstoneId?: string;
  gemstoneId: string;
  gemstoneName?: string;
  caratWeight: number;
  stoneCount?: number;
  cutGrade?: string | null;
  colorGrade?: string | null;
  clarityGrade?: string | null;
  ratePerCaratCad: number;
  matrixId?: string | null;
  totalCad: number;
}

/**
 * Comprehensive transparent calculation breakdown for an item valuation.
 */
export interface PriceBreakdownDetails {
  metal: {
    metalType: MetalType;
    netWeightGrams: number;
    purityCode?: string;
    purityRatio: number;
    pureMetalWeightGrams: number;
    spotRatePerGramCad: number;
    marketRateId?: string | null;
    totalCad: number;
  };
  gemstones: {
    stoneCount: number;
    totalCarats: number;
    totalCad: number;
    stones: PriceBreakdownGemstoneItem[];
  };
  makingCharge: {
    policyId?: string | null;
    policyName?: string | null;
    chargeType: MakingChargeType;
    chargeRate: number;
    totalCad: number;
  };
  wastage: {
    percentage: number;
    totalCad: number;
  };
  ancillary: {
    hallmarkingCad: number;
    certificationCad: number;
    totalCad: number;
  };
  summary: {
    costPriceCad: number;
    marginPercentage: number;
    marginCad: number;
    minRetailPriceCad?: number | null;
    sellingPriceCad: number;
  };
}

/**
 * In-memory representation of an immutable price snapshot record (Entity 47 - FEAT-PRICE-04).
 */
export interface PriceSnapshotRecord {
  id: string;
  organizationId: string;
  storeId: string;
  inventoryItemId: string;
  marketRateId: string | null;
  pricingPolicyId: string | null;
  metalComponentCad: number;
  gemstoneComponentCad: number;
  makingChargeCad: number;
  wastageComponentCad: number;
  ancillaryFeesCad: number;
  costPriceCad: number;
  marginComponentCad: number;
  sellingPriceCad: number;
  priceBreakdownJson: PriceBreakdownDetails;
  currency: string;
  triggeredByUserId: string | null;
  createdAt: Date;
}

/**
 * Gemstone input for custom price calculation / simulation.
 */
export const calculateCustomPriceGemstoneSchema = z.object({
  gemstoneId: z.string().uuid("Invalid gemstone UUID format"),
  caratWeight: z.number().positive("caratWeight must be strictly positive"),
  stoneCount: z.number().int().min(1).default(1),
  cutGrade: z.string().trim().max(30).optional().nullable(),
  colorGrade: z.string().trim().max(30).optional().nullable(),
  clarityGrade: z.string().trim().max(30).optional().nullable(),
});

export type CalculateCustomPriceGemstone = z.infer<
  typeof calculateCustomPriceGemstoneSchema
>;

/**
 * Zod schema for dynamic price calculation / simulation (FEAT-PRICE-04).
 * Supports either an existing inventoryItemId or custom piece specs.
 */
export const calculatePriceRequestSchema = z
  .object({
    inventoryItemId: z
      .string()
      .uuid("Invalid inventory item UUID format")
      .optional(),
    storeId: z.string().uuid("Invalid store UUID format").optional().nullable(),
    categoryId: z
      .string()
      .uuid("Invalid category UUID format")
      .optional()
      .nullable(),
    productId: z
      .string()
      .uuid("Invalid product UUID format")
      .optional()
      .nullable(),
    metalType: z.nativeEnum(MetalType).optional(),
    netWeightGrams: z
      .number()
      .positive("netWeightGrams must be strictly positive")
      .optional(),
    purityRatio: z
      .number()
      .min(0, "purityRatio must be between 0 and 1")
      .max(1, "purityRatio must be between 0 and 1")
      .optional(),
    gemstones: z
      .array(calculateCustomPriceGemstoneSchema)
      .optional()
      .default([]),
    marginPercentageOverride: z
      .number()
      .min(0, "marginPercentageOverride cannot be negative")
      .max(10, "marginPercentageOverride cannot exceed 1000%")
      .optional(),
  })
  .refine(
    (data) =>
      Boolean(data.inventoryItemId) ||
      (Boolean(data.metalType) &&
        data.netWeightGrams !== undefined &&
        data.purityRatio !== undefined),
    {
      message:
        "Either inventoryItemId or metal specifications (metalType, netWeightGrams, purityRatio) must be provided",
      path: ["inventoryItemId"],
    },
  );

export type CalculatePriceRequest = z.infer<typeof calculatePriceRequestSchema>;

/**
 * Zod schema for snapshotting piece price.
 */
export const snapshotPiecePriceSchema = z.object({
  marginPercentageOverride: z
    .number()
    .min(0, "marginPercentageOverride cannot be negative")
    .max(10, "marginPercentageOverride cannot exceed 1000%")
    .optional(),
});

export type SnapshotPiecePriceInput = z.infer<typeof snapshotPiecePriceSchema>;

/**
 * Zod schema for batch revaluing store inventory.
 */
export const revalueStoreInventorySchema = z.object({
  storeId: z.string().uuid("Invalid store UUID format"),
  categoryId: z
    .string()
    .uuid("Invalid category UUID format")
    .optional()
    .nullable(),
});

export type RevalueStoreInventoryInput = z.infer<
  typeof revalueStoreInventorySchema
>;

/**
 * Zod schema for querying historical price snapshots.
 */
export const listPriceSnapshotsQuerySchema = z.object({
  storeId: z.string().uuid("Invalid store UUID format").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListPriceSnapshotsQuery = z.infer<
  typeof listPriceSnapshotsQuerySchema
>;
