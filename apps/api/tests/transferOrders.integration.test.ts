import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  query,
  runAllMigrations,
  createOrganization,
  createStore,
  createUser,
  createOrganizationMembership,
  createStoreMembership,
  getRoleByCode,
  assignRoleToUser,
  createVault,
  createLocker,
  createCompartment,
  createCategory,
  createMaterial,
  createPurity,
  createProduct,
  createProductSku,
  createSupplier,
  uuidv7,
} from "@jewelcore/database";
import {
  StoreType,
  TransferOrderStatus,
  TransferOrderPriority,
  TransferOrderItemStatus,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Transfer Orders API (FEAT-XFR-01, Entities 58 & 59)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let sourceStoreId: string;
  let destinationStoreId: string;
  let otherStoreId: string;

  let managerToken: string;
  let managerUserId: string;
  let unprivilegedToken: string;
  let unprivilegedUserId: string;
  let otherOrgManagerToken: string;

  let skuId: string;
  let pieceId1: string;
  let pieceId2: string;
  let pieceId3: string;
  let pieceIdDifferentStore: string;

  async function cleanFixtures() {
    await query("ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;");

    await query("DELETE FROM transfer_order_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM transfer_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'))));");
    await query("DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT')));");
    await query("DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'))));");
    await query("DELETE FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT')));");
    await query("DELETE FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM suppliers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM product_skus WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM products WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_XFR_API_%';");
    await query("DELETE FROM materials WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM categories WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT')));");
    await query("DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT')));");
    await query("DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT')));");
    await query("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT')));");
    await query("DELETE FROM store_memberships WHERE organization_membership_id IN (SELECT id FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT')));");
    await query("DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT'));");
    await query("DELETE FROM organizations WHERE code IN ('ORG_XFR_API', 'ORG_XFR_API_ALT');");

    await query("ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;");
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_XFR_API",
      name: "Transfer API Org",
    });
    orgId = org.id;

    const otherOrg = await createOrganization({
      code: "ORG_XFR_API_ALT",
      name: "Transfer API Alt Org",
    });
    otherOrgId = otherOrg.id;

    const sourceStore = await createStore({
      organizationId: orgId,
      code: "STORE_XFR_API_01",
      name: "Flagship Vault Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    sourceStoreId = sourceStore.id;

    const destStore = await createStore({
      organizationId: orgId,
      code: "STORE_XFR_API_02",
      name: "Boutique Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    destinationStoreId = destStore.id;

    const otherStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_XFR_API_ALT",
      name: "Alternate Org Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    otherStoreId = otherStore.id;

    // 1. Manager User (has transfer:order:create, transfer:order:view, transfer:order:approve)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "mgr_xfr_api@test.com",
      firstName: "Manager",
      lastName: "User",
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
      storeId: sourceStoreId,
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

    // 2. Unprivileged User (QC_TECHNICIAN, lacks transfer:order:create and transfer:order:approve)
    const unprivilegedUser = await createUser({
      organizationId: orgId,
      email: "unprivileged_xfr_api@test.com",
      firstName: "Unprivileged",
      lastName: "Tech",
      passwordHash: "hash",
      isActive: true,
    });
    unprivilegedUserId = unprivilegedUser.id;

    const unprivOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: unprivilegedUserId,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: sourceStoreId,
      organizationMembershipId: unprivOrgMem.id,
      isDefault: true,
    });
    const qcRole = await getRoleByCode("QC_TECHNICIAN");
    if (qcRole) {
      await assignRoleToUser(unprivilegedUserId, qcRole.id);
    }
    unprivilegedToken = await signAccessToken({
      userId: unprivilegedUserId,
      email: unprivilegedUser.email,
      orgId,
    });

    // 3. Alternate Org Manager
    const otherOrgUser = await createUser({
      organizationId: otherOrgId,
      email: "other_org_mgr@test.com",
      firstName: "Other",
      lastName: "Manager",
      passwordHash: "hash",
      isActive: true,
    });
    const otherOrgMem = await createOrganizationMembership({
      organizationId: otherOrgId,
      userId: otherOrgUser.id,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: otherStoreId,
      organizationMembershipId: otherOrgMem.id,
      isDefault: true,
    });
    if (storeManagerRole) {
      await assignRoleToUser(otherOrgUser.id, storeManagerRole.id);
    }
    otherOrgManagerToken = await signAccessToken({
      userId: otherOrgUser.id,
      email: otherOrgUser.email,
      orgId: otherOrgId,
    });

    // 4. Storage & Product Hierarchy
    const vault = await createVault({
      storeId: sourceStoreId,
      code: "VLT_XFR_API_01",
      name: "Main Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId: sourceStoreId,
      code: "LCK_XFR_API_01",
      name: "Locker A",
      lockerNumber: "LK-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId: sourceStoreId,
      code: "CMP_XFR_API_01",
      name: "Compartment 1",
      compartmentNumber: "C-01",
    });

    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_XFR_API_RINGS",
      name: "Solitaire Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_XFR_API_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_XFR_API_18K",
      name: "18K Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_XFR_API_001",
      name: "Classic Solitaire",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-XFR-API-001",
      name: "Solitaire Ring 18K",
      variantName: "Standard",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 5.0,
      targetMetalWeightGrams: 5.0,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // Supplier, GRN, Shipment, QC items
    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_XFR_API_01",
      name: "Supplier XFR API",
    });

    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-XFR-API-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, sourceStoreId, sup.id, managerUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHIP-XFR-API-01', 'BRINKS', 'BR-01', 'RECEIVED', $2)
       RETURNING id`,
      [grnId, managerUserId],
    );
    const shipmentId = shipRes.rows[0]!.id;

    const shipItemRes = await query<{ id: string }>(
      `INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
       VALUES (gen_random_uuid(), $1, $2, 1, 4, 4)
       RETURNING id`,
      [shipmentId, sku.id],
    );
    const shipmentItemId = shipItemRes.rows[0]!.id;

    const qcRes = await query<{ id: string }>(
      `INSERT INTO quality_checks (id, shipment_id, store_id, inspector_user_id, session_sequence_number, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 1, 'APPROVED')
       RETURNING id`,
      [shipmentId, sourceStoreId, managerUserId],
    );
    const qcId = qcRes.rows[0]!.id;

    const qcItems: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const qci = await query<{ id: string }>(
        `INSERT INTO quality_check_items (
          id, quality_check_id, shipment_item_id, item_sequence_number, status,
          gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
          hallmark_verified, visual_inspection_passed, damage_detected
         )
         VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 5.0000, 5.0000, $4, $5, true, true, false)
         RETURNING id`,
        [qcId, shipmentItemId, i, material.id, purity.id],
      );
      qcItems.push(qci.rows[0]!.id);
    }

    pieceId1 = uuidv7();
    pieceId2 = uuidv7();
    pieceId3 = uuidv7();
    pieceIdDifferentStore = uuidv7();

    await query(
      `INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, custody_state, commercial_state, current_compartment_id,
        created_at, updated_at
      ) VALUES
       ($1, $2, $3, $4, $5, 'SN-XFR-API-01', 'Solitaire 1', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($8, $2, $3, $4, $9, 'SN-XFR-API-02', 'Solitaire 2', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($10, $2, $3, $4, $11, 'SN-XFR-API-03', 'Solitaire 3', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($12, $2, $13, $4, $14, 'SN-XFR-API-04', 'Solitaire 4', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', NULL, clock_timestamp(), clock_timestamp())`,
      [
        pieceId1, orgId, sourceStoreId, sku.id, qcItems[0]!, purity.id, comp.id,
        pieceId2, qcItems[1]!,
        pieceId3, qcItems[2]!,
        pieceIdDifferentStore, destinationStoreId, qcItems[3]!,
      ],
    );
  });

  afterAll(async () => {
    await cleanFixtures();
  });

  it("POST /api/v1/transfers/orders returns 401 if unauthenticated", async () => {
    const res = await request(app)
      .post("/api/v1/transfers/orders")
      .send({
        sourceStoreId,
        destinationStoreId,
      });

    expect(res.status).toBe(401);
  });

  it("POST /api/v1/transfers/orders returns 403 if user lacks transfer:order:create", async () => {
    const res = await request(app)
      .post("/api/v1/transfers/orders")
      .set("Authorization", `Bearer ${unprivilegedToken}`)
      .send({
        sourceStoreId,
        destinationStoreId,
      });

    expect(res.status).toBe(403);
  });

  it("POST /api/v1/transfers/orders returns 400 if source and destination store are identical", async () => {
    const res = await request(app)
      .post("/api/v1/transfers/orders")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        sourceStoreId,
        destinationStoreId: sourceStoreId,
      });

    expect(res.status).toBe(400);
  });

  it("POST /api/v1/transfers/orders successfully creates a draft transfer order (201 Created)", async () => {
    const res = await request(app)
      .post("/api/v1/transfers/orders")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        sourceStoreId,
        destinationStoreId,
        priority: TransferOrderPriority.HIGH,
        notes: "Store showcase replenishment",
        itemIds: [pieceId1],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe(TransferOrderStatus.DRAFT);
    expect(res.body.priority).toBe(TransferOrderPriority.HIGH);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].inventoryItemId).toBe(pieceId1);
  });

  it("POST /api/v1/transfers/orders/:id/items adds line item and DELETE removes it", async () => {
    // 1. Create empty draft
    const createRes = await request(app)
      .post("/api/v1/transfers/orders")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        sourceStoreId,
        destinationStoreId,
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.id;

    // 2. Add pieceId2
    const addRes = await request(app)
      .post(`/api/v1/transfers/orders/${orderId}/items`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        inventoryItemId: pieceId2,
        notes: "Verified condition",
      });
    expect(addRes.status).toBe(201);
    expect(addRes.body.inventoryItemId).toBe(pieceId2);
    const itemId = addRes.body.id;

    // 3. Add pieceId2 again -> 409 Conflict
    const dupRes = await request(app)
      .post(`/api/v1/transfers/orders/${orderId}/items`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        inventoryItemId: pieceId2,
      });
    expect(dupRes.status).toBe(409);

    // 4. Remove item
    const delRes = await request(app)
      .delete(`/api/v1/transfers/orders/${orderId}/items/${itemId}`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(delRes.status).toBe(204);

    // 5. Verify order has 0 items
    const getRes = await request(app)
      .get(`/api/v1/transfers/orders/${orderId}`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toHaveLength(0);
  });

  it("POST /api/v1/transfers/orders/:id/submit and /approve executes workflow", async () => {
    // 1. Create order with pieceId2
    const createRes = await request(app)
      .post("/api/v1/transfers/orders")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        sourceStoreId,
        destinationStoreId,
        itemIds: [pieceId2],
      });
    const orderId = createRes.body.id;

    // 2. Submit order
    const submitRes = await request(app)
      .post(`/api/v1/transfers/orders/${orderId}/submit`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe(TransferOrderStatus.REQUESTED);

    // 3. Approve order with managerToken
    const approveRes = await request(app)
      .post(`/api/v1/transfers/orders/${orderId}/approve`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe(TransferOrderStatus.APPROVED);
    expect(approveRes.body.approvedByUserId).toBe(managerUserId);
  });

  it("POST /api/v1/transfers/orders/:id/reject rejects requested order", async () => {
    // 1. Create order with pieceId3
    const createRes = await request(app)
      .post("/api/v1/transfers/orders")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        sourceStoreId,
        destinationStoreId,
        itemIds: [pieceId3],
      });
    const orderId = createRes.body.id;

    // 2. Submit order
    await request(app)
      .post(`/api/v1/transfers/orders/${orderId}/submit`)
      .set("Authorization", `Bearer ${managerToken}`);

    // 3. Reject order
    const rejectRes = await request(app)
      .post(`/api/v1/transfers/orders/${orderId}/reject`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        rejectionReason: "Stock needed locally for festival season",
      });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe(TransferOrderStatus.REJECTED);
    expect(rejectRes.body.rejectionReason).toBe("Stock needed locally for festival season");
  });

  it("GET /api/v1/transfers/orders lists orders and enforces multi-tenant isolation", async () => {
    // List orders for orgId
    const listRes = await request(app)
      .get("/api/v1/transfers/orders")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.orders.length).toBeGreaterThanOrEqual(1);

    // Other org manager should see 0 orders
    const otherOrgListRes = await request(app)
      .get("/api/v1/transfers/orders")
      .set("Authorization", `Bearer ${otherOrgManagerToken}`);
    expect(otherOrgListRes.status).toBe(200);
    expect(otherOrgListRes.body.orders).toHaveLength(0);
  });
});
