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
} from "../src/repositories/transferDispatchRepository.js";
import {
  receiveTransferManifest,
  createTransferDispute,
  resolveTransferDispute,
  getTransferDisputeById,
  listTransferDisputes,
} from "../src/repositories/transferReceivingRepository.js";
import {
  StoreType,
  TransferOrderStatus,
  TransferOrderItemStatus,
  ManifestStatus,
  SealStatus,
  DisputeClaimType,
  DisputeSeverity,
  DisputeStatus,
  ValidationError,
} from "@jewelcore/shared";

describe("Transfer Receiving & Dispute Repository (FEAT-XFR-03, Entity 62)", () => {
  let orgId: string;
  let sourceStoreId: string;
  let destinationStoreId: string;
  let otherStoreId: string;
  let dispatcherUserId: string;
  let receiverUserId: string;
  let witnessUserId: string;
  let sourceCompId: string;
  let destCompId: string;
  let otherStoreCompId: string;
  let skuId: string;

  let cleanPiece1: string;
  let cleanPiece2: string;
  let cleanManifestId: string;

  let disputedPiece1: string;
  let disputedPiece2: string;
  let disputedManifestId: string;
  let disputedOrderId: string;

  async function cleanFixtures() {
    await query("ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;");

    await query("DELETE FROM transfer_disputes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM security_seals WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM transfer_manifests WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM transfer_order_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM transfer_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO')));");
    await query("DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO'));");
    await query("DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO')));");
    await query("DELETE FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO'));");
    await query("DELETE FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM suppliers WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM product_skus WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM products WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_RCV_REPO_%';");
    await query("DELETE FROM materials WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM categories WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO'));");
    await query("DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO'));");
    await query("DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO'));");
    await query("DELETE FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code = 'ORG_RCV_REPO');");
    await query("DELETE FROM organizations WHERE code = 'ORG_RCV_REPO';");

    await query("ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;");
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_RCV_REPO",
      name: "Receiving Test Org",
    });
    orgId = org.id;

    const sourceStore = await createStore({
      organizationId: orgId,
      code: "STORE_RCV_01",
      name: "Source Vault Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    sourceStoreId = sourceStore.id;

    const destStore = await createStore({
      organizationId: orgId,
      code: "STORE_RCV_02",
      name: "Destination Boutique",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    destinationStoreId = destStore.id;

    const otherStore = await createStore({
      organizationId: orgId,
      code: "STORE_RCV_03",
      name: "Third Branch Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    otherStoreId = otherStore.id;

    const dispUser = await createUser({
      organizationId: orgId,
      email: "disp_rcv@test.com",
      firstName: "David",
      lastName: "Dispatcher",
      passwordHash: "hash",
      isActive: true,
    });
    dispatcherUserId = dispUser.id;

    const recvUser = await createUser({
      organizationId: orgId,
      email: "recv_rcv@test.com",
      firstName: "Rachel",
      lastName: "Receiver",
      passwordHash: "hash",
      isActive: true,
    });
    receiverUserId = recvUser.id;

    const witUser = await createUser({
      organizationId: orgId,
      email: "wit_rcv@test.com",
      firstName: "William",
      lastName: "Witness",
      passwordHash: "hash",
      isActive: true,
    });
    witnessUserId = witUser.id;

    // Storage hierarchy in source store
    const sourceVault = await createVault({
      storeId: sourceStoreId,
      code: "VLT_SRC_01",
      name: "Source Vault",
      vaultType: "MAIN_VAULT",
    });
    const sourceLocker = await createLocker({
      vaultId: sourceVault.id,
      storeId: sourceStoreId,
      code: "LCK_SRC_01",
      name: "Source Locker",
      lockerNumber: "SRC-01",
    });
    const sourceComp = await createCompartment({
      lockerId: sourceLocker.id,
      storeId: sourceStoreId,
      code: "CMP_SRC_01",
      name: "Source Tray",
      compartmentNumber: "SRC-01",
    });
    sourceCompId = sourceComp.id;

    // Storage hierarchy in destination store
    const destVault = await createVault({
      storeId: destinationStoreId,
      code: "VLT_DST_01",
      name: "Dest Vault",
      vaultType: "MAIN_VAULT",
    });
    const destLocker = await createLocker({
      vaultId: destVault.id,
      storeId: destinationStoreId,
      code: "LCK_DST_01",
      name: "Dest Locker",
      lockerNumber: "DST-01",
    });
    const destComp = await createCompartment({
      lockerId: destLocker.id,
      storeId: destinationStoreId,
      code: "CMP_DST_01",
      name: "Dest Tray",
      compartmentNumber: "DST-01",
    });
    destCompId = destComp.id;

    // Storage hierarchy in other store (for cross-store isolation test)
    const otherVault = await createVault({
      storeId: otherStoreId,
      code: "VLT_OTH_01",
      name: "Other Vault",
      vaultType: "MAIN_VAULT",
    });
    const otherLocker = await createLocker({
      vaultId: otherVault.id,
      storeId: otherStoreId,
      code: "LCK_OTH_01",
      name: "Other Locker",
      lockerNumber: "OTH-01",
    });
    const otherComp = await createCompartment({
      lockerId: otherLocker.id,
      storeId: otherStoreId,
      code: "CMP_OTH_01",
      name: "Other Tray",
      compartmentNumber: "OTH-01",
    });
    otherStoreCompId = otherComp.id;

    // Taxonomy & Product
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_RCV_RINGS",
      name: "Solitaire Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_RCV_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_RCV_REPO_18K",
      name: "18K Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_RCV_001",
      name: "Classic Solitaire",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-RCV-001",
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
      code: "SUP_RCV_01",
      name: "Supplier RCV",
    });

    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-RCV-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, sourceStoreId, sup.id, dispatcherUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHIP-RCV-01', 'BRINKS', 'BR-01', 'RECEIVED', $2)
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

    cleanPiece1 = uuidv7();
    cleanPiece2 = uuidv7();
    disputedPiece1 = uuidv7();
    disputedPiece2 = uuidv7();

    await query(
      `INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, custody_state, commercial_state, current_compartment_id,
        created_at, updated_at
      ) VALUES
       ($1, $2, $3, $4, $5, 'SN-CLN-01', 'Solitaire 1', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($8, $2, $3, $4, $9, 'SN-CLN-02', 'Solitaire 2', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($10, $2, $3, $4, $11, 'SN-DIS-01', 'Solitaire 3', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp()),
       ($12, $2, $3, $4, $13, 'SN-DIS-02', 'Solitaire 4', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp())`,
      [
        cleanPiece1, orgId, sourceStoreId, sku.id, qcItems[0]!, purity.id, sourceCompId,
        cleanPiece2, qcItems[1]!,
        disputedPiece1, qcItems[2]!,
        disputedPiece2, qcItems[3]!,
      ],
    );

    // 1. Dispatch clean shipment
    const cleanOrder = await createTransferOrder(orgId, dispatcherUserId, {
      sourceStoreId,
      destinationStoreId,
      itemIds: [cleanPiece1, cleanPiece2],
    });
    await submitTransferOrder(orgId, cleanOrder.id, dispatcherUserId);
    await approveTransferOrder(orgId, cleanOrder.id, dispatcherUserId);
    const cleanMnf = await dispatchTransferOrder(orgId, dispatcherUserId, {
      transferOrderId: cleanOrder.id,
      witnessUserId,
      carrierName: "BRINKS",
      sealNumbers: ["SEAL-CLN-01"],
    });
    cleanManifestId = cleanMnf.id;

    // 2. Dispatch shipment for discrepancy & dispute test
    const dispOrder = await createTransferOrder(orgId, dispatcherUserId, {
      sourceStoreId,
      destinationStoreId,
      itemIds: [disputedPiece1, disputedPiece2],
    });
    await submitTransferOrder(orgId, dispOrder.id, dispatcherUserId);
    await approveTransferOrder(orgId, dispOrder.id, dispatcherUserId);
    disputedOrderId = dispOrder.id;
    const dispMnf = await dispatchTransferOrder(orgId, dispatcherUserId, {
      transferOrderId: dispOrder.id,
      witnessUserId,
      carrierName: "MALCA-AMIT",
      sealNumbers: ["SEAL-DIS-01"],
    });
    disputedManifestId = dispMnf.id;
  });

  afterAll(async () => {
    await cleanFixtures();
  });

  it("rejects receiving if receiver and witness are the same user (INV-13)", async () => {
    await expect(
      receiveTransferManifest(orgId, receiverUserId, cleanManifestId, {
        witnessUserId: receiverUserId,
        destinationCompartmentId: destCompId,
        receivedItemIds: [cleanPiece1, cleanPiece2],
        sealVerifications: [{ sealNumber: "SEAL-CLN-01", status: SealStatus.VERIFIED_INTACT }],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects receiving if destination compartment belongs to another store (INV-11)", async () => {
    await expect(
      receiveTransferManifest(orgId, receiverUserId, cleanManifestId, {
        witnessUserId,
        destinationCompartmentId: otherStoreCompId, // 3rd branch store!
        receivedItemIds: [cleanPiece1, cleanPiece2],
        sealVerifications: [{ sealNumber: "SEAL-CLN-01", status: SealStatus.VERIFIED_INTACT }],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("successfully receives clean transfer manifest, moves items to destination vault and completes order", async () => {
    const result = await receiveTransferManifest(orgId, receiverUserId, cleanManifestId, {
      witnessUserId,
      destinationCompartmentId: destCompId,
      receivedItemIds: [cleanPiece1, cleanPiece2],
      sealVerifications: [{ sealNumber: "SEAL-CLN-01", status: SealStatus.VERIFIED_INTACT }],
      notes: "All pieces received in pristine condition",
    });

    expect(result.order.status).toBe(TransferOrderStatus.COMPLETED);
    expect(result.manifest.status).toBe(ManifestStatus.RECEIVED);
    expect(result.disputes).toHaveLength(0);

    // Verify pieces updated to destination store and compartment
    const piecesRes = await query<{ store_id: string; current_compartment_id: string; custody_state: string }>(
      `SELECT store_id, current_compartment_id, custody_state FROM inventory_items WHERE id IN ($1, $2)`,
      [cleanPiece1, cleanPiece2],
    );
    expect(piecesRes.rows).toHaveLength(2);
    expect(piecesRes.rows.every(r => r.store_id === destinationStoreId)).toBe(true);
    expect(piecesRes.rows.every(r => r.current_compartment_id === destCompId)).toBe(true);
    expect(piecesRes.rows.every(r => r.custody_state === "IN_VAULT")).toBe(true);

    // Verify movements logged with INTAKE_PLACEMENT
    const mvmRes = await query<{ movement_type: string; to_compartment_id: string; to_custody_state: string }>(
      `SELECT movement_type, to_compartment_id, to_custody_state
       FROM inventory_movements
       WHERE reference_document_type = 'TRANSFER_ORDER' AND reference_document_id = $1`,
      [result.order.id],
    );
    expect(mvmRes.rows).toHaveLength(2);
    expect(mvmRes.rows[0].movement_type).toBe("INTAKE_PLACEMENT");
    expect(mvmRes.rows[0].to_compartment_id).toBe(destCompId);
    expect(mvmRes.rows[0].to_custody_state).toBe("IN_VAULT");
  });

  it("detects tampered seals and missing pieces, creates dispute claims and marks missing custody (Architectural Gap 2)", async () => {
    // disputedPiece1 received, disputedPiece2 missing! Seal BROKEN_TAMPERED!
    const result = await receiveTransferManifest(orgId, receiverUserId, disputedManifestId, {
      witnessUserId,
      destinationCompartmentId: destCompId,
      receivedItemIds: [disputedPiece1], // disputedPiece2 is missing
      sealVerifications: [{ sealNumber: "SEAL-DIS-01", status: SealStatus.BROKEN_TAMPERED, notes: "Seal cable cut" }],
      notes: "Package arrived with severed seal and 1 missing solitaire ring",
    });

    expect(result.order.status).toBe(TransferOrderStatus.DISPUTED);
    expect(result.manifest.status).toBe(ManifestStatus.DISPUTED);
    expect(result.disputes).toHaveLength(2);

    const sealDispute = result.disputes.find(d => d.claimType === DisputeClaimType.DAMAGED_SEAL);
    expect(sealDispute).toBeDefined();
    expect(sealDispute!.severity).toBe(DisputeSeverity.CRITICAL);
    expect(sealDispute!.status).toBe(DisputeStatus.OPEN);

    const missingPieceDispute = result.disputes.find(d => d.claimType === DisputeClaimType.MISSING_PIECE);
    expect(missingPieceDispute).toBeDefined();
    expect(missingPieceDispute!.inventoryItemId).toBe(disputedPiece2);
    expect(missingPieceDispute!.severity).toBe(DisputeSeverity.CRITICAL);
    expect(missingPieceDispute!.status).toBe(DisputeStatus.OPEN);

    // Verify disputedPiece1 is IN_VAULT at destination store
    const p1Res = await query<{ store_id: string; current_compartment_id: string; custody_state: string }>(
      `SELECT store_id, current_compartment_id, custody_state FROM inventory_items WHERE id = $1`,
      [disputedPiece1],
    );
    expect(p1Res.rows[0].custody_state).toBe("IN_VAULT");
    expect(p1Res.rows[0].store_id).toBe(destinationStoreId);

    // Verify disputedPiece2 is MISSING
    const p2Res = await query<{ custody_state: string; current_compartment_id: string | null }>(
      `SELECT custody_state, current_compartment_id FROM inventory_items WHERE id = $1`,
      [disputedPiece2],
    );
    expect(p2Res.rows[0].custody_state).toBe("MISSING");
    expect(p2Res.rows[0].current_compartment_id).toBeNull();
  });

  it("resolves dispute claims and lists disputes with filters", async () => {
    const listRes = await listTransferDisputes(orgId, {
      transferOrderId: disputedOrderId,
      limit: 10,
      offset: 0,
    });
    expect(listRes.total).toBe(2);

    const disputeToResolve = listRes.disputes[0];
    const resolved = await resolveTransferDispute(orgId, disputeToResolve.id, receiverUserId, {
      resolutionStatus: DisputeStatus.RESOLVED,
      resolutionNotes: "Insurance payout claim approved by carrier",
    });

    expect(resolved.status).toBe(DisputeStatus.RESOLVED);
    expect(resolved.resolutionNotes).toBe("Insurance payout claim approved by carrier");
    expect(resolved.resolvedByUserId).toBe(receiverUserId);
    expect(resolved.resolvedAt).toBeDefined();

    // Verify getTransferDisputeById
    const fetched = await getTransferDisputeById(orgId, disputeToResolve.id);
    expect(fetched!.status).toBe(DisputeStatus.RESOLVED);
    expect(fetched!.orderNumber).toBeDefined();
    expect(fetched!.manifestNumber).toBeDefined();
  });
});
