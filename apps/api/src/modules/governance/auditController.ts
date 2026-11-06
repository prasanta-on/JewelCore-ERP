import type { Request, Response, NextFunction } from "express";
import {
  createAuditEventSchema,
  listAuditEventsQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  recordAuditEvent,
  getAuditEventById,
  listAuditEvents,
} from "@jewelcore/database";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Handles capturing an immutable compliance audit event (FEAT-GOV-02, Entity 40 / INV-09).
 */
export async function recordAuditEventHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to record an audit event",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError(
        "User context is required to record an audit event",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      null;

    const validated = createAuditEventSchema.parse({
      ...req.body,
      organizationId: orgId,
      actorUserId: userId,
      actorIpAddress: req.body.actorIpAddress ?? clientIp,
    });

    const event = await recordAuditEvent({
      ...validated,
      organizationId: orgId,
      actorUserId: userId,
    });

    res.status(201).json({
      success: true,
      data: event,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a compliance audit event by ID with tenant boundary isolation.
 */
export async function getAuditEventHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestError("Valid audit event UUID parameter is required");
    }

    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required");
    }

    const event = await getAuditEventById(id, orgId);
    if (!event) {
      throw new NotFoundError(
        `Audit event with ID '${id}' not found`,
        "ERR_NOT_FOUND",
      );
    }

    res.status(200).json({
      success: true,
      data: event,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists compliance audit events matching criteria with filtering, tenant isolation, and pagination.
 */
export async function listAuditEventsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required");
    }

    const validatedQuery = listAuditEventsQuerySchema.parse({
      ...req.query,
      organizationId: orgId,
    });

    const events = await listAuditEvents({
      ...validatedQuery,
      organizationId: orgId,
    });

    res.status(200).json({
      success: true,
      data: events,
      meta: {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        count: events.length,
      },
    });
  } catch (err) {
    next(err);
  }
}
