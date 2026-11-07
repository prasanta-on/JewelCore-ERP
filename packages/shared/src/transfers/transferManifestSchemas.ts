import { z } from "zod";

export enum ManifestStatus {
  DISPATCHED = "DISPATCHED",
  IN_TRANSIT = "IN_TRANSIT",
  RECEIVED = "RECEIVED",
  DISPUTED = "DISPUTED",
}

export enum SealStatus {
  ATTACHED = "ATTACHED",
  VERIFIED_INTACT = "VERIFIED_INTACT",
  BROKEN_TAMPERED = "BROKEN_TAMPERED",
  DAMAGED = "DAMAGED",
}

export enum SealType {
  SECURITY_BAG = "SECURITY_BAG",
  LOCKER_BOX = "LOCKER_BOX",
  CABLE_SEAL = "CABLE_SEAL",
}

export const createTransferManifestSchema = z.object({
  transferOrderId: z.string().uuid(),
  manifestNumber: z.string().min(3).max(50).optional(),
  witnessUserId: z.string().uuid(),
  carrierName: z.string().min(2).max(100),
  trackingNumber: z.string().max(100).optional(),
  estimatedArrival: z.string().datetime().optional(),
  sealNumbers: z.array(z.string().min(2).max(50)).min(1, "At least one security seal is required (INV-16)"),
  notes: z.string().max(1000).optional(),
});

export type CreateTransferManifestInput = z.infer<typeof createTransferManifestSchema>;

export const listTransferManifestsQuerySchema = z.object({
  transferOrderId: z.string().uuid().optional(),
  status: z.nativeEnum(ManifestStatus).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type ListTransferManifestsQuery = z.infer<typeof listTransferManifestsQuerySchema>;

export interface SecuritySealRecord {
  id: string;
  organizationId: string;
  transferManifestId: string;
  sealNumber: string;
  sealType: SealType;
  status: SealStatus;
  verifiedAt?: string | null;
  verifiedByUserId?: string | null;
  createdAt: string;
}

export interface TransferManifestRecord {
  id: string;
  organizationId: string;
  manifestNumber: string;
  transferOrderId: string;
  orderNumber?: string;
  dispatcherUserId: string;
  dispatcherUserName?: string;
  witnessUserId: string;
  witnessUserName?: string;
  carrierName: string;
  trackingNumber?: string | null;
  estimatedArrival?: string | null;
  dispatchedAt: string;
  status: ManifestStatus;
  notes?: string | null;
  createdAt: string;
  seals?: SecuritySealRecord[];
}
