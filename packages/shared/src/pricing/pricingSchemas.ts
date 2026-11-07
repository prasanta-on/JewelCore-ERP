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
