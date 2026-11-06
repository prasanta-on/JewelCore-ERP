import { z } from "zod";

export interface Supplier {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  taxIdentifier: string | null;
  currencyCode: string;
  paymentTerms: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const createSupplierSchema = z.object({
  organizationId: z.string().uuid("Organization ID must be a valid UUID"),
  code: z
    .string()
    .trim()
    .min(1, "Supplier code is required")
    .max(50, "Supplier code must not exceed 50 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Supplier code must contain only alphanumeric characters, dashes, and underscores"),
  name: z
    .string()
    .trim()
    .min(1, "Supplier name is required")
    .max(150, "Supplier name must not exceed 150 characters"),
  contactName: z.string().trim().max(100).optional().nullable(),
  email: z.string().trim().email("Invalid email address").max(150).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  taxIdentifier: z.string().trim().max(50).optional().nullable(),
  currencyCode: z.string().trim().min(3, "Currency code must be at least 3 characters").max(10).default("CAD"),
  paymentTerms: z.string().trim().max(50).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  contactName: z.string().trim().max(100).optional().nullable(),
  email: z.string().trim().email("Invalid email address").max(150).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  taxIdentifier: z.string().trim().max(50).optional().nullable(),
  currencyCode: z.string().trim().min(3).max(10).optional(),
  paymentTerms: z.string().trim().max(50).optional().nullable(),
  isActive: z.boolean().optional(),
});

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
