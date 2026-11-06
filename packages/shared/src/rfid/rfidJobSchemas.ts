import { z } from "zod";

/**
 * RFID Batch Job Status (Entity 37 - FEAT-RFID-03).
 */
export const RfidJobStatus = {
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type RfidJobStatus = (typeof RfidJobStatus)[keyof typeof RfidJobStatus];

/**
 * RFID Job Item Status (Entity 38 - FEAT-RFID-03).
 */
export const RfidJobItemStatus = {
  PENDING: "PENDING",
  ENCODED: "ENCODED",
  FAILED: "FAILED",
} as const;

export type RfidJobItemStatus =
  (typeof RfidJobItemStatus)[keyof typeof RfidJobItemStatus];

/**
 * Schema for an individual item inside an RFID encoding batch job.
 */
export const createRfidJobItemInputSchema = z.object({
  inventoryItemId: z.string().uuid("inventoryItemId must be a valid UUID"),
  targetEpc: z
    .string()
    .min(16, "targetEpc must be at least 16 hex characters")
    .max(64, "targetEpc must not exceed 64 characters")
    .optional(),
  labelFormat: z
    .string()
    .max(100, "labelFormat must not exceed 100 characters")
    .optional(),
});

export type CreateRfidJobItemInput = z.infer<
  typeof createRfidJobItemInputSchema
>;

/**
 * Schema for dispatching a batch RFID print & encoding job.
 */
export const createRfidJobSchema = z.object({
  organizationId: z
    .string()
    .uuid("organizationId must be a valid UUID")
    .optional(),
  storeId: z.string().uuid("storeId must be a valid UUID").optional(),
  printerDeviceId: z
    .string()
    .min(1, "printerDeviceId is required")
    .max(100, "printerDeviceId must not exceed 100 characters"),
  jobName: z
    .string()
    .max(255, "jobName must not exceed 255 characters")
    .optional(),
  items: z
    .array(createRfidJobItemInputSchema)
    .min(1, "At least one item is required in an RFID print job")
    .max(500, "Maximum batch size is 500 items per print job"),
});

export type CreateRfidJobInput = z.infer<typeof createRfidJobSchema>;

/**
 * In-memory representation of an RFID Batch Job (Entity 37).
 */
export interface RfidJobRecord {
  id: string;
  organizationId: string;
  storeId: string;
  createdByUserId: string;
  printerDeviceId: string;
  jobName: string | null;
  status: RfidJobStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * In-memory representation of an RFID Job Item (Entity 38).
 */
export interface RfidJobItemRecord {
  id: string;
  jobId: string;
  inventoryItemId: string;
  rfidTagId: string | null;
  targetEpc: string | null;
  status: RfidJobItemStatus;
  attempts: number;
  errorMessage: string | null;
  encodedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Query schema for listing RFID batch jobs.
 */
export const listRfidJobsQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  status: z.nativeEnum(RfidJobStatus).optional(),
  printerDeviceId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListRfidJobsQuery = z.infer<typeof listRfidJobsQuerySchema>;
