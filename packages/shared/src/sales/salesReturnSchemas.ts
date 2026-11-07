import { z } from "zod";

/**
 * Return reason codes (Entity 52 - FEAT-RET-01).
 */
export const ReturnReason = {
  CUSTOMER_CHANGED_MIND: "CUSTOMER_CHANGED_MIND",
  DEFECTIVE: "DEFECTIVE",
  INCORRECT_SIZE: "INCORRECT_SIZE",
  UNWANTED_GIFT: "UNWANTED_GIFT",
  OTHER: "OTHER",
} as const;

export type ReturnReason = (typeof ReturnReason)[keyof typeof ReturnReason];

/**
 * Physical condition of returned jewellery piece upon inspection.
 */
export const ReturnCondition = {
  NEW_CONDITION: "NEW_CONDITION",
  MINOR_WEAR: "MINOR_WEAR",
  DAMAGED: "DAMAGED",
} as const;

export type ReturnCondition =
  (typeof ReturnCondition)[keyof typeof ReturnCondition];

/**
 * Operational disposition for returned jewellery piece.
 */
export const ReturnDisposition = {
  RESTOCK_AS_NEW: "RESTOCK_AS_NEW",
  SEND_TO_REPAIR: "SEND_TO_REPAIR",
  SEND_TO_MELT: "SEND_TO_MELT",
} as const;

export type ReturnDisposition =
  (typeof ReturnDisposition)[keyof typeof ReturnDisposition];

/**
 * Settlement method for returning customer funds.
 */
export const RefundMethod = {
  STORE_CREDIT: "STORE_CREDIT",
  ORIGINAL_PAYMENT_METHOD: "ORIGINAL_PAYMENT_METHOD",
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
} as const;

export type RefundMethod = (typeof RefundMethod)[keyof typeof RefundMethod];

/**
 * Status lifecycle of a sales return.
 */
export const SalesReturnStatus = {
  PENDING_INSPECTION: "PENDING_INSPECTION",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
} as const;

export type SalesReturnStatus =
  (typeof SalesReturnStatus)[keyof typeof SalesReturnStatus];

/**
 * Line item schema for returning a sold piece.
 */
export const createSalesReturnItemSchema = z.object({
  salesInvoiceItemId: z.string().uuid("Invalid invoice item UUID format"),
  condition: z.nativeEnum(ReturnCondition),
  disposition: z.nativeEnum(ReturnDisposition),
  targetCompartmentId: z
    .string()
    .uuid("Invalid target compartment UUID format")
    .optional()
    .nullable(),
  restockingFeeCad: z
    .number()
    .min(0, "Restocking fee cannot be negative")
    .default(0),
  inspectionNotes: z.string().trim().max(500).optional().nullable(),
});

export type CreateSalesReturnItemInput = z.infer<
  typeof createSalesReturnItemSchema
>;

/**
 * Schema for initiating and processing a sales return.
 */
export const createSalesReturnSchema = z.object({
  salesInvoiceId: z.string().uuid("Invalid sales invoice UUID format"),
  storeId: z.string().uuid("Invalid store UUID format"),
  returnNumber: z
    .string()
    .trim()
    .max(50)
    .regex(/^[A-Z0-9_-]+$/i, "Return number must be alphanumeric")
    .optional(),
  returnReason: z.nativeEnum(ReturnReason),
  refundMethod: z.nativeEnum(RefundMethod),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(createSalesReturnItemSchema)
    .min(1, "Return must contain at least one piece"),
});

export type CreateSalesReturnInput = z.infer<typeof createSalesReturnSchema>;

/**
 * Query schema for listing customer returns.
 */
export const listSalesReturnsQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  salesInvoiceId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(SalesReturnStatus).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListSalesReturnsQuery = z.infer<typeof listSalesReturnsQuerySchema>;

/**
 * Representation of an individual return line item (Entity 53).
 */
export interface SalesReturnItemRecord {
  id: string;
  organizationId: string;
  salesReturnId: string;
  salesInvoiceItemId: string;
  inventoryItemId: string;
  condition: ReturnCondition;
  disposition: ReturnDisposition;
  targetCompartmentId: string | null;
  refundAmountCad: number;
  restockingFeeCad: number;
  netRefundAmountCad: number;
  inspectionNotes: string | null;
  createdAt: Date;
  itemSerialNumber?: string;
  itemName?: string;
}

/**
 * Representation of a sales return header record (Entity 52).
 */
export interface SalesReturnRecord {
  id: string;
  organizationId: string;
  storeId: string;
  salesInvoiceId: string;
  customerId: string;
  processedByUserId: string;
  returnNumber: string;
  returnReason: ReturnReason;
  status: SalesReturnStatus;
  refundMethod: RefundMethod;
  totalRefundAmountCad: number;
  restockingFeeCad: number;
  netRefundAmountCad: number;
  notes: string | null;
  createdAt: Date;
  items?: SalesReturnItemRecord[];
  customerName?: string;
  storeName?: string;
  invoiceNumber?: string;
}
