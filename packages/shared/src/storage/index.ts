import { z } from "zod";

/**
 * Vault types supported in JewelCore ERP
 */
export const VaultType = {
  MAIN_VAULT: "MAIN_VAULT",
  SHOWROOM_SAFE: "SHOWROOM_SAFE",
  INTAKE_HOLDING: "INTAKE_HOLDING",
} as const;

export type VaultType = (typeof VaultType)[keyof typeof VaultType];

export interface Vault {
  id: string;
  storeId: string;
  code: string;
  name: string;
  vaultType: VaultType;
  accessLevelRequired: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Locker {
  id: string;
  vaultId: string;
  storeId: string;
  code: string;
  name: string;
  lockerNumber: string;
  capacityRating: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Compartment {
  id: string;
  lockerId: string;
  storeId: string;
  code: string;
  name: string;
  compartmentNumber: string;
  maxWeightCapacityGrams: number | null;
  maxItemCapacity: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LockerHierarchy extends Locker {
  compartments: Compartment[];
}

export interface VaultHierarchy extends Vault {
  lockers: LockerHierarchy[];
}

export const createVaultSchema = z.object({
  storeId: z.string().uuid("Store ID must be a valid UUID"),
  code: z
    .string()
    .trim()
    .min(1, "Vault code is required")
    .max(50, "Vault code must not exceed 50 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Vault code must contain only letters, numbers, hyphens, and underscores"),
  name: z
    .string()
    .trim()
    .min(1, "Vault name is required")
    .max(100, "Vault name must not exceed 100 characters"),
  vaultType: z.nativeEnum(VaultType).default(VaultType.MAIN_VAULT),
  accessLevelRequired: z.string().trim().max(50).default("STORE_MANAGER"),
  isActive: z.boolean().default(true),
});

export type CreateVaultInput = z.infer<typeof createVaultSchema>;

export const createLockerSchema = z.object({
  vaultId: z.string().uuid("Vault ID must be a valid UUID"),
  storeId: z.string().uuid("Store ID must be a valid UUID"),
  code: z
    .string()
    .trim()
    .min(1, "Locker code is required")
    .max(50, "Locker code must not exceed 50 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Locker code must contain only letters, numbers, hyphens, and underscores"),
  name: z
    .string()
    .trim()
    .min(1, "Locker name is required")
    .max(100, "Locker name must not exceed 100 characters"),
  lockerNumber: z
    .string()
    .trim()
    .min(1, "Locker number is required")
    .max(50, "Locker number must not exceed 50 characters"),
  capacityRating: z.string().trim().max(50).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateLockerInput = z.infer<typeof createLockerSchema>;

export const createCompartmentSchema = z.object({
  lockerId: z.string().uuid("Locker ID must be a valid UUID"),
  storeId: z.string().uuid("Store ID must be a valid UUID"),
  code: z
    .string()
    .trim()
    .min(1, "Compartment code is required")
    .max(50, "Compartment code must not exceed 50 characters")
    .regex(/^[A-Z0-9_-]+$/i, "Compartment code must contain only letters, numbers, hyphens, and underscores"),
  name: z
    .string()
    .trim()
    .min(1, "Compartment name is required")
    .max(100, "Compartment name must not exceed 100 characters"),
  compartmentNumber: z
    .string()
    .trim()
    .min(1, "Compartment number is required")
    .max(50, "Compartment number must not exceed 50 characters"),
  maxWeightCapacityGrams: z.number().positive().optional().nullable(),
  maxItemCapacity: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateCompartmentInput = z.infer<typeof createCompartmentSchema>;
