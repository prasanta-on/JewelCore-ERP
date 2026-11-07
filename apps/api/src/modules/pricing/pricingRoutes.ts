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
import {
  createPricingPolicyHandler,
  updatePricingPolicyHandler,
  getPricingPolicyHandler,
  listPricingPoliciesHandler,
  resolvePricingPolicyHandler,
} from "./pricingPolicyController.js";
import {
  createGemstonePriceMatrixHandler,
  updateGemstonePriceMatrixHandler,
  getGemstonePriceMatrixHandler,
  listGemstonePriceMatricesHandler,
  resolveGemstoneRateHandler,
} from "./gemstonePriceMatrixController.js";

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

  // Making Charge Rules & Pricing Policies (Entity 45 - FEAT-PRICE-02)
  router.post(
    "/policies",
    requirePermission("pricing:policy:manage"),
    createPricingPolicyHandler,
  );
  router.get(
    "/policies/resolve",
    requirePermission("pricing:policy:view"),
    resolvePricingPolicyHandler,
  );
  router.get(
    "/policies",
    requirePermission("pricing:policy:view"),
    listPricingPoliciesHandler,
  );
  router.get(
    "/policies/:id",
    requirePermission("pricing:policy:view"),
    getPricingPolicyHandler,
  );
  router.patch(
    "/policies/:id",
    requirePermission("pricing:policy:manage"),
    updatePricingPolicyHandler,
  );

  // Gemstone Valuation Matrices (Entity 46 - FEAT-PRICE-03)
  router.post(
    "/gemstone-matrices",
    requirePermission("pricing:matrix:manage"),
    createGemstonePriceMatrixHandler,
  );
  router.get(
    "/gemstone-matrices/resolve",
    requirePermission("pricing:matrix:view"),
    resolveGemstoneRateHandler,
  );
  router.get(
    "/gemstone-matrices",
    requirePermission("pricing:matrix:view"),
    listGemstonePriceMatricesHandler,
  );
  router.get(
    "/gemstone-matrices/:id",
    requirePermission("pricing:matrix:view"),
    getGemstonePriceMatrixHandler,
  );
  router.patch(
    "/gemstone-matrices/:id",
    requirePermission("pricing:matrix:manage"),
    updateGemstonePriceMatrixHandler,
  );

  return router;
}
