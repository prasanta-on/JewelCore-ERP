import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../common/authMiddleware.js";
import { storeContextMiddleware } from "../../common/storeContextMiddleware.js";
import {
  createCustomerHandler,
  updateCustomerHandler,
  getCustomerByIdHandler,
  listCustomersHandler,
} from "./customerController.js";
import {
  createSalesInvoiceHandler,
  getSalesInvoiceByIdHandler,
  listSalesInvoicesHandler,
  cancelSalesInvoiceHandler,
  finalizeSaleAndReleaseHandler,
} from "./salesInvoiceController.js";
import {
  recordSalesPaymentHandler,
  getSalesPaymentByIdHandler,
  listSalesPaymentsHandler,
} from "./salesPaymentController.js";
import {
  createSalesReturnHandler,
  getSalesReturnByIdHandler,
  listSalesReturnsHandler,
} from "./salesReturnController.js";
import {
  createGoldBuybackOrderHandler,
  settleGoldBuybackOrderHandler,
  getGoldBuybackOrderByIdHandler,
  listGoldBuybackOrdersHandler,
} from "./goldBuybackController.js";

/**
 * Express router for Point of Sale, Invoicing, Customers and Settlement (FEAT-SALES).
 */
export function createSalesRouter(): Router {
  const router = Router();

  // All sales endpoints require authentication
  router.use(authenticate);

  // Store-context scoping & multi-store isolation (INV-11)
  router.use(storeContextMiddleware);

  // 1. Customer Master & KYC Profiles (Entity 48 - FEAT-SALES-01)
  router.post(
    "/customers",
    requirePermission("customers:create"),
    createCustomerHandler,
  );
  router.get(
    "/customers",
    requirePermission("customers:view"),
    listCustomersHandler,
  );
  router.get(
    "/customers/:id",
    requirePermission("customers:view"),
    getCustomerByIdHandler,
  );
  router.patch(
    "/customers/:id",
    requirePermission("customers:update"),
    updateCustomerHandler,
  );

  // 2. Sales Invoices & Line Items (Entities 49 & 50 - FEAT-SALES-02)
  router.post(
    "/invoices",
    requirePermission("sales:invoice:create"),
    createSalesInvoiceHandler,
  );
  router.get(
    "/invoices",
    requirePermission("sales:invoice:view"),
    listSalesInvoicesHandler,
  );
  router.get(
    "/invoices/:id",
    requirePermission("sales:invoice:view"),
    getSalesInvoiceByIdHandler,
  );
  router.post(
    "/invoices/:id/cancel",
    requirePermission("sales:invoice:cancel"),
    cancelSalesInvoiceHandler,
  );
  router.post(
    "/invoices/:id/finalize-release",
    requirePermission("sales:custody:release"),
    finalizeSaleAndReleaseHandler,
  );

  // 3. Multi-Mode Payments & Split Tender (Entity 51 - FEAT-SALES-03)
  router.post(
    "/payments",
    requirePermission("sales:payment:record"),
    recordSalesPaymentHandler,
  );
  router.get(
    "/payments",
    requirePermission("sales:payment:view"),
    listSalesPaymentsHandler,
  );
  router.get(
    "/payments/:id",
    requirePermission("sales:payment:view"),
    getSalesPaymentByIdHandler,
  );

  // 4. Customer Sales Returns & Restocking Engine (Entities 52 & 53 - FEAT-RET-01)
  router.post(
    "/returns",
    requirePermission("sales:return:create"),
    createSalesReturnHandler,
  );
  router.get(
    "/returns",
    requirePermission("sales:return:view"),
    listSalesReturnsHandler,
  );
  router.get(
    "/returns/:id",
    requirePermission("sales:return:view"),
    getSalesReturnByIdHandler,
  );

  // 5. Old Gold & Scrap Buyback Engine (Entities 54 & 55 - FEAT-RET-02)
  router.post(
    "/buybacks",
    requirePermission("buyback:order:create"),
    createGoldBuybackOrderHandler,
  );
  router.post(
    "/buybacks/:id/settle",
    requirePermission("buyback:order:settle"),
    settleGoldBuybackOrderHandler,
  );
  router.get(
    "/buybacks",
    requirePermission("buyback:order:view"),
    listGoldBuybackOrdersHandler,
  );
  router.get(
    "/buybacks/:id",
    requirePermission("buyback:order:view"),
    getGoldBuybackOrderByIdHandler,
  );

  return router;
}
