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
  cancelSalesInvoice,
  recordSalesPayment,
  getSalesPaymentById,
  listSalesPayments,
} from "../src/index.js";
import { StoreType } from "@jewelcore/shared";

describe("Sales Payment Repository (FEAT-SALES-03, Entity 51)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let userId: string;
  let customerId: string;

  let pieceId1: string;
  let pieceId2: string;

  let activeInvoiceId: string;
  let cancelledInvoiceId: string;

  let firstPaymentId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE sales_payments DISABLE TRIGGER trg_sales_payments_immutability;",
    );
    await query(
      "DELETE FROM sales_payments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_REPO', 'ORG_PAY_REPO_ALT'));",
    );
    await query(
      "ALTER TABLE sales_payments ENABLE TRIGGER trg_sales_payments_immutability;",
    );

    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_REPO', 'ORG_PAY_REPO_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_REPO', 'ORG_PAY_REPO_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_REPO', 'ORG_PAY_REPO_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_REPO', 'ORG_PAY_REPO_ALT'));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PAY-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PAY-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-PAY-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-PAY-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-PAY-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_PAY_REPO_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-PAY-REPO-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_PAY_REPO_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_PAY_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_PAY_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_PAY_REPO_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_PAY_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_PAY_REPO', 'ORG_PAY_REPO_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'pay_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_PAY_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_PAY_REPO', 'ORG_PAY_REPO_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_PAY_REPO",
      name: "Payment Settlement Repository Org",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_PAY_REPO_ALT",
      name: "Rival Payment Settlement Org",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_PAY_REPO_01",
      name: "Downtown Financial District Boutique",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const userRes = await query<{ id: string }>(
      `
      INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active)
      VALUES (gen_random_uuid(), $1, 'pay_repo_cashier@jewelcore.local', 'hash', 'Head', 'Cashier', true)
      RETURNING id
      `,
      [orgId],
    );
    userId = userRes.rows[0]!.id;

    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_PAY_REPO_BRC",
      name: "Bracelets",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_PAY_REPO_WG",
      name: "White Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_PAY_REPO_18K",
      name: "18K White Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_PAY_REPO_TEN",
      name: "Tennis Bracelet",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-PAY-REPO-001",
      variantName: "18K Diamond Tennis Bracelet 18cm",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 15.0,
      targetMetalWeightGrams: 14.0,
      trackingType: "SERIALIZED",
    });

    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_PAY_REPO_01",
      name: "Prestige Diamond Supply",
      currency: "CAD",
      paymentTermsDays: 30,
    });

    const grnRes = await query<{ id: string }>(
      `
      INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
      VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-PAY-REPO-001', 'RECEIVED', $4)
      RETURNING id
      `,
      [orgId, storeId, sup.id, userId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `
      INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
      VALUES (gen_random_uuid(), $1, 'SHIP-PAY-REPO-001', 'BRINKS', 'BR-PAY-01', 'RECEIVED', $2)
      RETURNING id
      `,
      [grnId, userId],
    );
    const shipmentId = shipRes.rows[0]!.id;

    const shipItemRes = await query<{ id: string }>(
      `
      INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
      VALUES (gen_random_uuid(), $1, $2, 1, 2, 2)
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
      [shipmentId, storeId, userId],
    );
    const qcId = qcRes.rows[0]!.id;

    const qcItems = await Promise.all([1, 2].map((seq) =>
      query<{ id: string }>(
        `
        INSERT INTO quality_check_items (
          id, quality_check_id, shipment_item_id, item_sequence_number, status,
          gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
          hallmark_verified, visual_inspection_passed, damage_detected
        )
        VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 15.0000, 14.0000, $4, $5, true, true, false)
        RETURNING id
        `,
        [qcId, shipmentItemId, seq, mat.id, pur.id],
      ),
    ));

    const item1 = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state, selling_price_cad
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-PAY-REPO-001', 'Diamond Tennis Bracelet #1', 15.0, 14.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 10000.00)
      RETURNING id
      `,
      [orgId, storeId, sku.id, qcItems[0]!.rows[0]!.id, pur.id],
    );
    pieceId1 = item1.rows[0]!.id;

    const item2 = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state, selling_price_cad
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-PAY-REPO-002', 'Diamond Tennis Bracelet #2', 15.0, 14.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 5000.00)
      RETURNING id
      `,
      [orgId, storeId, sku.id, qcItems[1]!.rows[0]!.id, pur.id],
    );
    pieceId2 = item2.rows[0]!.id;

    const cust = await createCustomer({
      organizationId: orgId,
      customerCode: "CUST-PAY-001",
      firstName: "Lady",
      lastName: "Chatterley",
      email: "chatterley@estate.local",
    });
    customerId = cust.id;

    // Active Invoice: Total = 10,000 (taxRate: 0 for simpler math)
    const activeInv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      createdByUserId: userId,
      invoiceNumber: "INV-PAY-TEST-001",
      items: [
        {
          inventoryItemId: pieceId1,
          unitPriceCad: 10000.0,
          taxRate: 0.0,
        },
      ],
    });
    activeInvoiceId = activeInv.id;

    // Cancelled Invoice
    const cancelledInv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      createdByUserId: userId,
      invoiceNumber: "INV-PAY-TEST-002",
      items: [
        {
          inventoryItemId: pieceId2,
          unitPriceCad: 5000.0,
          taxRate: 0.0,
        },
      ],
    });
    cancelledInvoiceId = cancelledInv.id;
    await cancelSalesInvoice({
      id: cancelledInvoiceId,
      organizationId: orgId,
      reason: "Void before test",
    });
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: records partial payment (CAD 4,000 CASH) transitioning invoice to PARTIALLY_PAID", async () => {
    const result = await recordSalesPayment({
      organizationId: orgId,
      storeId,
      salesInvoiceId: activeInvoiceId,
      receivedByUserId: userId,
      paymentMethod: "CASH",
      amountCad: 4000.0,
      notes: "Cash deposit at counter",
    });

    expect(result.payment.id).toBeDefined();
    expect(result.payment.paymentMethod).toBe("CASH");
    expect(result.payment.amountCad).toBe(4000.0);
    expect(result.payment.status).toBe("SUCCESS");
    expect(result.payment.invoiceNumber).toBe("INV-PAY-TEST-001");

    expect(result.invoice.paidAmountCad).toBe(4000.0);
    expect(result.invoice.balanceDueCad).toBe(6000.0);
    expect(result.invoice.status).toBe("PARTIALLY_PAID");

    firstPaymentId = result.payment.id;
  });

  it("Scenario 2: rejects payment tender exceeding remaining balance due (CAD 7,000 vs CAD 6,000)", async () => {
    await expect(
      recordSalesPayment({
        organizationId: orgId,
        storeId,
        salesInvoiceId: activeInvoiceId,
        receivedByUserId: userId,
        paymentMethod: "CREDIT_CARD",
        amountCad: 7000.0,
      }),
    ).rejects.toThrow(/exceeds remaining invoice balance/);
  });

  it("Scenario 3: records split tender settlement (CAD 6,000 CREDIT_CARD) transitioning invoice to PAID", async () => {
    const result = await recordSalesPayment({
      organizationId: orgId,
      storeId,
      salesInvoiceId: activeInvoiceId,
      receivedByUserId: userId,
      paymentMethod: "CREDIT_CARD",
      amountCad: 6000.0,
      referenceNumber: "AUTH-CC-998811",
      cardLast4: "4242",
      notes: "Visa Infinite settlement",
    });

    expect(result.payment.paymentMethod).toBe("CREDIT_CARD");
    expect(result.payment.amountCad).toBe(6000.0);
    expect(result.payment.cardLast4).toBe("4242");

    expect(result.invoice.paidAmountCad).toBe(10000.0);
    expect(result.invoice.balanceDueCad).toBe(0.0);
    expect(result.invoice.status).toBe("PAID");
  });

  it("Scenario 4: rejects further payments on an already fully settled invoice", async () => {
    await expect(
      recordSalesPayment({
        organizationId: orgId,
        storeId,
        salesInvoiceId: activeInvoiceId,
        receivedByUserId: userId,
        paymentMethod: "CASH",
        amountCad: 100.0,
      }),
    ).rejects.toThrow(/already fully paid/);
  });

  it("Scenario 5: rejects payment tender on a cancelled invoice", async () => {
    await expect(
      recordSalesPayment({
        organizationId: orgId,
        storeId,
        salesInvoiceId: cancelledInvoiceId,
        receivedByUserId: userId,
        paymentMethod: "DEBIT_CARD",
        amountCad: 500.0,
      }),
    ).rejects.toThrow(/cancelled sales invoice/);
  });

  it("Scenario 6: guarantees append-only immutability (INV-09) on sales_payments", async () => {
    // Attempting direct UPDATE must be blocked
    await expect(
      query(
        `UPDATE sales_payments SET amount_cad = 9999.00 WHERE id = $1`,
        [firstPaymentId],
      ),
    ).rejects.toThrow(/strictly immutable financial ledger history \(INV-09\)/);

    // Attempting direct DELETE must be blocked
    await expect(
      query(
        `DELETE FROM sales_payments WHERE id = $1`,
        [firstPaymentId],
      ),
    ).rejects.toThrow(/strictly immutable financial ledger history \(INV-09\)/);
  });

  it("Scenario 7: retrieves sales payment by ID with user and invoice names", async () => {
    const payment = await getSalesPaymentById({
      id: firstPaymentId,
      organizationId: orgId,
    });

    expect(payment).not.toBeNull();
    expect(payment!.id).toBe(firstPaymentId);
    expect(payment!.amountCad).toBe(4000.0);
    expect(payment!.receivedByUserName).toBe("Head Cashier");
    expect(payment!.invoiceNumber).toBe("INV-PAY-TEST-001");
  });

  it("Scenario 8: lists sales payments filtered by invoice", async () => {
    const listRes = await listSalesPayments({
      organizationId: orgId,
      salesInvoiceId: activeInvoiceId,
    });

    expect(listRes.total).toBe(2);
    expect(listRes.data.length).toBe(2);
    expect(listRes.data.map((p) => p.paymentMethod)).toContain("CASH");
    expect(listRes.data.map((p) => p.paymentMethod)).toContain("CREDIT_CARD");
  });
});
