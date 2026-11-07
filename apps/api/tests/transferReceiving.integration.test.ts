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
  createTransferOrder,
  submitTransferOrder,
  approveTransferOrder,
  dispatchTransferOrder,
  uuidv7,
} from "@jewelcore/database";
import {
  StoreType,
  TransferOrderStatus,
  TransferOrderPriority,
  ManifestStatus,
  SealStatus,
  SealType,
  DisputeClaimType,
  DisputeSeverity,
  DisputeStatus,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Transfer Manifest Receiving & Disputes API (FEAT-XFR-03, Entity 62)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let sourceStoreId: string;
  let destinationStoreId: string;
  let otherStoreId: string;

  let receiverToken: string;
  let receiverUserId: string;
  let witnessUserId: string;
  let unprivilegedToken: string;
  let unprivilegedUserId: string;
  let otherOrgReceiverToken: string;

  let skuId: string;
  let sourceCompId: string;
  let destCompId: string;
  let otherCompId: string;

  let cleanManifestId: string;
  let cleanOrderId: string;
  let cleanPieceId: string;

  let disputeManifestId: string;
  let disputeOrderId: string;
  let disputePiece1Id: string;
  let disputePiece2Id: string;

  async function cleanFixtures() {
    await query("ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;");

    await query("DELETE FROM transfer_disputes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM security_seals WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM transfer_manifests WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM transfer_order_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM transfer_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'))));");
    await query("DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT')));");
    await query("DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'))));");
    await query("DELETE FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT')));");
    await query("DELETE FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM suppliers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM product_skus WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM products WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_RCV_API_%';");
    await query("DELETE FROM materials WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM categories WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT')));");
    await query("DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT')));");
    await query("DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT')));");
    await query("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT')));");
    await query("DELETE FROM store_memberships WHERE organization_membership_id IN (SELECT id FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT')));");
    await query("DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT'));");
    await query("DELETE FROM organizations WHERE code IN ('ORG_RCV_API', 'ORG_RCV_API_ALT');");

    await query("ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;");
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_RCV_API",
      name: "Receiving API Org",
    });
    orgId = org.id;

    const otherOrg = await createOrganization({
      code: "ORG_RCV_API_ALT",
      name: "Receiving Alt Org",
    });
    otherOrgId = otherOrg.id;

    const sourceStore = await createStore({
      organizationId: orgId,
      code: "STORE_RCV_API_01",
      name: "Source Hub",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    sourceStoreId = sourceStore.id;

    const destStore = await createStore({
      organizationId: orgId,
      code: "STORE_RCV_API_02",
      name: "Destination Hub",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    destinationStoreId = destStore.id;

    const otherStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_RCV_API_ALT",
      name: "Alt Org Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    otherStoreId = otherStore.id;

    // 1. Destination Manager / Receiver (has transfer:receive, transfer:dispute:create, transfer:dispute:resolve)
    const receiverUser = await createUser({
      organizationId: orgId,
      email: "receiver_api@test.com",
      firstName: "Rachel",
      lastName: "Receiver",
      passwordHash: "hash",
      isActive: true,
    });
    receiverUserId = receiverUser.id;

    const rcvOrgMem = await createOrganizationMembership({
      organizationId: orgId,
      userId: receiverUserId,
      isDefault: true,
    });
    await createStoreMembership({
      storeId: destinationStoreId,
      organizationMembershipId: rcvOrgMem.id,
      isDefault: true,
    });
    const storeManagerRole = await getRoleByCode("STORE_MANAGER");
    if (storeManagerRole) {
      await assignRoleToUser(receiverUserId, storeManagerRole.id);
    }
    receiverToken = await signAccessToken({
      userId: receiverUserId,
      email: receiverUser.email,
      orgId,
    });

    // 2. Witness User
    const witnessUser = await createUser({
      organizationId: orgId,
      email: "wit_rcv_api@test.com",
      firstName: "William",
      lastName: "Witness",
      passwordHash: "hash",
      isActive: true,
    });
    witnessUserId = witnessUser.id;

    // 3. Unprivileged User (QC_TECHNICIAN, lacks transfer:receive)
    const unprivUser = await createUser({
      organizationId: orgId,
      email: "unpriv_rcv_api@test.com",
      firstName: "Unprivileged",
      lastName: "User",
      passwordHash: "hash",
      isActive: true,
    });
    unprivilegedUserId = unprivUser.id;
    const qcRole = await getRoleByCode("QC_TECHNICIAN");
    if (qcRole) {
      await assignRoleToUser(unprivilegedUserId, qcRole.id);
    }
    unprivilegedToken = await signAccessToken({
      userId: unprivilegedUserId,
      email: unprivUser.email,
      orgId,
    });

    // 4. Other Org Manager
    const otherUser = await createUser({
      organizationId: otherOrgId,
      email: "other_rcv_mgr@test.com",
      firstName: "Other",
      lastName: "Org",
      passwordHash: "hash",
      isActive: true,
    });
    if (storeManagerRole) {
      await assignRoleToUser(otherUser.id, storeManagerRole.id);
    }
    otherOrgReceiverToken = await signAccessToken({
      userId: otherUser.id,
      email: otherUser.email,
      orgId: otherOrgId,
    });

    // Storage: Source
    const srcVault = await createVault({
      storeId: sourceStoreId,
      code: "VLT_RCV_API_SRC",
      name: "Source Vault",
      vaultType: "MAIN_VAULT",
    });
    const srcLocker = await createLocker({
      vaultId: srcVault.id,
      storeId: sourceStoreId,
      code: "LCK_RCV_API_SRC",
      name: "Source Locker",
      lockerNumber: "LK-SRC",
    });
    const srcComp = await createCompartment({
      lockerId: srcLocker.id,
      storeId: sourceStoreId,
      code: "CMP_RCV_API_SRC",
      name: "Source Compartment",
      compartmentNumber: "C-SRC",
    });
    sourceCompId = srcComp.id;

    // Storage: Destination
    const destVault = await createVault({
      storeId: destinationStoreId,
      code: "VLT_RCV_API_DST",
      name: "Dest Vault",
      vaultType: "MAIN_VAULT",
    });
    const destLocker = await createLocker({
      vaultId: destVault.id,
      storeId: destinationStoreId,
      code: "LCK_RCV_API_DST",
      name: "Dest Locker",
      lockerNumber: "LK-DST",
    });
    const destComp = await createCompartment({
      lockerId: destLocker.id,
      storeId: destinationStoreId,
      code: "CMP_RCV_API_DST",
      name: "Dest Compartment",
      compartmentNumber: "C-DST",
    });
    destCompId = destComp.id;

    // Storage: Other Org
    const otherVault = await createVault({
      storeId: otherStoreId,
      code: "VLT_RCV_API_ALT",
      name: "Alt Vault",
      vaultType: "MAIN_VAULT",
    });
    const otherLocker = await createLocker({
      vaultId: otherVault.id,
      storeId: otherStoreId,
      code: "LCK_RCV_API_ALT",
      name: "Alt Locker",
      lockerNumber: "LK-ALT",
    });
    const otherComp = await createCompartment({
      lockerId: otherLocker.id,
      storeId: otherStoreId,
      code: "CMP_RCV_API_ALT",
      name: "Alt Compartment",
      compartmentNumber: "C-ALT",
    });
    otherCompId = otherComp.id;

    // Product Catalog
    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_RCV_API_RINGS",
      name: "Receiving Rings",
    });
    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_RCV_API_GOLD",
      name: "Receiving Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });
    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_RCV_API_18K",
      name: "18K Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });
    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_RCV_API_001",
      name: "Emerald Ring",
      materialId: material.id,
      defaultPurityId: purity.id,
    });
    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-RCV-API-001",
      name: "Emerald Ring 18K",
      variantName: "Standard",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 4.5,
      targetMetalWeightGrams: 4.5,
      trackingType: "SERIALIZED",
    });
    skuId = sku.id;

    // GRN & QC
    const sup = await createSupplier({
      organizationId: orgId,
      code: "SUP_RCV_API_01",
      name: "Supplier RCV API",
    });
    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-RCV-API-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, sourceStoreId, sup.id, receiverUserId],
    );
    const grnId = grnRes.rows[0].id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHP-RCV-API-01', 'SecureLogistics', 'TRK-RCV-01', 'RECEIVED', $2)
       RETURNING id`,
      [grnId, receiverUserId],
    );
    const shipmentId = shipRes.rows[0].id;

    const shipItemRes = await query<{ id: string }>(
      `INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
       VALUES (gen_random_uuid(), $1, $2, 1, 3, 3)
       RETURNING id`,
      [shipmentId, sku.id],
    );
    const shipmentItemId = shipItemRes.rows[0].id;

    const qcRes = await query<{ id: string }>(
      `INSERT INTO quality_checks (id, shipment_id, store_id, inspector_user_id, session_sequence_number, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 1, 'APPROVED')
       RETURNING id`,
      [shipmentId, sourceStoreId, receiverUserId],
    );
    const qcId = qcRes.rows[0].id;

    // Helper to create an inventory item in sourceComp
    async function makeItem(serial: string, seq: number): Promise<string> {
      const qciRes = await query<{ id: string }>(
        `INSERT INTO quality_check_items (
          id, quality_check_id, shipment_item_id, item_sequence_number, status,
          gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
          hallmark_verified, visual_inspection_passed, damage_detected
         )
         VALUES (gen_random_uuid(), $1, $2, $3, 'APPROVED', 4.5000, 4.5000, $4, $5, true, true, false)
         RETURNING id`,
        [qcId, shipmentItemId, seq, material.id, purity.id],
      );
      const qciId = qciRes.rows[0].id;

      const itemId = uuidv7();
      await query(
        `INSERT INTO inventory_items (
           id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
           gross_weight_grams, net_weight_grams, purity_id, custody_state, commercial_state, current_compartment_id,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, 'Emerald Ring Item',
           4.5000, 4.5000, $7, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $8,
           clock_timestamp(), clock_timestamp()
         )`,
        [itemId, orgId, sourceStoreId, sku.id, qciId, serial, purity.id, sourceCompId],
      );
      return itemId;
    }

    cleanPieceId = await makeItem(`SN-RCV-CLN-${Date.now()}`, 1);
    disputePiece1Id = await makeItem(`SN-RCV-DSP1-${Date.now()}`, 2);
    disputePiece2Id = await makeItem(`SN-RCV-DSP2-${Date.now()}`, 3);

    // Create & Dispatch Clean Order
    const cleanOrder = await createTransferOrder(orgId, receiverUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.NORMAL,
      itemIds: [cleanPieceId],
    });
    cleanOrderId = cleanOrder.id;
    await submitTransferOrder(orgId, cleanOrderId, receiverUserId);
    await approveTransferOrder(orgId, cleanOrderId, receiverUserId);

    const cleanManifest = await dispatchTransferOrder(orgId, receiverUserId, {
      transferOrderId: cleanOrderId,
      witnessUserId,
      carrierName: "BRINKS",
      sealNumbers: [`SEAL-CLN-${Date.now()}`],
      estimatedArrivalHours: 24,
    });
    cleanManifestId = cleanManifest.id;

    // Create & Dispatch Dispute Order (2 items)
    const dispOrder = await createTransferOrder(orgId, receiverUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.HIGH,
      itemIds: [disputePiece1Id, disputePiece2Id],
    });
    disputeOrderId = dispOrder.id;
    await submitTransferOrder(orgId, disputeOrderId, receiverUserId);
    await approveTransferOrder(orgId, disputeOrderId, receiverUserId);

    const dispManifest = await dispatchTransferOrder(orgId, receiverUserId, {
      transferOrderId: disputeOrderId,
      witnessUserId,
      carrierName: "BRINKS",
      sealNumbers: [`SEAL-DSP-${Date.now()}`],
      estimatedArrivalHours: 12,
    });
    disputeManifestId = dispManifest.id;
  });

  afterAll(async () => {
    await cleanFixtures();
  });

  // ==========================================
  // Permission & Validation Checks
  // ==========================================

  it("rejects receiving when unauthenticated", async () => {
    const res = await request(app)
      .post(`/api/v1/transfers/manifests/${cleanManifestId}/receive`)
      .send({
        witnessUserId,
        destinationCompartmentId: destCompId,
        receivedItemIds: [cleanPieceId],
        sealVerifications: [{ sealNumber: "SEAL-CLN-01", status: SealStatus.VERIFIED_INTACT }],
      });

    expect(res.status).toBe(401);
  });

  it("rejects receiving when user lacks transfer:receive permission", async () => {
    const res = await request(app)
      .post(`/api/v1/transfers/manifests/${cleanManifestId}/receive`)
      .set("Authorization", `Bearer ${unprivilegedToken}`)
      .send({
        witnessUserId,
        destinationCompartmentId: destCompId,
        receivedItemIds: [cleanPieceId],
        sealVerifications: [{ sealNumber: "SEAL-CLN-01", status: SealStatus.VERIFIED_INTACT }],
      });

    expect(res.status).toBe(403);
  });

  it("rejects receiving when receiver and witness are the same user (INV-13)", async () => {
    const res = await request(app)
      .post(`/api/v1/transfers/manifests/${cleanManifestId}/receive`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        witnessUserId: receiverUserId, // SAME as receiver
        destinationCompartmentId: destCompId,
        receivedItemIds: [cleanPieceId],
        sealVerifications: [{ sealNumber: "SEAL-CLN-01", status: SealStatus.VERIFIED_INTACT }],
      });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain("distinct receiving and witness users");
  });

  it("rejects receiving when destination compartment belongs to another store or org (INV-11)", async () => {
    const res = await request(app)
      .post(`/api/v1/transfers/manifests/${cleanManifestId}/receive`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        witnessUserId,
        destinationCompartmentId: otherCompId, // Belongs to other store/org
        receivedItemIds: [cleanPieceId],
        sealVerifications: [{ sealNumber: "SEAL-CLN-01", status: SealStatus.VERIFIED_INTACT }],
      });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain("does not belong to receiving branch");
  });

  // ==========================================
  // Clean Receipt Flow
  // ==========================================

  it("successfully receives clean transfer manifest, moves items to destination vault and completes order", async () => {
    // Fetch manifest details to get the exact seal number
    const getRes = await request(app)
      .get(`/api/v1/transfers/manifests/${cleanManifestId}`)
      .set("Authorization", `Bearer ${receiverToken}`);

    expect(getRes.status).toBe(200);
    const sealNumber = getRes.body.seals[0].sealNumber;

    const res = await request(app)
      .post(`/api/v1/transfers/manifests/${cleanManifestId}/receive`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        witnessUserId,
        destinationCompartmentId: destCompId,
        receivedItemIds: [cleanPieceId],
        sealVerifications: [{ sealNumber, status: SealStatus.VERIFIED_INTACT }],
        notes: "All pieces accounted for and in pristine condition",
      });

    expect(res.status).toBe(200);
    expect(res.body.manifest.status).toBe(ManifestStatus.RECEIVED);
    expect(res.body.order.status).toBe(TransferOrderStatus.COMPLETED);
    expect(res.body.disputes).toHaveLength(0);

    // Verify inventory item moved to destination store and compartment
    const itemCheck = await query<{
      store_id: string;
      current_compartment_id: string;
      custody_state: string;
      commercial_state: string;
    }>(
      `SELECT store_id, current_compartment_id, custody_state, commercial_state FROM inventory_items WHERE id = $1`,
      [cleanPieceId],
    );
    expect(itemCheck.rows[0].store_id).toBe(destinationStoreId);
    expect(itemCheck.rows[0].current_compartment_id).toBe(destCompId);
    expect(itemCheck.rows[0].custody_state).toBe("IN_VAULT");
    expect(itemCheck.rows[0].commercial_state).toBe("AVAILABLE_FOR_SALE");
  });

  // ==========================================
  // Discrepancy & Dispute Detection Flow
  // ==========================================

  it("detects tampered seals and missing pieces, creates disputes and marks missing custody (Architectural Gap 2)", async () => {
    const getRes = await request(app)
      .get(`/api/v1/transfers/manifests/${disputeManifestId}`)
      .set("Authorization", `Bearer ${receiverToken}`);

    const sealNumber = getRes.body.seals[0].sealNumber;

    // Receive only disputePiece1Id; disputePiece2Id is missing; seal is BROKEN_TAMPERED
    const res = await request(app)
      .post(`/api/v1/transfers/manifests/${disputeManifestId}/receive`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        witnessUserId,
        destinationCompartmentId: destCompId,
        receivedItemIds: [disputePiece1Id], // disputePiece2Id omitted
        sealVerifications: [
          {
            sealNumber,
            status: SealStatus.BROKEN_TAMPERED,
            notes: "Seal wire was cut upon arrival",
          },
        ],
        notes: "Intake discrepancy: missing piece and cut security seal",
      });

    expect(res.status).toBe(200);
    expect(res.body.manifest.status).toBe(ManifestStatus.DISPUTED);
    expect(res.body.order.status).toBe(TransferOrderStatus.DISPUTED);
    expect(res.body.disputes.length).toBeGreaterThanOrEqual(2);

    const disputeTypes = res.body.disputes.map((d: any) => d.claimType);
    expect(disputeTypes).toContain(DisputeClaimType.DAMAGED_SEAL);
    expect(disputeTypes).toContain(DisputeClaimType.MISSING_PIECE);

    // Verify missing piece custody transitioned to MISSING
    const missingPieceCheck = await query<{ custody_state: string }>(
      `SELECT custody_state FROM inventory_items WHERE id = $1`,
      [disputePiece2Id],
    );
    expect(missingPieceCheck.rows[0].custody_state).toBe("MISSING");

    // Verify received piece moved to destination vault
    const receivedPieceCheck = await query<{
      store_id: string;
      current_compartment_id: string;
      custody_state: string;
    }>(
      `SELECT store_id, current_compartment_id, custody_state FROM inventory_items WHERE id = $1`,
      [disputePiece1Id],
    );
    expect(receivedPieceCheck.rows[0].store_id).toBe(destinationStoreId);
    expect(receivedPieceCheck.rows[0].current_compartment_id).toBe(destCompId);
    expect(receivedPieceCheck.rows[0].custody_state).toBe("IN_VAULT");
  });

  // ==========================================
  // Dispute Management & Resolution Endpoints
  // ==========================================

  it("lists disputes, queries dispute by id, and resolves dispute claim", async () => {
    // 1. List disputes for this transfer order
    const listRes = await request(app)
      .get(`/api/v1/transfers/disputes?transferOrderId=${disputeOrderId}`)
      .set("Authorization", `Bearer ${receiverToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.disputes.length).toBeGreaterThanOrEqual(2);

    const missingDispute = listRes.body.disputes.find(
      (d: any) => d.claimType === DisputeClaimType.MISSING_PIECE,
    );
    expect(missingDispute).toBeDefined();
    expect(missingDispute.status).toBe(DisputeStatus.OPEN);

    // 2. Query individual dispute by ID
    const getDispRes = await request(app)
      .get(`/api/v1/transfers/disputes/${missingDispute.id}`)
      .set("Authorization", `Bearer ${receiverToken}`);

    expect(getDispRes.status).toBe(200);
    expect(getDispRes.body.id).toBe(missingDispute.id);
    expect(getDispRes.body.claimType).toBe(DisputeClaimType.MISSING_PIECE);

    // 3. Unprivileged user cannot resolve dispute
    const unprivResolve = await request(app)
      .post(`/api/v1/transfers/disputes/${missingDispute.id}/resolve`)
      .set("Authorization", `Bearer ${unprivilegedToken}`)
      .send({
        resolutionStatus: DisputeStatus.RESOLVED,
        resolutionNotes: "Attempting resolution without permission",
      });

    expect(unprivResolve.status).toBe(403);

    // 4. Authorized user resolves dispute
    const resolveRes = await request(app)
      .post(`/api/v1/transfers/disputes/${missingDispute.id}/resolve`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        resolutionStatus: DisputeStatus.RESOLVED,
        resolutionNotes: "Item located in staging transit buffer and verified",
      });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.status).toBe(DisputeStatus.RESOLVED);
    expect(resolveRes.body.resolutionNotes).toBe("Item located in staging transit buffer and verified");
    expect(resolveRes.body.resolvedByUserId).toBe(receiverUserId);
  });

  it("allows raising manual transfer dispute", async () => {
    const res = await request(app)
      .post(`/api/v1/transfers/disputes`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        transferOrderId: disputeOrderId,
        transferManifestId: disputeManifestId,
        claimType: DisputeClaimType.WEIGHT_DISCREPANCY,
        severity: DisputeSeverity.MEDIUM,
        witnessUserId,
        details: "Scale shows weight variation of 0.05g from manifest declaration",
      });

    expect(res.status).toBe(201);
    expect(res.body.claimType).toBe(DisputeClaimType.WEIGHT_DISCREPANCY);
    expect(res.body.status).toBe(DisputeStatus.OPEN);
  });
});
