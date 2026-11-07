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
  finalizeSaleAndReleaseCustody,
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
} from "@jewelcore/database";
import {
  StoreType,
  ReturnReason,
  ReturnCondition,
  ReturnDisposition,
  RefundMethod,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Customer Sales Returns API (FEAT-RET-01, Entities 52 & 53)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;
  let compartmentId: string;

  let managerToken: string;
  let managerUserId: string;
  let qcInspectorToken: string;
  let qcInspectorUserId: string;
  let otherOrgManagerToken: string;

  let customerId: string;
  let pieceId1: string;
  let pieceId2: string;
  let pieceId3: string;
  let finalizedInvoiceId: string;
  let unfinalizedInvoiceId: string;

  let lineItemId1: string;
  let lineItemId2: string;
  let lineItemId3: string;

  let createdReturnId: string;

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
      "DELETE FROM sales_return_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_returns WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_payments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-RET-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-RET-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-RET-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-RET-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-RET-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_RET_API_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-RET-API-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_RET_API_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_RET_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_RET_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_RET_API_%';");
    await query(
      "DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RET_API_%');",
    );
    await query(
      "DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RET_API_%');",
    );
    await query(
      "DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RET_API_%');",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RET_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'ret_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RET_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RET_API', 'ORG_RET_API_ALT');",
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
      code: "ORG_RET_API",
      name: "High Jewellery Returns Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_RET_API_ALT",
      name: "Alternative Luxury Group",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_RET_API_01",
      name: "Bloor Street Flagship",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_RET_API_ALT",
      name: "Vancouver Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    // Compartment
    const vaultRes = await query<{ id: string }>(
      `INSERT INTO vaults (id, store_id, code, name, vault_type)
       VALUES (gen_random_uuid(), $1, 'VLT-RET-API-01', 'Bloor Safe', 'MAIN_VAULT')
       RETURNING id`,
      [storeId],
    );
    const lockerRes = await query<{ id: string }>(
      `INSERT INTO lockers (id, vault_id, store_id, code, name, locker_number)
       VALUES (gen_random_uuid(), $1, $2, 'LCK-RET-API-01', 'Locker A', 'LA-01')
       RETURNING id`,
      [vaultRes.rows[0]!.id, storeId],
    );
    const compRes = await query<{ id: string }>(
      `INSERT INTO compartments (id, locker_id, store_id, code, name, compartment_number)
       VALUES (gen_random_uuid(), $1, $2, 'CMP-RET-API-01', 'Tray A', 'TA-01')
       RETURNING id`,
      [lockerRes.rows[0]!.id, storeId],
    );
    compartmentId = compRes.rows[0]!.id;

    // Manager User
    const managerUser = await createUser({
      organizationId: orgId,
      email: "ret_api_mgr@jewelcore.local",
      firstName: "Claire",
      lastName: "Delacroix",
      passwordHash: "hash",
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

    // QC Inspector User (lacks sales:return:create)
    const qcUser = await createUser({
      organizationId: orgId,
      email: "ret_api_qc@jewelcore.local",
      firstName: "Inspector",
      lastName: "Gadget",
      passwordHash: "hash",
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
    const altManager = await createUser({
      organizationId: otherOrgId,
      email: "ret_api_alt_mgr@jewelcore.local",
      firstName: "Alt",
      lastName: "Manager",
      passwordHash: "hash",
      isActive: true,
    });

    const altOrgMem = await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: altManager.id,
      isDefault: true,
    });

    await createStoreMembership({
      storeId: otherStoreId,
      organizationMembershipId: altOrgMem.id,
      isDefault: true,
    });

    if (storeManagerRole) {
      await assignRoleToUser(altManager.id, storeManagerRole.id);
    }

    otherOrgManagerToken = await signAccessToken({
      userId: altManager.id,
      email: altManager.email,
      orgId: otherOrgId,
    });

    // Taxonomy & SKU
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_RET_API_BRC",
      name: "Tennis Bracelets",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_RET_API_PT",
      name: "Platinum 950",
      baseMetalType: "PLATINUM",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_RET_API_950",
      name: "PT 950",
      purityPercentage: 95.0,
      hallmarkEligible: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_RET_API_01",
      name: "Diamond Line Bracelet",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-RET-API-01",
      variantName: "18cm Platinum Line",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 15.0,
      targetMetalWeightGrams: 14.0,
      trackingType: "SERIALIZED",
    });

    // Supplier, GRN, Shipment, QC
    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_RET_API_01",
      name: "Gemstone Masterworks Inc",
    });

    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-RET-API-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, storeId, sup.id, managerUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHIP-RET-API-01', 'BRINKS', 'BR-01', 'RECEIVED', $2)
       RETURNING id`,
      [grnId, managerUserId],
    );
    const shipmentId = shipRes.rows[0]!.id;

    const shipItemRes = await query<{ id: string }>(
      `INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
       VALUES (gen_random_uuid(), $1, $2, 1, 3, 3)
       RETURNING id`,
      [shipmentId, sku.id],
    );
    const shipmentItemId = shipItemRes.rows[0]!.id;

    const qcRes = await query<{ id: string }>(
      `INSERT INTO quality_checks (id, shipment_id, store_id, inspector_user_id, session_sequence_number, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 1, 'APPROVED')
       RETURNING id`,
      [shipmentId, storeId, managerUserId],
    );
    const qcId = qcRes.rows[0]!.id;

    const qcItems: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const qci = await query<{ id: string }>(
        `INSERT INTO quality_check_items (
          id, quality_check_id, shipment_item_id, item_sequence_number, status,
          gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
          hallmark_verified, visual_inspection_passed, damage_detected
         )
         VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 15.0000, 14.0000, $4, $5, true, true, false)
         RETURNING id`,
        [qcId, shipmentItemId, i, mat.id, pur.id],
      );
      qcItems.push(qci.rows[0]!.id);
    }

    // Inventory Items
    const p1 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-RET-API-01', 'Line Bracelet 1', 15.0000, 14.0000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 3000.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[0]!, pur.id, compartmentId],
    );
    pieceId1 = p1.rows[0]!.id;

    const p2 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-RET-API-02', 'Line Bracelet 2', 15.0000, 14.0000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 2500.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[1]!, pur.id, compartmentId],
    );
    pieceId2 = p2.rows[0]!.id;

    const p3 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-RET-API-03', 'Line Bracelet 3', 15.0000, 14.0000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 4000.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[2]!, pur.id, compartmentId],
    );
    pieceId3 = p3.rows[0]!.id;

    // Customer
    const cust = await createCustomer({
      organizationId: orgId,
      primaryStoreId: storeId,
      customerCode: "CUST-RET-API-01",
      customerType: "INDIVIDUAL",
      firstName: "Victoria",
      lastName: "Beckham",
      email: "victoria.ret@example.com",
    });
    customerId = cust.id;

    // Finalized Invoice with piece 1 & 2
    const finInv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      invoiceNumber: "INV-RET-API-FIN-01",
      createdByUserId: managerUserId,
      items: [
        { inventoryItemId: pieceId1, unitPriceCad: 3000 },
        { inventoryItemId: pieceId2, unitPriceCad: 2500 },
      ],
    });
    finalizedInvoiceId = finInv.id;
    lineItemId1 = finInv.items![0]!.id;
    lineItemId2 = finInv.items![1]!.id;

    await recordSalesPayment({
      organizationId: orgId,
      storeId,
      salesInvoiceId: finalizedInvoiceId,
      receivedByUserId: managerUserId,
      paymentMethod: "BANK_TRANSFER",
      amountCad: finInv.totalAmountCad,
    });

    await finalizeSaleAndReleaseCustody({
      invoiceId: finalizedInvoiceId,
      organizationId: orgId,
      actorUserId: managerUserId,
    });

    // Unfinalized Invoice with piece 3
    const unfinInv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      invoiceNumber: "INV-RET-API-UNFIN-01",
      createdByUserId: managerUserId,
      items: [{ inventoryItemId: pieceId3, unitPriceCad: 4000 }],
    });
    unfinalizedInvoiceId = unfinInv.id;
    lineItemId3 = unfinInv.items![0]!.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("POST /api/v1/sales/returns returns 401 Unauthorized if Bearer token missing", async () => {
    const res = await request(app)
      .post("/api/v1/sales/returns")
      .send({ salesInvoiceId: finalizedInvoiceId });

    expect(res.status).toBe(401);
  });

  it("POST /api/v1/sales/returns returns 403 Forbidden if user lacks sales:return:create permission", async () => {
    const res = await request(app)
      .post("/api/v1/sales/returns")
      .set("Authorization", `Bearer ${qcInspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: finalizedInvoiceId,
        returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
        refundMethod: RefundMethod.STORE_CREDIT,
        items: [
          {
            salesInvoiceItemId: lineItemId1,
            condition: ReturnCondition.NEW_CONDITION,
            disposition: ReturnDisposition.RESTOCK_AS_NEW,
          },
        ],
      });

    expect(res.status).toBe(403);
  });

  it("POST /api/v1/sales/returns returns 400 Bad Request if missing required fields", async () => {
    const res = await request(app)
      .post("/api/v1/sales/returns")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.title).toBe("Validation Error");
  });

  it("POST /api/v1/sales/returns returns 422 Unprocessable Entity if invoice is not finalized", async () => {
    const res = await request(app)
      .post("/api/v1/sales/returns")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: unfinalizedInvoiceId,
        returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
        refundMethod: RefundMethod.CASH,
        items: [
          {
            salesInvoiceItemId: lineItemId3,
            condition: ReturnCondition.NEW_CONDITION,
            disposition: ReturnDisposition.RESTOCK_AS_NEW,
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_INVOICE_NOT_FINALIZED");
  });

  it("POST /api/v1/sales/returns successfully processes return with RESTOCK_AS_NEW (201 Created)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/returns")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: finalizedInvoiceId,
        returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
        refundMethod: RefundMethod.STORE_CREDIT,
        notes: "Customer decided on a different design",
        items: [
          {
            salesInvoiceItemId: lineItemId1,
            condition: ReturnCondition.NEW_CONDITION,
            disposition: ReturnDisposition.RESTOCK_AS_NEW,
            targetCompartmentId: compartmentId,
            restockingFeeCad: 100,
            inspectionNotes: "Brand new with certificates",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.returnNumber).toMatch(/^RET-/);
    expect(res.body.data.status).toBe("COMPLETED");
    expect(res.body.data.totalRefundAmountCad).toBe(3390); // 3000 + 13% tax
    expect(res.body.data.restockingFeeCad).toBe(100);
    expect(res.body.data.netRefundAmountCad).toBe(3290);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].disposition).toBe("RESTOCK_AS_NEW");

    createdReturnId = res.body.data.id;
  });

  it("POST /api/v1/sales/returns returns 409 Conflict if piece was already returned", async () => {
    const res = await request(app)
      .post("/api/v1/sales/returns")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: finalizedInvoiceId,
        returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
        refundMethod: RefundMethod.STORE_CREDIT,
        items: [
          {
            salesInvoiceItemId: lineItemId1, // already returned
            condition: ReturnCondition.NEW_CONDITION,
            disposition: ReturnDisposition.RESTOCK_AS_NEW,
          },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_ITEM_ALREADY_RETURNED");
  });

  it("POST /api/v1/sales/returns returns 422 Unprocessable Entity if restocking fee exceeds item refund amount", async () => {
    const res = await request(app)
      .post("/api/v1/sales/returns")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: finalizedInvoiceId,
        returnReason: ReturnReason.DEFECTIVE,
        refundMethod: RefundMethod.CASH,
        items: [
          {
            salesInvoiceItemId: lineItemId2,
            condition: ReturnCondition.MINOR_WEAR,
            disposition: ReturnDisposition.SEND_TO_REPAIR,
            restockingFeeCad: 50000, // exceeds line total
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_INVALID_RESTOCKING_FEE");
  });

  it("POST /api/v1/sales/returns successfully processes return with SEND_TO_REPAIR (201 Created)", async () => {
    const res = await request(app)
      .post("/api/v1/sales/returns")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        salesInvoiceId: finalizedInvoiceId,
        returnReason: ReturnReason.DEFECTIVE,
        refundMethod: RefundMethod.ORIGINAL_PAYMENT_METHOD,
        items: [
          {
            salesInvoiceItemId: lineItemId2,
            condition: ReturnCondition.DAMAGED,
            disposition: ReturnDisposition.SEND_TO_REPAIR,
            restockingFeeCad: 0,
            inspectionNotes: "Safety catch loose, needs jeweler attention",
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].disposition).toBe("SEND_TO_REPAIR");
  });

  it("GET /api/v1/sales/returns/:id retrieves return details with line items", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/returns/${createdReturnId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdReturnId);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.customerName).toBe("Victoria Beckham");
    expect(res.body.data.storeName).toBe("Bloor Street Flagship");
  });

  it("GET /api/v1/sales/returns/:id returns 404 for other organization's return (tenant isolation)", async () => {
    const res = await request(app)
      .get(`/api/v1/sales/returns/${createdReturnId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`)
      .set("x-store-id", otherStoreId);

    expect(res.status).toBe(404);
  });

  it("GET /api/v1/sales/returns lists returns with store filter and pagination", async () => {
    const res = await request(app)
      .get("/api/v1/sales/returns")
      .query({ storeId, limit: 10, offset: 0 })
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(0);
  });
});
