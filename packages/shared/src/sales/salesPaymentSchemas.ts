import { z } from "zod";

/**
 * Valid tender payment methods (Entity 51 - FEAT-SALES-03).
 */
export const PaymentMethod = {
  CASH: "CASH",
  CREDIT_CARD: "CREDIT_CARD",
  DEBIT_CARD: "DEBIT_CARD",
  BANK_TRANSFER: "BANK_TRANSFER",
  CHEQUE: "CHEQUE",
  STORE_CREDIT: "STORE_CREDIT",
  GIFT_CARD: "GIFT_CARD",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * Status lifecycle of a payment transaction.
 */
export const PaymentStatus = {
  SUCCESS: "SUCCESS",
  PENDING: "PENDING",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/**
 * Zod schema for recording a tender payment against a sales invoice.
 */
export const recordSalesPaymentSchema = z.object({
  salesInvoiceId: z.string().uuid("Invalid sales invoice UUID format"),
  paymentMethod: z.nativeEnum(PaymentMethod),
  amountCad: z
    .number()
    .positive("Payment tender amount must be greater than zero"),
  referenceNumber: z
    .string()
    .trim()
    .max(100, "Reference number cannot exceed 100 characters")
    .optional()
    .nullable(),
  cardLast4: z
    .string()
    .trim()
    .length(4, "Card last 4 must be exactly 4 digits")
    .regex(/^\d{4}$/, "Card last 4 must contain digits only")
    .optional()
    .nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type RecordSalesPaymentInput = z.infer<typeof recordSalesPaymentSchema>;

/**
 * Query schema for searching and filtering payment records.
 */
export const listSalesPaymentsQuerySchema = z.object({
  salesInvoiceId: z.string().uuid().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListSalesPaymentsQuery = z.infer<
  typeof listSalesPaymentsQuerySchema
>;

/**
 * Representation of an individual payment record (Entity 51).
 */
export interface SalesPaymentRecord {
  id: string;
  organizationId: string;
  storeId: string;
  salesInvoiceId: string;
  receivedByUserId: string;
  paymentMethod: PaymentMethod;
  amountCad: number;
  currency: string;
  status: PaymentStatus;
  referenceNumber: string | null;
  cardLast4: string | null;
  notes: string | null;
  createdAt: Date;
  receivedByUserName?: string;
  invoiceNumber?: string;
}
