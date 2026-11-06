import type { Request, Response, NextFunction } from "express";
import {
  createQualityCheckSchema,
  updateQualityCheckSchema,
  createWeightMeasurementSchema,
  createQualityCheckItemSchema,
  createItemGemstoneSchema,
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
  createWeightMeasurement,
  getWeightMeasurementById,
  listWeightMeasurements,
  createQualityCheckItem,
  getQualityCheckItemWithSession,
  addItemGemstone,
  listItemGemstonesByQcItemId,
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

/**
 * Ingests a raw sub-milligram scale reading from an analytical balance (FEAT-QC-02 / INV-02, INV-09).
 *
 * Enforces:
 * - Gross weight must be strictly positive (> 0) (ERR_INVALID_WEIGHT_VALUE, 400)
 * - DEC-05 4-decimal precision
 * - Strict append-only immutability
 */
export async function createWeightMeasurementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parseResult = createWeightMeasurementSchema.safeParse(req.body);

    if (!parseResult.success) {
      const hasWeightIssue = parseResult.error.issues.some((issue) =>
        [
          "measuredWeight",
          "grossWeight",
          "grossWeightGrams",
          "tareWeight",
          "tareWeightGrams",
        ].includes(String(issue.path[0])),
      );

      if (hasWeightIssue) {
        throw new BadRequestError(
          parseResult.error.issues[0]?.message ??
            "Weight value must be strictly positive (> 0) (INV-02)",
          "ERR_INVALID_WEIGHT_VALUE",
        );
      }

      throw parseResult.error;
    }

    const input = parseResult.data;
    const measuredByUserId = input.measuredByUserId ?? req.user!.userId;

    const measurement = await createWeightMeasurement({
      qualityCheckId: input.qualityCheckId ?? null,
      qualityCheckItemId: input.qualityCheckItemId ?? null,
      balanceDeviceId: input.balanceDeviceId,
      measurementType: input.measurementType,
      measurementStage: input.measurementStage,
      measuredWeight: input.measuredWeight!,
      tareWeight: input.tareWeight,
      measurementUnit: input.measurementUnit,
      isCalibrated: input.isCalibrated,
      measuredByUserId,
      measuredAt: input.measuredAt,
    });

    res.status(201).json(measurement);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves an analytical scale measurement reading by ID.
 */
export async function getWeightMeasurementHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Weight measurement ID parameter is required");
    }

    const measurement = await getWeightMeasurementById(id);
    if (!measurement) {
      throw new NotFoundError(
        `Weight measurement record with ID '${id}' not found`,
        "ERR_MEASUREMENT_NOT_FOUND",
      );
    }

    res.status(200).json(measurement);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists weight measurements matching optional query filters.
 */
