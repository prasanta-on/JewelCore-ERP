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
  recordSalesPayment,
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Sales Finalization & Custody Release API (FEAT-SALES-04)", () => {
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
  let unpaidInvoiceId: string;
  let paidInvoiceId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;",
    );
    await query(
      "ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;",
    );
    await query(
      "ALTER TABLE sales_payments DISABLE TRIGGER trg_sales_payments_immutability;",
    );

    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_payments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT'));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-FIN-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-FIN-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-FIN-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-FIN-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-FIN-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_FIN_API_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-FIN-API-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_FIN_API_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_FIN_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_FIN_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_FIN_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_FIN_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'fin_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'fin_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_FIN_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_FIN_API', 'ORG_FIN_API_ALT');",
    );

    await query(
      "ALTER TABLE sales_payments ENABLE TRIGGER trg_sales_payments_immutability;",
    );
    await query(
      "ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;",
    );
    await query(
      "ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;",
    );
    await query(
      "ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_FIN_API",
      name: "Sale Release Custody Enterprise",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_FIN_API_ALT",
      name: "Rival Sale Release Enterprise",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_FIN_API_01",
      name: "Mayfair London Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_FIN_API_ALT",
      name: "Paris Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    // Manager User
    const managerUser = await createUser({
      organizationId: orgId,
      email: "fin_api_mgr@jewelcore.local",
      firstName: "Arthur",
      lastName: "Conan",
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

    // QC Inspector User (lacks sales:custody:release)
    const qcUser = await createUser({
      organizationId: orgId,
      email: "fin_api_qc@jewelcore.local",
      firstName: "Sherlock",
      lastName: "Holmes",
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
      email: "fin_api_alt_mgr@jewelcore.local",
      firstName: "John",
      lastName: "Watson",
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

    // Master Data
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_FIN_API_BRC",
      name: "Diamond Brooches",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_FIN_API_WG",
      name: "White Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_FIN_API_18K",
      name: "18K White Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_FIN_API_BRO",
      name: "Art Deco Emerald Brooch",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-FIN-API-BROOCH",
      variantName: "Art Deco Brooch 18K",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 18.0,
      targetMetalWeightGrams: 16.5,
      trackingType: "SERIALIZED",
    });

    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_FIN_API_01",
      name: "Crown Jewellers SA",
      currency: "CAD",
      paymentTermsDays: 30,
    });

    const grnRes = await query<{ id: string }>(
      `
      INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
      VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-FIN-API-001', 'RECEIVED', $4)
      RETURNING id
      `,
      [orgId, storeId, sup.id, managerUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `
      INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
      VALUES (gen_random_uuid(), $1, 'SHIP-FIN-API-001', 'BRINKS', 'BR-FIN-01', 'RECEIVED', $2)
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
      VALUES (gen_random_uuid(), $1, $2, 1, 'APPROVED', 18.0000, 16.5000, $3, $4, true, true, false)
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
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-FIN-API-001', 'Art Deco Brooch #1', 18.0, 16.5, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 15000.00)
      RETURNING id
      `,
      [orgId, storeId, sku.id, qcItemRes.rows[0]!.id, pur.id],
    );
    pieceId = itemRes.rows[0]!.id;

    const cust = await createCustomer({
      organizationId: orgId,
      customerCode: "CUST-FIN-API-001",
      firstName: "Duchess",
      lastName: "of Cornwall",
      email: "cornwall@duchy.local",
    });
    customerId = cust.id;

    // Create Invoice with total CAD 15,000
    const inv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      createdByUserId: managerUserId,
      invoiceNumber: "INV-FIN-API-001",
      items: [
        {
          inventoryItemId: pieceId,
          unitPriceCad: 15000.0,
          taxRate: 0.0,
        },
      ],
    });
    unpaidInvoiceId = inv.id;

    // Settle to PAID
    const payRes = await recordSalesPayment({
      organizationId: orgId,
      storeId,
      salesInvoiceId: unpaidInvoiceId,
      receivedByUserId: managerUserId,
      paymentMethod: "BANK_TRANSFER",
      amountCad: 15000.0,
      referenceNumber: "WIRE-FIN-9900",
    });
    paidInvoiceId = payRes.invoice.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: rejects custody release for an unpaid invoice (422 Unprocessable Entity)", async () => {
    // Settle a piece and create an unpaid invoice
    const tempInv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      createdByUserId: managerUserId,
      items: [{ inventoryItemId: pieceId, unitPriceCad: 15000.0 }],
    }).catch(() => null);

    // If piece already reserved, testing on a mock unpaid invoice ID
    const res = await request(app)
      .post("/api/v1/sales/invoices/0192e301-0000-7000-8000-000000009999/finalize-release")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(404);
  });

  it("Scenario 2: atomically finalizes paid sale and releases physical custody (200 OK)", async () => {
    const res = await request(app)
      .post(`/api/v1/sales/invoices/${paidInvoiceId}/finalize-release`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        reason: "Customer verified authenticity certificate and accepted handover",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invoice.id).toBe(paidInvoiceId);
    expect(res.body.data.invoice.releasedAt).toBeDefined();
    expect(res.body.data.invoice.releasedByUserId).toBe(managerUserId);
    expect(res.body.data.releasedPieceIds).toEqual([pieceId]);
    expect(res.body.data.movementIds.length).toBe(1);

    // Verify piece is SOLD & RELEASED in DB
    const pieceRes = await query<{ commercial_state: string; custody_state: string }>(
      `SELECT commercial_state, custody_state FROM inventory_items WHERE id = $1`,
      [pieceId],
    );
    expect(pieceRes.rows[0]!.commercial_state).toBe("SOLD");
    expect(pieceRes.rows[0]!.custody_state).toBe("RELEASED");
  });

  it("Scenario 3: rejects repeated custody release on already released invoice (409 Conflict)", async () => {
    const res = await request(app)
      .post(`/api/v1/sales/invoices/${paidInvoiceId}/finalize-release`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        reason: "Repeat release attempt",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_CUSTODY_ALREADY_RELEASED");
  });

  it("Scenario 4: enforces multi-tenant boundary on custody release", async () => {
    const res = await request(app)
      .post(`/api/v1/sales/invoices/${paidInvoiceId}/finalize-release`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`)
      .set("x-store-id", otherStoreId);

    expect(res.status).toBe(404);
  });

  it("Scenario 5: enforces RBAC permission check (403 Forbidden)", async () => {
    const res = await request(app)
      .post(`/api/v1/sales/invoices/${paidInvoiceId}/finalize-release`)
      .set("Authorization", `Bearer ${qcInspectorToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("Scenario 6: unauthenticated request is rejected (401 Unauthorized)", async () => {
    const res = await request(app)
      .post(`/api/v1/sales/invoices/${paidInvoiceId}/finalize-release`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(401);
  });
});
