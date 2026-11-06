import { z } from "zod";

export const GrnStatusValues = ["DRAFT", "RECEIVED", "CLOSED"] as const;
export type GrnStatus = (typeof GrnStatusValues)[number];

export interface GoodsReceiptNote {
  id: string;
  organizationId: string;
  storeId: string;
  supplierId: string;
  grnNumber: string;
  status: GrnStatus;
  supplierInvoiceNumber: string | null;
  supplierInvoiceDate: Date | null;
  receivedDate: Date;
  createdByUserId: string;
  closedByUserId: string | null;
  closedAt: Date | null;
  remarks: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const createGrnSchema = z.object({
  organizationId: z.string().uuid("Organization ID must be a valid UUID"),
  storeId: z.string().uuid("Store ID must be a valid UUID"),
  supplierId: z.string().uuid("Supplier ID must be a valid UUID"),
  grnNumber: z
    .string()
    .trim()
    .min(1, "GRN number is required")
    .max(50, "GRN number must not exceed 50 characters")
    .regex(
      /^[A-Z0-9_-]+$/i,
      "GRN number must contain only alphanumeric characters, dashes, and underscores",
    )
    .optional(),
  supplierInvoiceNumber: z.string().trim().max(100).optional().nullable(),
  supplierInvoiceDate: z.coerce.date().optional().nullable(),
  receivedDate: z.coerce.date().default(() => new Date()),
  remarks: z.string().trim().max(1000).optional().nullable(),
});

export type CreateGrnInput = z.infer<typeof createGrnSchema>;

export const updateGrnSchema = z.object({
  supplierInvoiceNumber: z.string().trim().max(100).optional().nullable(),
  supplierInvoiceDate: z.coerce.date().optional().nullable(),
  remarks: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(GrnStatusValues).optional(),
});

export type UpdateGrnInput = z.infer<typeof updateGrnSchema>;

export const closeGrnSchema = z.object({
  remarks: z.string().trim().max(1000).optional().nullable(),
});

export type CloseGrnInput = z.infer<typeof closeGrnSchema>;