export async function listWeightMeasurementsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const qualityCheckId =
      typeof req.query.qualityCheckId === "string"
        ? req.query.qualityCheckId
        : undefined;
    const qualityCheckItemId =
      typeof req.query.qualityCheckItemId === "string"
        ? req.query.qualityCheckItemId
        : undefined;
    const balanceDeviceId =
      typeof req.query.balanceDeviceId === "string"
        ? req.query.balanceDeviceId
        : undefined;
    const measurementStage =
      typeof req.query.measurementStage === "string"
        ? req.query.measurementStage
        : undefined;

    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await listWeightMeasurements({
      qualityCheckId,
      qualityCheckItemId,
      balanceDeviceId,
      measurementStage,
      limit,
      offset,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a piece-level technical inspection record (Entity 24 - FEAT-QC-04).
 */
export async function createQualityCheckItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = createQualityCheckItemSchema.parse(req.body);

    const qcSession = await getQualityCheckById(input.qualityCheckId);
    if (!qcSession) {
      throw new NotFoundError(
        `Quality inspection session with ID '${input.qualityCheckId}' not found`,
        "ERR_QC_NOT_FOUND",
      );
    }

    // Invariant INV-11: store context boundary check
    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && activeStoreId !== qcSession.storeId) {
      throw new ForbiddenError(
        `Cross-store access denied: session belongs to store '${qcSession.storeId}', but request is scoped to '${activeStoreId}'`,
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    // Sealed Session Gate
    if (SEALED_QC_STATUSES.includes(qcSession.status)) {
      throw new UnprocessableEntityError(
        `Inspection session is ${qcSession.status} and sealed; adding inspection items is prohibited`,
        "ERR_SESSION_SEALED",
      );
    }

    const qcItem = await createQualityCheckItem(input);
    res.status(201).json(qcItem);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a quality check inspection item by primary ID.
 */
export async function getQualityCheckItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Quality check item ID parameter is required");
    }

    const sessionContext = await getQualityCheckItemWithSession(id);
    if (!sessionContext) {
      throw new NotFoundError(
        `Quality check item with ID '${id}' not found`,
        "ERR_QC_ITEM_NOT_FOUND",
      );
    }

    // Invariant INV-11: store context check
    if (
      req.storeContext?.storeId &&
      req.storeContext.storeId !== sessionContext.storeId
    ) {
      throw new ForbiddenError(
        "Access to the requested store context is denied",
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    res.status(200).json(sessionContext.item);
  } catch (err) {
    next(err);
  }
}

/**
 * Records a mounted gemstone or parcel on an inspected piece (FEAT-QC-03).
 *
 * Enforces:
 * - qc:measure permission
 * - Net Metal Weight Calculation Formula: Net = Gross - Tare - Stones (1 ct = 0.2000 g)
 * - Solitaire single stone invariant
 * - Multi-Store Isolation (INV-11)
 * - Sealed session immutability
 */
export async function addItemGemstoneHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const itemId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!itemId) {
      throw new BadRequestError("Quality check item ID parameter is required");
    }

    const sessionContext = await getQualityCheckItemWithSession(itemId);
    if (!sessionContext) {
      throw new NotFoundError(
        `Quality check item with ID '${itemId}' not found`,
        "ERR_QC_ITEM_NOT_FOUND",
      );
    }

    // Invariant INV-11: verify cross-store boundary
    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && activeStoreId !== sessionContext.storeId) {
      throw new ForbiddenError(
        `Cross-store access denied: QC item belongs to store '${sessionContext.storeId}', but request is scoped to '${activeStoreId}'`,
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    // Sealed Session Gate
    if (SEALED_QC_STATUSES.includes(sessionContext.sessionStatus)) {
      throw new UnprocessableEntityError(
        `Inspection session is ${sessionContext.sessionStatus} and sealed; gemstone additions are strictly prohibited`,
        "ERR_SESSION_SEALED",
      );
    }

    const input = createItemGemstoneSchema.parse(req.body);

    const result = await addItemGemstone({
      qualityCheckItemId: itemId,
      gemstoneId: input.gemstoneId,
      stoneType: input.stoneType,
      stoneCount: input.stoneCount,
      caratWeight: input.caratWeight,
      shape: input.shape,
      cutGrade: input.cutGrade,
      colorGrade: input.colorGrade,
      clarityGrade: input.clarityGrade,
      certificateNumber: input.certificateNumber,
      certificateAuthority: input.certificateAuthority,
      certificateFileId: input.certificateFileId,
      settingVerified: input.settingVerified,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists all mounted gemstones on an inspected piece.
 */
export async function listItemGemstonesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const itemId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!itemId) {
      throw new BadRequestError("Quality check item ID parameter is required");
    }

    const sessionContext = await getQualityCheckItemWithSession(itemId);
    if (!sessionContext) {
      throw new NotFoundError(
        `Quality check item with ID '${itemId}' not found`,
        "ERR_QC_ITEM_NOT_FOUND",
      );
    }

    // Invariant INV-11: verify cross-store boundary
    const activeStoreId =
      req.storeContext?.storeId ??
      (typeof req.headers["x-store-id"] === "string"
        ? req.headers["x-store-id"]
        : undefined);

    if (activeStoreId && activeStoreId !== sessionContext.storeId) {
      throw new ForbiddenError(
        "Access to the requested store context is denied",
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    const gemstones = await listItemGemstonesByQcItemId(itemId);
    res.status(200).json(gemstones);
  } catch (err) {
    next(err);
  }
}
