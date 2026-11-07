import type { Request, Response, NextFunction } from "express";
import {
  receiveTransferManifestSchema,
  createTransferDisputeSchema,
  resolveTransferDisputeSchema,
  listTransferDisputesQuerySchema,
  NotFoundError,
  UnauthorizedError,
} from "@jewelcore/shared";
import {
  receiveTransferManifest,
  createTransferDispute,
  resolveTransferDispute,
  getTransferDisputeById,
  listTransferDisputes,
} from "@jewelcore/database";

function getAuthContext(req: Request): { orgId: string; userId: string } {
  const orgId = req.user?.orgId;
  const userId = req.user?.userId;
  if (!orgId || !userId) {
    throw new UnauthorizedError("Authentication context missing");
  }
  return { orgId, userId };
}

export async function receiveTransferManifestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId, userId } = getAuthContext(req);
    const input = receiveTransferManifestSchema.parse(req.body);
    const result = await receiveTransferManifest(
      orgId,
      userId,
      req.params.id as string,
      input,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createTransferDisputeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId, userId } = getAuthContext(req);
    const input = createTransferDisputeSchema.parse(req.body);
    const dispute = await createTransferDispute(orgId, userId, input);
    res.status(201).json(dispute);
  } catch (err) {
    next(err);
  }
}

export async function resolveTransferDisputeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId, userId } = getAuthContext(req);
    const input = resolveTransferDisputeSchema.parse(req.body);
    const dispute = await resolveTransferDispute(
      orgId,
      req.params.id as string,
      userId,
      input,
    );
    res.status(200).json(dispute);
  } catch (err) {
    next(err);
  }
}

export async function getTransferDisputeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = getAuthContext(req);
    const dispute = await getTransferDisputeById(
      orgId,
      req.params.id as string,
    );
    if (!dispute) {
      throw new NotFoundError("Transfer dispute not found");
    }
    res.status(200).json(dispute);
  } catch (err) {
    next(err);
  }
}

export async function listTransferDisputesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { orgId } = getAuthContext(req);
    const queryFilters = listTransferDisputesQuerySchema.parse(req.query);
    const result = await listTransferDisputes(orgId, queryFilters);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
