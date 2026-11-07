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
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Sales Invoices API (FEAT-SALES-02, Entities 49 & 50)", () => {
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
  let pieceId1: string;
  let pieceId2: string;
  let otherStorePieceId: string;

  let createdInvoiceId: string;

  async function cleanFixtures() {
    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_API', 'ORG_INV_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_API', 'ORG_INV_API_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_API', 'ORG_INV_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_API', 'ORG_INV_API_ALT'));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-INV-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-INV-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_INV_API_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-INV-API-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_INV_API_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_INV_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_INV_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_INV_API_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_INV_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_API', 'ORG_INV_API_ALT'));",
    );
    await query(
      "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'inv_api_%@jewelcore.local');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'inv_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_INV_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_INV_API', 'ORG_INV_API_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_INV_API",
      name: "Haute Horlogerie & Diamond POS Inc",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_INV_API_ALT",
      name: "Rival Luxury POS Inc",
    });
    otherOrgId = altOrg.id;

    // 2. Stores
    const store = await createStore({
      organizationId: orgId,
      code: "STORE_INV_API_01",
      name: "Yorkville Showroom Toronto",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const otherStore = await createStore({
      organizationId: orgId,
      code: "STORE_INV_API_02",
      name: "Westmount Showroom Montreal",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = otherStore.id;

    const altStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_INV_API_ALT",
      name: "Geneva Vault",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });

    // 3. Manager User (STORE_MANAGER role has sales:invoice:create, sales:invoice:view, sales:invoice:cancel)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "inv_api_mgr@jewelcore.local",
      firstName: "Julian",
      lastName: "Devaux",
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

    // 4. QC Inspector User (QC_INSPECTOR has NO sales:invoice:create)
    const qcUser = await createUser({
      organizationId: orgId,
      email: "inv_api_qc@jewelcore.local",
      firstName: "Gareth",
      lastName: "Bale",
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

    // 5. Other Org Manager
    const altManagerUser = await createUser({
      organizationId: otherOrgId,
      email: "inv_api_alt_mgr@jewelcore.local",
      firstName: "Philippe",
      lastName: "Patek",
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

    // 6. Master Data
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_INV_API_NCK",
      name: "High Necklaces",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_INV_API_PT",
      name: "Platinum 950",
      baseMetalType: "PLATINUM",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_INV_API_PT950",
      name: "PT 950",
      purityPercentage: 95.0,
      purityRatio: 0.95,
      isHallmarkPurity: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_INV_API_CHV",
      name: "Diamond Chevron Collar",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-INV-API-COLLAR",
      variantName: "Diamond Collar 42cm",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 28.5,
      targetMetalWeightGrams: 26.0,
      trackingType: "SERIALIZED",
    });

    // 7. Inbound & QC to birth serialized pieces
    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_INV_API_01",
      name: "Geneva Diamond Cutters SA",
      currency: "CAD",
      paymentTermsDays: 30,
    });

    const grnRes = await query<{ id: string }>(
      `
      INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
      VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-INV-API-001', 'RECEIVED', $4)
      RETURNING id
      `,
      [orgId, storeId, sup.id, managerUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `
      INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
      VALUES (gen_random_uuid(), $1, 'SHIP-INV-API-001', 'FERRARI', 'FE-001', 'RECEIVED', $2)
      RETURNING id
      `,
      [grnId, managerUserId],
    );
    const shipmentId = shipRes.rows[0]!.id;

    const shipItemRes = await query<{ id: string }>(
      `
      INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
      VALUES (gen_random_uuid(), $1, $2, 1, 3, 3)
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

    const qcItems = await Promise.all([1, 2, 3].map((seq) =>
      query<{ id: string }>(
        `
        INSERT INTO quality_check_items (
          id, quality_check_id, shipment_item_id, item_sequence_number, status,
          gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
          hallmark_verified, visual_inspection_passed, damage_detected
        )
        VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 28.5000, 26.0000, $4, $5, true, true, false)
        RETURNING id
        `,
        [qcId, shipmentItemId, seq, mat.id, pur.id],
      ),
    ));

    // Piece 1 in Store 1 (AVAILABLE_FOR_SALE)
    const item1 = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state, selling_price_cad
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-INV-API-001', 'Diamond Collar #1', 28.5, 26.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 18500.00)
      RETURNING id
      `,
      [orgId, storeId, sku.id, qcItems[0]!.rows[0]!.id, pur.id],
    );
    pieceId1 = item1.rows[0]!.id;

    // Piece 2 in Store 1 (AVAILABLE_FOR_SALE)
    const item2 = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state, selling_price_cad
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-INV-API-002', 'Diamond Collar #2', 28.5, 26.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 22000.00)
      RETURNING id
      `,
      [orgId, storeId, sku.id, qcItems[1]!.rows[0]!.id, pur.id],
    );
    pieceId2 = item2.rows[0]!.id;

    // Piece 3 in Store 2 (Montreal) (AVAILABLE_FOR_SALE)
    const item3 = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state, selling_price_cad
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-INV-API-003', 'Diamond Collar #3', 28.5, 26.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 25000.00)
      RETURNING id
      `,
      [orgId, otherStoreId, sku.id, qcItems[2]!.rows[0]!.id, pur.id],
    );
    otherStorePieceId = item3.rows[0]!.id;

    // Customer
    const cust = await createCustomer({
      organizationId: orgId,
      customerCode: "CUST-INV-API-001",
      firstName: "Baroness",
      lastName: "von Rothschild",
      email: "baroness@rothschild.local",
    });
    customerId = cust.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: generates a sales invoice with multiple line items (201 Created)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/invoices")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        customerId,
        invoiceNumber: "INV-API-0001",
        discountAmountCad: 500.0,
        notes: "Private Salon Diamond Commission",
        items: [
          {
            inventoryItemId: pieceId1,
            unitPriceCad: 18500.0,
            discountAmountCad: 500.0, // Final: 18000. Tax (13%): 2340. Line: 20340
            taxRate: 0.13,
            notes: "Fitted with safety chain",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.invoiceNumber).toBe("INV-API-0001");
    expect(res.body.data.status).toBe("PENDING_PAYMENT");
    expect(res.body.data.subtotalCad).toBe(18000.0);
    expect(res.body.data.taxAmountCad).toBe(2340.0);
    expect(res.body.data.discountAmountCad).toBe(500.0);
    expect(res.body.data.totalAmountCad).toBe(19840.0); // 18000 + 2340 - 500
    expect(res.body.data.balanceDueCad).toBe(19840.0);
    expect(res.body.data.items?.length).toBe(1);

    createdInvoiceId = res.body.data.id;
  });

  it("Scenario 2: rejects piece already RESERVED in another invoice (422 Unprocessable Entity)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/invoices")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        customerId,
        items: [
          {
            inventoryItemId: pieceId1, // Already reserved in Scenario 1
            unitPriceCad: 18500.0,
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_ITEM_NOT_AVAILABLE_FOR_SALE");
  });

  it("Scenario 3: rejects piece belonging to a different store (400 Bad Request)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/invoices")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId, // Store 1 (Toronto)
        customerId,
        items: [
          {
            inventoryItemId: otherStorePieceId, // Store 2 (Montreal)
            unitPriceCad: 25000.0,
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_STORE_MISMATCH");
  });

  it("Scenario 4: rejects duplicate inventory item IDs in lines (400 Bad Request)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/invoices")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        customerId,
        items: [
          { inventoryItemId: pieceId2, unitPriceCad: 22000.0 },
          { inventoryItemId: pieceId2, unitPriceCad: 22000.0 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_DUPLICATE_LINE_ITEM");
  });

  it("Scenario 5: retrieves sales invoice by ID (200 OK)", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/invoices/${createdInvoiceId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdInvoiceId);
    expect(res.body.data.customerName).toBe("Baroness von Rothschild");
    expect(res.body.data.storeName).toBe("Yorkville Showroom Toronto");
    expect(res.body.data.items?.length).toBe(1);
    expect(res.body.data.items?.[0].itemSerialNumber).toBe("SR-INV-API-001");
  });

  it("Scenario 6: returns 404 for nonexistent invoice ID", async () => {
    const res = await request(app)
      .get("/api/v1/sales/invoices/0192e301-0000-7000-8000-000000009999")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(404);
  });

  it("Scenario 7: lists sales invoices with status filter (200 OK)", async () => {
    const res = await request(app)
      .get("/api/v1/sales/invoices?status=PENDING_PAYMENT")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].id).toBe(createdInvoiceId);
  });

  it("Scenario 8: cancels sales invoice and unreserves physical piece (200 OK)", async () => {
    const res = await request(app)
      .post(`/api/v1/sales/invoices/${createdInvoiceId}/cancel`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        reason: "Client elected to wire funds next week",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("CANCELLED");
    expect(res.body.data.notes).toContain("Client elected to wire funds");

    // Piece 1 is now available for sale again
    const pieceRes = await query<{ commercial_state: string }>(
      `SELECT commercial_state FROM inventory_items WHERE id = $1`,
      [pieceId1],
    );
    expect(pieceRes.rows[0]!.commercial_state).toBe("AVAILABLE_FOR_SALE");
  });

  it("Scenario 9: rejects cancelling an already cancelled invoice (409 Conflict)", async () => {
    const res = await request(app)
      .post(`/api/v1/sales/invoices/${createdInvoiceId}/cancel`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        reason: "Repeat cancel",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_INVOICE_ALREADY_CANCELLED");
  });

  it("Scenario 10: enforces multi-tenant boundary on invoice access", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/invoices/${createdInvoiceId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`)
      .set("x-store-id", otherStoreId);

    expect(res.status).toBe(404);
  });

  it("Scenario 11: enforces RBAC permission check (403 Forbidden)", async () => {
    // QC Inspector attempts to create sales invoice
    const res = await request(app)
      .post("/api/v1/sales/invoices")
      .set("Authorization", `Bearer ${qcInspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        storeId,
        customerId,
        items: [{ inventoryItemId: pieceId2, unitPriceCad: 22000.0 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  it("Scenario 12: unauthenticated request is rejected (401 Unauthorized)", async () => {
    const res = await request(app)
      .get("/api/v1/sales/invoices")
      .set("x-store-id", storeId);

    expect(res.status).toBe(401);
  });
});
