import { z } from "zod";

/**
 * Status lifecycle of a sales invoice (Entity 49 - FEAT-SALES-02).
 */
export const SalesInvoiceStatus = {
  DRAFT: "DRAFT",
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;

export type SalesInvoiceStatus =
  (typeof SalesInvoiceStatus)[keyof typeof SalesInvoiceStatus];

/**
 * Line item schema for invoice creation.
 */
export const createSalesInvoiceItemSchema = z.object({
  inventoryItemId: z.string().uuid("Invalid inventory item UUID format"),
  priceSnapshotId: z
    .string()
    .uuid("Invalid price snapshot UUID format")
    .optional()
    .nullable(),
  unitPriceCad: z
    .number()
    .nonnegative("Unit price must be non-negative"),
  discountAmountCad: z
    .number()
    .nonnegative("Discount amount must be non-negative")
    .default(0),
  taxRate: z
    .number()
    .min(0, "Tax rate cannot be negative")
    .max(1, "Tax rate cannot exceed 100%")
    .default(0.13), // 13% default Canadian HST
  notes: z.string().trim().max(500).optional().nullable(),
});

export type CreateSalesInvoiceItemInput = z.infer<
  typeof createSalesInvoiceItemSchema
>;

/**
 * Zod schema for generating a new sales invoice.
 */
export const createSalesInvoiceSchema = z.object({
  organizationId: z
    .string()
    .uuid("Invalid organization UUID format")
    .optional(),
  storeId: z.string().uuid("Invalid store UUID format"),
  customerId: z.string().uuid("Invalid customer UUID format"),
  invoiceNumber: z
    .string()
    .trim()
    .max(50, "Invoice number cannot exceed 50 characters")
    .regex(
      /^[A-Z0-9_-]+$/i,
      "Invoice number must contain only alphanumeric characters, dashes, and underscores",
    )
    .optional(),
  discountAmountCad: z
    .number()
    .nonnegative("Invoice discount amount must be non-negative")
    .default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(createSalesInvoiceItemSchema)
    .min(1, "Invoice must contain at least one line item"),
});

export type CreateSalesInvoiceInput = z.infer<typeof createSalesInvoiceSchema>;

/**
 * Query schema for searching and filtering sales invoices.
 */
export const listSalesInvoicesQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(SalesInvoiceStatus).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListSalesInvoicesQuery = z.infer<
  typeof listSalesInvoicesQuerySchema
>;

/**
 * Representation of an individual invoice line item (Entity 50).
 */
export interface SalesInvoiceItemRecord {
  id: string;
  organizationId: string;
  salesInvoiceId: string;
  inventoryItemId: string;
  priceSnapshotId: string | null;
  unitPriceCad: number;
  discountAmountCad: number;
  finalPriceCad: number;
  taxRate: number;
  taxAmountCad: number;
  lineTotalCad: number;
  notes: string | null;
  createdAt: Date;
  itemSerialNumber?: string;
  itemName?: string;
}

/**
 * Representation of a sales invoice record (Entity 49).
 */
export interface SalesInvoiceRecord {
  id: string;
  organizationId: string;
  storeId: string;
  customerId: string;
  createdByUserId: string;
  invoiceNumber: string;
  status: SalesInvoiceStatus;
  currency: string;
  subtotalCad: number;
  taxAmountCad: number;
  discountAmountCad: number;
  totalAmountCad: number;
  paidAmountCad: number;
  balanceDueCad: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: SalesInvoiceItemRecord[];
  customerName?: string;
  storeName?: string;
}
