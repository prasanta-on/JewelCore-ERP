import { z } from "zod";
import { SealStatus } from "./transferManifestSchemas.js";

export enum DisputeClaimType {
  MISSING_PIECE = "MISSING_PIECE",
  DAMAGED_SEAL = "DAMAGED_SEAL",
  WEIGHT_DISCREPANCY = "WEIGHT_DISCREPANCY",
  DAMAGED_ITEM = "DAMAGED_ITEM",
  INCORRECT_ITEM = "INCORRECT_ITEM",
}

export enum DisputeSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum DisputeStatus {
  OPEN = "OPEN",
  INVESTIGATING = "INVESTIGATING",
  RESOLVED = "RESOLVED",
  WRITTEN_OFF = "WRITTEN_OFF",
}

export const sealVerificationItemSchema = z.object({
  sealNumber: z.string().min(1),
  status: z.nativeEnum(SealStatus),
  notes: z.string().max(500).optional(),
});

export const receiveTransferManifestSchema = z.object({
  witnessUserId: z.string().uuid(),
  destinationCompartmentId: z.string().uuid(),
  receivedItemIds: z.array(z.string().uuid()),
  sealVerifications: z.array(sealVerificationItemSchema).min(1, "All seals must be verified upon receipt"),
  notes: z.string().max(1000).optional(),
});

export type ReceiveTransferManifestInput = z.infer<typeof receiveTransferManifestSchema>;

export const createTransferDisputeSchema = z.object({
  transferOrderId: z.string().uuid(),
  transferManifestId: z.string().uuid(),
  claimType: z.nativeEnum(DisputeClaimType),
  severity: z.nativeEnum(DisputeSeverity).default(DisputeSeverity.HIGH),
  witnessUserId: z.string().uuid(),
  inventoryItemId: z.string().uuid().optional(),
  details: z.string().min(5).max(2000),
});

export type CreateTransferDisputeInput = z.infer<typeof createTransferDisputeSchema>;

export const resolveTransferDisputeSchema = z.object({
  resolutionStatus: z.enum([DisputeStatus.RESOLVED, DisputeStatus.WRITTEN_OFF]),
  resolutionNotes: z.string().min(5).max(2000),
});

export type ResolveTransferDisputeInput = z.infer<typeof resolveTransferDisputeSchema>;

export const listTransferDisputesQuerySchema = z.object({
  transferOrderId: z.string().uuid().optional(),
  transferManifestId: z.string().uuid().optional(),
  claimType: z.nativeEnum(DisputeClaimType).optional(),
  severity: z.nativeEnum(DisputeSeverity).optional(),
  status: z.nativeEnum(DisputeStatus).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type ListTransferDisputesQuery = z.infer<typeof listTransferDisputesQuerySchema>;

export interface TransferDisputeRecord {
  id: string;
  organizationId: string;
  transferOrderId: string;
  orderNumber?: string;
  transferManifestId: string;
  manifestNumber?: string;
  claimType: DisputeClaimType;
  severity: DisputeSeverity;
  status: DisputeStatus;
  reportedByUserId: string;
  reportedByUserName?: string;
  witnessUserId: string;
  witnessUserName?: string;
  inventoryItemId?: string | null;
  serialNumber?: string | null;
  details: string;
  resolutionNotes?: string | null;
  resolvedByUserId?: string | null;
  resolvedByUserName?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
