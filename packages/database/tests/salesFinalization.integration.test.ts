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
} from "../src/index.js";
import { StoreType } from "@jewelcore/shared";

describe("Atomic Sale Finalization & Custody Release (FEAT-SALES-04)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let userId: string;
  let customerId: string;

  let pieceId: string;
  let secondPieceId: string;
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
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT'));",
    );
    await query(
      "DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT'));",
    );
    await query(
      "DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT'));",
    );
    await query(
      "DELETE FROM sales_payments WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT'));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-FIN-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-FIN-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-FIN-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-FIN-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-FIN-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_FIN_REPO_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-FIN-REPO-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_FIN_REPO_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_FIN_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_FIN_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_FIN_REPO_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_FIN_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'fin_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_FIN_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_FIN_REPO', 'ORG_FIN_REPO_ALT');",
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
      code: "ORG_FIN_REPO",
      name: "Sale Finalization Repository Org",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_FIN_REPO_ALT",
      name: "Rival Organization",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_FIN_REPO_01",
      name: "Vancouver Diamond Salon",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const userRes = await query<{ id: string }>(
      `
      INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active)
      VALUES (gen_random_uuid(), $1, 'fin_repo_officer@jewelcore.local', 'hash', 'Custody', 'Officer', true)
      RETURNING id
      `,
      [orgId],
    );
    userId = userRes.rows[0]!.id;

    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_FIN_REPO_PEN",
      name: "Diamond Pendants",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_FIN_REPO_PT",
      name: "Platinum",
      baseMetalType: "PLATINUM",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_FIN_REPO_950",
      name: "Platinum 950",
      purityPercentage: 95.0,
      purityRatio: 0.95,
      isHallmarkPurity: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_FIN_REPO_SOL",
      name: "Solitaire Diamond Pendant",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-FIN-REPO-001",
      variantName: "PT 950 2ct Solitaire Pendant",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 6.5,
      targetMetalWeightGrams: 6.0,
      trackingType: "SERIALIZED",
    });

    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_FIN_REPO_01",
      name: "Pendant Makers Ltd",
      currency: "CAD",
      paymentTermsDays: 30,
    });

    const grnRes = await query<{ id: string }>(
      `
      INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
      VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-FIN-REPO-001', 'RECEIVED', $4)
      RETURNING id
      `,
      [orgId, storeId, sup.id, userId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `
      INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
      VALUES (gen_random_uuid(), $1, 'SHIP-FIN-REPO-001', 'MALCA-AMIT', 'MA-FIN-01', 'RECEIVED', $2)
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
        VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 6.5000, 6.0000, $4, $5, true, true, false)
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
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-FIN-REPO-001', 'Diamond Solitaire Pendant #1', 6.5, 6.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 8000.00)
      RETURNING id
      `,
      [orgId, storeId, sku.id, qcItems[0]!.rows[0]!.id, pur.id],
    );
    pieceId = item1.rows[0]!.id;

    const item2 = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state, selling_price_cad
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-FIN-REPO-002', 'Diamond Solitaire Pendant #2', 6.5, 6.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 8000.00)
      RETURNING id
      `,
      [orgId, storeId, sku.id, qcItems[1]!.rows[0]!.id, pur.id],
    );
    secondPieceId = item2.rows[0]!.id;

    const cust = await createCustomer({
      organizationId: orgId,
      customerCode: "CUST-FIN-001",
      firstName: "Margaret",
      lastName: "Thatcher",
      email: "margaret@ironlady.local",
    });
    customerId = cust.id;

    // Unpaid Invoice
    const inv1 = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      createdByUserId: userId,
      invoiceNumber: "INV-FIN-UNPAID",
      items: [{ inventoryItemId: pieceId, unitPriceCad: 8000.0, taxRate: 0.0 }],
    });
    unpaidInvoiceId = inv1.id;

    // Settle Invoice to PAID
    const paymentRes = await recordSalesPayment({
      organizationId: orgId,
      storeId,
      salesInvoiceId: unpaidInvoiceId,
      receivedByUserId: userId,
      paymentMethod: "BANK_TRANSFER",
      amountCad: 8000.0,
      referenceNumber: "WIRE-REF-998811",
    });
    paidInvoiceId = paymentRes.invoice.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: rejects custody release for an unpaid invoice (ERR_INVOICE_NOT_PAID)", async () => {
    const tempInv = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      createdByUserId: userId,
      items: [{ inventoryItemId: secondPieceId, unitPriceCad: 8000.0, taxRate: 0.0 }],
    });

    await expect(
      finalizeSaleAndReleaseCustody({
        invoiceId: tempInv.id,
        organizationId: orgId,
        actorUserId: userId,
      }),
    ).rejects.toThrow(/Cannot release physical custody for an unpaid/);
  });

  it("Scenario 2: atomically finalizes sale, releases custody, appends movements, status history, and audit trail", async () => {
    const result = await finalizeSaleAndReleaseCustody({
      invoiceId: paidInvoiceId,
      organizationId: orgId,
      actorUserId: userId,
      reason: "Handed over to Lady Margaret in presentation box",
    });

    expect(result.invoice.id).toBe(paidInvoiceId);
    expect(result.invoice.releasedAt).toBeDefined();
    expect(result.invoice.releasedByUserId).toBe(userId);
    expect(result.releasedPieceIds).toEqual([pieceId]);
    expect(result.movementIds.length).toBe(1);

    // 1. Verify piece is SOLD and RELEASED
    const pieceRes = await query<{
      commercial_state: string;
      custody_state: string;
      current_compartment_id: string | null;
      version: number;
    }>(
      `SELECT commercial_state, custody_state, current_compartment_id, version FROM inventory_items WHERE id = $1`,
      [pieceId],
    );
    expect(pieceRes.rows[0]!.commercial_state).toBe("SOLD");
    expect(pieceRes.rows[0]!.custody_state).toBe("RELEASED");
    expect(pieceRes.rows[0]!.current_compartment_id).toBeNull();
    expect(pieceRes.rows[0]!.version).toBeGreaterThanOrEqual(2);

    // 2. Verify append-only custody movement
    const movementRes = await query<{
      movement_type: string;
      to_custody_state: string;
      reference_document_type: string;
    }>(
      `SELECT movement_type, to_custody_state, reference_document_type FROM inventory_movements WHERE id = $1`,
      [result.movementIds[0]],
    );
    expect(movementRes.rows[0]!.movement_type).toBe("CUSTODY_DEPARTURE");
    expect(movementRes.rows[0]!.to_custody_state).toBe("RELEASED");
    expect(movementRes.rows[0]!.reference_document_type).toBe("SALES_INVOICE");

    // 3. Verify status history has both COMMERCIAL and CUSTODY dimensions
    const historyRes = await query<{ dimension_changed: string; new_state: string }>(
      `SELECT dimension_changed, new_state FROM inventory_status_history WHERE inventory_item_id = $1 ORDER BY dimension_changed ASC`,
      [pieceId],
    );
    const dimensions = historyRes.rows.map((h) => `${h.dimension_changed}:${h.new_state}`);
    expect(dimensions).toContain("COMMERCIAL:SOLD");
    expect(dimensions).toContain("CUSTODY:RELEASED");

    // 4. Verify compliance audit trail
    const auditRes = await query<{ action: string; resource_type: string }>(
      `SELECT action, resource_type FROM audit_events WHERE resource_id = $1`,
      [paidInvoiceId],
    );
    expect(auditRes.rows[0]!.action).toBe("FINALIZE_AND_RELEASE_CUSTODY");
    expect(auditRes.rows[0]!.resource_type).toBe("sales_invoices");
  });

  it("Scenario 3: rejects repeat custody release on already released invoice (ERR_CUSTODY_ALREADY_RELEASED)", async () => {
    await expect(
      finalizeSaleAndReleaseCustody({
        invoiceId: paidInvoiceId,
        organizationId: orgId,
        actorUserId: userId,
      }),
    ).rejects.toThrow(/Physical custody of pieces on this invoice has already been released/);
  });

  it("Scenario 4: rejects custody release across organization boundaries", async () => {
    await expect(
      finalizeSaleAndReleaseCustody({
        invoiceId: paidInvoiceId,
        organizationId: otherOrgId,
        actorUserId: userId,
      }),
    ).rejects.toThrow(/not found/);
  });
});
