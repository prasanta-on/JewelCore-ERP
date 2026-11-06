import type { Request, Response, NextFunction } from "express";
import {
  createRfidTagSchema,
  updateRfidTagStatusSchema,
  listRfidTagsQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  createRfidTag,
  getRfidTagById,
  getRfidTagByEpc,
  updateRfidTagStatus,
  listRfidTags,
} from "@jewelcore/database";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Handles registration of a new physical RFID transponder tag (FEAT-RFID-01, Entity 35).
 *
 * Enforces:
 * - rfid:write permission
 * - Multi-tenant organization scoping
 * - Global unique EPC per organization (409 Conflict)
 */
export async function createRfidTagHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to register an RFID tag",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const validated = createRfidTagSchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const tag = await createRfidTag(
      {
        ...validated,
        organizationId: orgId,
      },
      { userId: req.user?.userId },
    );

    res.status(201).json(tag);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves an RFID tag by primary key ID or by EPC string.
 *
 * Enforces:
 * - rfid:view permission
 * - Multi-tenant organization scoping
 */
export async function getRfidTagHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("RFID tag ID or EPC parameter is required");
    }

    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to access RFID tag records",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    let tag = null;
    if (UUID_REGEX.test(id)) {
      const byId = await getRfidTagById(id);
      if (byId && byId.organizationId === orgId) {
        tag = byId;
      }
    }

    if (!tag) {
      // Fallback to EPC lookup within tenant
      tag = await getRfidTagByEpc(orgId, id);
    }

    if (!tag) {
      throw new NotFoundError(
        `RFID tag with ID or EPC '${id}' not found`,
        "ERR_RFID_TAG_NOT_FOUND",
      );
    }

    res.status(200).json(tag);
  } catch (err) {
    next(err);
  }
}

/**
 * Updates the lifecycle status of an RFID tag (e.g. UNENCODED -> ACTIVE, ACTIVE -> RETIRED).
 *
 * Enforces:
 * - rfid:write permission
 * - Multi-tenant organization scoping
 * - State machine validation (terminal states RETIRED/DAMAGED cannot transition, no-op transitions rejected)
 */
export async function updateRfidTagStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("RFID tag ID parameter is required");
    }

    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to update RFID tag status",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const existing = await getRfidTagById(id);
    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundError(
        `RFID tag with ID '${id}' not found`,
        "ERR_RFID_TAG_NOT_FOUND",
      );
    }

    const input = updateRfidTagStatusSchema.parse(req.body);
    const updatedTag = await updateRfidTagStatus(id, input, {
      userId: req.user?.userId,
    });

    res.status(200).json(updatedTag);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists RFID tags matching query filters and pagination.
 *
 * Enforces:
 * - rfid:view permission
 * - Multi-tenant organization scoping
 */
export async function listRfidTagsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to list RFID tags",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const query = listRfidTagsQuerySchema.parse({
      ...req.query,
      organizationId: orgId,
    });

    const tags = await listRfidTags(query);
    res.status(200).json(tags);
  } catch (err) {
    next(err);
  }
}
