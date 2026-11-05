import { Router } from "express";
import {
  createOrganizationHandler,
  getOrganizationHandler,
  listOrganizationsHandler,
  createStoreHandler,
  getStoreHandler,
  listStoresHandler,
} from "./iamController.js";

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

  return router;
}
