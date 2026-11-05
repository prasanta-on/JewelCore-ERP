import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "@jewelcore/shared";
import { verifyJwt, type TokenClaims } from "../modules/auth/authUtils.js";
import { getUserPermissionCodes, getUserRoles } from "@jewelcore/database";

declare global {
  namespace Express {
    interface Request {
      user?: TokenClaims;
      permissions?: string[];
    }
  }
}

/**
 * Express middleware ensuring a valid Bearer JWT is supplied.
 * Attaches decoded user claims to req.user.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authorization header with Bearer token is required");
    }

    const token = authHeader.substring(7);
    const claims = await verifyJwt(token);
    req.user = claims;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError("Invalid or expired authentication token"));
    }
  }
}

/**
 * Express middleware requiring the authenticated user to possess a specific domain permission code.
 *
 * If the user has the 'SYSTEM_ADMIN' role or the explicit permission code, access is granted.
 * Otherwise, rejects with 403 Forbidden and code 'ERR_INSUFFICIENT_PERMISSIONS'.
 */
export function requirePermission(permissionCode: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required before permission evaluation");
      }

      // Check if user has SYSTEM_ADMIN role
      const userRoles = await getUserRoles(req.user.userId);
      const isSystemAdmin = userRoles.some((r) => r.code === "SYSTEM_ADMIN");
      if (isSystemAdmin) {
        return next();
      }

      // Fetch active permissions
      const permissions = await getUserPermissionCodes(req.user.userId);
      req.permissions = permissions;

      if (!permissions.includes(permissionCode)) {
        throw new ForbiddenError(
          `User lacks the required permission '${permissionCode}' to perform this action`,
          "ERR_INSUFFICIENT_PERMISSIONS",
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
