import { z } from "zod";

export interface Material {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  baseMetalType: string;
  isPrecious: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Purity {
  id: string;
  materialId: string;
  code: string;
  name: string;
  karatage: string | null;
  purityPercentage: number;
  purityRatio: number;
  hallmarkCode: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialWithPurities extends Material {
  purities: Purity[];
}

export const createMaterialSchema = z.object({
  organizationId: z.string().uuid("Organization ID must be a valid UUID"),
  code: z
    .string()
    .trim()
    .min(1, "Material code is required")
    .max(32, "Material code must not exceed 32 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Material code must contain only letters, numbers, hyphens, and underscores"),
  name: z
    .string()
    .trim()
    .min(1, "Material name is required")
    .max(100, "Material name must not exceed 100 characters"),
  baseMetalType: z
    .string()
    .trim()
    .min(1, "Base metal type is required")
    .max(32, "Base metal type must not exceed 32 characters"),
  isPrecious: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

export const createPuritySchema = z
  .object({
    materialId: z.string().uuid("Material ID must be a valid UUID"),
    code: z
      .string()
      .trim()
      .min(1, "Purity code is required")
      .max(32, "Purity code must not exceed 32 characters")
      .regex(/^[A-Z0-9_-]+$/i, "Purity code must contain only letters, numbers, hyphens, and underscores"),
    name: z
      .string()
      .trim()
      .min(1, "Purity name is required")
      .max(100, "Purity name must not exceed 100 characters"),
    karatage: z.string().trim().max(32).optional().nullable(),
    purityPercentage: z.coerce
      .number({ invalid_type_error: "Purity percentage must be a number" })
      .min(0, "Purity percentage must be >= 0")
      .max(100, "Purity percentage must be <= 100.0000"),
    purityRatio: z.coerce
      .number()
      .min(0, "Purity ratio must be >= 0")
      .max(1, "Purity ratio must be <= 1.0000")
      .optional(),
    hallmarkCode: z.string().trim().max(32).optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .transform((data) => {
    const calculatedRatio = Number((data.purityPercentage / 100).toFixed(4));
    return {
      ...data,
      purityRatio: data.purityRatio !== undefined ? data.purityRatio : calculatedRatio,
    };
  });

export type CreatePurityInput = z.infer<typeof createPuritySchema>;
