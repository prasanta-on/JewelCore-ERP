import { z } from "zod";
import { ReturnReason, createSalesReturnItemSchema, type SalesReturnRecord } from "./salesReturnSchemas.js";
import { createGoldBuybackItemSchema, type GoldBuybackOrderRecord } from "./goldBuybackSchemas.js";
import { PaymentMethod } from "./salesPaymentSchemas.js";
import type { SalesInvoiceRecord } from "./salesInvoiceSchemas.js";

/**
 * Line item schema for new inventory items purchased in a POS exchange.
 */
export const posExchangeItemSchema = z.object({
  inventoryItemId: z.string().uuid("Invalid inventory item UUID format"),
  unitPriceCad: z.number().positive("Unit price must be positive"),
  discountAmountCad: z
    .number()
    .min(0, "Discount cannot be negative")
    .default(0),
  taxRate: z
    .number()
    .min(0, "Tax rate cannot be negative")
    .max(1, "Tax rate cannot exceed 100%")
    .default(0.13),
});

export type POSExchangeItemInput = z.infer<typeof posExchangeItemSchema>;

/**
 * Schema for returned pieces applied toward an exchange.
 */
export const posExchangeReturnSchema = z.object({
  salesInvoiceId: z.string().uuid("Invalid sales invoice UUID format"),
  returnReason: z.nativeEnum(ReturnReason).default(ReturnReason.CUSTOMER_CHANGED_MIND),
  items: z
    .array(createSalesReturnItemSchema)
    .min(1, "Must return at least one piece"),
});

export type POSExchangeReturnInput = z.infer<typeof posExchangeReturnSchema>;

/**
 * Schema for scrap gold pieces appraised as trade-in value.
 */
export const posExchangeBuybackSchema = z.object({
  items: z
    .array(createGoldBuybackItemSchema)
    .min(1, "Must provide at least one scrap piece"),
});

export type POSExchangeBuybackInput = z.infer<typeof posExchangeBuybackSchema>;

/**
 * Payment tender schema for settling remaining balance on an exchange.
 */
export const posExchangePaymentSchema = z.object({
  paymentMethod: z.nativeEnum(PaymentMethod),
  amountCad: z.number().positive("Payment amount must be positive"),
  referenceNumber: z.string().trim().max(100).optional().nullable(),
  cardLast4: z.string().regex(/^\d{4}$/, "Must be 4 digits").optional().nullable(),
});

export type POSExchangePaymentInput = z.infer<typeof posExchangePaymentSchema>;

/**
 * Comprehensive POS Exchange & Trade-In Orchestration Schema (FEAT-RET-04).
 */
export const posExchangeSchema = z.object({
  customerId: z.string().uuid("Invalid customer UUID format"),
  storeId: z.string().uuid("Invalid store UUID format"),
  notes: z.string().trim().max(1000).optional().nullable(),
  newItems: z
    .array(posExchangeItemSchema)
    .min(1, "Exchange must include at least one new piece to purchase"),
  returns: posExchangeReturnSchema.optional().nullable(),
  buybacks: posExchangeBuybackSchema.optional().nullable(),
  additionalPayments: z.array(posExchangePaymentSchema).optional().nullable(),
});

export type POSExchangeInput = z.infer<typeof posExchangeSchema>;

/**
 * Result returned upon successful POS exchange transaction execution.
 */
export interface POSExchangeResult {
  invoice: SalesInvoiceRecord;
  salesReturn?: SalesReturnRecord;
  goldBuybackOrder?: GoldBuybackOrderRecord;
  tradeInCreditGeneratedCad: number;
  storeCreditAppliedCad: number;
  customerStoreCreditBalanceCad: number;
  isFinalized: boolean;
  releasedPieceIds: string[];
}
