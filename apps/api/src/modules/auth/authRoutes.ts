import { Router } from "express";
import {
  registerHandler,
  loginHandler,
  meHandler,
} from "./authController.js";

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/register", registerHandler);
  router.post("/login", loginHandler);
  router.get("/me", meHandler);

  return router;
}
