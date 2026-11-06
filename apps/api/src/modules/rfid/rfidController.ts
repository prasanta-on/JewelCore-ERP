import type { Request, Response, NextFunction } from "express";
import {
  createRfidTagSchema,
  updateRfidTagStatusSchema,
  listRfidTagsQuerySchema,
  createRfidAssignmentSchema,
  retireRfidAssignmentSchema,
  listRfidAssignmentsQuerySchema,
  createRfidJobSchema,
  listRfidJobsQuerySchema,
  BadRequestError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  createRfidTag,
  getRfidTagById,
  getRfidTagByEpc,
  updateRfidTagStatus,
  listRfidTags,
  assignRfidTag,
  retireRfidTagAssignment,
  getActiveAssignmentByItemId,
  getRfidAssignmentById,
  listRfidAssignments,
  createRfidJob,
  getRfidJobById,
  listRfidJobItems,
  listRfidJobs,
} from "@jewelcore/database";
import {
  executeRfidJobWorker,
  SimulatedRfidPrinterAdapter,
} from "./rfidPrinterAdapter.js";

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

/**
 * Handles binding an active RFID tag to a serialized physical inventory piece (Entity 36 - FEAT-RFID-02).
 *
 * Enforces:
 * - rfid:write permission
 * - Multi-tenant organization scoping
 * - INV-03: Single active tag per piece (409 Conflict)
 * - INV-04: Single active piece per tag transponder (409 Conflict)
 */
export async function createRfidAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to bind an RFID tag",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError(
        "User context is required to bind an RFID tag",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const validated = createRfidAssignmentSchema.parse({
      ...req.body,
      organizationId: orgId,
    });

    const assignment = await assignRfidTag(
      {
        ...validated,
        organizationId: orgId,
      },
      { userId },
    );

    res.status(201).json(assignment);
  } catch (err) {
    next(err);
  }
}

/**
 * Handles retiring or detaching an active RFID tag assignment (Entity 36 - FEAT-RFID-02 / INV-07).
 *
 * Enforces:
 * - rfid:write permission
 * - Multi-tenant organization scoping
 * - INV-07: Commercial availability reversion (drops AVAILABLE_FOR_SALE to UNREADY)
 */
export async function retireRfidAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Assignment ID parameter is required");
    }

    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to retire an RFID tag assignment",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError(
        "User context is required to retire an RFID tag assignment",
        "ERR_MISSING_USER_CONTEXT",
      );
    }

    const input = retireRfidAssignmentSchema.parse(req.body);
    const retired = await retireRfidTagAssignment(id, input, orgId, { userId });

    res.status(200).json(retired);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves an RFID tag assignment by ID.
 *
 * Enforces:
 * - rfid:view permission
 * - Multi-tenant organization scoping
 */
export async function getRfidAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Assignment ID parameter is required");
    }

    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to access RFID tag assignments",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const assignment = await getRfidAssignmentById(id, orgId);
    if (!assignment) {
      throw new NotFoundError(
        `RFID tag assignment with ID '${id}' not found`,
        "ERR_RFID_ASSIGNMENT_NOT_FOUND",
      );
    }

    res.status(200).json(assignment);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists RFID tag assignments matching query filters and pagination.
 *
 * Enforces:
 * - rfid:view permission
 * - Multi-tenant organization scoping
 */
export async function listRfidAssignmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to list RFID tag assignments",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const query = listRfidAssignmentsQuerySchema.parse({
      ...req.query,
      organizationId: orgId,
    });

    const assignments = await listRfidAssignments(query);
    res.status(200).json(assignments);
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the currently active RFID tag assignment for a given serialized inventory piece (INV-03).
 *
 * Enforces:
 * - rfid:view permission
 * - Multi-tenant organization scoping
 */
export async function getActiveItemAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const itemId = Array.isArray(req.params.itemId)
      ? req.params.itemId[0]
      : req.params.itemId;
    if (!itemId) {
      throw new BadRequestError("Inventory item ID parameter is required");
    }

    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to access item RFID assignments",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const assignment = await getActiveAssignmentByItemId(itemId, orgId);
    if (!assignment) {
      throw new NotFoundError(
        `No active RFID tag assignment found for inventory item '${itemId}'`,
        "ERR_ACTIVE_TAG_NOT_FOUND",
      );
    }

    res.status(200).json(assignment);
  } catch (err) {
    next(err);
  }
}

/**
 * Dispatches a batch RFID print & encoding job (FEAT-RFID-03, Entities 37 & 38).
 *
 * Enforces:
 * - rfid:encode permission
 * - Multi-tenant organization scoping
 * - Active store context resolution
 * - Transactional outbox event insertion
 */
export async function createRfidJobHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.body.organizationId ?? req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to create an RFID print job",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    const storeId =
      req.body.storeId ??
      req.storeContext?.storeId ??
      (req.headers["x-store-id"] as string | undefined);

    if (!storeId) {
      throw new BadRequestError(
        "Store context is required to create an RFID print job",
        "ERR_MISSING_STORE_CONTEXT",
      );
    }

    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError("User authentication context is required");
    }

    const validated = createRfidJobSchema.parse({
      ...req.body,
      organizationId: orgId,
      storeId,
    });

    const result = await createRfidJob(
      {
        ...validated,
        organizationId: orgId,
        storeId,
      },
      { userId },
    );

    res.status(201).json({
      success: true,
      data: {
        ...result.job,
        items: result.items,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves an RFID batch job by ID.
 */
export async function getRfidJobHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestError("Valid RFID job UUID parameter is required");
    }

    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required");
    }

    const job = await getRfidJobById(id, orgId);
    if (!job) {
      throw new NotFoundError(
        `RFID print job with ID '${id}' not found`,
        "ERR_NOT_FOUND",
      );
    }

    res.status(200).json({
      success: true,
      data: job,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists all items belonging to an RFID batch job.
 */
export async function listRfidJobItemsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestError("Valid RFID job UUID parameter is required");
    }

    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required");
    }

    const job = await getRfidJobById(id, orgId);
    if (!job) {
      throw new NotFoundError(
        `RFID print job with ID '${id}' not found`,
        "ERR_NOT_FOUND",
      );
    }

    const items = await listRfidJobItems(id);

    res.status(200).json({
      success: true,
      data: items,
      meta: { count: items.length },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists RFID batch jobs with filtering and pagination.
 */
export async function listRfidJobsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required");
    }

    const validatedQuery = listRfidJobsQuerySchema.parse({
      ...req.query,
      organizationId: orgId,
    });

    const jobs = await listRfidJobs(validatedQuery);

    res.status(200).json({
      success: true,
      data: jobs,
      meta: {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        count: jobs.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Triggers synchronous or worker execution for a queued RFID batch job (FEAT-RFID-03).
 */
export async function processRfidJobHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestError("Valid RFID job UUID parameter is required");
    }

    const orgId = req.user?.orgId;
    if (!orgId) {
      throw new BadRequestError("Organization context is required");
    }

    let printerAdapter: SimulatedRfidPrinterAdapter | undefined;
    if (typeof req.body?.simulateFailures === "number") {
      printerAdapter = new SimulatedRfidPrinterAdapter();
      printerAdapter.simulateTransientFailures(
        req.body.simulateFailures,
        req.body.errorMessage,
      );
    }

    const job = await executeRfidJobWorker(id, orgId, {
      userId: req.user?.userId,
      printerAdapter,
      baseBackoffMs: 2,
    });

    res.status(200).json({
      success: true,
      data: job,
    });
  } catch (err) {
    next(err);
  }
}
