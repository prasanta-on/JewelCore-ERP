import { z } from "zod";

export const TrackingTypeValues = ["SERIALIZED", "QUANTITY_BATCH"] as const;
export type TrackingType = (typeof TrackingTypeValues)[number];

export const GenderValues = ["WOMEN", "MEN", "UNISEX"] as const;
export type Gender = (typeof GenderValues)[number];

export interface Product {
  id: string;
  organizationId: string;
  categoryId: string;
  subcategoryId: string | null;
  materialId: string;
  defaultPurityId: string;
  productCode: string;
  name: string;
  description: string | null;
  gender: string | null;
  collection: string | null;
  defaultTrackingType: TrackingType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const createProductSchema = z
  .object({
    organizationId: z.string().uuid("Organization ID must be a valid UUID"),
    categoryId: z.string().uuid("Category ID must be a valid UUID"),
    subcategoryId: z.string().uuid("Subcategory ID must be a valid UUID").optional().nullable(),
    materialId: z.string().uuid("Material ID must be a valid UUID"),
    defaultPurityId: z.string().uuid("Default purity ID must be a valid UUID"),
    productCode: z
      .string()
      .trim()
      .min(1, "Product code is required")
      .max(50, "Product code must not exceed 50 characters")
      .regex(/^[A-Z0-9_-]+$/i, "Product code must contain only letters, numbers, hyphens, and underscores")
      .optional(),
    code: z
      .string()
      .trim()
      .min(1, "Product code is required")
      .max(50, "Product code must not exceed 50 characters")
      .regex(/^[A-Z0-9_-]+$/i, "Product code must contain only letters, numbers, hyphens, and underscores")
      .optional(),
    name: z
      .string()
      .trim()
      .min(1, "Product name is required")
      .max(150, "Product name must not exceed 150 characters"),
    description: z.string().trim().max(1000).optional().nullable(),
    gender: z.string().trim().max(30).optional().nullable(),
    collection: z.string().trim().max(100).optional().nullable(),
    defaultTrackingType: z.enum(TrackingTypeValues).default("SERIALIZED"),
    isActive: z.boolean().default(true),
  })
  .transform((data) => {
    const finalCode = data.productCode ?? data.code;
    if (!finalCode) {
      throw new Error("Product code is required");
    }
    return {
      organizationId: data.organizationId,
      categoryId: data.categoryId,
      subcategoryId: data.subcategoryId ?? null,
      materialId: data.materialId,
      defaultPurityId: data.defaultPurityId,
      productCode: finalCode,
      name: data.name,
      description: data.description ?? null,
      gender: data.gender ?? null,
      collection: data.collection ?? null,
      defaultTrackingType: data.defaultTrackingType,
      isActive: data.isActive,
    };
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
