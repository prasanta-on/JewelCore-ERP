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
