import { z } from "zod";
import { CustodyState } from "./inventorySchemas.js";

/**
 * Operational movement types for physical inventory custody transfers.
 */
export const MovementType = {
  INTAKE_PLACEMENT: "INTAKE_PLACEMENT",
  VAULT_TRANSFER: "VAULT_TRANSFER",
  DISPLAY_PLACEMENT: "DISPLAY_PLACEMENT",
  RETURN_TO_VAULT: "RETURN_TO_VAULT",
  AUDIT_ADJUSTMENT: "AUDIT_ADJUSTMENT",
  CUSTODY_DEPARTURE: "CUSTODY_DEPARTURE",
} as const;

export type MovementType = (typeof MovementType)[keyof typeof MovementType];

/**
 * Zod schema for recording physical custody movements (Entity 30 - FEAT-INV-03 / INV-09, INV-13, INV-16).
 */
export const createInventoryMovementSchema = z
  .object({
    storeId: z.string().uuid("Invalid store UUID format").optional(),
    inventoryItemId: z
      .string()
      .uuid("Invalid inventory item UUID format")
      .optional()
      .nullable(),
    productSkuId: z.string().uuid("Invalid product SKU UUID format"),
    movementType: z.nativeEnum(MovementType),
    fromCompartmentId: z
      .string()
      .uuid("Invalid from-compartment UUID format")
      .optional()
      .nullable(),
    toCompartmentId: z
      .string()
      .uuid("Invalid to-compartment UUID format")
      .optional()
      .nullable(),
    fromCustodyState: z.nativeEnum(CustodyState).optional().nullable(),
    toCustodyState: z.nativeEnum(CustodyState),
    quantity: z
      .number()
      .int("Quantity must be an integer")
      .min(1, "Quantity must be at least 1")
      .default(1),
    weightGrams: z
      .number()
      .min(0, "Weight must be non-negative")
      .optional()
      .nullable(),
    reasonCode: z.string().min(1).max(50).optional().nullable(),
    referenceDocumentType: z.string().min(1).max(50).optional().nullable(),
    referenceDocumentId: z
      .string()
      .uuid("Invalid reference document UUID format")
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      // Invariant INV-13: Destination compartment consistency
      if (
        data.toCustodyState === CustodyState.IN_VAULT ||
        data.toCustodyState === CustodyState.IN_DISPLAY
      ) {
        return !!data.toCompartmentId;
      }
      if (
        data.toCustodyState === CustodyState.IN_TRANSIT ||
        data.toCustodyState === CustodyState.MISSING ||
        data.toCustodyState === CustodyState.RELEASED ||
        data.toCustodyState === CustodyState.INTAKE_STAGING
      ) {
        return (
          data.toCompartmentId === null || data.toCompartmentId === undefined
        );
      }
      return true;
    },
    {
      message:
        "toCompartmentId is mandatory when toCustodyState is IN_VAULT or IN_DISPLAY, and must be null when moving to non-compartment states (IN_TRANSIT, MISSING, RELEASED, INTAKE_STAGING) (INV-13)",
      path: ["toCompartmentId"],
    },
  )
  .refine(
    (data) => {
      // Serialized items strictly move 1 piece
      if (data.inventoryItemId && data.quantity !== 1) {
        return false;
      }
      return true;
    },
    {
      message: "Serialized inventory movements strictly require quantity = 1",
      path: ["quantity"],
    },
  );

export type CreateInventoryMovementInput = z.infer<
  typeof createInventoryMovementSchema
>;

/**
 * Zod schema for querying custody movements.
 */
export const listInventoryMovementsQuerySchema = z.object({
  storeId: z.string().uuid("Invalid store UUID format").optional(),
  inventoryItemId: z
    .string()
    .uuid("Invalid inventory item UUID format")
    .optional(),
  productSkuId: z.string().uuid("Invalid product SKU UUID format").optional(),
  movementType: z.nativeEnum(MovementType).optional(),
  toCustodyState: z.nativeEnum(CustodyState).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListInventoryMovementsQuery = z.infer<
  typeof listInventoryMovementsQuerySchema
>;

/**
 * In-memory representation of an immutable inventory movement ledger record (Entity 30).
 */
export interface InventoryMovementRecord {
  id: string;
  organizationId: string;
  storeId: string;
  inventoryItemId: string | null;
  productSkuId: string;
  movementType: MovementType;
  fromCompartmentId: string | null;
  toCompartmentId: string | null;
  fromCustodyState: CustodyState | null;
  toCustodyState: CustodyState;
  quantity: number;
  weightGrams: number | null;
  actorUserId: string;
  reasonCode: string | null;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  movedAt: Date;
  createdAt: Date;
}
