import type { Request, Response, NextFunction } from "express";
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  createCustomer,
  updateCustomer,
  getCustomerById,
  listCustomers,
} from "@jewelcore/database";

/**
 * Handles creation of a customer master profile (Entity 48 - FEAT-SALES-01).
 */
export async function createCustomerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to create a customer profile",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const input = createCustomerSchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const customer = await createCustomer({
      ...input,
      organizationId: orgId,
    });

    res.status(201).json({
      success: true,
      data: customer,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles partial update of an existing customer master profile.
 */
export async function updateCustomerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to update a customer profile",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const id = req.params.id as string;
    const input = updateCustomerSchema.parse(req.body);

    const updated = await updateCustomer(id, input, orgId);

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a customer profile by ID scoped to the active organization.
 */
export async function getCustomerByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to retrieve a customer profile",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const id = req.params.id as string;
    const customer = await getCustomerById({ id, organizationId: orgId });

    if (!customer) {
      throw new NotFoundError("Customer", id);
    }

    res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists customer profiles with search and filtering.
 */
export async function listCustomersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId ?? req.storeContext?.organizationId;
    if (!orgId || typeof orgId !== "string") {
      throw new BadRequestError(
        "Organization context is required to list customer profiles",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const query = listCustomersQuerySchema.parse(req.query);

    const result = await listCustomers({
      ...query,
      organizationId: orgId,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (err) {
    next(err);
  }
}
