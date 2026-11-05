import { Router } from "express";
import {
  createOrganizationHandler,
  getOrganizationHandler,
  listOrganizationsHandler,
  createStoreHandler,
  getStoreHandler,
  listStoresHandler,
} from "./iamController.js";
import {
  listPermissionsHandler,
  createRoleHandler,
  listRolesHandler,
  getRoleHandler,
  assignUserRoleHandler,
} from "./rbacController.js";

export function createIamRouter(): Router {
  const router = Router();

  // Organization administrative endpoints
  router.post("/organizations", createOrganizationHandler);
  router.get("/organizations", listOrganizationsHandler);
  router.get("/organizations/:id", getOrganizationHandler);

  // Store branch administrative endpoints
  router.post("/stores", createStoreHandler);
  router.get("/stores", listStoresHandler);
  router.get("/stores/:id", getStoreHandler);

  // RBAC Roles & Permissions endpoints (FEAT-IAM-03)
  router.get("/permissions", listPermissionsHandler);
  router.post("/roles", createRoleHandler);
  router.get("/roles", listRolesHandler);
  router.get("/roles/:id", getRoleHandler);
  router.post("/users/:id/roles", assignUserRoleHandler);

  return router;
}

