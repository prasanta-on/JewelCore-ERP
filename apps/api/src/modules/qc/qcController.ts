import type { Request, Response, NextFunction } from "express";
import {
  createQualityCheckSchema,
  updateQualityCheckSchema,
  QualityCheckStatus,
  SEALED_QC_STATUSES,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import {
  createQualityCheck,
  getQualityCheckById,
  listQualityChecks,
  updateQualityCheck,
  getShipmentWithStore,
} from "@jewelcore/database";

/**
 * Initiates a new Quality Inspection Session from a received shipment (FEAT-QC-01).
 *
 * Enforces:
 * - Shipment status prerequisite: must be 'RECEIVED' (ERR_SHIPMENT_NOT_RECEIVED, 422)
 * - Multi-Store Isolation (INV-11): shipment store must match active store context (ERR_STORE_ACCESS_DENIED, 403)
 * - Inspector identity attribution: defaults to authenticated user
 */
export async function createQualityCheckHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = createQualityCheckSchema.parse(req.body);

    // 1. Fetch shipment joined with its parent GRN store context
    const shipmentContext = await getShipmentWithStore(input.shipmentId);
    if (!shipmentContext) {
      throw new NotFoundError(
        `Target shipment with ID '${input.shipmentId}' does not exist`,
        "ERR_SHIPMENT_NOT_FOUND",
      );
    }

    // 2. Scenario 3: Unreceived Shipment Inspection Rejection
    if (shipmentContext.status !== "RECEIVED") {
      throw new UnprocessableEntityError(
        `Shipment '${shipmentContext.shipmentNumber}' is in status '${shipmentContext.status}'; quality inspection requires 'RECEIVED' status`,
        "ERR_SHIPMENT_NOT_RECEIVED",
      );
    }

    // 3. Scenario 2: Cross-Store QC Session Creation Rejection (INV-11)
    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && activeStoreId !== shipmentContext.storeId) {
      throw new ForbiddenError(
        `Cross-store access denied: shipment belongs to store '${shipmentContext.storeId}', but request is scoped to '${activeStoreId}'`,
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    // 4. Assign inspector: input override or authenticated operator
    const inspectorUserId = input.inspectorUserId ?? req.user!.userId;

    // 5. Create quality inspection session
    const qc = await createQualityCheck({
      shipmentId: input.shipmentId,
      storeId: shipmentContext.storeId,
      inspectorUserId,
      inspectionType: input.inspectionType,
      status: QualityCheckStatus.IN_PROGRESS,
    });

    res.status(201).json(qc);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a quality check inspection session by primary ID.
 */
export async function getQualityCheckHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Quality check ID parameter is required");
    }
    const qc = await getQualityCheckById(id);

    if (!qc) {
      throw new NotFoundError(
        `Quality inspection session with ID '${id}' not found`,
        "ERR_QC_NOT_FOUND",
      );
    }

    // Invariant INV-11: verify cross-store boundary if store context is present
    if (req.storeContext?.storeId && req.storeContext.storeId !== qc.storeId) {
      throw new ForbiddenError(
        "Access to the requested store context is denied",
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    res.status(200).json(qc);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists quality inspection sessions matching query filters.
 */
export async function listQualityChecksHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const shipmentId =
      typeof req.query.shipmentId === "string"
        ? req.query.shipmentId
        : undefined;
    const storeId =
      req.storeContext?.storeId ??
      (typeof req.query.storeId === "string" ? req.query.storeId : undefined);
    const status =
      typeof req.query.status === "string"
        ? (req.query.status as any)
        : undefined;

    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await listQualityChecks({
      shipmentId,
      storeId,
      status,
      limit,
      offset,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Updates a quality inspection session.
 * Enforces Sealed Session Immutability Gate (Scenario 5, ERR_SESSION_SEALED).
 */
export async function updateQualityCheckHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Quality check ID parameter is required");
    }
    const input = updateQualityCheckSchema.parse(req.body);

    const existing = await getQualityCheckById(id);
    if (!existing) {
      throw new NotFoundError(
        `Quality inspection session with ID '${id}' not found`,
        "ERR_QC_NOT_FOUND",
      );
    }

    // Scenario 5: Sealed Session Immutability Gate
    if (SEALED_QC_STATUSES.includes(existing.status)) {
      throw new UnprocessableEntityError(
        `Inspection session is ${existing.status} and sealed; modifications are strictly prohibited`,
        "ERR_SESSION_SEALED",
      );
    }

    // Invariant INV-11: store context boundary check
    if (
      req.storeContext?.storeId &&
      req.storeContext.storeId !== existing.storeId
    ) {
      throw new ForbiddenError(
        "Access to the requested store context is denied",
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    const updated = await updateQualityCheck(id, {
      status: input.status,
      completedAt: input.completedAt,
      rejectionReasonCode: input.rejectionReasonCode,
      rejectionNotes: input.rejectionNotes,
      expectedVersion: input.expectedVersion,
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}
