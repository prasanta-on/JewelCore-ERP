import { z } from "zod";

// -------------------------------------------------------------
// Inventory State Dimensions (Four-Tier Orthogonal Decoupling)
// -------------------------------------------------------------

export const QualityState = {
  QC_APPROVED: "QC_APPROVED",
  RE_INSPECTION: "RE_INSPECTION",
  QC_REJECTED: "QC_REJECTED",
} as const;

export type QualityState = (typeof QualityState)[keyof typeof QualityState];

export const ApprovalState = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type ApprovalState = (typeof ApprovalState)[keyof typeof ApprovalState];

export const CustodyState = {
  INTAKE_STAGING: "INTAKE_STAGING",
  IN_VAULT: "IN_VAULT",
  IN_TRANSIT: "IN_TRANSIT",
  IN_DISPLAY: "IN_DISPLAY",
  MISSING: "MISSING",
  RELEASED: "RELEASED",
} as const;

export type CustodyState = (typeof CustodyState)[keyof typeof CustodyState];

export const CommercialState = {
  UNREADY: "UNREADY",
  AVAILABLE_FOR_SALE: "AVAILABLE_FOR_SALE",
  RESERVED: "RESERVED",
  SOLD: "SOLD",
  ON_CONSIGNMENT: "ON_CONSIGNMENT",
} as const;

export type CommercialState =
  (typeof CommercialState)[keyof typeof CommercialState];

// -------------------------------------------------------------
// Serialized Piece Birth Schemas (FEAT-INV-01 / INV-14)
// -------------------------------------------------------------

export const birthInventoryItemSchema = z.object({
  qualityCheckItemId: z
    .string()
    .uuid("qualityCheckItemId must be a valid UUIDv7"),
  currentCompartmentId: z
    .string()
    .uuid("currentCompartmentId must be a valid UUIDv7")
    .optional()
    .nullable(),
  serialNumber: z
    .string()
    .min(1, "serialNumber must not be empty")
    .max(100, "serialNumber must not exceed 100 characters")
    .optional(),
  itemName: z
    .string()
    .min(1, "itemName must not be empty")
    .max(255, "itemName must not exceed 255 characters")
    .optional(),
  costPriceCad: z
    .number()
    .nonnegative("costPriceCad cannot be negative")
    .optional()
    .nullable(),
  sellingPriceCad: z
    .number()
    .nonnegative("sellingPriceCad cannot be negative")
    .optional()
    .nullable(),
});

export type BirthInventoryItemInput = z.infer<typeof birthInventoryItemSchema>;

export interface InventoryItemRecord {
  id: string;
  organizationId: string;
  storeId: string;
  productSkuId: string;
  qualityCheckItemId: string;
  serialNumber: string;
  itemName: string;
  grossWeightGrams: number;
  netWeightGrams: number;
  purityId: string;
  qualityState: QualityState;
  approvalState: ApprovalState;
  custodyState: CustodyState;
  commercialState: CommercialState;
  currentCompartmentId: string | null;
  costPriceCad: number | null;
  sellingPriceCad: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const listInventoryItemsQuerySchema = z.object({
  storeId: z.string().uuid("storeId must be a valid UUID").optional(),
  productSkuId: z.string().uuid("productSkuId must be a valid UUID").optional(),
  custodyState: z
    .enum([
      CustodyState.INTAKE_STAGING,
      CustodyState.IN_VAULT,
      CustodyState.IN_TRANSIT,
      CustodyState.IN_DISPLAY,
      CustodyState.MISSING,
      CustodyState.RELEASED,
    ])
    .optional(),
  commercialState: z
    .enum([
      CommercialState.UNREADY,
      CommercialState.AVAILABLE_FOR_SALE,
      CommercialState.RESERVED,
      CommercialState.SOLD,
      CommercialState.ON_CONSIGNMENT,
    ])
    .optional(),
  qualityState: z
    .enum([
      QualityState.QC_APPROVED,
      QualityState.RE_INSPECTION,
      QualityState.QC_REJECTED,
    ])
    .optional(),
  serialNumber: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type ListInventoryItemsQuery = z.infer<
  typeof listInventoryItemsQuerySchema
>;
