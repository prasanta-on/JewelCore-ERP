import type { Request, Response, NextFunction } from "express";
import {
  createSupplierSchema,
  updateSupplierSchema,
  NotFoundError,
  BadRequestError,
} from "@jewelcore/shared";
import {
  createSupplier,
  getSupplierById,
  listSuppliers,
  updateSupplier,
} from "@jewelcore/database";

export async function createSupplierHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
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
      throw new BadRequestError("Organization context is required", "ERR_MISSING_ORG_CONTEXT");
    }

    const isActive =
      req.query.isActive !== undefined ? req.query.isActive === "true" : undefined;

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
