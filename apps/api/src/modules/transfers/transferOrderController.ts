import type { Request, Response, NextFunction } from "express";
import {
  createTransferOrderSchema,
  addTransferOrderItemSchema,
  rejectTransferOrderSchema,
  cancelTransferOrderSchema,
  listTransferOrdersQuerySchema,
  NotFoundError,
  UnauthorizedError,
} from "@jewelcore/shared";
import {
  createTransferOrder,
  addTransferOrderItem,
  removeTransferOrderItem,
  submitTransferOrder,
  approveTransferOrder,
  rejectTransferOrder,
  cancelTransferOrder,
  getTransferOrderById,
  listTransferOrders,
} from "@jewelcore/database";

function getAuthContext(req: Request): { orgId: string; userId: string } {
  const orgId = req.user?.orgId;
  const userId = req.user?.userId;
  if (!orgId || !userId) {
    throw new UnauthorizedError("Authentication context missing");
  }
  return { orgId, userId };
}

export async function createTransferOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId, userId } = getAuthContext(req);
    const input = createTransferOrderSchema.parse(req.body);
    const order = await createTransferOrder(orgId, userId, input);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

export async function addTransferOrderItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = getAuthContext(req);
    const input = addTransferOrderItemSchema.parse(req.body);
    const item = await addTransferOrderItem(orgId, req.params.id as string, input);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

export async function removeTransferOrderItemHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = getAuthContext(req);
    await removeTransferOrderItem(orgId, req.params.id as string, req.params.itemId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function submitTransferOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId, userId } = getAuthContext(req);
    const order = await submitTransferOrder(orgId, req.params.id as string, userId);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

export async function approveTransferOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId, userId } = getAuthContext(req);
    const order = await approveTransferOrder(orgId, req.params.id as string, userId);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

export async function rejectTransferOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId, userId } = getAuthContext(req);
    const input = rejectTransferOrderSchema.parse(req.body);
    const order = await rejectTransferOrder(orgId, req.params.id as string, userId, input);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

export async function cancelTransferOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId, userId } = getAuthContext(req);
    const input = cancelTransferOrderSchema.parse(req.body || {});
    const order = await cancelTransferOrder(orgId, req.params.id as string, userId, input.reason);
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

export async function getTransferOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = getAuthContext(req);
    const order = await getTransferOrderById(orgId, req.params.id as string);
    if (!order) {
      throw new NotFoundError("Transfer order not found");
    }
    res.status(200).json(order);
  } catch (err) {
    next(err);
  }
}

export async function listTransferOrdersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = getAuthContext(req);
    const queryFilters = listTransferOrdersQuerySchema.parse(req.query);
    const result = await listTransferOrders(orgId, queryFilters);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
