import { z } from "zod";

export enum TransferOrderStatus {
  DRAFT = "DRAFT",
  REQUESTED = "REQUESTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  IN_TRANSIT = "IN_TRANSIT",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  DISPUTED = "DISPUTED",
}

export enum TransferOrderPriority {
  NORMAL = "NORMAL",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum TransferOrderItemStatus {
  PENDING = "PENDING",
  DISPATCHED = "DISPATCHED",
  RECEIVED = "RECEIVED",
  DISPUTED = "DISPUTED",
  CANCELLED = "CANCELLED",
}

export const createTransferOrderSchema = z.object({
  sourceStoreId: z.string().uuid(),
  destinationStoreId: z.string().uuid(),
  priority: z.nativeEnum(TransferOrderPriority).default(TransferOrderPriority.NORMAL),
  orderNumber: z.string().min(3).max(50).optional(),
  notes: z.string().max(1000).optional(),
  itemIds: z.array(z.string().uuid()).optional(),
}).refine(data => data.sourceStoreId !== data.destinationStoreId, {
  message: "Source store and destination store must be different",
  path: ["destinationStoreId"],
});

export type CreateTransferOrderInput = z.infer<typeof createTransferOrderSchema>;

export const addTransferOrderItemSchema = z.object({
  inventoryItemId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export type AddTransferOrderItemInput = z.infer<typeof addTransferOrderItemSchema>;

export const rejectTransferOrderSchema = z.object({
  rejectionReason: z.string().min(3).max(1000),
});

export type RejectTransferOrderInput = z.infer<typeof rejectTransferOrderSchema>;

export const cancelTransferOrderSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export type CancelTransferOrderInput = z.infer<typeof cancelTransferOrderSchema>;

export const listTransferOrdersQuerySchema = z.object({
  sourceStoreId: z.string().uuid().optional(),
  destinationStoreId: z.string().uuid().optional(),
  status: z.nativeEnum(TransferOrderStatus).optional(),
  priority: z.nativeEnum(TransferOrderPriority).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type ListTransferOrdersQuery = z.infer<typeof listTransferOrdersQuerySchema>;

export interface TransferOrderItemRecord {
  id: string;
  organizationId: string;
  transferOrderId: string;
  inventoryItemId: string;
  productSkuId: string;
  skuCode?: string;
  serialNumber?: string;
  status: TransferOrderItemStatus;
  notes?: string | null;
  createdAt: string;
}

export interface TransferOrderRecord {
  id: string;
  organizationId: string;
  orderNumber: string;
  sourceStoreId: string;
  sourceStoreName?: string;
  destinationStoreId: string;
  destinationStoreName?: string;
  status: TransferOrderStatus;
  priority: TransferOrderPriority;
  requestedByUserId: string;
  requestedByUserName?: string;
  approvedByUserId?: string | null;
  approvedByUserName?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: TransferOrderItemRecord[];
}
