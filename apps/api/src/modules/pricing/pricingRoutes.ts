import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import { storeContextMiddleware } from "../../common/storeContextMiddleware.js";
import {
  recordDailyMarketRateHandler,
  getLatestEffectiveRateHandler,
  getDailyMarketRateHandler,
  listDailyMarketRatesHandler,
} from "./pricingRateController.js";

export function createPricingRouter(): Router {
  const router = Router();

  // All pricing endpoints require authentication
  router.use(authenticate);

  // Store-context scoping & multi-store isolation (INV-11)
  router.use(storeContextMiddleware);

  // Precious Metal Market Spot Rates (Entity 44 - FEAT-PRICE-01)
  router.post(
    "/rates",
    requirePermission("pricing:rate:create"),
    recordDailyMarketRateHandler,
  );
  router.get(
    "/rates/latest",
    requirePermission("pricing:rate:view"),
    getLatestEffectiveRateHandler,
  );
  router.get(
    "/rates",
    requirePermission("pricing:rate:view"),
    listDailyMarketRatesHandler,
  );
  router.get(
    "/rates/:id",
    requirePermission("pricing:rate:view"),
    getDailyMarketRateHandler,
  );

  return router;
}
