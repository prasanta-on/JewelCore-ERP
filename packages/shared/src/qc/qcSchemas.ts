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

// -------------------------------------------------------------
// Gemstone Parcel Grading & Mounted Stones (FEAT-QC-03)
// -------------------------------------------------------------

export const StoneType = {
  PRIMARY_SOLITAIRE: "PRIMARY_SOLITAIRE",
  ACCENT_MELEE: "ACCENT_MELEE",
  PARCEL: "PARCEL",
} as const;

export type StoneType = (typeof StoneType)[keyof typeof StoneType];

export const CertificateAuthority = {
  GIA: "GIA",
  IGI: "IGI",
  AGS: "AGS",
  HRD: "HRD",
  IN_HOUSE: "IN_HOUSE",
} as const;

export type CertificateAuthority =
  (typeof CertificateAuthority)[keyof typeof CertificateAuthority];

export const CARATS_TO_GRAMS = 0.2;

/**
 * Calculates net precious metal weight:
 * Net = Gross - Tare - (Total Stone Carats * 0.2000 g/ct)
 * Guaranteed to 4 decimal places (DEC-05).
 */
export function calculateNetWeightGrams(
  grossWeightGrams: number,
  tareWeightGrams: number = 0,
  stoneWeightCarats: number = 0,
): number {
  const stoneWeightGrams = stoneWeightCarats * CARATS_TO_GRAMS;
  const net = grossWeightGrams - tareWeightGrams - stoneWeightGrams;
  return parseFloat(net.toFixed(4));
}

export const QualityCheckItemStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type QualityCheckItemStatus =
  (typeof QualityCheckItemStatus)[keyof typeof QualityCheckItemStatus];

export const createQualityCheckItemSchema = z.object({
  qualityCheckId: z.string().uuid("qualityCheckId must be a valid UUID"),
  shipmentItemId: z.string().uuid("shipmentItemId must be a valid UUID"),
  itemSequenceNumber: z.number().int().min(1).optional(),
  verifiedMaterialId: z
    .string()
    .uuid("verifiedMaterialId must be a valid UUID")
    .optional()
    .nullable(),
  verifiedPurityId: z
    .string()
    .uuid("verifiedPurityId must be a valid UUID")
    .optional()
    .nullable(),
  grossWeightGrams: z
    .number()
    .positive("grossWeightGrams must be strictly positive (> 0)")
    .optional()
    .nullable(),
  tareWeightGrams: z
    .number()
    .nonnegative("tareWeightGrams cannot be negative")
    .default(0),
  netWeightGrams: z
    .number()
    .positive("netWeightGrams must be strictly positive (> 0)")
    .optional()
    .nullable(),
  hallmarkVerified: z.boolean().optional().nullable(),
  visualInspectionPassed: z.boolean().optional().nullable(),
  damageDetected: z.boolean().optional().nullable(),
  damageNotes: z.string().optional().nullable(),
});

export type CreateQualityCheckItemInput = z.infer<
  typeof createQualityCheckItemSchema
>;

export interface QualityCheckItemRecord {
  id: string;
  qualityCheckId: string;
  shipmentItemId: string;
  itemSequenceNumber: number;
  status: QualityCheckItemStatus;
  verifiedMaterialId: string | null;
  verifiedPurityId: string | null;
  grossWeightGrams: number | null;
  tareWeightGrams: number;
  netWeightGrams: number | null;
  stoneWeightCarats: number;
  hallmarkVerified: boolean | null;
  visualInspectionPassed: boolean | null;
  damageDetected: boolean | null;
  damageNotes: string | null;
  rejectionReason: string | null;
  decisionByUserId: string | null;
  decisionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createItemGemstoneSchema = z
  .object({
    gemstoneId: z.string().uuid("gemstoneId must be a valid UUID"),
    stoneType: z.enum([
      StoneType.PRIMARY_SOLITAIRE,
      StoneType.ACCENT_MELEE,
      StoneType.PARCEL,
    ]),
    stoneCount: z.number().int().min(1, "stoneCount must be at least 1"),
    caratWeight: z
      .number()
      .positive("caratWeight must be strictly positive (> 0) (INV-02)"),
    shape: z.string().max(50).optional().nullable(),
    cutGrade: z.string().max(50).optional().nullable(),
    colorGrade: z.string().max(50).optional().nullable(),
    clarityGrade: z.string().max(50).optional().nullable(),
    certificateNumber: z.string().max(100).optional().nullable(),
    certificateAuthority: z
      .enum(["GIA", "IGI", "AGS", "HRD", "IN_HOUSE"])
      .optional()
      .nullable(),
    certificateFileId: z
      .string()
      .uuid("certificateFileId must be a valid UUID")
      .optional()
      .nullable(),
    settingVerified: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (
        data.stoneType === StoneType.PRIMARY_SOLITAIRE &&
        data.stoneCount !== 1
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Solitaire stones must possess stone_count = 1",
      path: ["stoneCount"],
    },
  );

export type CreateItemGemstoneInput = z.infer<typeof createItemGemstoneSchema>;

export interface ItemGemstoneRecord {
  id: string;
  qualityCheckItemId: string;
  inventoryItemId: string | null;
  gemstoneId: string;
  stoneType: StoneType;
  stoneCount: number;
  caratWeight: number;
  shape: string | null;
  cutGrade: string | null;
  colorGrade: string | null;
  clarityGrade: string | null;
  certificateNumber: string | null;
  certificateAuthority: CertificateAuthority | null;
  certificateFileId: string | null;
  settingVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}
