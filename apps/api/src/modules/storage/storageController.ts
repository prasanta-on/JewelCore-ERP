import type { Request, Response, NextFunction } from "express";
import {
  createVaultSchema,
  createLockerSchema,
  createCompartmentSchema,
  NotFoundError,
  BadRequestError,
} from "@jewelcore/shared";
import {
  createVault,
  getVaultById,
  listVaultsByStore,
  createLocker,
  getLockerById,
  createCompartment,
  getCompartmentById,
  getStorageHierarchy,
} from "@jewelcore/database";

export async function createVaultHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const storeId = req.storeContext?.storeId ?? req.body.storeId;
    if (!storeId) {
      throw new BadRequestError("Store context or storeId is required", "ERR_MISSING_STORE_CONTEXT");
    }

    const validated = createVaultSchema.parse({
      ...req.body,
      storeId,
    });

    const vault = await createVault(validated);
    res.status(201).json({
      data: vault,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listVaultsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const storeId = req.storeContext?.storeId;
    if (!storeId) {
      throw new BadRequestError("Store context is required", "ERR_MISSING_STORE_CONTEXT");
    }

    const vaults = await listVaultsByStore(storeId);
    res.status(200).json({
      data: vaults,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getVaultHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Vault ID is required", "ERR_INVALID_ID");
    }

    const vault = await getVaultById(id);
    if (!vault) {
      throw new NotFoundError("Vault", id);
    }

    res.status(200).json({
      data: vault,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createLockerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const storeId = req.body.storeId ?? req.storeContext?.storeId;
    if (!storeId) {
      throw new BadRequestError("Store context or storeId is required", "ERR_MISSING_STORE_CONTEXT");
    }

    const validated = createLockerSchema.parse({
      ...req.body,
      storeId,
    });

    const locker = await createLocker(validated);
    res.status(201).json({
      data: locker,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getLockerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Locker ID is required", "ERR_INVALID_ID");
    }

    const locker = await getLockerById(id);
    if (!locker) {
      throw new NotFoundError("Locker", id);
    }

    res.status(200).json({
      data: locker,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createCompartmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const storeId = req.body.storeId ?? req.storeContext?.storeId;
    if (!storeId) {
      throw new BadRequestError("Store context or storeId is required", "ERR_MISSING_STORE_CONTEXT");
    }

    const validated = createCompartmentSchema.parse({
      ...req.body,
      storeId,
    });

    const comp = await createCompartment(validated);
    res.status(201).json({
      data: comp,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getCompartmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      throw new BadRequestError("Compartment ID is required", "ERR_INVALID_ID");
    }

    const comp = await getCompartmentById(id);
    if (!comp) {
      throw new NotFoundError("Compartment", id);
    }

    res.status(200).json({
      data: comp,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getHierarchyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const storeId = req.storeContext?.storeId;
    if (!storeId) {
      throw new BadRequestError("Store context is required", "ERR_MISSING_STORE_CONTEXT");
    }

    // Support simulated occupancy query for directory visualizer testing
    let occupancyMap: Map<string, number> | undefined;
    if (req.query.simulateOccupancy && typeof req.query.simulateOccupancy === "string") {
      try {
        const parsed = JSON.parse(req.query.simulateOccupancy);
        if (typeof parsed === "object" && parsed !== null) {
          occupancyMap = new Map(Object.entries(parsed).map(([k, v]) => [k, Number(v)]));
        }
      } catch {
        // ignore invalid JSON format in query parameter
      }
    }

    const hierarchy = await getStorageHierarchy(storeId, undefined, occupancyMap);
    res.status(200).json({
      data: hierarchy,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
