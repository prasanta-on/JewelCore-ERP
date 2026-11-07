import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createCategory,
  createMaterial,
  createPurity,
  createProduct,
  createProductSku,
  createSupplier,
  createCustomer,
  createSalesInvoice,
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Sales Payments API (FEAT-SALES-03, Entity 51)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;

  let managerToken: string;
  let managerUserId: string;
  let qcInspectorToken: string;
  let qcInspectorUserId: string;
  let otherOrgManagerToken: string;

  let customerId: string;
  let pieceId: string;
  let invoiceId: string;

  let firstPaymentId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE sales_payments DISABLE TRIGGER trg_sales_payments_immutability;",
    );
    await query(
      "DELETE FROM sales_payments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_API', 'ORG_PAY_API_ALT'));",
    );
    await query(
      "ALTER TABLE sales_payments ENABLE TRIGGER trg_sales_payments_immutability;",
    );

    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_API', 'ORG_PAY_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_API', 'ORG_PAY_API_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_API', 'ORG_PAY_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_API', 'ORG_PAY_API_ALT'));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PAY-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PAY-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PAY-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-PAY-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-PAY-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_PAY_API_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-PAY-API-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_PAY_API_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_PAY_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_PAY_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_PAY_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_PAY_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_API', 'ORG_PAY_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'pay_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'pay_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_PAY_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_PAY_API', 'ORG_PAY_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_PAY_API",
      name: "High Jewellery POS Settlement Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_PAY_API_ALT",
      name: "Alternative Luxury Group",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_PAY_API_01",
      name: "Fifth Avenue Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_PAY_API_ALT",
      name: "Madison Avenue Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    // Manager User
    const managerUser = await createUser({
      organizationId: orgId,
      email: "pay_api_mgr@jewelcore.local",
      firstName: "Jean-Paul",
      lastName: "Sartre",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    managerUserId = managerUser.id;

    const mgrOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: managerUserId,
      isDefault: true,
    });

    await createStoreMembership({
      storeId,
      organizationMembershipId: mgrOrgMem.id,
      isDefault: true,
    });

    const storeManagerRole = await getRoleByCode("STORE_MANAGER");
    if (storeManagerRole) {
      await assignRoleToUser(managerUserId, storeManagerRole.id);
    }

    managerToken = await signAccessToken({
      userId: managerUserId,
      email: managerUser.email,
      orgId,
    });

    // QC Inspector (no sales:payment:record permission)
    const qcUser = await createUser({
      organizationId: orgId,
      email: "pay_api_qc@jewelcore.local",
      firstName: "Albert",
      lastName: "Camus",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });
    qcInspectorUserId = qcUser.id;

    const qcOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: qcInspectorUserId,
      isDefault: true,
    });

    await createStoreMembership({
      storeId,
      organizationMembershipId: qcOrgMem.id,
      isDefault: true,
    });

    const qcRole = await getRoleByCode("QC_INSPECTOR");
    if (qcRole) {
      await assignRoleToUser(qcInspectorUserId, qcRole.id);
    }

    qcInspectorToken = await signAccessToken({
      userId: qcInspectorUserId,
      email: qcUser.email,
      orgId,
    });

    // Other Org Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "pay_api_alt_mgr@jewelcore.local",
      firstName: "Simone",
      lastName: "Beauvoir",
      passwordHash: "argon2id_mock_hash",
      isActive: true,
    });

    const altMgrOrgMem = await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: altManagerUser.id,
      isDefault: true,
    });

    await createStoreMembership({
      storeId: altStore.id,
      organizationMembershipId: altMgrOrgMem.id,
      isDefault: true,
    });

    if (storeManagerRole) {
      await assignRoleToUser(altManagerUser.id, storeManagerRole.id);
    }

    otherOrgManagerToken = await signAccessToken({
      userId: altManagerUser.id,
      email: altManagerUser.email,
      orgId: otherOrgId,
    });

    // Master Data & Serialized Piece
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_PAY_API_EAR",
      name: "Diamond Earrings",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_PAY_API_RG",
      name: "Rose Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_PAY_API_18K",
      name: "18K Rose Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_PAY_API_DRP",
      name: "Cascade Drop Earrings",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-PAY-API-DROP",
      variantName: "18K Cascade Earrings",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 8.0,
      targetMetalWeightGrams: 7.5,
      trackingType: "SERIALIZED",
    });

    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_PAY_API_01",
      name: "Atelier Cartier BV",
      currency: "CAD",
      paymentTermsDays: 30,
    });

    const grnRes = await query<{ id: string }>(
      `
      INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
      VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-PAY-API-001', 'RECEIVED', $4)
      RETURNING id
      `,
      [orgId, storeId, sup.id, managerUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `
      INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
      VALUES (gen_random_uuid(), $1, 'SHIP-PAY-API-001', 'FEDEX', 'FX-PAY-01', 'RECEIVED', $2)
      RETURNING id
      `,
      [grnId, managerUserId],
    );
    const shipmentId = shipRes.rows[0]!.id;

    const shipItemRes = await query<{ id: string }>(
      `
      INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
      VALUES (gen_random_uuid(), $1, $2, 1, 1, 1)
      RETURNING id
      `,
      [shipmentId, sku.id],
    );
    const shipmentItemId = shipItemRes.rows[0]!.id;

    const qcRes = await query<{ id: string }>(
      `
      INSERT INTO quality_checks (id, shipment_id, store_id, inspector_user_id, session_sequence_number, status)
      VALUES (gen_random_uuid(), $1, $2, $3, 1, 'APPROVED')
      RETURNING id
      `,
      [shipmentId, storeId, managerUserId],
    );
    const qcId = qcRes.rows[0]!.id;

    const qcItemRes = await query<{ id: string }>(
      `
      INSERT INTO quality_check_items (
        id, quality_check_id, shipment_item_id, item_sequence_number, status,
        gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
        hallmark_verified, visual_inspection_passed, damage_detected
      )
      VALUES (gen_random_uuid(), $1, $2, 1, 'APPROVED', 8.0000, 7.5000, $3, $4, true, true, false)
      RETURNING id
      `,
      [qcId, shipmentItemId, mat.id, pur.id],
    );

    const itemRes = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state, selling_price_cad
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-PAY-API-001', 'Cascade Earrings Pair', 8.0, 7.5, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 12000.00)
      RETURNING id
      `,
      [orgId, storeId, sku.id, qcItemRes.rows[0]!.id, pur.id],
    );
    pieceId = itemRes.rows[0]!.id;

    const cust = await createCustomer({
      organizationId: orgId,
      customerCode: "CUST-PAY-API-001",
      firstName: "Countess",
      lastName: "Olga",
      email: "olga@countess.local",
    });
    customerId = cust.id;

    // Create Invoice with total CAD 12,000 (taxRate: 0)
    const inv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      createdByUserId: managerUserId,
      invoiceNumber: "INV-PAY-API-100",
      items: [
        {
          inventoryItemId: pieceId,
          unitPriceCad: 12000.0,
          taxRate: 0.0,
        },
      ],
    });
    invoiceId = inv.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: records partial payment tender (CAD 5,000 CASH) transitioning invoice to PARTIALLY_PAID (201 Created)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/payments")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: invoiceId,
        paymentMethod: "CASH",
        amountCad: 5000.0,
        notes: "Cash down payment",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.payment.id).toBeDefined();
    expect(res.body.data.payment.amountCad).toBe(5000.0);
    expect(res.body.data.payment.paymentMethod).toBe("CASH");

    expect(res.body.data.invoice.paidAmountCad).toBe(5000.0);
    expect(res.body.data.invoice.balanceDueCad).toBe(7000.0);
    expect(res.body.data.invoice.status).toBe("PARTIALLY_PAID");

    firstPaymentId = res.body.data.payment.id;
  });

  it("Scenario 2: rejects tender exceeding remaining invoice balance (400 Bad Request)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/payments")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: invoiceId,
        paymentMethod: "CREDIT_CARD",
        amountCad: 8000.0, // Remaining balance is 7,000
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_PAYMENT_EXCEEDS_BALANCE");
  });

  it("Scenario 3: completes split tender settlement (CAD 7,000 CREDIT_CARD) transitioning invoice to PAID (201 Created)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/payments")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: invoiceId,
        paymentMethod: "CREDIT_CARD",
        amountCad: 7000.0,
        referenceNumber: "AUTH-PAY-112233",
        cardLast4: "1234",
        notes: "Mastercard World Elite final settlement",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.payment.amountCad).toBe(7000.0);
    expect(res.body.data.payment.cardLast4).toBe("1234");

    expect(res.body.data.invoice.paidAmountCad).toBe(12000.0);
    expect(res.body.data.invoice.balanceDueCad).toBe(0.0);
    expect(res.body.data.invoice.status).toBe("PAID");
  });

  it("Scenario 4: rejects further tender on already fully paid invoice (422 Unprocessable Entity)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/payments")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: invoiceId,
        paymentMethod: "CASH",
        amountCad: 50.0,
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_INVOICE_ALREADY_PAID");
  });

  it("Scenario 5: retrieves payment record by ID (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/payments/${firstPaymentId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(firstPaymentId);
    expect(res.body.data.amountCad).toBe(5000.0);
    expect(res.body.data.receivedByUserName).toBe("Jean-Paul Sartre");
  });

  it("Scenario 6: returns 404 for nonexistent payment ID", async () => {
    const res = await request(app)
      .get("/api/v1/sales/payments/0192e301-0000-7000-8000-000000009999")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(404);
  });

  it("Scenario 7: lists payments filtered by invoice (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/payments?salesInvoiceId=${invoiceId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data.length).toBe(2);
  });

  it("Scenario 8: enforces multi-tenant boundary isolation", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/payments/${firstPaymentId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`)
      .set("x-store-id", otherStoreId);

    expect(res.status).toBe(404);
  });

  it("Scenario 9: enforces RBAC permission check (403 Forbidden)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/payments")
      .set("Authorization", `Bearer ${qcInspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: invoiceId,
        paymentMethod: "CASH",
        amountCad: 100.0,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("Scenario 10: unauthenticated request is rejected (401 Unauthorized)", async () => {
    const res = await request(app)
      .get("/api/v1/sales/payments")
      .set("x-store-id", storeId);

    expect(res.status).toBe(401);
  });
});
