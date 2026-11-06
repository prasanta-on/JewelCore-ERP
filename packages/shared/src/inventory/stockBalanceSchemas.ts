import { z } from "zod";

/**
 * Zod schema for creating or upserting a bulk quantity-batch stock balance (Entity 29 - FEAT-INV-02 / BIZ-Q02).
 */
export const createStockBalanceSchema = z
  .object({
    storeId: z.string().uuid("Invalid store UUID format").optional(),
    productSkuId: z.string().uuid("Invalid product SKU UUID format"),
    compartmentId: z.string().uuid("Invalid compartment UUID format"),
    quantityOnHand: z
      .number()
      .int("Quantity on hand must be an integer")
      .min(0, "Quantity on hand must be non-negative"),
    quantityReserved: z
      .number()
      .int("Quantity reserved must be an integer")
      .min(0, "Quantity reserved must be non-negative")
      .default(0),
    totalWeightGrams: z
      .number()
      .min(0, "Total weight must be non-negative")
      .default(0),
    averageCostUnitCad: z
      .number()
      .min(0, "Average cost must be non-negative")
      .optional()
      .nullable(),
  })
  .refine((data) => data.quantityOnHand >= data.quantityReserved, {
    message:
      "Quantity on hand must be greater than or equal to quantity reserved",
    path: ["quantityReserved"],
  });

export type CreateStockBalanceInput = z.infer<typeof createStockBalanceSchema>;

/**
 * Zod schema for updating a stock balance by ID with optional OCC check.
 */
export const updateStockBalanceSchema = z
  .object({
    quantityOnHand: z
      .number()
      .int("Quantity on hand must be an integer")
      .min(0, "Quantity on hand must be non-negative")
      .optional(),
    quantityReserved: z
      .number()
      .int("Quantity reserved must be an integer")
      .min(0, "Quantity reserved must be non-negative")
      .optional(),
    totalWeightGrams: z
      .number()
      .min(0, "Total weight must be non-negative")
      .optional(),
    averageCostUnitCad: z
      .number()
      .min(0, "Average cost must be non-negative")
      .optional()
      .nullable(),
    expectedVersion: z
      .number()
      .int("Expected version must be an integer")
      .min(1, "Expected version must be >= 1")
      .optional(),
  })
  .refine(
    (data) => {
      if (
        data.quantityOnHand !== undefined &&
        data.quantityReserved !== undefined
      ) {
        return data.quantityOnHand >= data.quantityReserved;
      }
      return true;
    },
    {
      message:
        "Quantity on hand must be greater than or equal to quantity reserved",
      path: ["quantityReserved"],
    },
  );

export type UpdateStockBalanceInput = z.infer<typeof updateStockBalanceSchema>;

/**
 * Zod schema for delta-based stock balance adjustment.
 */
export const adjustStockBalanceSchema = z.object({
  deltaOnHand: z.number().int("Delta on hand must be an integer").default(0),
  deltaReserved: z.number().int("Delta reserved must be an integer").default(0),
  totalWeightGrams: z
    .number()
    .min(0, "Total weight must be non-negative")
    .optional(),
  expectedVersion: z
    .number()
    .int("Expected version must be an integer")
    .min(1, "Expected version must be >= 1")
    .optional(),
});

export type AdjustStockBalanceInput = z.infer<typeof adjustStockBalanceSchema>;

/**
 * Zod schema for querying / listing stock balances.
 */
export const listStockBalancesQuerySchema = z.object({
  storeId: z.string().uuid("Invalid store UUID format").optional(),
  productSkuId: z.string().uuid("Invalid product SKU UUID format").optional(),
  compartmentId: z.string().uuid("Invalid compartment UUID format").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListStockBalancesQuery = z.infer<
  typeof listStockBalancesQuerySchema
>;

/**
 * In-memory representation of an inventory stock balance record (Entity 29).
 */
export interface StockBalanceRecord {
  id: string;
  organizationId: string;
  storeId: string;
  productSkuId: string;
  compartmentId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  totalWeightGrams: number;
  averageCostUnitCad: number | null;
  lastMovementAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
