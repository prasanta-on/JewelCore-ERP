import { z } from "zod";

export const QualityCheckStatus = {
  DRAFT: "DRAFT",
  IN_PROGRESS: "IN_PROGRESS",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  FINALIZED: "FINALIZED",
} as const;

export type QualityCheckStatusType =
  (typeof QualityCheckStatus)[keyof typeof QualityCheckStatus];

export const SEALED_QC_STATUSES: readonly QualityCheckStatusType[] = [
  QualityCheckStatus.FINALIZED,
  QualityCheckStatus.APPROVED,
  QualityCheckStatus.REJECTED,
];

export const InspectionType = {
  INITIAL_INTAKE: "INITIAL_INTAKE",
  REINSPECTION: "REINSPECTION",
} as const;

export type InspectionType =
  (typeof InspectionType)[keyof typeof InspectionType];

export const createQualityCheckSchema = z.object({
  shipmentId: z.string().uuid("shipmentId must be a valid UUIDv7"),
  inspectionType: z
    .enum([InspectionType.INITIAL_INTAKE, InspectionType.REINSPECTION])
    .default(InspectionType.INITIAL_INTAKE),
  inspectorUserId: z
    .string()
    .uuid("inspectorUserId must be a valid UUIDv7")
    .optional(),
});

export type CreateQualityCheckInput = z.infer<typeof createQualityCheckSchema>;

export const updateQualityCheckSchema = z.object({
  status: z
    .enum([
      QualityCheckStatus.DRAFT,
      QualityCheckStatus.IN_PROGRESS,
      QualityCheckStatus.PENDING,
      QualityCheckStatus.APPROVED,
      QualityCheckStatus.REJECTED,
      QualityCheckStatus.FINALIZED,
    ])
    .optional(),
  completedAt: z.string().datetime().optional().nullable(),
  rejectionReasonCode: z.string().max(50).optional().nullable(),
  rejectionNotes: z.string().optional().nullable(),
  expectedVersion: z.number().int().positive().optional(),
});

export type UpdateQualityCheckInput = z.infer<typeof updateQualityCheckSchema>;

export interface QualityCheckRecord {
  id: string;
  shipmentId: string;
  storeId: string;
  inspectorUserId: string;
  sessionSequenceNumber: number;
  status: QualityCheckStatusType;
  inspectionType: InspectionType;
  startedAt: Date;
  completedAt: Date | null;
  rejectionReasonCode: string | null;
  rejectionNotes: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
