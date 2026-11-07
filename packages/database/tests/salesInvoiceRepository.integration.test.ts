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
  getSalesInvoiceById,
  listSalesInvoices,
  cancelSalesInvoice,
} from "../src/index.js";
import { StoreType } from "@jewelcore/shared";

describe("Sales Invoice Repository (FEAT-SALES-02, Entities 49 & 50)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;
  let userId: string;
  let customerId: string;
  let inactiveCustomerId: string;

  let pieceId1: string;
  let pieceId2: string;
  let otherStorePieceId: string;

  let createdInvoiceId: string;

  async function cleanFixtures() {
    await query(
      "DELETE FROM sales_invoice_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_REPO', 'ORG_INV_REPO_ALT'));",
    );
    await query(
      "DELETE FROM sales_invoices WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_REPO', 'ORG_INV_REPO_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_REPO', 'ORG_INV_REPO_ALT'));",
    );
    await query(
      "DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_REPO', 'ORG_INV_REPO_ALT'));",
    );
    await query(
      "DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%'));",
    );
    await query(
      "DELETE FROM quality_checks WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%');",
    );
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHIP-INV-REPO-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-INV-REPO-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_INV_REPO_%';");
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SKU-INV-REPO-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'PRD_INV_REPO_%';");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_INV_REPO_%';");
    await query("DELETE FROM materials WHERE code LIKE 'MAT_INV_REPO_%';");
    await query("DELETE FROM categories WHERE code LIKE 'CAT_INV_REPO_%';");
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_INV_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_INV_REPO', 'ORG_INV_REPO_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'inv_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_INV_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_INV_REPO', 'ORG_INV_REPO_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    // 1. Organizations
    const org = await createOrganization({
      code: "ORG_INV_REPO",
      name: "Boutique Sales Invoicing Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_INV_REPO_ALT",
      name: "Alternative Invoicing Corp",
    });
    otherOrgId = altOrg.id;

    // 2. Stores
    const store = await createStore({
      organizationId: orgId,
      code: "STORE_INV_REPO_01",
      name: "Flagship Showroom Toronto",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const otherStore = await createStore({
      organizationId: orgId,
      code: "STORE_INV_REPO_02",
      name: "Vancouver Branch",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = otherStore.id;

    // 3. User
    const userRes = await query<{ id: string }>(
      `
      INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active)
      VALUES (gen_random_uuid(), $1, 'inv_repo_admin@jewelcore.local', 'hash', 'Sales', 'Manager', true)
      RETURNING id
      `,
      [orgId],
    );
    userId = userRes.rows[0]!.id;

    // 4. Material, Purity, Category, Product, SKU
    const cat = await createCategory({
      organizationId: orgId,
      code: "CAT_INV_REPO_RNG",
      name: "Fine Rings",
    });

    const mat = await createMaterial({
      organizationId: orgId,
      code: "MAT_INV_REPO_18K",
      name: "18K Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const pur = await createPurity({
      materialId: mat.id,
      code: "PUR_INV_REPO_750",
      name: "750 Yellow Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const prod = await createProduct({
      organizationId: orgId,
      categoryId: cat.id,
      productCode: "PRD_INV_REPO_SOL",
      name: "Solitaire Engagement Ring",
      materialId: mat.id,
      defaultPurityId: pur.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: prod.id,
      skuCode: "SKU-INV-REPO-001",
      variantName: "18K Solitaire Ring 54",
      targetPurityId: pur.id,
      targetGrossWeightGrams: 5.5,
      targetMetalWeightGrams: 5.0,
      trackingType: "SERIALIZED",
    });

    // 5. Inbound Logistics & QC to birth serialized pieces
    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_INV_REPO_01",
      name: "Master Jewellers Ltd",
      currency: "CAD",
      paymentTermsDays: 30,
    });

    const grnRes = await query<{ id: string }>(
      `
      INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
      VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-INV-REPO-001', 'RECEIVED', $4)
      RETURNING id
      `,
      [orgId, storeId, sup.id, userId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `
      INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
      VALUES (gen_random_uuid(), $1, 'SHIP-INV-REPO-001', 'MALCA-AMIT', 'MA-001', 'RECEIVED', $2)
      RETURNING id
      `,
      [grnId, userId],
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
      [shipmentId, storeId, userId],
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
        VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 5.5000, 5.0000, $4, $5, true, true, false)
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
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-INV-REPO-001', 'Solitaire Ring #1', 5.5, 5.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 3500.00)
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
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-INV-REPO-002', 'Solitaire Ring #2', 5.5, 5.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 4200.00)
      RETURNING id
      `,
      [orgId, storeId, sku.id, qcItems[1]!.rows[0]!.id, pur.id],
    );
    pieceId2 = item2.rows[0]!.id;

    // Piece 3 in Store 2 (Vancouver) (AVAILABLE_FOR_SALE)
    const item3 = await query<{ id: string }>(
      `
      INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, quality_state, approval_state, custody_state, commercial_state, selling_price_cad
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SR-INV-REPO-003', 'Solitaire Ring #3', 5.5, 5.0, $5, 'QC_APPROVED', 'APPROVED', 'IN_VAULT', 'AVAILABLE_FOR_SALE', 5000.00)
      RETURNING id
      `,
      [orgId, otherStoreId, sku.id, qcItems[2]!.rows[0]!.id, pur.id],
    );
    otherStorePieceId = item3.rows[0]!.id;

    // 6. Customers
    const cust = await createCustomer({
      organizationId: orgId,
      customerCode: "CUST-INV-001",
      firstName: "Victoria",
      lastName: "Sterling",
      email: "victoria@sterling.local",
    });
    customerId = cust.id;

    const inactiveCust = await createCustomer({
      organizationId: orgId,
      customerCode: "CUST-INV-002",
      firstName: "Suspended",
      lastName: "Buyer",
      status: "SUSPENDED",
    });
    inactiveCustomerId = inactiveCust.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: creates a sales invoice with multiple lines, reserves pieces, and computes totals", async () => {
    const invoice = await createSalesInvoice({
      organizationId: orgId,
      storeId,
      customerId,
      createdByUserId: userId,
      invoiceNumber: "INV-REPO-TEST-001",
      discountAmountCad: 200.0,
      notes: "VIP Client Walk-in Purchase",
      items: [
        {
          inventoryItemId: pieceId1,
          unitPriceCad: 3500.0,
          discountAmountCad: 100.0, // Final: 3400. Tax (13%): 442. Line: 3842
          taxRate: 0.13,
          notes: "Complimentary ring resizing included",
        },
        {
          inventoryItemId: pieceId2,
          unitPriceCad: 4200.0,
          discountAmountCad: 0, // Final: 4200. Tax (13%): 546. Line: 4746
          taxRate: 0.13,
        },
      ],
    });

    expect(invoice.id).toBeDefined();
    expect(invoice.invoiceNumber).toBe("INV-REPO-TEST-001");
    expect(invoice.status).toBe("PENDING_PAYMENT");
    expect(invoice.subtotalCad).toBe(7600.0); // 3400 + 4200
    expect(invoice.taxAmountCad).toBe(988.0); // 442 + 546
    expect(invoice.discountAmountCad).toBe(200.0);
    expect(invoice.totalAmountCad).toBe(8388.0); // 7600 + 988 - 200
    expect(invoice.balanceDueCad).toBe(8388.0);
    expect(invoice.items?.length).toBe(2);

    createdInvoiceId = invoice.id;

    // Verify pieces are now RESERVED
    const piecesRes = await query<{ id: string; commercial_state: string }>(
      `SELECT id, commercial_state FROM inventory_items WHERE id IN ($1, $2)`,
      [pieceId1, pieceId2],
    );
    expect(piecesRes.rows[0]!.commercial_state).toBe("RESERVED");
    expect(piecesRes.rows[1]!.commercial_state).toBe("RESERVED");
  });

  it("Scenario 2: rejects piece that is already RESERVED (not AVAILABLE_FOR_SALE)", async () => {
    await expect(
      createSalesInvoice({
        organizationId: orgId,
        storeId,
        customerId,
        createdByUserId: userId,
        items: [
          {
            inventoryItemId: pieceId1, // Already reserved in Scenario 1
            unitPriceCad: 3500.0,
          },
        ],
      }),
    ).rejects.toThrow(/not available for sale/);
  });

  it("Scenario 3: rejects duplicate inventory item IDs in line items", async () => {
    await expect(
      createSalesInvoice({
        organizationId: orgId,
        storeId,
        customerId,
        createdByUserId: userId,
        items: [
          { inventoryItemId: otherStorePieceId, unitPriceCad: 5000.0 },
          { inventoryItemId: otherStorePieceId, unitPriceCad: 5000.0 },
        ],
      }),
    ).rejects.toThrow(/Duplicate inventory items/);
  });

  it("Scenario 4: rejects inventory item located in a different store", async () => {
    await expect(
      createSalesInvoice({
        organizationId: orgId,
        storeId, // Store 1 (Toronto)
        customerId,
        createdByUserId: userId,
        items: [
          {
            inventoryItemId: otherStorePieceId, // Store 2 (Vancouver)
            unitPriceCad: 5000.0,
          },
        ],
      }),
    ).rejects.toThrow(/is not in store/);
  });

  it("Scenario 5: rejects invoice creation for inactive or suspended customer", async () => {
    await expect(
      createSalesInvoice({
        organizationId: orgId,
        storeId: otherStoreId,
        customerId: inactiveCustomerId,
        createdByUserId: userId,
        items: [
          {
            inventoryItemId: otherStorePieceId,
            unitPriceCad: 5000.0,
          },
        ],
      }),
    ).rejects.toThrow(/Cannot issue invoice to suspended customer/);
  });

  it("Scenario 6: rejects duplicate invoice number in the same organization", async () => {
    await expect(
      createSalesInvoice({
        organizationId: orgId,
        storeId: otherStoreId,
        customerId,
        createdByUserId: userId,
        invoiceNumber: "INV-REPO-TEST-001", // Already used in Scenario 1
        items: [
          {
            inventoryItemId: otherStorePieceId,
            unitPriceCad: 5000.0,
          },
        ],
      }),
    ).rejects.toThrow(/Invoice number already exists/);
  });

  it("Scenario 7: retrieves sales invoice by ID with line items and customer details", async () => {
    const invoice = await getSalesInvoiceById({
      id: createdInvoiceId,
      organizationId: orgId,
    });

    expect(invoice).not.toBeNull();
    expect(invoice!.id).toBe(createdInvoiceId);
    expect(invoice!.customerName).toBe("Victoria Sterling");
    expect(invoice!.storeName).toBe("Flagship Showroom Toronto");
    expect(invoice!.items?.length).toBe(2);
    expect(invoice!.items?.[0]!.itemSerialNumber).toBe("SR-INV-REPO-001");
  });

  it("Scenario 8: lists sales invoices with status and search filtering", async () => {
    const listRes = await listSalesInvoices({
      organizationId: orgId,
      status: "PENDING_PAYMENT",
      search: "Victoria",
    });

    expect(listRes.total).toBe(1);
    expect(listRes.data[0]!.id).toBe(createdInvoiceId);
    expect(listRes.data[0]!.customerName).toBe("Victoria Sterling");
  });

  it("Scenario 9: cancels sales invoice and releases reserved pieces back to AVAILABLE_FOR_SALE", async () => {
    const cancelled = await cancelSalesInvoice({
      id: createdInvoiceId,
      organizationId: orgId,
      reason: "Customer changed mind before card processing",
    });

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.notes).toContain("Customer changed mind");

    // Verify pieces are reverted to AVAILABLE_FOR_SALE
    const piecesRes = await query<{ id: string; commercial_state: string }>(
      `SELECT id, commercial_state FROM inventory_items WHERE id IN ($1, $2)`,
      [pieceId1, pieceId2],
    );
    expect(piecesRes.rows[0]!.commercial_state).toBe("AVAILABLE_FOR_SALE");
    expect(piecesRes.rows[1]!.commercial_state).toBe("AVAILABLE_FOR_SALE");
  });

  it("Scenario 10: rejects cancellation of an already cancelled invoice", async () => {
    await expect(
      cancelSalesInvoice({
        id: createdInvoiceId,
        organizationId: orgId,
        reason: "Duplicate cancel attempt",
      }),
    ).rejects.toThrow(/already cancelled/);
  });
});
