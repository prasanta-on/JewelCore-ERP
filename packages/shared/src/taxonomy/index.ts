import { z } from "zod";

export interface Category {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryWithSubcategories extends Category {
  subcategories: Subcategory[];
}

export const createCategorySchema = z.object({
  organizationId: z.string().uuid("Organization ID must be a valid UUID"),
  code: z
    .string()
    .trim()
    .min(1, "Category code is required")
    .max(50, "Category code must not exceed 50 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Category code must contain only letters, numbers, hyphens, and underscores"),
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(100, "Category name must not exceed 100 characters"),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const createSubcategorySchema = z.object({
  categoryId: z.string().uuid("Category ID must be a valid UUID"),
  code: z
    .string()
    .trim()
    .min(1, "Subcategory code is required")
    .max(50, "Subcategory code must not exceed 50 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Subcategory code must contain only letters, numbers, hyphens, and underscores"),
  name: z
    .string()
    .trim()
    .min(1, "Subcategory name is required")
    .max(100, "Subcategory name must not exceed 100 characters"),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateSubcategoryInput = z.infer<typeof createSubcategorySchema>;

export * from "./materialSchemas.js";
