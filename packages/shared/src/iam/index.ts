import { z } from "zod";

/**
 * Physical and operational store types supported in JewelCore ERP
 */
export const StoreType = {
  HEAD_OFFICE: "HEAD_OFFICE",
  RETAIL_STORE: "RETAIL_STORE",
  SHOWROOM: "SHOWROOM",
  CENTRAL_WAREHOUSE: "CENTRAL_WAREHOUSE",
  VAULT_FACILITY: "VAULT_FACILITY",
  VAULT_HUB: "VAULT_HUB",
  WORKSHOP: "WORKSHOP",
  REGIONAL_OFFICE: "REGIONAL_OFFICE",
} as const;

export type StoreType = (typeof StoreType)[keyof typeof StoreType];

export interface Organization {
  id: string;
  code: string;
  name: string;
  currency: string;
  taxIdentifier: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Store {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  storeType: StoreType;
  addressJson: Record<string, unknown>;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const createOrganizationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Organization code is required")
    .max(50, "Organization code must not exceed 50 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Organization code must contain only letters, numbers, hyphens, and underscores"),
  name: z
    .string()
    .trim()
    .min(1, "Organization name is required")
    .max(255, "Organization name must not exceed 255 characters"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, "Currency must be a 3-letter ISO code")
    .default("CAD"),
  taxIdentifier: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const createStoreSchema = z.object({
  organizationId: z.string().uuid("Organization ID must be a valid UUID"),
  code: z
    .string()
    .trim()
    .min(1, "Store code is required")
    .max(50, "Store code must not exceed 50 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Store code must contain only letters, numbers, hyphens, and underscores"),
  name: z
    .string()
    .trim()
    .min(1, "Store name is required")
    .max(255, "Store name must not exceed 255 characters"),
  storeType: z.nativeEnum(StoreType, {
    errorMap: () => ({ message: "Invalid store type" }),
  }),
  addressJson: z.record(z.unknown()).optional().default({}),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().email("Invalid store email address").optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export interface User {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserPublic = Omit<User, "passwordHash">;

export const registerUserSchema = z.object({
  organizationId: z.string().uuid("Organization ID must be a valid UUID"),
  email: z.string().trim().toLowerCase().email("Must be a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  phone: z.string().trim().max(50).optional().nullable(),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserPublic;
}

