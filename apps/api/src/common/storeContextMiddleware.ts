import type { Request, Response, NextFunction } from "express";
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
  type StoreContext,
} from "@jewelcore/shared";
import {
  getUserStoreMembership,
  getUserDefaultStoreMembership,
} from "@jewelcore/database";

declare global {
  namespace Express {
    interface Request {
      storeContext?: StoreContext;
    }
  }
}

export interface StoreContextOptions {
  /**
   * If true, falls back to the user's default store membership when x-store-id header is absent.
   * Default: true.
   */
  allowDefaultFallback?: boolean;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Express middleware enforcing Invariant INV-11 (Store-Context Scoping & Multi-Store Isolation).
 *
 * Scopes incoming requests to a specific physical store branch via the `x-store-id` header
 * (or fallback to user's default store). Rejects cross-store access attempts with 403 ERR_STORE_ACCESS_DENIED.
 */
export function requireStoreContext(options: StoreContextOptions = { allowDefaultFallback: true }) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required before store context evaluation");
      }

      const rawStoreId = req.headers["x-store-id"];
      let targetStoreId: string | undefined;

      if (rawStoreId) {
        const storeIdStr = Array.isArray(rawStoreId) ? rawStoreId[0] : rawStoreId;
        if (!storeIdStr || !UUID_REGEX.test(storeIdStr)) {
          throw new BadRequestError("Invalid 'x-store-id' header format; valid UUID expected", "ERR_INVALID_STORE_ID");
        }
        targetStoreId = storeIdStr;
      }

      if (targetStoreId) {
        // Explicit store requested: verify active membership
        const membership = await getUserStoreMembership(req.user.userId, targetStoreId);
        if (!membership || !membership.isActive) {
          throw new ForbiddenError(
            "Access to the requested store context is denied",
            "ERR_STORE_ACCESS_DENIED",
          );
        }

        req.storeContext = {
          storeId: membership.storeId,
          organizationId: membership.organizationId,
          organizationMembershipId: membership.organizationMembershipId,
          storeMembershipId: membership.id,
          isDefault: membership.isDefault,
        };
        return next();
      }

      // No header provided: check fallback option
      if (options.allowDefaultFallback) {
        const organizationId = req.user.orgId as string | undefined;
        const defaultMembership = await getUserDefaultStoreMembership(
          req.user.userId,
          organizationId,
        );

        if (defaultMembership && defaultMembership.isActive) {
          req.storeContext = {
            storeId: defaultMembership.storeId,
            organizationId: defaultMembership.organizationId,
            organizationMembershipId: defaultMembership.organizationMembershipId,
            storeMembershipId: defaultMembership.id,
            isDefault: defaultMembership.isDefault,
          };
          return next();
        }
      }

      // Neither valid header nor default store available
      throw new BadRequestError(
        "Missing required 'x-store-id' header and no default store membership found",
        "ERR_MISSING_STORE_CONTEXT",
      );
    } catch (err) {
      next(err);
    }
  };
}
