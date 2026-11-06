import { z } from "zod";

/**
 * Managerial Stock Approval Statuses (Entity 39 - FEAT-GOV-01).
 */
export const StockApprovalStatus = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type StockApprovalStatus =
  (typeof StockApprovalStatus)[keyof typeof StockApprovalStatus];

/**
 * Zod schema for managerial stock approval authorization (FEAT-GOV-01 / INV-01).
 */
export const createStockApprovalSchema = z.object({
  organizationId: z
    .string()
    .uuid("organizationId must be a valid UUID")
    .optional(),
  storeId: z.string().uuid("storeId must be a valid UUID").optional(),
  inventoryItemId: z.string().uuid("inventoryItemId must be a valid UUID"),
  approvalStatus: z.nativeEnum(StockApprovalStatus),
  approvalNotes: z
    .string()
    .max(1000, "Approval notes must not exceed 1000 characters")
    .optional()
    .nullable(),
  rejectionReasonCode: z
    .string()
    .max(50, "Rejection reason code must not exceed 50 characters")
    .optional()
    .nullable(),
});

export type CreateStockApprovalInput = z.infer<
  typeof createStockApprovalSchema
>;

/**
 * In-memory representation of a stock approval record (Entity 39).
 */
export interface StockApprovalRecord {
  id: string;
  organizationId: string;
  storeId: string;
  inventoryItemId: string;
  approverUserId: string;
  approvalStatus: StockApprovalStatus;
  approvalNotes: string | null;
  rejectionReasonCode: string | null;
  approvedAt: Date;
  createdAt: Date;
}

/**
 * Zod schema for querying stock approvals with filters and pagination.
 */
export const listStockApprovalsQuerySchema = z.object({
  organizationId: z
    .string()
    .uuid("organizationId must be a valid UUID")
    .optional(),
  storeId: z.string().uuid("storeId must be a valid UUID").optional(),
  inventoryItemId: z
    .string()
    .uuid("inventoryItemId must be a valid UUID")
    .optional(),
  approvalStatus: z.nativeEnum(StockApprovalStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListStockApprovalsQuery = z.infer<
  typeof listStockApprovalsQuerySchema
>;
