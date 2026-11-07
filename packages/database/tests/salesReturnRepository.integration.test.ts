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
  processSalesReturn,
  getSalesReturnById,
  listSalesReturns,
} from "../src/index.js";
import {
  StoreType,
  ReturnReason,
  ReturnCondition,
  ReturnDisposition,
  RefundMethod,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("Sales Return Repository (FEAT-RET-01, Entities 52 & 53)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;
  let compartmentId: string;
  let otherStoreCompartmentId: string;
  let userId: string;
  let customerId: string;

  let pieceId1: string;
  let pieceId2: string;
  let pieceId3: string;
  let pieceId4: string;
  let pieceId5: string;

  let finalizedInvoiceId: string;
  let unfinalizedInvoiceId: string;
  let invoiceItemId1: string;
  let invoiceItemId2: string;
  let invoiceItemId3: string;
  let invoiceItemId4: string;

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
      "DELETE FROM sales_return_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM sales_returns WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM sales_payments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-RET-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-RET-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-RET-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-RET-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-RET-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_RET_REPO_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-RET-REPO-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_RET_REPO_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_RET_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_RET_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_RET_REPO_%';");
    await query(
      "DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RET_REPO_%');",
    );
    await query(
      "DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RET_REPO_%');",
    );
    await query(
      "DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RET_REPO_%');",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_RET_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'ret_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_RET_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_RET_REPO', 'ORG_RET_REPO_ALT');",
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

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_RET_REPO",
      name: "Luxury Returns Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_RET_REPO_ALT",
      name: "Alternative Returns Corp",
    });
    otherOrgId = altOrg.id;

    // 2. Stores
    const store = await createStore({
      organizationId: orgId,
      code: "STORE_RET_REPO_01",
      name: "Toronto Downtown",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const otherStore = await createStore({
      organizationId: orgId,
      code: "STORE_RET_REPO_02",
      name: "Montreal Branch",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = otherStore.id;

    // 3. Vaults, Lockers, Compartments
    const vaultRes = await query<{ id: string }>(
      `INSERT INTO vaults (id, store_id, code, name, vault_type)
       VALUES (gen_random_uuid(), $1, 'VLT-RET-01', 'Main Safe', 'MAIN_VAULT')
       RETURNING id`,
      [storeId],
    );
    const lockerRes = await query<{ id: string }>(
      `INSERT INTO lockers (id, vault_id, store_id, code, name, locker_number)
       VALUES (gen_random_uuid(), $1, $2, 'LCK-RET-01', 'Safe Locker A', 'L-01')
       RETURNING id`,
      [vaultRes.rows[0]!.id, storeId],
    );
    const compRes = await query<{ id: string }>(
      `INSERT INTO compartments (id, locker_id, store_id, code, name, compartment_number)
       VALUES (gen_random_uuid(), $1, $2, 'CMP-RET-01', 'Tray 1', 'C-01')
       RETURNING id`,
      [lockerRes.rows[0]!.id, storeId],
    );
    compartmentId = compRes.rows[0]!.id;

    // Compartment for otherStore
    const otherVaultRes = await query<{ id: string }>(
      `INSERT INTO vaults (id, store_id, code, name, vault_type)
       VALUES (gen_random_uuid(), $1, 'VLT-RET-02', 'MTL Safe', 'MAIN_VAULT')
       RETURNING id`,
      [otherStoreId],
    );
    const otherLockerRes = await query<{ id: string }>(
      `INSERT INTO lockers (id, vault_id, store_id, code, name, locker_number)
       VALUES (gen_random_uuid(), $1, $2, 'LCK-RET-02', 'MTL Locker', 'L-02')
       RETURNING id`,
      [otherVaultRes.rows[0]!.id, otherStoreId],
    );
    const otherCompRes = await query<{ id: string }>(
      `INSERT INTO compartments (id, locker_id, store_id, code, name, compartment_number)
       VALUES (gen_random_uuid(), $1, $2, 'CMP-RET-02', 'MTL Tray', 'C-02')
       RETURNING id`,
      [otherLockerRes.rows[0]!.id, otherStoreId],
    );
    otherStoreCompartmentId = otherCompRes.rows[0]!.id;

    // 4. User
    const userRes = await query<{ id: string }>(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active)
       VALUES (gen_random_uuid(), $1, 'ret_repo_clerk@jewelcore.local', 'hash', 'Return', 'Clerk', true)
       RETURNING id`,
      [orgId],
    );
    userId = userRes.rows[0]!.id;

    // 5. Taxonomy & SKU
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_RET_REPO_NECK",
      name: "Necklaces",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_RET_REPO_18K",
      name: "18K Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_RET_REPO_750",
      name: "18K (750)",
      purityPercentage: 75.0,
      hallmarkEligible: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_RET_REPO_01",
      name: "Gold Choker",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-RET-REPO-01",
      variantName: "Standard Choker",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 10.0,
      targetMetalWeightGrams: 9.5,
      trackingType: "SERIALIZED",
    });

    // 6. Supplier, GRN, Shipment, QC
    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_RET_REPO_01",
      name: "Top Jewel Suppliers Inc",
    });

    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-RET-REPO-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, storeId, sup.id, userId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHIP-RET-REPO-01', 'MALCA-AMIT', 'MA-RET-01', 'RECEIVED', $2)
       RETURNING id`,
      [grnId, userId],
    );
    const shipmentId = shipRes.rows[0]!.id;

    const shipItemRes = await query<{ id: string }>(
      `INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
       VALUES (gen_random_uuid(), $1, $2, 1, 5, 5)
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

    // QC items
    const qcItems: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const qci = await query<{ id: string }>(
        `INSERT INTO quality_check_items (
          id, quality_check_id, shipment_item_id, item_sequence_number, status,
          gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
          hallmark_verified, visual_inspection_passed, damage_detected
         )
         VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 10.0000, 9.5000, $4, $5, true, true, false)
         RETURNING id`,
        [qcId, shipmentItemId, i, mat.id, pur.id],
      );
      qcItems.push(qci.rows[0]!.id);
    }

    // 7. Inventory Items
    const p1 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-RET-01', 'Choker 1', 10.0000, 9.5000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 1200.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[0]!, pur.id, compartmentId],
    );
    pieceId1 = p1.rows[0]!.id;

    const p2 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-RET-02', 'Choker 2', 10.0000, 9.5000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 1500.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[1]!, pur.id, compartmentId],
    );
    pieceId2 = p2.rows[0]!.id;

    const p3 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-RET-03', 'Choker 3', 10.0000, 9.5000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 800.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[2]!, pur.id, compartmentId],
    );
    pieceId3 = p3.rows[0]!.id;

    const p4 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-RET-04', 'Choker 4', 10.0000, 9.5000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 2000.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[3]!, pur.id, compartmentId],
    );
    pieceId4 = p4.rows[0]!.id;

    const p5 = await query<{ id: string }>(
      `INSERT INTO inventory_items (id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name, gross_weight_grams, net_weight_grams, purity_id, commercial_state, custody_state, current_compartment_id, selling_price_cad)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SN-RET-05', 'Choker 5', 10.0000, 9.5000, $5, 'AVAILABLE_FOR_SALE', 'IN_VAULT', $6, 500.00)
       RETURNING id`,
      [orgId, storeId, sku.id, qcItems[4]!, pur.id, compartmentId],
    );
    pieceId5 = p5.rows[0]!.id;

    // 8. Customer
    const cust = await createCustomer({
      organizationId: orgId,
      primaryStoreId: storeId,
      customerCode: "CUST-RET-01",
      customerType: "INDIVIDUAL",
      firstName: "Alice",
      lastName: "Wonderland",
      email: "alice.ret@example.com",
    });
    customerId = cust.id;

    // 9. Create and finalize invoice with pieces 1, 2, 3
    const invoice = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      invoiceNumber: "INV-RET-TEST-001",
      createdByUserId: userId,
      items: [
        { inventoryItemId: pieceId1, unitPriceCad: 1200 },
        { inventoryItemId: pieceId2, unitPriceCad: 1500 },
        { inventoryItemId: pieceId3, unitPriceCad: 800 },
      ],
    });
    finalizedInvoiceId = invoice.id;
    invoiceItemId1 = invoice.items![0]!.id;
    invoiceItemId2 = invoice.items![1]!.id;
    invoiceItemId3 = invoice.items![2]!.id;

    // Settle invoice with payment
    await recordSalesPayment({
      organizationId: orgId,
      storeId,
      salesInvoiceId: finalizedInvoiceId,
      receivedByUserId: userId,
      paymentMethod: "CREDIT_CARD",
      amountCad: invoice.totalAmountCad,
    });

    // Finalize and release custody
    await finalizeSaleAndReleaseCustody({
      invoiceId: finalizedInvoiceId,
      organizationId: orgId,
      actorUserId: userId,
    });

    // 10. Create an unfinalized invoice with piece 4
    const unfinInvoice = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      invoiceNumber: "INV-RET-TEST-002",
      createdByUserId: userId,
      items: [{ inventoryItemId: pieceId4, unitPriceCad: 2000 }],
    });
    unfinalizedInvoiceId = unfinInvoice.id;
    invoiceItemId4 = unfinInvoice.items![0]!.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("successfully processes customer return with RESTOCK_AS_NEW and restores inventory piece (FEAT-RET-01)", async () => {
    const returnRecord = await processSalesReturn({
      organizationId: orgId,
      processedByUserId: userId,
      storeId,
      salesInvoiceId: finalizedInvoiceId,
      returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
      refundMethod: RefundMethod.STORE_CREDIT,
      items: [
        {
          salesInvoiceItemId: invoiceItemId1,
          condition: ReturnCondition.NEW_CONDITION,
          disposition: ReturnDisposition.RESTOCK_AS_NEW,
          targetCompartmentId: compartmentId,
          restockingFeeCad: 50.0,
          inspectionNotes: "Pristine piece, tags intact",
        },
      ],
    });

    expect(returnRecord.id).toBeDefined();
    expect(returnRecord.returnNumber).toMatch(/^RET-/);
    expect(returnRecord.status).toBe("COMPLETED");
    expect(returnRecord.totalRefundAmountCad).toBe(1356);
    expect(returnRecord.restockingFeeCad).toBe(50);
    expect(returnRecord.netRefundAmountCad).toBe(1306);
    expect(returnRecord.items).toHaveLength(1);
    expect(returnRecord.items![0]!.condition).toBe("NEW_CONDITION");
    expect(returnRecord.items![0]!.disposition).toBe("RESTOCK_AS_NEW");
    expect(returnRecord.items![0]!.targetCompartmentId).toBe(compartmentId);

    // Verify physical inventory piece restored to AVAILABLE_FOR_SALE & IN_VAULT
    const pieceRes = await query<{
      commercial_state: string;
      custody_state: string;
      current_compartment_id: string;
    }>(
      `SELECT commercial_state, custody_state, current_compartment_id FROM inventory_items WHERE id = $1`,
      [pieceId1],
    );
    expect(pieceRes.rows[0]!.commercial_state).toBe("AVAILABLE_FOR_SALE");
    expect(pieceRes.rows[0]!.custody_state).toBe("IN_VAULT");
    expect(pieceRes.rows[0]!.current_compartment_id).toBe(compartmentId);

    // Verify inventory movement appended (INV-09)
    const movRes = await query<{
      movement_type: string;
      to_custody_state: string;
      reason_code: string;
      to_compartment_id: string;
    }>(
      `SELECT movement_type, to_custody_state, reason_code, to_compartment_id FROM inventory_movements WHERE inventory_item_id = $1 ORDER BY moved_at DESC LIMIT 1`,
      [pieceId1],
    );
    expect(movRes.rows[0]!.movement_type).toBe("INTAKE_PLACEMENT");
    expect(movRes.rows[0]!.to_custody_state).toBe("IN_VAULT");
    expect(movRes.rows[0]!.reason_code).toBe("CUSTOMER_RETURN_RESTOCK");
    expect(movRes.rows[0]!.to_compartment_id).toBe(compartmentId);

    // Verify status history appended
    const historyRes = await query<{
      dimension_changed: string;
      new_state: string;
    }>(
      `SELECT dimension_changed, new_state FROM inventory_status_history WHERE inventory_item_id = $1 ORDER BY transitioned_at DESC LIMIT 2`,
      [pieceId1],
    );
    expect(historyRes.rows.some((h) => h.dimension_changed === "COMMERCIAL" && h.new_state === "AVAILABLE_FOR_SALE")).toBe(true);
    expect(historyRes.rows.some((h) => h.dimension_changed === "CUSTODY" && h.new_state === "IN_VAULT")).toBe(true);

    // Verify audit event
    const auditRes = await query<{ action: string; resource_id: string }>(
      `SELECT action, resource_id FROM audit_events WHERE resource_id = $1`,
      [returnRecord.id],
    );
    expect(auditRes.rows[0]!.action).toBe("SALES_RETURN_PROCESSED");
  });

  it("processes return with SEND_TO_REPAIR disposition setting commercial state to UNREADY", async () => {
    const returnRecord = await processSalesReturn({
      organizationId: orgId,
      processedByUserId: userId,
      storeId,
      salesInvoiceId: finalizedInvoiceId,
      returnReason: ReturnReason.DEFECTIVE,
      refundMethod: RefundMethod.ORIGINAL_PAYMENT_METHOD,
      items: [
        {
          salesInvoiceItemId: invoiceItemId2,
          condition: ReturnCondition.DAMAGED,
          disposition: ReturnDisposition.SEND_TO_REPAIR,
          targetCompartmentId: compartmentId,
          restockingFeeCad: 0,
          inspectionNotes: "Clasp broken",
        },
      ],
    });

    expect(returnRecord.id).toBeDefined();
    expect(returnRecord.items![0]!.disposition).toBe("SEND_TO_REPAIR");

    const pieceRes = await query<{
      commercial_state: string;
      custody_state: string;
    }>(
      `SELECT commercial_state, custody_state FROM inventory_items WHERE id = $1`,
      [pieceId2],
    );
    expect(pieceRes.rows[0]!.commercial_state).toBe("UNREADY");
    expect(pieceRes.rows[0]!.custody_state).toBe("IN_VAULT");
  });

  it("processes return with SEND_TO_MELT disposition setting commercial state to UNREADY", async () => {
    const returnRecord = await processSalesReturn({
      organizationId: orgId,
      processedByUserId: userId,
      storeId,
      salesInvoiceId: finalizedInvoiceId,
      returnReason: ReturnReason.OTHER,
      refundMethod: RefundMethod.CASH,
      items: [
        {
          salesInvoiceItemId: invoiceItemId3,
          condition: ReturnCondition.DAMAGED,
          disposition: ReturnDisposition.SEND_TO_MELT,
          targetCompartmentId: compartmentId,
          restockingFeeCad: 0,
          inspectionNotes: "Crushed piece, melt down for gold scrap",
        },
      ],
    });

    expect(returnRecord.id).toBeDefined();
    expect(returnRecord.items![0]!.disposition).toBe("SEND_TO_MELT");

    const pieceRes = await query<{
      commercial_state: string;
      custody_state: string;
    }>(
      `SELECT commercial_state, custody_state FROM inventory_items WHERE id = $1`,
      [pieceId3],
    );
    expect(pieceRes.rows[0]!.commercial_state).toBe("UNREADY");
    expect(pieceRes.rows[0]!.custody_state).toBe("IN_VAULT");
  });

  it("rejects return on unfinalized/unpaid sales invoice", async () => {
    await expect(
      processSalesReturn({
        organizationId: orgId,
        processedByUserId: userId,
        storeId,
        salesInvoiceId: unfinalizedInvoiceId,
        returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
        refundMethod: RefundMethod.STORE_CREDIT,
        items: [
          {
            salesInvoiceItemId: invoiceItemId4,
            condition: ReturnCondition.NEW_CONDITION,
            disposition: ReturnDisposition.RESTOCK_AS_NEW,
            targetCompartmentId: compartmentId,
            restockingFeeCad: 0,
          },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("rejects double return of the already returned item", async () => {
    await expect(
      processSalesReturn({
        organizationId: orgId,
        processedByUserId: userId,
        storeId,
        salesInvoiceId: finalizedInvoiceId,
        returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
        refundMethod: RefundMethod.STORE_CREDIT,
        items: [
          {
            salesInvoiceItemId: invoiceItemId1, // already returned in test 1
            condition: ReturnCondition.NEW_CONDITION,
            disposition: ReturnDisposition.RESTOCK_AS_NEW,
            targetCompartmentId: compartmentId,
            restockingFeeCad: 0,
          },
        ],
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects return if restocking fee exceeds item refund amount", async () => {
    // Attempt with restocking fee greater than item price (using a fresh invoice)
    const newInv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      invoiceNumber: "INV-RET-TEST-003",
      createdByUserId: userId,
      items: [{ inventoryItemId: pieceId5, unitPriceCad: 500 }],
    });
    await recordSalesPayment({
      organizationId: orgId,
      storeId,
      salesInvoiceId: newInv.id,
      receivedByUserId: userId,
      paymentMethod: "CASH",
      amountCad: newInv.totalAmountCad,
    });
    await finalizeSaleAndReleaseCustody({
      invoiceId: newInv.id,
      organizationId: orgId,
      actorUserId: userId,
    });

    await expect(
      processSalesReturn({
        organizationId: orgId,
        processedByUserId: userId,
        storeId,
        salesInvoiceId: newInv.id,
        returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
        refundMethod: RefundMethod.CASH,
        items: [
          {
            salesInvoiceItemId: newInv.items![0]!.id,
            condition: ReturnCondition.NEW_CONDITION,
            disposition: ReturnDisposition.RESTOCK_AS_NEW,
            targetCompartmentId: compartmentId,
            restockingFeeCad: 600, // exceeds 500
          },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("rejects return if target compartment belongs to another store (INV-11)", async () => {
    // Attempt to return piece from newInv with compartment belonging to otherStoreId
    const newInvRes = await query<{ id: string; sales_invoice_id: string }>(
      `SELECT sii.id, sii.sales_invoice_id FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.sales_invoice_id WHERE si.store_id = $1 AND sii.id NOT IN (SELECT sales_invoice_item_id FROM sales_return_items) LIMIT 1`,
      [storeId],
    );

    if (newInvRes.rows[0]) {
      await expect(
        processSalesReturn({
          organizationId: orgId,
          processedByUserId: userId,
          storeId,
          salesInvoiceId: newInvRes.rows[0].sales_invoice_id,
          returnReason: ReturnReason.CUSTOMER_CHANGED_MIND,
          refundMethod: RefundMethod.CASH,
          items: [
            {
              salesInvoiceItemId: newInvRes.rows[0].id,
              condition: ReturnCondition.NEW_CONDITION,
              disposition: ReturnDisposition.RESTOCK_AS_NEW,
              targetCompartmentId: otherStoreCompartmentId, // belongs to other store
              restockingFeeCad: 0,
            },
          ],
        }),
      ).rejects.toThrow(UnprocessableEntityError);
    }
  });

  it("retrieves sales return by ID with line items and customer/store joins", async () => {
    const listRes = await listSalesReturns({
      organizationId: orgId,
      storeId,
    });
    expect(listRes.total).toBeGreaterThanOrEqual(1);

    const firstReturn = listRes.data[0]!;
    const fetched = await getSalesReturnById({
      id: firstReturn.id,
      organizationId: orgId,
    });

    expect(fetched.id).toBe(firstReturn.id);
    expect(fetched.customerName).toBeDefined();
    expect(fetched.storeName).toBe("Toronto Downtown");
    expect(fetched.invoiceNumber).toBeDefined();
    expect(fetched.items).toBeDefined();
    expect(fetched.items!.length).toBeGreaterThanOrEqual(1);
  });

  it("lists sales returns with filtering by store, invoice, and pagination", async () => {
    const listByStore = await listSalesReturns({
      organizationId: orgId,
      storeId,
      limit: 10,
      offset: 0,
    });
    expect(listByStore.data.length).toBeGreaterThanOrEqual(1);
    expect(listByStore.total).toBeGreaterThanOrEqual(1);

    const listByInvoice = await listSalesReturns({
      organizationId: orgId,
      salesInvoiceId: finalizedInvoiceId,
    });
    expect(listByInvoice.data.length).toBeGreaterThanOrEqual(1);

    const listEmptyStore = await listSalesReturns({
      organizationId: orgId,
      storeId: otherStoreId,
    });
    expect(listEmptyStore.total).toBe(0);
    expect(listEmptyStore.data).toHaveLength(0);
  });
});
