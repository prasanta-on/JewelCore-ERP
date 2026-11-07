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
} from "./salesInvoiceController.js";

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

  return router;
}
