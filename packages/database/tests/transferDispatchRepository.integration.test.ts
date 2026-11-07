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
  submitTransferOrder,
  approveTransferOrder,
} from "../src/repositories/transferOrderRepository.js";
import {
  dispatchTransferOrder,
  getTransferManifestById,
  getTransferManifestByOrderId,
  listTransferManifests,
} from "../src/repositories/transferDispatchRepository.js";
import {
  StoreType,
  TransferOrderStatus,
  TransferOrderPriority,
  TransferOrderItemStatus,
  ManifestStatus,
  SealStatus,
  ValidationError,
} from "@jewelcore/shared";

describe("Transfer Dispatch Repository (FEAT-XFR-02, Entities 60 & 61)", () => {
  let orgId: string;
  let sourceStoreId: string;
  let destinationStoreId: string;
  let dispatcherUserId: string;
  let witnessUserId: string;
  let skuId: string;
  let pieceId1: string;
  let pieceId2: string;
  let pieceId3: string;
  let pieceId4: string;
  let compId: string;

  async function cleanFixtures() {
    await query("ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;");

    await query("DELETE FROM security_seals WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM transfer_manifests WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM transfer_order_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM transfer_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO')));");
    await query("DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO'));");
    await query("DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO')));");
    await query("DELETE FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO'));");
    await query("DELETE FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM suppliers WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM product_skus WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM products WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_DSP_REPO_%';");
    await query("DELETE FROM materials WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM categories WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO'));");
    await query("DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO'));");
    await query("DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO'));");
    await query("DELETE FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_DSP_REPO');");
    await query("DELETE FROM organizations WHERE code = 'ORG_DSP_REPO';");

    await query("ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;");
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_DSP_REPO",
      name: "Dispatch Test Org",
    });
    orgId = org.id;

    const sourceStore = await createStore({
      organizationId: orgId,
      code: "STORE_DSP_01",
      name: "Dispatch Source Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    sourceStoreId = sourceStore.id;

    const destStore = await createStore({
      organizationId: orgId,
      code: "STORE_DSP_02",
      name: "Dispatch Destination Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    destinationStoreId = destStore.id;

    const dispUser = await createUser({
      organizationId: orgId,
      email: "dispatcher@test.com",
      firstName: "David",
      lastName: "Dispatcher",
      passwordHash: "hash",
      isActive: true,
    });
    dispatcherUserId = dispUser.id;

    const witUser = await createUser({
      organizationId: orgId,
      email: "witness@test.com",
      firstName: "Wendy",
      lastName: "Witness",
      passwordHash: "hash",
      isActive: true,
    });
    witnessUserId = witUser.id;

    const vault = await createVault({
      storeId: sourceStoreId,
      code: "VLT_DSP_01",
      name: "Main Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId: sourceStoreId,
      code: "LCK_DSP_01",
      name: "Locker A",
      lockerNumber: "LK-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId: sourceStoreId,
      code: "CMP_DSP_01",
      name: "Compartment 1",
      compartmentNumber: "C-01",
    });
    compId = comp.id;

    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_DSP_RINGS",
      name: "Solitaire Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_DSP_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_DSP_REPO_18K",
      name: "18K Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_DSP_001",
      name: "Classic Solitaire",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-DSP-001",
      name: "Solitaire Ring 18K",
      variantName: "Standard",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 5.0,
      targetMetalWeightGrams: 5.0,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_DSP_01",
      name: "Supplier DSP",
    });

    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-DSP-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, sourceStoreId, sup.id, dispatcherUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHIP-DSP-01', 'BRINKS', 'BR-01', 'RECEIVED', $2)
       RETURNING id`,
      [grnId, dispatcherUserId],
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
      [shipmentId, sourceStoreId, dispatcherUserId],
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
    pieceId4 = uuidv7();

    await query(
      `INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, custody_state, commercial_state, current_compartment_id,
        created_at, updated_at
      ) VALUES
       ($1, $2, $3, $4, $5, 'SN-DSP-01', 'Solitaire 1', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($8, $2, $3, $4, $9, 'SN-DSP-02', 'Solitaire 2', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($10, $2, $3, $4, $11, 'SN-DSP-03', 'Solitaire 3', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($12, $2, $3, $4, $13, 'SN-DSP-04', 'Solitaire 4', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp())`,
      [
        pieceId1, orgId, sourceStoreId, sku.id, qcItems[0]!, purity.id, compId,
        pieceId2, qcItems[1]!,
        pieceId3, qcItems[2]!,
        pieceId4, qcItems[3]!,
      ],
    );
  });

  afterAll(async () => {
    await cleanFixtures();
  });

  it("rejects dispatch if dispatcher and witness are the same user (INV-13)", async () => {
    const order = await createTransferOrder(orgId, dispatcherUserId, {
      sourceStoreId,
      destinationStoreId,
      itemIds: [pieceId1],
    });
    await submitTransferOrder(orgId, order.id, dispatcherUserId);
    await approveTransferOrder(orgId, order.id, witnessUserId);

    await expect(
      dispatchTransferOrder(orgId, dispatcherUserId, {
        transferOrderId: order.id,
        witnessUserId: dispatcherUserId,
        carrierName: "BRINKS SECURITY",
        sealNumbers: ["SEAL-TEST-001"],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects dispatch if transfer order is not approved", async () => {
    const draftOrder = await createTransferOrder(orgId, dispatcherUserId, {
      sourceStoreId,
      destinationStoreId,
      itemIds: [pieceId2],
    });

    await expect(
      dispatchTransferOrder(orgId, dispatcherUserId, {
        transferOrderId: draftOrder.id,
        witnessUserId,
        carrierName: "BRINKS SECURITY",
        sealNumbers: ["SEAL-TEST-001"],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("successfully dispatches approved order with tamper-evident seals and transitions custody (FEAT-XFR-02)", async () => {
    // 1. Create order with pieceId3 and pieceId4
    const order = await createTransferOrder(orgId, dispatcherUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.HIGH,
      itemIds: [pieceId3, pieceId4],
    });
    await submitTransferOrder(orgId, order.id, dispatcherUserId);
    await approveTransferOrder(orgId, order.id, witnessUserId);

    // 2. Dispatch with 2 security seals
    const manifest = await dispatchTransferOrder(orgId, dispatcherUserId, {
      transferOrderId: order.id,
      witnessUserId,
      carrierName: "MALCA-AMIT ARMORED",
      trackingNumber: "MA-TRACK-8899",
      sealNumbers: ["SEAL-BAG-001", "SEAL-BAG-002"],
      notes: "High value express courier dispatch",
    });

    expect(manifest.id).toBeDefined();
    expect(manifest.manifestNumber).toMatch(/^MNF-/);
    expect(manifest.status).toBe(ManifestStatus.DISPATCHED);
    expect(manifest.carrierName).toBe("MALCA-AMIT ARMORED");
    expect(manifest.trackingNumber).toBe("MA-TRACK-8899");
    expect(manifest.dispatcherUserId).toBe(dispatcherUserId);
    expect(manifest.dispatcherUserName).toBe("David Dispatcher");
    expect(manifest.witnessUserId).toBe(witnessUserId);
    expect(manifest.witnessUserName).toBe("Wendy Witness");
    expect(manifest.seals).toHaveLength(2);
    expect(manifest.seals![0].status).toBe(SealStatus.ATTACHED);

    // 3. Verify transfer order status transitioned to IN_TRANSIT
    const updatedOrderRes = await query<{ status: string }>(
      `SELECT status FROM transfer_orders WHERE id = $1`,
      [order.id],
    );
    expect(updatedOrderRes.rows[0]?.status).toBe(TransferOrderStatus.IN_TRANSIT);

    // 4. Verify transfer order items status transitioned to DISPATCHED
    const itemsRes = await query<{ status: string }>(
      `SELECT status FROM transfer_order_items WHERE transfer_order_id = $1`,
      [order.id],
    );
    expect(itemsRes.rows).toHaveLength(2);
    expect(itemsRes.rows.every(r => r.status === TransferOrderItemStatus.DISPATCHED)).toBe(true);

    // 5. Verify inventory pieces transitioned to IN_TRANSIT and compartment cleared
    const piecesRes = await query<{ custody_state: string; current_compartment_id: string | null }>(
      `SELECT custody_state, current_compartment_id FROM inventory_items WHERE id IN ($1, $2)`,
      [pieceId3, pieceId4],
    );
    expect(piecesRes.rows).toHaveLength(2);
    expect(piecesRes.rows.every(r => r.custody_state === "IN_TRANSIT" && r.current_compartment_id === null)).toBe(true);

    // 6. Verify custody movements logged with CUSTODY_DEPARTURE (INV-09, INV-13, INV-16)
    const mvmRes = await query<{ movement_type: string; from_custody_state: string; to_custody_state: string; reference_document_type: string }>(
      `SELECT movement_type, from_custody_state, to_custody_state, reference_document_type
       FROM inventory_movements
       WHERE reference_document_id = $1`,
      [manifest.id],
    );
    expect(mvmRes.rows).toHaveLength(2);
    expect(mvmRes.rows[0].movement_type).toBe("CUSTODY_DEPARTURE");
    expect(mvmRes.rows[0].from_custody_state).toBe("IN_VAULT");
    expect(mvmRes.rows[0].to_custody_state).toBe("IN_TRANSIT");
    expect(mvmRes.rows[0].reference_document_type).toBe("TRANSFER_MANIFEST");
  });

  it("retrieves manifest by ID and by Order ID, and lists manifests", async () => {
    const list = await listTransferManifests(orgId, {
      limit: 10,
      offset: 0,
    });
    expect(list.total).toBeGreaterThanOrEqual(1);
    expect(list.manifests.length).toBeGreaterThanOrEqual(1);

    const first = list.manifests[0];
    const fetchedById = await getTransferManifestById(orgId, first.id);
    expect(fetchedById).not.toBeNull();
    expect(fetchedById!.manifestNumber).toBe(first.manifestNumber);
    expect(fetchedById!.seals!.length).toBeGreaterThanOrEqual(1);

    const fetchedByOrderId = await getTransferManifestByOrderId(orgId, first.transferOrderId);
    expect(fetchedByOrderId).not.toBeNull();
    expect(fetchedByOrderId!.id).toBe(first.id);
  });
});
