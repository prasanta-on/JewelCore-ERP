import { z } from "zod";

export const GemstoneTypeValues = [
  "PRECIOUS",
  "SEMI_PRECIOUS",
  "ORGANIC_PEARL",
] as const;
export type GemstoneType = (typeof GemstoneTypeValues)[number];

export interface Gemstone {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  gemstoneType: GemstoneType;
  defaultMeasurementUnit: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const createGemstoneSchema = z.object({
  organizationId: z.string().uuid("Organization ID must be a valid UUID"),
  code: z
    .string()
    .trim()
    .min(1, "Gemstone code is required")
    .max(50, "Gemstone code must not exceed 50 characters")
    .regex(
      /^[A-Z0-9_-]+$/i,
      "Gemstone code must contain only letters, numbers, hyphens, and underscores",
    ),
  name: z
    .string()
    .trim()
    .min(1, "Gemstone name is required")
    .max(100, "Gemstone name must not exceed 100 characters"),
  gemstoneType: z.enum(GemstoneTypeValues, {
    errorMap: () => ({
      message:
        "Gemstone type must be PRECIOUS, SEMI_PRECIOUS, or ORGANIC_PEARL",
    }),
  }),
  defaultMeasurementUnit: z
    .string()
    .trim()
    .min(1, "Default measurement unit is required")
    .max(20, "Default measurement unit must not exceed 20 characters")
    .default("CARAT"),
  isActive: z.boolean().default(true),
});

export type CreateGemstoneInput = z.infer<typeof createGemstoneSchema>;
