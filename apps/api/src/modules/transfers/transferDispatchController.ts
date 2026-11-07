import type { Request, Response, NextFunction } from "express";
import {
  createTransferManifestSchema,
  listTransferManifestsQuerySchema,
  NotFoundError,
  UnauthorizedError,
} from "@jewelcore/shared";
import {
  dispatchTransferOrder,
  getTransferManifestById,
  listTransferManifests,
} from "@jewelcore/database";

function getAuthContext(req: Request): { orgId: string; userId: string } {
  const orgId = req.user?.orgId;
  const userId = req.user?.userId;
  if (!orgId || !userId) {
    throw new UnauthorizedError("Authentication context missing");
  }
  return { orgId, userId };
}

export async function dispatchTransferOrderHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId, userId } = getAuthContext(req);
    const input = createTransferManifestSchema.parse(req.body);
    const manifest = await dispatchTransferOrder(orgId, userId, input);
    res.status(201).json(manifest);
  } catch (err) {
    next(err);
  }
}

export async function getTransferManifestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = getAuthContext(req);
    const manifest = await getTransferManifestById(orgId, req.params.id as string);
    if (!manifest) {
      throw new NotFoundError("Transfer manifest not found");
    }
    res.status(200).json(manifest);
  } catch (err) {
    next(err);
  }
}

export async function listTransferManifestsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = getAuthContext(req);
    const queryFilters = listTransferManifestsQuerySchema.parse(req.query);
    const result = await listTransferManifests(orgId, queryFilters);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
