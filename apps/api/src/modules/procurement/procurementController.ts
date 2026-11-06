import type { Request, Response, NextFunction } from "express";
import {
  createSupplierSchema,
  updateSupplierSchema,
  createGrnSchema,
  updateGrnSchema,
  closeGrnSchema,
  createShipmentSchema,
  updateShipmentSchema,
  createShipmentItemInputSchema,
  updateShipmentItemSchema,
  type GrnStatus,
  type ShipmentStatus,
  NotFoundError,
  BadRequestError,
} from "@jewelcore/shared";
import {
  createSupplier,
  getSupplierById,
  listSuppliers,
  updateSupplier,
  createGrn,
  getGrnById,
  listGrns,
  updateGrn,
  closeGrn,
  createShipment,
  getShipmentWithItems,
  listShipments,
  updateShipment,
  addShipmentItem,
  updateShipmentItem,
} from "@jewelcore/database";

export async function createSupplierHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const validated = createSupplierSchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const supplier = await createSupplier(validated);
    res.status(201).json({
      data: supplier,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listSuppliersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const isActive =
      req.query.isActive !== undefined
        ? req.query.isActive === "true"
        : undefined;

    const suppliers = await listSuppliers({
      organizationId: orgId,
      isActive,
    });

    res.status(200).json({
      data: suppliers,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getSupplierHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Supplier ID is required", "ERR_INVALID_ID");
    }

    const supplier = await getSupplierById(id);
    if (!supplier) {
      throw new NotFoundError("Supplier", id);
    }

    res.status(200).json({
      data: supplier,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateSupplierHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Supplier ID is required", "ERR_INVALID_ID");
    }

    const validated = updateSupplierSchema.parse(req.body);
    const updated = await updateSupplier(id, validated);

    res.status(200).json({
      data: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// Goods Receipt Notes (GRN) Handlers (FEAT-PROC-02)
// ==========================================

export async function createGrnHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const storeId = req.body.storeId ?? req.storeContext?.storeId;
    if (!storeId) {
      throw new BadRequestError(
        "Store context is required",
        "ERR_MISSING_STORE_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError(
        "User authentication is required",
        "ERR_UNAUTHENTICATED",
      );
    }

    const validated = createGrnSchema.parse({
      ...req.body,
      organizationId: orgId,
      storeId,
    });

    const grn = await createGrn({
      ...validated,
      createdByUserId: userId,
    });

    res.status(201).json({
      data: grn,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listGrnsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const storeId = (req.query.storeId as string) ?? req.storeContext?.storeId;
    const supplierId = req.query.supplierId as string | undefined;
    const status = req.query.status as GrnStatus | undefined;

    const grns = await listGrns({
      organizationId: orgId,
      storeId,
      supplierId,
      status,
    });

    res.status(200).json({
      data: grns,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getGrnHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("GRN ID is required", "ERR_INVALID_ID");
    }

    const grn = await getGrnById(id);
    if (!grn) {
      throw new NotFoundError("Goods Receipt Note", id);
    }

    res.status(200).json({
      data: grn,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateGrnHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("GRN ID is required", "ERR_INVALID_ID");
    }

    const validated = updateGrnSchema.parse(req.body);
    const updated = await updateGrn(id, validated);

    res.status(200).json({
      data: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function closeGrnHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("GRN ID is required", "ERR_INVALID_ID");
    }

    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError(
        "User authentication is required",
        "ERR_UNAUTHENTICATED",
      );
    }

    const validated = closeGrnSchema.parse(req.body);
    const closed = await closeGrn(id, userId, validated.remarks);

    res.status(200).json({
      data: closed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// Inbound Shipments & Line Items Handlers (FEAT-PROC-03)
// ==========================================

export async function createShipmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError(
        "User authentication is required",
        "ERR_UNAUTHENTICATED",
      );
    }

    const validated = createShipmentSchema.parse(req.body);
    const shipment = await createShipment({
      ...validated,
      receivedByUserId: userId,
    });

    res.status(201).json({
      data: shipment,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listShipmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const goodsReceiptNoteId = req.query.goodsReceiptNoteId as
      string | undefined;
    const status = req.query.status as ShipmentStatus | undefined;

    const shipments = await listShipments({
      goodsReceiptNoteId,
      status,
    });

    res.status(200).json({
      data: shipments,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getShipmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Shipment ID is required", "ERR_INVALID_ID");
    }

    const shipment = await getShipmentWithItems(id);
    if (!shipment) {
      throw new NotFoundError("Shipment", id);
    }

    res.status(200).json({
      data: shipment,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateShipmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Shipment ID is required", "ERR_INVALID_ID");
    }

    const validated = updateShipmentSchema.parse(req.body);
    const updated = await updateShipment(id, validated);

    res.status(200).json({
      data: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function addShipmentItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const shipmentId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!shipmentId) {
      throw new BadRequestError("Shipment ID is required", "ERR_INVALID_ID");
    }

    const validated = createShipmentItemInputSchema.parse(req.body);
    const item = await addShipmentItem(shipmentId, validated);

    res.status(201).json({
      data: item,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateShipmentItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawItemId = req.params.itemId;
    const itemId = Array.isArray(rawItemId) ? rawItemId[0] : rawItemId;
    if (!itemId) {
      throw new BadRequestError(
        "Shipment Item ID is required",
        "ERR_INVALID_ID",
      );
    }

    const validated = updateShipmentItemSchema.parse(req.body);
    const updated = await updateShipmentItem(itemId, validated);

    res.status(200).json({
      data: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
