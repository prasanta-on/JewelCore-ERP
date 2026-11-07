import { z } from "zod";

/**
 * Types of store credit ledger transactions (Entity 57 - FEAT-RET-03 / INV-09).
 */
export const StoreCreditTransactionType = {
  ISSUE_REFUND: "ISSUE_REFUND",
  ISSUE_BUYBACK: "ISSUE_BUYBACK",
  ISSUE_PROMOTION: "ISSUE_PROMOTION",
  REDEEM_PURCHASE: "REDEEM_PURCHASE",
  MANUAL_ADJUSTMENT: "MANUAL_ADJUSTMENT",
  EXPIRE_CREDIT: "EXPIRE_CREDIT",
} as const;

export type StoreCreditTransactionType =
  (typeof StoreCreditTransactionType)[keyof typeof StoreCreditTransactionType];

/**
 * Schema for issuing or manually adjusting customer store credit.
 */
export const adjustStoreCreditSchema = z.object({
  customerId: z.string().uuid("Invalid customer UUID format"),
  storeId: z.string().uuid("Invalid store UUID format"),
  transactionType: z.nativeEnum(StoreCreditTransactionType),
  amountCad: z.number().positive("Adjustment amount must be positive"),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type AdjustStoreCreditInput = z.infer<typeof adjustStoreCreditSchema>;

/**
 * Schema for redeeming store credit tender against a sales invoice.
 */
export const redeemStoreCreditSchema = z.object({
  customerId: z.string().uuid("Invalid customer UUID format"),
  storeId: z.string().uuid("Invalid store UUID format"),
  amountCad: z.number().positive("Redemption amount must be positive"),
  salesInvoiceId: z
    .string()
    .uuid("Invalid sales invoice UUID format")
    .optional()
    .nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type RedeemStoreCreditInput = z.infer<typeof redeemStoreCreditSchema>;

/**
 * Query schema for listing store credit transactions for an account.
 */
export const listStoreCreditTransactionsQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  transactionType: z.nativeEnum(StoreCreditTransactionType).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListStoreCreditTransactionsQuery = z.infer<
  typeof listStoreCreditTransactionsQuerySchema
>;

/**
 * Store credit ledger transaction representation (Entity 57 / INV-09).
 */
export interface StoreCreditTransactionRecord {
  id: string;
  organizationId: string;
  storeCreditAccountId: string;
  storeId: string;
  transactionType: StoreCreditTransactionType;
  amountCad: number;
  balanceBeforeCad: number;
  balanceAfterCad: number;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  performedByUserId: string;
  notes: string | null;
  createdAt: Date;
  storeName?: string;
  performerName?: string;
}

/**
 * Store credit account header representation (Entity 56).
 */
export interface StoreCreditAccountRecord {
  id: string;
  organizationId: string;
  customerId: string;
  accountNumber: string;
  currency: string;
  balanceCad: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  customerName?: string;
  recentTransactions?: StoreCreditTransactionRecord[];
}
