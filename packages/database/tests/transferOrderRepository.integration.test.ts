import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { query } from "../src/pool.js";
import { runAllMigrations } from "../src/migrations/index.js";
import { uuidv7 } from "../src/uuidv7.js";
import {
  createOrganization,
  createStore,
  createUser,
  createVault,
  createLocker,
  createCompartment,
  createCategory,
  createMaterial,
  createPurity,
  createProduct,
  createProductSku,
  createSupplier,
} from "../src/index.js";
import {
  createTransferOrder,
  addTransferOrderItem,
  removeTransferOrderItem,
  submitTransferOrder,
  approveTransferOrder,
  rejectTransferOrder,
  cancelTransferOrder,
  getTransferOrderById,
  listTransferOrders,
} from "../src/repositories/transferOrderRepository.js";
import {
  StoreType,
  TransferOrderStatus,
  TransferOrderPriority,
  TransferOrderItemStatus,
  ValidationError,
  ConflictError,
  NotFoundError,
} from "@jewelcore/shared";

describe("Transfer Order Repository (FEAT-XFR-01, Entities 58 & 59)", () => {
  let orgId: string;
  let sourceStoreId: string;
  let destinationStoreId: string;
  let requesterUserId: string;
  let approverUserId: string;
  let skuId: string;
  let pieceId1: string;
  let pieceId2: string;
  let pieceId3: string;
  let pieceIdDifferentStore: string;

  async function cleanFixtures() {
    await query("ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;");

    await query("DELETE FROM transfer_order_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM transfer_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO')));");
    await query("DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO'));");
    await query("DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO')));");
    await query("DELETE FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO'));");
    await query("DELETE FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM suppliers WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM product_skus WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM products WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_XFR_REPO_%';");
    await query("DELETE FROM materials WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM categories WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO'));");
    await query("DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO'));");
    await query("DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO'));");
    await query("DELETE FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_XFR_REPO');");
    await query("DELETE FROM organizations WHERE code = 'ORG_XFR_REPO';");

    await query("ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;");
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_XFR_REPO",
      name: "Transfer Test Org",
    });
    orgId = org.id;

    const sourceStore = await createStore({
      organizationId: orgId,
      code: "STORE_XFR_01",
      name: "Downtown Flagship",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    sourceStoreId = sourceStore.id;

    const destStore = await createStore({
      organizationId: orgId,
      code: "STORE_XFR_02",
      name: "Uptown Boutique",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    destinationStoreId = destStore.id;

    const reqUser = await createUser({
      organizationId: orgId,
      email: "requester_xfr@test.com",
      firstName: "Requester",
      lastName: "Staff",
      passwordHash: "hash",
      isActive: true,
    });
    requesterUserId = reqUser.id;

    const appUser = await createUser({
      organizationId: orgId,
      email: "approver_xfr@test.com",
      firstName: "Approver",
      lastName: "Manager",
      passwordHash: "hash",
      isActive: true,
    });
    approverUserId = appUser.id;

    const vault = await createVault({
      storeId: sourceStoreId,
      code: "VLT_XFR_01",
      name: "Main Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId: sourceStoreId,
      code: "LCK_XFR_01",
      name: "Locker A",
      lockerNumber: "LK-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId: sourceStoreId,
      code: "CMP_XFR_01",
      name: "Compartment 1",
      compartmentNumber: "C-01",
    });

    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_XFR_RINGS",
      name: "Solitaire Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_XFR_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_XFR_REPO_18K",
      name: "18K Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_XFR_001",
      name: "Classic Solitaire",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-XFR-001",
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
      code: "SUP_XFR_01",
      name: "Supplier XFR",
    });

    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-XFR-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, sourceStoreId, sup.id, requesterUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHIP-XFR-01', 'BRINKS', 'BR-01', 'RECEIVED', $2)
       RETURNING id`,
      [grnId, requesterUserId],
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
      [shipmentId, sourceStoreId, requesterUserId],
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
       ($1, $2, $3, $4, $5, 'SN-XFR-01', 'Solitaire 1', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($8, $2, $3, $4, $9, 'SN-XFR-02', 'Solitaire 2', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($10, $2, $3, $4, $11, 'SN-XFR-03', 'Solitaire 3', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($12, $2, $13, $4, $14, 'SN-XFR-04', 'Solitaire 4', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', NULL, clock_timestamp(), clock_timestamp())`,
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

  it("creates a transfer order in DRAFT status with items", async () => {
    const order = await createTransferOrder(orgId, requesterUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.HIGH,
      notes: "Urgent display restock",
      itemIds: [pieceId1],
    });

    expect(order.id).toBeDefined();
    expect(order.orderNumber).toMatch(/^XFR-/);
    expect(order.status).toBe(TransferOrderStatus.DRAFT);
    expect(order.priority).toBe(TransferOrderPriority.HIGH);
    expect(order.sourceStoreId).toBe(sourceStoreId);
    expect(order.sourceStoreName).toBe("Downtown Flagship");
    expect(order.destinationStoreId).toBe(destinationStoreId);
    expect(order.destinationStoreName).toBe("Uptown Boutique");
    expect(order.requestedByUserId).toBe(requesterUserId);
    expect(order.requestedByUserName).toBe("Requester Staff");
    expect(order.items).toHaveLength(1);
    expect(order.items![0].inventoryItemId).toBe(pieceId1);
    expect(order.items![0].status).toBe(TransferOrderItemStatus.PENDING);
  });

  it("rejects transfer order if source and destination store are the same", async () => {
    await expect(
      createTransferOrder(orgId, requesterUserId, {
        sourceStoreId,
        destinationStoreId: sourceStoreId,
        priority: TransferOrderPriority.NORMAL,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects transfer order item if piece does not belong to source store", async () => {
    await expect(
      createTransferOrder(orgId, requesterUserId, {
        sourceStoreId,
        destinationStoreId,
        priority: TransferOrderPriority.NORMAL,
        itemIds: [pieceIdDifferentStore],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("allows adding and removing items from a draft transfer order", async () => {
    const order = await createTransferOrder(orgId, requesterUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.NORMAL,
    });

    const item = await addTransferOrderItem(orgId, order.id, {
      inventoryItemId: pieceId2,
      notes: "Diamond inspected",
    });

    expect(item.id).toBeDefined();
    expect(item.inventoryItemId).toBe(pieceId2);
    expect(item.status).toBe(TransferOrderItemStatus.PENDING);

    // Verify order now has 1 item
    const fetched = await getTransferOrderById(orgId, order.id);
    expect(fetched!.items).toHaveLength(1);

    // Remove item
    await removeTransferOrderItem(orgId, order.id, item.id);

    const fetchedAfterRemove = await getTransferOrderById(orgId, order.id);
    expect(fetchedAfterRemove!.items).toHaveLength(0);
  });

  it("rejects adding the same item twice to the same order", async () => {
    const order = await createTransferOrder(orgId, requesterUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.NORMAL,
      itemIds: [pieceId3],
    });

    await expect(
      addTransferOrderItem(orgId, order.id, {
        inventoryItemId: pieceId3,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects submitting an empty transfer order without items", async () => {
    const order = await createTransferOrder(orgId, requesterUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.NORMAL,
    });

    await expect(submitTransferOrder(orgId, order.id, requesterUserId)).rejects.toThrow(ValidationError);
  });

  it("executes full transfer order submission, approval, rejection, and cancellation lifecycle", async () => {
    // 1. Submit
    const order = await createTransferOrder(orgId, requesterUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.URGENT,
      itemIds: [pieceId1],
    });

    const submitted = await submitTransferOrder(orgId, order.id, requesterUserId);
    expect(submitted.status).toBe(TransferOrderStatus.REQUESTED);

    // 2. Cannot add items after submission
    await expect(
      addTransferOrderItem(orgId, order.id, { inventoryItemId: pieceId2 }),
    ).rejects.toThrow(ValidationError);

    // 3. Approve
    const approved = await approveTransferOrder(orgId, order.id, approverUserId);
    expect(approved.status).toBe(TransferOrderStatus.APPROVED);
    expect(approved.approvedByUserId).toBe(approverUserId);
    expect(approved.approvedByUserName).toBe("Approver Manager");
    expect(approved.approvedAt).toBeDefined();

    // 4. Test Rejection flow on second order
    const order2 = await createTransferOrder(orgId, requesterUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.NORMAL,
      itemIds: [pieceId2],
    });
    await submitTransferOrder(orgId, order2.id, requesterUserId);
    const rejected = await rejectTransferOrder(orgId, order2.id, approverUserId, {
      rejectionReason: "Item needed for local VIP client appointment",
    });
    expect(rejected.status).toBe(TransferOrderStatus.REJECTED);
    expect(rejected.rejectionReason).toBe("Item needed for local VIP client appointment");

    // 5. Test Cancellation flow on third order
    const order3 = await createTransferOrder(orgId, requesterUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.NORMAL,
      itemIds: [pieceId3],
    });
    const cancelled = await cancelTransferOrder(orgId, order3.id, requesterUserId, "Store request recalled");
    expect(cancelled.status).toBe(TransferOrderStatus.CANCELLED);
    expect(cancelled.items![0].status).toBe(TransferOrderItemStatus.CANCELLED);
  });

  it("lists transfer orders with filters and pagination", async () => {
    const res = await listTransferOrders(orgId, {
      sourceStoreId,
      limit: 10,
      offset: 0,
    });

    expect(res.total).toBeGreaterThanOrEqual(1);
    expect(res.orders.length).toBeGreaterThanOrEqual(1);
    expect(res.orders[0].sourceStoreId).toBe(sourceStoreId);
  });
});
