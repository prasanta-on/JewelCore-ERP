import type { Request, Response, NextFunction } from "express";
import {
  createOrganizationSchema,
  createStoreSchema,
} from "@jewelcore/shared";
import {
  createOrganizationService,
  getOrganizationService,
  listOrganizationsService,
  createStoreService,
  getStoreService,
  listStoresService,
} from "./iamService.js";

export async function createOrganizationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = createOrganizationSchema.parse(req.body);
    const organization = await createOrganizationService(validated);
    res.status(201).json({
      data: organization,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getOrganizationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organization = await getOrganizationService(req.params.id as string);
    res.status(200).json({
      data: organization,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listOrganizationsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizations = await listOrganizationsService();
    res.status(200).json({
      data: organizations,
      total: organizations.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createStoreHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = createStoreSchema.parse(req.body);
    const store = await createStoreService(validated);
    res.status(201).json({
      data: store,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getStoreHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const store = await getStoreService(req.params.id as string);
    res.status(200).json({
      data: store,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listStoresHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = req.query.organizationId as string | undefined;
    const stores = await listStoresService(organizationId);
    res.status(200).json({
      data: stores,
      total: stores.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
