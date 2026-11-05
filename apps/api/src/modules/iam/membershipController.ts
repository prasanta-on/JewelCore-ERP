import type { Request, Response, NextFunction } from "express";
import {
  createOrganizationMembershipSchema,
  createStoreMembershipSchema,
  assignMembershipRoleSchema,
} from "@jewelcore/shared";
import {
  createOrganizationMembership,
  createStoreMembership,
  assignRoleToStoreMembership,
  getUserAccessibleStores,
} from "@jewelcore/database";

export async function createOrgMembershipHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = createOrganizationMembershipSchema.parse(req.body);
    const membership = await createOrganizationMembership(validated);
    res.status(201).json({
      data: membership,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createStoreMembershipHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = createStoreMembershipSchema.parse(req.body);
    const membership = await createStoreMembership(validated);
    res.status(201).json({
      data: membership,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function assignMembershipRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = assignMembershipRoleSchema.parse(req.body);
    const assignedByUserId = req.user?.userId ?? null;
    const assignment = await assignRoleToStoreMembership({
      ...validated,
      assignedByUserId,
    });
    res.status(201).json({
      data: assignment,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getUserStoresHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawUserId = req.params.userId;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    if (!userId) {
      res.status(400).json({ error: "Missing user ID parameter" });
      return;
    }
    const stores = await getUserAccessibleStores(userId);
    res.status(200).json({
      data: stores,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
