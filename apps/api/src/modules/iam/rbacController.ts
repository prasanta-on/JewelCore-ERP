import type { Request, Response, NextFunction } from "express";
import {
  createRoleSchema,
  ConflictError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  listPermissions,
  createRole,
  getRoleById,
  getRoleByCode,
  listRoles,
  assignRoleToUser,
  getUserById,
  getUserRoles,
} from "@jewelcore/database";

export async function listPermissionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const moduleFilter = req.query.module as string | undefined;
    const permissions = await listPermissions(moduleFilter);
    res.status(200).json({
      data: permissions,
      total: permissions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = createRoleSchema.parse(req.body);

    // Check code collision
    const existing = await getRoleByCode(validated.code, validated.organizationId);
    if (existing) {
      throw new ConflictError(
        `Role with code '${validated.code}' already exists`,
        "ERR_DUPLICATE_ROLE_CODE",
      );
    }

    const role = await createRole({
      organizationId: validated.organizationId,
      code: validated.code,
      name: validated.name,
      scopeLevel: validated.scopeLevel,
      permissionCodes: validated.permissionCodes,
    });

    res.status(201).json({
      data: role,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function listRolesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = req.query.organizationId as string | undefined;
    const roles = await listRoles(organizationId);
    res.status(200).json({
      data: roles,
      total: roles.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const role = await getRoleById(req.params.id as string);
    if (!role) {
      throw new NotFoundError("Role", req.params.id as string);
    }
    res.status(200).json({
      data: role,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function assignUserRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.params.id as string;
    const { roleId } = req.body;

    const user = await getUserById(userId);
    if (!user) {
      throw new NotFoundError("User", userId);
    }

    const role = await getRoleById(roleId);
    if (!role) {
      throw new NotFoundError("Role", roleId);
    }

    await assignRoleToUser(userId, roleId);
    const updatedRoles = await getUserRoles(userId);

    res.status(200).json({
      data: {
        userId,
        roles: updatedRoles,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
