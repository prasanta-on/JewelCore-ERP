import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
  processPOSExchange,
  getStoreCreditAccountByCustomerId,
} from "../src/index.js";
import {
  StoreType,
  ReturnReason,
  ReturnCondition,
  ReturnDisposition,
  BuybackItemType,
  PaymentMethod,
} from "@jewelcore/shared";

describe("POS Exchange & Trade-In Cross-Flow Orchestration (FEAT-RET-04)", () => {
  let orgId: string;
  let storeId: string;
  let compartmentId: string;
  let userId: string;
  let customerId: string;

  let purity18kId: string;
  let oldSoldPieceId: string;
  let finalizedInvoiceId: string;
  let oldInvoiceItemId: string;

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
      "DELETE FROM sales_return_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM sales_returns WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM gold_buyback_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM gold_buyback_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM store_credit_transactions WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM store_credit_accounts WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM sales_payments WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM daily_market_rates WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-EXC-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-EXC-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-EXC-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-EXC-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-EXC-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_EXC_REPO_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-EXC-REPO-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_EXC_REPO_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_EXC_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_EXC_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_EXC_REPO_%';");
    await query(
      "DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_EXC_REPO_%');",
    );
    await query(
      "DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_EXC_REPO_%');",
    );
    await query(
      "DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_EXC_REPO_%');",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_EXC_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_EXC_REPO');",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'exc_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_EXC_REPO_%';");
    await query("DELETE FROM organizations WHERE code = 'ORG_EXC_REPO';");

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
      code: "ORG_EXC_REPO",
      name: "POS Exchange Orchestration Corp",
    });
    orgId = org.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_EXC_REPO_01",
      name: "Flagship Exchange Boutique",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const vaultRes = await query<{ id: string }>(
      `INSERT INTO vaults (id, store_id, code, name, vault_type)
       VALUES (gen_random_uuid(), $1, 'VLT-EXC-01', 'Exchange Safe', 'MAIN_VAULT')
       RETURNING id`,
      [storeId],
    );
    const lockerRes = await query<{ id: string }>(
      `INSERT INTO lockers (id, vault_id, store_id, code, name, locker_number)
       VALUES (gen_random_uuid(), $1, $2, 'LCK-EXC-01', 'Locker X', 'LX-01')
       RETURNING id`,
      [vaultRes.rows[0]!.id, storeId],
    );
    const compRes = await query<{ id: string }>(
      `INSERT INTO compartments (id, locker_id, store_id, code, name, compartment_number)
       VALUES (gen_random_uuid(), $1, $2, 'CMP-EXC-01', 'Tray X', 'TX-01')
       RETURNING id`,
      [lockerRes.rows[0]!.id, storeId],
    );
    compartmentId = compRes.rows[0]!.id;

    const userRes = await query<{ id: string }>(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active)
       VALUES (gen_random_uuid(), $1, 'exc_repo_cashier@jewelcore.local', 'hash', 'POS', 'Orchestrator', true)
       RETURNING id`,
      [orgId],
    );
    userId = userRes.rows[0]!.id;

    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_EXC_REPO_RNG",
      name: "Rings",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_EXC_REPO_18K",
      name: "18K Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_EXC_REPO_750",
      name: "18K (750)",
      purityPercentage: 75.0,
      hallmarkEligible: true,
    });
    purity18kId = pur.id;

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_EXC_REPO_01",
      name: "Eternity Band",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-EXC-REPO-01",
      variantName: "Gold Eternity Band",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 8.0,
      targetMetalWeightGrams: 7.5,
      trackingType: "SERIALIZED",
    });

    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_EXC_REPO_01",
      name: "Diamond Imports Inc",
    });

    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-EXC-REPO-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, storeId, sup.id, userId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHIP-EXC-REPO-01', 'FEDEX', 'FDX-01', 'RECEIVED', $2)
       RETURNING id`,
      [grnId, userId],
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
      [shipmentId, storeId, userId],
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
         VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 8.0000, 7.5000, $4, $5, true, true, false)
         RETURNING id`,
        [qcId, shipmentItemId, i, mat.id, pur.id],
      );
      qcItems.push(qci.rows[0]!.id);
    }

    // Pieces: piece 1 sold on previous invoice; pieces 2 & 3 available for sale
    const p1 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-EXC-01', 'Band Old', 8.0000, 7.5000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 1000.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[0]!, pur.id, compartmentId],
    );
    oldSoldPieceId = p1.rows[0]!.id;

    const p2 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-EXC-02', 'Band New A', 8.0000, 7.5000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 2500.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[1]!, pur.id, compartmentId],
    );
    newPieceId1 = p2.rows[0]!.id;

    const p3 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-EXC-03', 'Band New B', 8.0000, 7.5000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 1200.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[2]!, pur.id, compartmentId],
    );
    newPieceId2 = p3.rows[0]!.id;

    // Spot rate: Gold $100/g
    await recordDailyMarketRate({
      organizationId: orgId,
      storeId,
      metalType: "GOLD",
      ratePerGramCad: 100.0,
      recordedByUserId: userId,
    });

    const cust = await createCustomer({
      organizationId: orgId,
      primaryStoreId: storeId,
      customerCode: "CUST-EXC-REPO-01",
      customerType: "INDIVIDUAL",
      firstName: "Leonardo",
      lastName: "DiCaprio",
      email: "leo@example.com",
    });
    customerId = cust.id;

    // Sell piece 1 to customer on previous invoice
    const prevInv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      invoiceNumber: "INV-EXC-PREV-01",
      createdByUserId: userId,
      items: [{ inventoryItemId: oldSoldPieceId, unitPriceCad: 1000 }],
    });
    finalizedInvoiceId = prevInv.id;
    oldInvoiceItemId = prevInv.items![0]!.id;

    await recordSalesPayment({
      organizationId: orgId,
      storeId,
      salesInvoiceId: finalizedInvoiceId,
      receivedByUserId: userId,
      paymentMethod: "CREDIT_CARD",
      amountCad: prevInv.totalAmountCad,
    });

    await finalizeSaleAndReleaseCustody({
      invoiceId: finalizedInvoiceId,
      organizationId: orgId,
      actorUserId: userId,
    });
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("atomically executes full POS exchange with return, buyback trade-in, and split tender (FEAT-RET-04)", async () => {
    // Return: old piece ($1000 + 13% tax = $1130 refund credit)
    // Buyback: 10g scrap 18K (75%) = 7.5g gold @ $100/g = $750 - $50 fee = $700 buyback credit
    // Total trade-in credit generated: $1130 + $700 = $1830.
    // New item: $2500 + 13% tax = $2825.
    // Store credit applied: $1830.
    // Balance remaining: $2825 - $1830 = $995.
    // Additional payment: $995 CREDIT_CARD.
    // Result: Invoice fully paid, finalized, piece released, remaining store credit: $0.
    const result = await processPOSExchange({
      organizationId: orgId,
      storeId,
      actorUserId: userId,
      customerId,
      newItems: [{ inventoryItemId: newPieceId1, unitPriceCad: 2500 }],
      returns: {
        salesInvoiceId: finalizedInvoiceId,
        returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
        items: [
          {
            salesInvoiceItemId: oldInvoiceItemId,
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
            description: "Old 18K scrap chain",
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
          paymentMethod: PaymentMethod.CREDIT_CARD,
          amountCad: 995.0,
          cardLast4: "4242",
        },
      ],
      notes: "VIP customer trading in old piece and scrap towards new eternity ring",
    });

    expect(result.salesReturn).toBeDefined();
    expect(result.salesReturn!.netRefundAmountCad).toBe(1130);

    expect(result.goldBuybackOrder).toBeDefined();
    expect(result.goldBuybackOrder!.netPayoutAmountCad).toBe(700);

    expect(result.tradeInCreditGeneratedCad).toBe(1830);
    expect(result.storeCreditAppliedCad).toBe(1830);
    expect(result.invoice.totalAmountCad).toBe(2825);
    expect(result.invoice.status).toBe("PAID");
    expect(result.invoice.balanceDueCad).toBe(0);
    expect(result.isFinalized).toBe(true);
    expect(result.releasedPieceIds).toContain(newPieceId1);
    expect(result.customerStoreCreditBalanceCad).toBe(0);

    // Verify inventory pieces
    // Old piece returned and restocked in vault
    const oldPieceRes = await query<{
      commercial_state: string;
      custody_state: string;
    }>(
      `SELECT commercial_state, custody_state FROM inventory_items WHERE id = $1`,
      [oldSoldPieceId],
    );
    expect(oldPieceRes.rows[0]!.commercial_state).toBe("AVAILABLE_FOR_SALE");
    expect(oldPieceRes.rows[0]!.custody_state).toBe("IN_VAULT");

    // New piece custody released to customer
    const newPieceRes = await query<{
      commercial_state: string;
      custody_state: string;
    }>(
      `SELECT commercial_state, custody_state FROM inventory_items WHERE id = $1`,
      [newPieceId1],
    );
    expect(newPieceRes.rows[0]!.commercial_state).toBe("SOLD");
    expect(newPieceRes.rows[0]!.custody_state).toBe("RELEASED");
  });

  it("handles surplus trade-in value, banking remaining credit in customer account (FEAT-RET-04)", async () => {
    // Customer has 0 balance now.
    // Trades in scrap gold: 20g 18K (75%) = 15g gold @ $100/g = $1500 - $0 fee = $1500 credit.
    // Purchases new piece 3: $1000 + 13% tax = $1130.
    // Store credit applied: $1130 (invoice fully paid).
    // Remaining credit: $1500 - $1130 = $370 banked in store credit account!
    const result = await processPOSExchange({
      organizationId: orgId,
      storeId,
      actorUserId: userId,
      customerId,
      newItems: [{ inventoryItemId: newPieceId2, unitPriceCad: 1000 }],
      buybacks: {
        items: [
          {
            itemType: BuybackItemType.OLD_GOLD_BAR,
            description: "20g 18K ingot",
            purityId: purity18kId,
            grossWeightGrams: 20.0,
            netWeightGrams: 20.0,
            smeltingFeeCad: 0,
            targetCompartmentId: compartmentId,
          },
        ],
      },
    });

    expect(result.tradeInCreditGeneratedCad).toBe(1500);
    expect(result.storeCreditAppliedCad).toBe(1130);
    expect(result.invoice.status).toBe("PAID");
    expect(result.invoice.balanceDueCad).toBe(0);
    expect(result.isFinalized).toBe(true);
    expect(result.customerStoreCreditBalanceCad).toBe(370);

    // Verify account in DB
    const account = await getStoreCreditAccountByCustomerId({
      customerId,
      organizationId: orgId,
    });
    expect(account.balanceCad).toBe(370);
  });
});
