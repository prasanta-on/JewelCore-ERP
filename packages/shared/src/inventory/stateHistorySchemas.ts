import { z } from "zod";
import {
  QualityState,
  ApprovalState,
  CustodyState,
  CommercialState,
} from "./inventorySchemas.js";

/**
 * The four orthogonal state dimensions of an inventory item.
 */
export const StateDimension = {
  QUALITY: "QUALITY",
  APPROVAL: "APPROVAL",
  CUSTODY: "CUSTODY",
  COMMERCIAL: "COMMERCIAL",
} as const;

export type StateDimension =
  (typeof StateDimension)[keyof typeof StateDimension];

/**
 * Zod schema for updating an inventory item's multi-dimensional state with OCC support (FEAT-INV-04 / INV-08).
 */
export const updateInventoryItemStateSchema = z
  .object({
    dimension: z.nativeEnum(StateDimension),
    newState: z.string().min(1, "newState must not be empty").max(30),
    reason: z
      .string()
      .min(1, "Reason must not be empty if provided")
      .max(500, "Reason must not exceed 500 characters")
      .optional()
      .nullable(),
    expectedVersion: z
      .number()
      .int("expectedVersion must be an integer")
      .min(1, "expectedVersion must be at least 1")
      .optional(),
  })
  .refine(
    (data) => {
      switch (data.dimension) {
        case StateDimension.QUALITY:
          return Object.values(QualityState).includes(
            data.newState as QualityState,
          );
        case StateDimension.APPROVAL:
          return Object.values(ApprovalState).includes(
            data.newState as ApprovalState,
          );
        case StateDimension.CUSTODY:
          return Object.values(CustodyState).includes(
            data.newState as CustodyState,
          );
        case StateDimension.COMMERCIAL:
          return Object.values(CommercialState).includes(
            data.newState as CommercialState,
          );
        default:
          return false;
      }
    },
    {
      message: "newState must be a valid enum state for the selected dimension",
      path: ["newState"],
    },
  );

export type UpdateInventoryItemStateInput = z.infer<
  typeof updateInventoryItemStateSchema
>;

/**
 * In-memory representation of an immutable status history audit log row (Entity 31).
 */
export interface InventoryStatusHistoryRecord {
  id: string;
  organizationId: string;
  inventoryItemId: string;
  dimensionChanged: StateDimension;
  oldState: string;
  newState: string;
  actorUserId: string;
  reason: string | null;
  transitionedAt: Date;
  createdAt: Date;
}

/**
 * Query schema for listing inventory status history records.
 */
export const listStatusHistoryQuerySchema = z.object({
  inventoryItemId: z
    .string()
    .uuid("inventoryItemId must be a valid UUID")
    .optional(),
  dimensionChanged: z.nativeEnum(StateDimension).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListStatusHistoryQuery = z.infer<
  typeof listStatusHistoryQuerySchema
>;
