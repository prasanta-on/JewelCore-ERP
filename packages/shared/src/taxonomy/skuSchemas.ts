import { z } from "zod";
import { TrackingTypeValues, type TrackingType } from "./productSchemas.js";

export interface ProductSku {
  id: string;
  organizationId: string;
  productId: string;
  skuCode: string;
  variantName: string;
  targetPurityId: string;
  targetGrossWeightGrams: number;
  targetMetalWeightGrams: number;
  trackingType: TrackingType;
  attributesJson: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductGemstoneSpec {
  id: string;
  productSkuId: string;
  gemstoneId: string;
  expectedStoneCount: number;
  targetTotalCaratWeight: number;
  shape: string | null;
  cutGrade: string | null;
  colorGrade: string | null;
  clarityGrade: string | null;
  settingType: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductSkuWithSpecs extends ProductSku {
  gemstoneSpecs: ProductGemstoneSpec[];
}

export const createProductSkuSchema = z
  .object({
    organizationId: z.string().uuid("Organization ID must be a valid UUID"),
    productId: z.string().uuid("Product ID must be a valid UUID"),
    skuCode: z
      .string()
      .trim()
      .min(1, "SKU code is required")
      .max(50, "SKU code must not exceed 50 characters")
      .regex(
        /^[A-Z0-9_-]+$/i,
        "SKU code must contain only alphanumeric characters, dashes, and underscores",
      )
      .optional(),
    code: z
      .string()
      .trim()
      .min(1, "SKU code is required")
      .max(50, "SKU code must not exceed 50 characters")
      .regex(
        /^[A-Z0-9_-]+$/i,
        "SKU code must contain only alphanumeric characters, dashes, and underscores",
      )
      .optional(),
    variantName: z
      .string()
      .trim()
      .min(1, "Variant name is required")
      .max(150, "Variant name must not exceed 150 characters"),
    targetPurityId: z.string().uuid("Target purity ID must be a valid UUID"),
    targetGrossWeightGrams: z.coerce
      .number({ invalid_type_error: "Target gross weight must be a number" })
      .positive("Target gross weight must be positive"),
    targetMetalWeightGrams: z.coerce
      .number({ invalid_type_error: "Target metal weight must be a number" })
      .positive("Target metal weight must be positive"),
    trackingType: z.enum(TrackingTypeValues).default("SERIALIZED"),
    attributesJson: z.record(z.any()).default({}),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => data.targetGrossWeightGrams >= data.targetMetalWeightGrams,
    {
      message:
        "Target gross weight must be greater than or equal to target net metal weight",
      path: ["targetGrossWeightGrams"],
    },
  )
  .transform((data) => {
    const finalCode = data.skuCode ?? data.code;
    if (!finalCode) {
      throw new Error("SKU code is required");
    }
    return {
      organizationId: data.organizationId,
      productId: data.productId,
      skuCode: finalCode,
      variantName: data.variantName,
      targetPurityId: data.targetPurityId,
      targetGrossWeightGrams: Number(data.targetGrossWeightGrams.toFixed(4)),
      targetMetalWeightGrams: Number(data.targetMetalWeightGrams.toFixed(4)),
      trackingType: data.trackingType,
      attributesJson: data.attributesJson,
      isActive: data.isActive,
    };
  });

export type CreateProductSkuInput = z.infer<typeof createProductSkuSchema>;

export const updateProductSkuSchema = z.object({
  variantName: z.string().trim().min(1).max(150).optional(),
  targetPurityId: z.string().uuid().optional(),
  targetGrossWeightGrams: z.coerce.number().positive().optional(),
  targetMetalWeightGrams: z.coerce.number().positive().optional(),
  trackingType: z.string().optional(),
  attributesJson: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateProductSkuInput = z.infer<typeof updateProductSkuSchema>;

export const createProductGemstoneSpecSchema = z.object({
  productSkuId: z.string().uuid("Product SKU ID must be a valid UUID"),
  gemstoneId: z.string().uuid("Gemstone ID must be a valid UUID"),
  expectedStoneCount: z.coerce
    .number()
    .int("Expected stone count must be an integer")
    .min(1, "Expected stone count must be at least 1"),
  targetTotalCaratWeight: z.coerce
    .number()
    .positive("Target total carat weight must be positive"),
  shape: z.string().trim().max(50).optional().nullable(),
  cutGrade: z.string().trim().max(50).optional().nullable(),
  colorGrade: z.string().trim().max(50).optional().nullable(),
  clarityGrade: z.string().trim().max(50).optional().nullable(),
  settingType: z.string().trim().max(50).optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export type CreateProductGemstoneSpecInput = z.infer<
  typeof createProductGemstoneSpecSchema
>;
