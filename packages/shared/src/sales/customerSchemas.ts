import { z } from "zod";

/**
 * Lifecycle status of a customer record (Entity 48 - FEAT-SALES-01).
 */
export const CustomerStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

export type CustomerStatus =
  (typeof CustomerStatus)[keyof typeof CustomerStatus];

/**
 * Zod schema for creating a new customer profile.
 */
export const createCustomerSchema = z.object({
  organizationId: z
    .string()
    .uuid("Invalid organization UUID format")
    .optional(),
  customerCode: z
    .string()
    .trim()
    .min(1, "Customer code is required")
    .max(50, "Customer code cannot exceed 50 characters")
    .regex(
      /^[A-Z0-9_-]+$/i,
      "Customer code must contain only alphanumeric characters, underscores, and dashes",
    ),
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100, "First name cannot exceed 100 characters"),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(100, "Last name cannot exceed 100 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email address format")
    .max(150, "Email cannot exceed 150 characters")
    .optional()
    .nullable(),
  phone: z
    .string()
    .trim()
    .max(50, "Phone number cannot exceed 50 characters")
    .optional()
    .nullable(),
  addressLine1: z
    .string()
    .trim()
    .max(255, "Address cannot exceed 255 characters")
    .optional()
    .nullable(),
  addressLine2: z
    .string()
    .trim()
    .max(255, "Address line 2 cannot exceed 255 characters")
    .optional()
    .nullable(),
  city: z
    .string()
    .trim()
    .max(100, "City cannot exceed 100 characters")
    .optional()
    .nullable(),
  stateProvince: z
    .string()
    .trim()
    .max(50, "State/Province cannot exceed 50 characters")
    .optional()
    .nullable(),
  postalCode: z
    .string()
    .trim()
    .max(30, "Postal code cannot exceed 30 characters")
    .optional()
    .nullable(),
  country: z
    .string()
    .trim()
    .min(2, "Country code must be at least 2 characters")
    .max(10, "Country code cannot exceed 10 characters")
    .default("CA"),
  taxIdentifier: z
    .string()
    .trim()
    .max(50, "Tax identifier cannot exceed 50 characters")
    .optional()
    .nullable(),
  tags: z.array(z.string().trim().max(50)).default([]),
  notes: z.string().trim().max(1000).optional().nullable(),
  status: z.nativeEnum(CustomerStatus).default(CustomerStatus.ACTIVE),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/**
 * Zod schema for updating an existing customer profile.
 */
export const updateCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(150).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  addressLine1: z.string().trim().max(255).optional().nullable(),
  addressLine2: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  stateProvince: z.string().trim().max(50).optional().nullable(),
  postalCode: z.string().trim().max(30).optional().nullable(),
  country: z.string().trim().min(2).max(10).optional(),
  taxIdentifier: z.string().trim().max(50).optional().nullable(),
  tags: z.array(z.string().trim().max(50)).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  status: z.nativeEnum(CustomerStatus).optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/**
 * In-memory representation of a Customer record (Entity 48).
 */
export interface CustomerRecord {
  id: string;
  organizationId: string;
  customerCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string;
  taxIdentifier: string | null;
  tags: string[];
  notes: string | null;
  status: CustomerStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for querying customer profiles with pagination and search.
 */
export const listCustomersQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  tag: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
