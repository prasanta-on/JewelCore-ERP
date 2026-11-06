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

// -------------------------------------------------------------
// Analytical Balance Metrology (FEAT-QC-02, INV-02, INV-09)
// -------------------------------------------------------------

export const MeasurementType = {
  GROSS_WEIGHT: "GROSS_WEIGHT",
  NET_WEIGHT: "NET_WEIGHT",
  GEMSTONE_WEIGHT: "GEMSTONE_WEIGHT",
} as const;

export type MeasurementType =
  (typeof MeasurementType)[keyof typeof MeasurementType];

export const MeasurementStage = {
  INTAKE_RECEIVING: "INTAKE_RECEIVING",
  INITIAL_INTAKE: "INITIAL_INTAKE",
  QC_INSPECTION: "QC_INSPECTION",
  REINSPECTION: "REINSPECTION",
  POST_QC_AUDIT: "POST_QC_AUDIT",
  VAULT_AUDIT: "VAULT_AUDIT",
  TRANSFER_VERIFICATION: "TRANSFER_VERIFICATION",
} as const;

export type MeasurementStage =
  (typeof MeasurementStage)[keyof typeof MeasurementStage];

export const WeightMeasurementUnit = {
  GRAMS: "GRAMS",
  CARATS: "CARATS",
  TROY_OUNCES: "TROY_OUNCES",
} as const;

export type WeightMeasurementUnit =
  (typeof WeightMeasurementUnit)[keyof typeof WeightMeasurementUnit];

export const createWeightMeasurementSchema = z
  .object({
    qualityCheckId: z
      .string()
      .uuid("qualityCheckId must be a valid UUID")
      .optional()
      .nullable(),
    qualityCheckItemId: z
      .string()
      .uuid("qualityCheckItemId must be a valid UUID")
      .optional()
      .nullable(),
    balanceDeviceId: z
      .string()
      .min(1, "balanceDeviceId cannot be empty")
      .default("SCALE-BRIDGE-01"),
    measurementType: z
      .enum([
        MeasurementType.GROSS_WEIGHT,
        MeasurementType.NET_WEIGHT,
        MeasurementType.GEMSTONE_WEIGHT,
      ])
      .default(MeasurementType.GROSS_WEIGHT),
    measurementStage: z
      .enum([
        MeasurementStage.INTAKE_RECEIVING,
        MeasurementStage.INITIAL_INTAKE,
        MeasurementStage.QC_INSPECTION,
        MeasurementStage.REINSPECTION,
        MeasurementStage.POST_QC_AUDIT,
        MeasurementStage.VAULT_AUDIT,
        MeasurementStage.TRANSFER_VERIFICATION,
      ])
      .default(MeasurementStage.INTAKE_RECEIVING),
    measuredWeight: z.number().optional(),
    grossWeight: z.number().optional(),
    grossWeightGrams: z.number().optional(),
    tareWeight: z
      .number()
      .nonnegative("tareWeight cannot be negative")
      .default(0),
    tareWeightGrams: z.number().nonnegative().optional(),
    measurementUnit: z
      .enum(["GRAMS", "CARATS", "TROY_OUNCES", "GRAM", "CARAT"])
      .default("GRAMS"),
    isCalibrated: z.boolean().default(true),
    measuredByUserId: z
      .string()
      .uuid("measuredByUserId must be a valid UUID")
      .optional(),
    measuredAt: z.string().datetime().optional(),
  })
  .transform((data) => {
    const rawWeight =
      data.measuredWeight ?? data.grossWeightGrams ?? data.grossWeight;
    const tare = data.tareWeightGrams ?? data.tareWeight;
    return {
      ...data,
      measuredWeight: rawWeight,
      tareWeight: tare,
    };
  })
  .refine(
    (data) => data.measuredWeight !== undefined && data.measuredWeight > 0,
    {
      message: "Gross measured weight must be strictly positive (> 0) (INV-02)",
      path: ["measuredWeight"],
    },
  )
  .refine((data) => (data.measuredWeight ?? 0) >= (data.tareWeight ?? 0), {
    message:
      "Gross measured weight must be greater than or equal to tare weight (INV-02)",
    path: ["measuredWeight"],
  });

export type CreateWeightMeasurementInput = z.infer<
  typeof createWeightMeasurementSchema
>;

export interface WeightMeasurementRecord {
  id: string;
  qualityCheckId: string | null;
  qualityCheckItemId: string | null;
  balanceDeviceId: string;
  measurementType: MeasurementType;
  measurementStage: MeasurementStage;
  measuredWeight: number;
  tareWeight: number;
  netWeight: number;
  measurementUnit: string;
  isCalibrated: boolean;
  measuredByUserId: string;
  measuredAt: Date;
  createdAt: Date;
}
