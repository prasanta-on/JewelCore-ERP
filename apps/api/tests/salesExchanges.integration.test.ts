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
  recordDailyMarketRate,
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
  BuybackItemType,
  PaymentMethod,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("POS Exchange & Trade-In API (FEAT-RET-04)", () => {
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

  let customerId: string;
  let purity18kId: string;
  let oldSoldPieceId: string;
  let oldInvoiceId: string;
  let oldLineItemId: string;

  let newPieceId1: string;
  let newPieceId2: string;

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
      "ALTER TABLE store_credit_transactions DISABLE TRIGGER trg_store_credit_transactions_immutability;",
    );
    await query(
      "ALTER TABLE daily_market_rates DISABLE TRIGGER trg_daily_market_rates_immutability;",
    );

    await query(
      "DELETE FROM sales_return_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_returns WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM gold_buyback_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM gold_buyback_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM store_credit_transactions WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM store_credit_accounts WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_payments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM daily_market_rates WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-EXC-API-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-EXC-API-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-EXC-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-EXC-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-EXC-API-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_EXC_API_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-EXC-API-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_EXC_API_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_EXC_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_EXC_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_EXC_API_%';");
    await query(
      "DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_EXC_API_%');",
    );
    await query(
      "DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_EXC_API_%');",
    );
    await query(
      "DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_EXC_API_%');",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_EXC_API_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'exc_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_EXC_API_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_EXC_API', 'ORG_EXC_API_ALT');",
    );

    await query(
      "ALTER TABLE daily_market_rates ENABLE TRIGGER trg_daily_market_rates_immutability;",
    );
    await query(
      "ALTER TABLE store_credit_transactions ENABLE TRIGGER trg_store_credit_transactions_immutability;",
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
      code: "ORG_EXC_API",
      name: "Boutique POS Exchange Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_EXC_API_ALT",
      name: "Alt Exchange Corp",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_EXC_API_01",
      name: "Downtown POS Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_EXC_API_ALT",
      name: "West Coast POS Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    const vaultRes = await query<{ id: string }>(
      `INSERT INTO vaults (id, store_id, code, name, vault_type)
       VALUES (gen_random_uuid(), $1, 'VLT-EXC-API-01', 'Vault A', 'MAIN_VAULT')
       RETURNING id`,
      [storeId],
    );
    const lockerRes = await query<{ id: string }>(
      `INSERT INTO lockers (id, vault_id, store_id, code, name, locker_number)
       VALUES (gen_random_uuid(), $1, $2, 'LCK-EXC-API-01', 'Locker 1', 'L-01')
       RETURNING id`,
      [vaultRes.rows[0]!.id, storeId],
    );
    const compRes = await query<{ id: string }>(
      `INSERT INTO compartments (id, locker_id, store_id, code, name, compartment_number)
       VALUES (gen_random_uuid(), $1, $2, 'CMP-EXC-API-01', 'Tray 1', 'T-01')
       RETURNING id`,
      [lockerRes.rows[0]!.id, storeId],
    );
    compartmentId = compRes.rows[0]!.id;

    // Manager User
    const managerUser = await createUser({
      organizationId: orgId,
      email: "exc_api_mgr@jewelcore.local",
      firstName: "Harrison",
      lastName: "Ford",
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

    // QC Inspector User (lacks sales:invoice:create)
    const qcUser = await createUser({
      organizationId: orgId,
      email: "exc_api_qc@jewelcore.local",
      firstName: "Chief",
      lastName: "Wiggum",
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

    // Material & Purity
    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_EXC_API_18K",
      name: "18K Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_EXC_API_750",
      name: "18K",
      purityPercentage: 75.0,
      hallmarkEligible: true,
    });
    purity18kId = pur.id;

    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_EXC_API_PDT",
      name: "Pendants",
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_EXC_API_01",
      name: "Gold Medallion",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-EXC-API-01",
      variantName: "Gold Medallion Variant",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 10.0,
      targetMetalWeightGrams: 9.0,
      trackingType: "SERIALIZED",
    });

    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_EXC_API_01",
      name: "Gold Suppliers Ltd",
    });

    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-EXC-API-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, storeId, sup.id, managerUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHIP-EXC-API-01', 'DHL', 'DHL-01', 'RECEIVED', $2)
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
         VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 10.0000, 9.0000, $4, $5, true, true, false)
         RETURNING id`,
        [qcId, shipmentItemId, i, mat.id, pur.id],
      );
      qcItems.push(qci.rows[0]!.id);
    }

    const p1 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-EXC-API-01', 'Medallion Sold', 10.0000, 9.0000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 1500.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[0]!, pur.id, compartmentId],
    );
    oldSoldPieceId = p1.rows[0]!.id;

    const p2 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-EXC-API-02', 'Medallion New A', 10.0000, 9.0000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 3000.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[1]!, pur.id, compartmentId],
    );
    newPieceId1 = p2.rows[0]!.id;

    const p3 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-EXC-API-03', 'Medallion New B', 10.0000, 9.0000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 1200.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[2]!, pur.id, compartmentId],
    );
    newPieceId2 = p3.rows[0]!.id;

    // Spot rate: $100/g
    await recordDailyMarketRate({
      organizationId: orgId,
      storeId,
      metalType: "GOLD",
      ratePerGramCad: 100.0,
      recordedByUserId: managerUserId,
    });

    const cust = await createCustomer({
      organizationId: orgId,
      primaryStoreId: storeId,
      customerCode: "CUST-EXC-API-01",
      customerType: "INDIVIDUAL",
      firstName: "Indiana",
      lastName: "Jones",
      email: "indy@example.com",
    });
    customerId = cust.id;

    // Sell piece 1 on previous invoice and finalize
    const prevInv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      invoiceNumber: "INV-EXC-API-PREV-01",
      createdByUserId: managerUserId,
      items: [{ inventoryItemId: oldSoldPieceId, unitPriceCad: 1500 }],
    });
    oldInvoiceId = prevInv.id;
    oldLineItemId = prevInv.items![0]!.id;

    await recordSalesPayment({
      organizationId: orgId,
      storeId,
      salesInvoiceId: oldInvoiceId,
      receivedByUserId: managerUserId,
      paymentMethod: "DEBIT_CARD",
      amountCad: prevInv.totalAmountCad,
    });

    await finalizeSaleAndReleaseCustody({
      invoiceId: oldInvoiceId,
      organizationId: orgId,
      actorUserId: managerUserId,
    });
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("POST /api/v1/sales/exchanges returns 401 if unauthenticated", async () => {
    const res = await request(app).post("/api/v1/sales/exchanges").send({});
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/sales/exchanges returns 403 if user lacks sales:invoice:create", async () => {
    const res = await request(app)
      .post("/api/v1/sales/exchanges")
      .set("Authorization", `Bearer ${qcInspectorToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        newItems: [{ inventoryItemId: newPieceId1, unitPriceCad: 3000 }],
      });

    expect(res.status).toBe(403);
  });

  it("POST /api/v1/sales/exchanges executes full POS exchange with return, buyback and split tender (201 Created)", async () => {
    // Return: old piece ($1500 + 13% tax = $1695 refund credit)
    // Buyback: 10g scrap 18K (75%) = 7.5g pure gold @ $100/g = $750 - $50 smelting fee = $700 credit
    // Total trade-in credit generated: $1695 + $700 = $2395
    // New item: $3000 + 13% tax = $3390
    // Store credit applied: $2395
    // Balance remaining: $3390 - $2395 = $995
    // Additional payment: $995 DEBIT_CARD
    // Result: Invoice fully paid, finalized, piece released, remaining store credit = 0
    const res = await request(app)
      .post("/api/v1/sales/exchanges")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        newItems: [{ inventoryItemId: newPieceId1, unitPriceCad: 3000 }],
        returns: {
          salesInvoiceId: oldInvoiceId,
          returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
          items: [
            {
              salesInvoiceItemId: oldLineItemId,
              condition: ReturnCondition.NEW_CONDITION,
              disposition: ReturnDisposition.RESTOCK_AS_NEW,
              targetCompartmentId: compartmentId,
              restockingFeeCad: 0,
            },
          ],
        },
        buybacks: {
          items: [
            {
              itemType: BuybackItemType.SCRAP_JEWELLERY,
              description: "Scrap gold link",
              purityId: purity18kId,
              grossWeightGrams: 10.0,
              netWeightGrams: 10.0,
              smeltingFeeCad: 50.0,
              targetCompartmentId: compartmentId,
            },
          ],
        },
        additionalPayments: [
          {
            paymentMethod: PaymentMethod.DEBIT_CARD,
            amountCad: 995.0,
          },
        ],
        notes: "Full POS exchange and trade-in transaction",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.salesReturn).toBeDefined();
    expect(res.body.data.salesReturn.netRefundAmountCad).toBe(1695);
    expect(res.body.data.goldBuybackOrder).toBeDefined();
    expect(res.body.data.goldBuybackOrder.netPayoutAmountCad).toBe(700);
    expect(res.body.data.tradeInCreditGeneratedCad).toBe(2395);
    expect(res.body.data.storeCreditAppliedCad).toBe(2395);
    expect(res.body.data.invoice.totalAmountCad).toBe(3390);
    expect(res.body.data.invoice.status).toBe("PAID");
    expect(res.body.data.invoice.balanceDueCad).toBe(0);
    expect(res.body.data.isFinalized).toBe(true);
    expect(res.body.data.releasedPieceIds).toContain(newPieceId1);
    expect(res.body.data.customerStoreCreditBalanceCad).toBe(0);
  });

  it("POST /api/v1/sales/exchanges handles surplus trade-in value, banking remaining credit in customer account", async () => {
    // Customer trades in scrap gold: 20g 18K = 15g gold @ $100/g = $1500
    // Purchases new piece: $1000 + 13% tax = $1130
    // Applied credit: $1130
    // Surplus banked: $1500 - $1130 = $370
    const res = await request(app)
      .post("/api/v1/sales/exchanges")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", storeId)
      .send({
        customerId,
        newItems: [{ inventoryItemId: newPieceId2, unitPriceCad: 1000 }],
        buybacks: {
          items: [
            {
              itemType: BuybackItemType.OLD_GOLD_BAR,
              description: "20g bullion wafer",
              purityId: purity18kId,
              grossWeightGrams: 20.0,
              netWeightGrams: 20.0,
              smeltingFeeCad: 0,
              targetCompartmentId: compartmentId,
            },
          ],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tradeInCreditGeneratedCad).toBe(1500);
    expect(res.body.data.storeCreditAppliedCad).toBe(1130);
    expect(res.body.data.invoice.status).toBe("PAID");
    expect(res.body.data.isFinalized).toBe(true);
    expect(res.body.data.customerStoreCreditBalanceCad).toBe(370);
  });
});
