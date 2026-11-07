import { z } from "zod";

/**
 * Status lifecycle of an old gold / scrap buyback order (Entity 54 - FEAT-RET-02).
 */
export const BuybackStatus = {
  APPRAISED: "APPRAISED",
  ACCEPTED: "ACCEPTED",
  SETTLED: "SETTLED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export type BuybackStatus = (typeof BuybackStatus)[keyof typeof BuybackStatus];

/**
 * Method used to settle payout to the customer for bought-back gold.
 */
export const BuybackPayoutMethod = {
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
  STORE_CREDIT: "STORE_CREDIT",
  TRADE_IN_EXCHANGE: "TRADE_IN_EXCHANGE",
} as const;

export type BuybackPayoutMethod =
  (typeof BuybackPayoutMethod)[keyof typeof BuybackPayoutMethod];

/**
 * Categorization of old gold and scrap metal items evaluated.
 */
export const BuybackItemType = {
  SCRAP_JEWELLERY: "SCRAP_JEWELLERY",
  OLD_GOLD_BAR: "OLD_GOLD_BAR",
  COIN: "COIN",
  DENTAL_GOLD: "DENTAL_GOLD",
  WATCH_CASE: "WATCH_CASE",
  OTHER: "OTHER",
} as const;

export type BuybackItemType =
  (typeof BuybackItemType)[keyof typeof BuybackItemType];

/**
 * Line item schema for evaluating an old gold piece.
 */
export const createGoldBuybackItemSchema = z
  .object({
    itemType: z.nativeEnum(BuybackItemType),
    description: z
      .string()
      .trim()
      .min(2, "Description must be at least 2 characters")
      .max(255),
    purityId: z.string().uuid("Invalid purity UUID format"),
    grossWeightGrams: z
      .number()
      .positive("Gross weight must be strictly positive"),
    netWeightGrams: z.number().positive("Net weight must be strictly positive"),
    smeltingFeeCad: z
      .number()
      .min(0, "Smelting fee cannot be negative")
      .default(0),
    targetCompartmentId: z
      .string()
      .uuid("Invalid target compartment UUID format")
      .optional()
      .nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (data) => data.grossWeightGrams >= data.netWeightGrams,
    {
      message: "Gross weight cannot be less than net weight",
      path: ["grossWeightGrams"],
    },
  );

export type CreateGoldBuybackItemInput = z.infer<
  typeof createGoldBuybackItemSchema
>;

/**
 * Schema for creating and appraising an old gold buyback order.
 */
export const createGoldBuybackOrderSchema = z.object({
  customerId: z.string().uuid("Invalid customer UUID format"),
  storeId: z.string().uuid("Invalid store UUID format"),
  orderNumber: z
    .string()
    .trim()
    .max(50)
    .regex(/^[A-Z0-9_-]+$/i, "Order number must be alphanumeric")
    .optional(),
  payoutMethod: z.nativeEnum(BuybackPayoutMethod),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(createGoldBuybackItemSchema)
    .min(1, "Buyback order must contain at least one item"),
});

export type CreateGoldBuybackOrderInput = z.infer<
  typeof createGoldBuybackOrderSchema
>;

/**
 * Schema for finalizing settlement and payout of a buyback order.
 */
export const settleGoldBuybackOrderSchema = z.object({
  payoutMethod: z.nativeEnum(BuybackPayoutMethod).optional(),
  payoutReference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type SettleGoldBuybackOrderInput = z.infer<
  typeof settleGoldBuybackOrderSchema
>;

/**
 * Query schema for listing buyback orders.
 */
export const listGoldBuybackOrdersQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(BuybackStatus).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListGoldBuybackOrdersQuery = z.infer<
  typeof listGoldBuybackOrdersQuerySchema
>;

/**
 * Buyback item line record (Entity 55).
 */
export interface GoldBuybackItemRecord {
  id: string;
  organizationId: string;
  goldBuybackOrderId: string;
  itemType: BuybackItemType;
  description: string;
  purityId: string;
  purityCode?: string;
  purityPercentage: number;
  grossWeightGrams: number;
  netWeightGrams: number;
  marketRatePerGramCad: number;
  meltValueCad: number;
  smeltingFeeCad: number;
  netPayoutCad: number;
  targetCompartmentId: string | null;
  notes: string | null;
  createdAt: Date;
}

/**
 * Buyback order header record (Entity 54).
 */
export interface GoldBuybackOrderRecord {
  id: string;
  organizationId: string;
  storeId: string;
  customerId: string;
  createdByUserId: string;
  settledByUserId: string | null;
  orderNumber: string;
  status: BuybackStatus;
  payoutMethod: BuybackPayoutMethod;
  totalGrossWeightGrams: number;
  totalNetWeightGrams: number;
  totalMeltValueCad: number;
  totalSmeltingFeeCad: number;
  netPayoutAmountCad: number;
  payoutReference: string | null;
  notes: string | null;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customerName?: string;
  storeName?: string;
  items?: GoldBuybackItemRecord[];
}
