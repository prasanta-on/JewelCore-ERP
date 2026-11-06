import { z } from "zod";

/**
 * RFID Hardware Transponder Lifecycle Statuses.
 */
export const RfidTagStatus = {
  UNENCODED: "UNENCODED",
  ACTIVE: "ACTIVE",
  RETIRED: "RETIRED",
  DAMAGED: "DAMAGED",
} as const;

export type RfidTagStatus = (typeof RfidTagStatus)[keyof typeof RfidTagStatus];

/**
 * Supported RFID Frequency Bands.
 */
export const RfidFrequencyBand = {
  UHF_860_960_MHZ: "UHF_860_960_MHZ",
  HF_13_56_MHZ: "HF_13_56_MHZ",
  NFC: "NFC",
} as const;

export type RfidFrequencyBand =
  (typeof RfidFrequencyBand)[keyof typeof RfidFrequencyBand];

/**
 * Zod schema for registering a new RFID tag (FEAT-RFID-01).
 */
export const createRfidTagSchema = z.object({
  organizationId: z
    .string()
    .uuid("organizationId must be a valid UUID")
    .optional(),
  epc: z
    .string()
    .min(1, "EPC identifier cannot be empty")
    .max(128, "EPC identifier must not exceed 128 characters")
    .trim(),
  tid: z
    .string()
    .min(1, "TID identifier cannot be empty if provided")
    .max(128, "TID identifier must not exceed 128 characters")
    .trim()
    .optional()
    .nullable(),
  frequencyBand: z
    .nativeEnum(RfidFrequencyBand)
    .default(RfidFrequencyBand.UHF_860_960_MHZ),
});

export type CreateRfidTagInput = z.infer<typeof createRfidTagSchema>;

/**
 * Zod schema for updating an RFID tag's lifecycle status.
 */
export const updateRfidTagStatusSchema = z.object({
  status: z.nativeEnum(RfidTagStatus),
  reason: z
    .string()
    .min(1, "Reason cannot be empty if provided")
    .max(500, "Reason must not exceed 500 characters")
    .optional()
    .nullable(),
});

export type UpdateRfidTagStatusInput = z.infer<
  typeof updateRfidTagStatusSchema
>;

/**
 * In-memory representation of an RFID tag record (Entity 35).
 */
export interface RfidTagRecord {
  id: string;
  organizationId: string;
  epc: string;
  tid: string | null;
  status: RfidTagStatus;
  frequencyBand: RfidFrequencyBand;
  encodedAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for querying RFID tags with filters and pagination.
 */
export const listRfidTagsQuerySchema = z.object({
  organizationId: z
    .string()
    .uuid("organizationId must be a valid UUID")
    .optional(),
  status: z.nativeEnum(RfidTagStatus).optional(),
  epc: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListRfidTagsQuery = z.infer<typeof listRfidTagsQuerySchema>;

/**
 * RFID Tag Assignment Lifecycle Statuses (Entity 36 - FEAT-RFID-02).
 */
export const RfidAssignmentStatus = {
  ACTIVE: "ACTIVE",
  RETIRED: "RETIRED",
  VOIDED: "VOIDED",
} as const;

export type RfidAssignmentStatus =
  (typeof RfidAssignmentStatus)[keyof typeof RfidAssignmentStatus];

/**
 * RFID Tag Assignment Retirement Reasons.
 */
export const RfidRetirementReason = {
  DAMAGED: "DAMAGED",
  DETACHED: "DETACHED",
  ITEM_SOLD: "ITEM_SOLD",
  RETURN_TO_VENDOR: "RETURN_TO_VENDOR",
} as const;

export type RfidRetirementReason =
  (typeof RfidRetirementReason)[keyof typeof RfidRetirementReason];

/**
 * Zod schema for binding an RFID tag to a serialized inventory piece (FEAT-RFID-02 / INV-03, INV-04).
 */
export const createRfidAssignmentSchema = z.object({
  organizationId: z
    .string()
    .uuid("organizationId must be a valid UUID")
    .optional(),
  inventoryItemId: z.string().uuid("inventoryItemId must be a valid UUID"),
  rfidTagId: z.string().uuid("rfidTagId must be a valid UUID"),
});

export type CreateRfidAssignmentInput = z.infer<
  typeof createRfidAssignmentSchema
>;

/**
 * Zod schema for detaching/retiring an RFID tag assignment (FEAT-RFID-02 / INV-07).
 */
export const retireRfidAssignmentSchema = z.object({
  status: z
    .enum([RfidAssignmentStatus.RETIRED, RfidAssignmentStatus.VOIDED])
    .default(RfidAssignmentStatus.RETIRED),
  retirementReason: z.nativeEnum(RfidRetirementReason),
  notes: z
    .string()
    .max(500, "Notes must not exceed 500 characters")
    .optional()
    .nullable(),
});

export type RetireRfidAssignmentInput = z.infer<
  typeof retireRfidAssignmentSchema
>;

/**
 * In-memory representation of an RFID Tag Assignment record (Entity 36).
 */
export interface RfidAssignmentRecord {
  id: string;
  organizationId: string;
  inventoryItemId: string;
  rfidTagId: string;
  status: RfidAssignmentStatus;
  assignedAt: Date;
  assignedByUserId: string;
  retiredAt: Date | null;
  retiredByUserId: string | null;
  retirementReason: RfidRetirementReason | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for querying RFID tag assignments with filters and pagination.
 */
export const listRfidAssignmentsQuerySchema = z.object({
  organizationId: z
    .string()
    .uuid("organizationId must be a valid UUID")
    .optional(),
  inventoryItemId: z.string().uuid().optional(),
  rfidTagId: z.string().uuid().optional(),
  status: z.nativeEnum(RfidAssignmentStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListRfidAssignmentsQuery = z.infer<
  typeof listRfidAssignmentsQuerySchema
>;
