import { z } from "zod";

export const ShipmentStatusValues = [
  "PENDING",
  "RECEIVED",
  "RECONCILED",
] as const;
export type ShipmentStatus = (typeof ShipmentStatusValues)[number];

export const ShipmentReconciliationStatusValues = [
  "PENDING",
  "MATCHED",
  "DISCREPANCY",
  "REJECTED",
] as const;
export type ShipmentReconciliationStatus =
  (typeof ShipmentReconciliationStatusValues)[number];

export interface Shipment {
  id: string;
  goodsReceiptNoteId: string;
  shipmentNumber: string;
  carrierName: string | null;
  trackingNumber: string | null;
  declaredPackageCount: number;
  receivedPackageCount: number;
  grossPackageWeightGrams: number | null;
  status: ShipmentStatus;
  receivedAt: Date;
  receivedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentItem {
  id: string;
  shipmentId: string;
  productSkuId: string;
  lineNumber: number;
  supplierItemCode: string | null;
  declaredPieceCount: number;
  receivedPieceCount: number;
  declaredGrossWeightGrams: number | null;
  measuredGrossWeightGrams: number | null;
  declaredNetWeightGrams: number | null;
  unitLabourMakingCost: number | null;
  lineTotalSettlement: number | null;
  reconciliationStatus: ShipmentReconciliationStatus;
  discrepancyReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentWithItems extends Shipment {
  items: ShipmentItem[];
}

export const createShipmentItemInputSchema = z.object({
  productSkuId: z.string().uuid("Product SKU ID must be a valid UUID"),
  lineNumber: z
    .number()
    .int()
    .positive("Line number must be a positive integer"),
  supplierItemCode: z.string().trim().max(100).optional().nullable(),
  declaredPieceCount: z
    .number()
    .int()
    .nonnegative("Declared piece count must be non-negative"),
  receivedPieceCount: z
    .number()
    .int()
    .nonnegative("Received piece count must be non-negative")
    .default(0),
  declaredGrossWeightGrams: z
    .number()
    .positive("Declared gross weight must be positive")
    .optional()
    .nullable(),
  measuredGrossWeightGrams: z
    .number()
    .positive("Measured gross weight must be positive")
    .optional()
    .nullable(),
  declaredNetWeightGrams: z
    .number()
    .positive("Declared net weight must be positive")
    .optional()
    .nullable(),
  unitLabourMakingCost: z
    .number()
    .nonnegative("Unit labour making cost must be non-negative")
    .optional()
    .nullable(),
  lineTotalSettlement: z
    .number()
    .nonnegative("Line total settlement must be non-negative")
    .optional()
    .nullable(),
  reconciliationStatus: z
    .enum(ShipmentReconciliationStatusValues)
    .default("PENDING"),
  discrepancyReason: z.string().trim().max(1000).optional().nullable(),
});

export type CreateShipmentItemInput = z.infer<
  typeof createShipmentItemInputSchema
>;

export const createShipmentSchema = z.object({
  goodsReceiptNoteId: z
    .string()
    .uuid("Goods Receipt Note ID must be a valid UUID"),
  shipmentNumber: z
    .string()
    .trim()
    .min(1, "Shipment number is required")
    .max(50, "Shipment number must not exceed 50 characters")
    .regex(
      /^[A-Z0-9_-]+$/i,
      "Shipment number must contain only alphanumeric characters, dashes, and underscores",
    ),
  carrierName: z.string().trim().max(100).optional().nullable(),
  trackingNumber: z.string().trim().max(100).optional().nullable(),
  declaredPackageCount: z
    .number()
    .int()
    .nonnegative("Declared package count must be non-negative")
    .default(1),
  receivedPackageCount: z
    .number()
    .int()
    .nonnegative("Received package count must be non-negative")
    .default(1),
  grossPackageWeightGrams: z
    .number()
    .positive("Gross package weight must be positive")
    .optional()
    .nullable(),
  status: z.enum(ShipmentStatusValues).default("PENDING"),
  receivedAt: z.coerce.date().default(() => new Date()),
  items: z.array(createShipmentItemInputSchema).optional().default([]),
});

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

export const updateShipmentSchema = z.object({
  carrierName: z.string().trim().max(100).optional().nullable(),
  trackingNumber: z.string().trim().max(100).optional().nullable(),
  declaredPackageCount: z
    .number()
    .int()
    .nonnegative("Declared package count must be non-negative")
    .optional(),
  receivedPackageCount: z
    .number()
    .int()
    .nonnegative("Received package count must be non-negative")
    .optional(),
  grossPackageWeightGrams: z
    .number()
    .positive("Gross package weight must be positive")
    .optional()
    .nullable(),
  status: z.enum(ShipmentStatusValues).optional(),
});

export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;

export const updateShipmentItemSchema = z.object({
  receivedPieceCount: z
    .number()
    .int()
    .nonnegative("Received piece count must be non-negative")
    .optional(),
  measuredGrossWeightGrams: z
    .number()
    .positive("Measured gross weight must be positive")
    .optional()
    .nullable(),
  reconciliationStatus: z.enum(ShipmentReconciliationStatusValues).optional(),
  discrepancyReason: z.string().trim().max(1000).optional().nullable(),
  unitLabourMakingCost: z
    .number()
    .nonnegative("Unit labour making cost must be non-negative")
    .optional()
    .nullable(),
  lineTotalSettlement: z
    .number()
    .nonnegative("Line total settlement must be non-negative")
    .optional()
    .nullable(),
});

export type UpdateShipmentItemInput = z.infer<typeof updateShipmentItemSchema>;
