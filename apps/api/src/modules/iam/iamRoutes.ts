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
  registerHandler,
  loginHandler,
  meHandler,
} from "./authController.js";

export function createIamRouter(): Router {
  const router = Router();

  // Authentication & User endpoints (FEAT-IAM-02)
  router.post("/auth/register", registerHandler);
  router.post("/auth/login", loginHandler);
  router.get("/auth/me", meHandler);

  // Organization endpoints (FEAT-IAM-01)
  router.post("/organizations", createOrganizationHandler);
  router.get("/organizations", listOrganizationsHandler);
  router.get("/organizations/:id", getOrganizationHandler);

  // Store endpoints (FEAT-IAM-01)
  router.post("/stores", createStoreHandler);
  router.get("/stores", listStoresHandler);
  router.get("/stores/:id", getStoreHandler);

  return router;
}

