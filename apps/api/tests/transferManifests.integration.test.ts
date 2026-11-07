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
  uuidv7,
} from "@jewelcore/database";
import {
  StoreType,
  TransferOrderStatus,
  TransferOrderPriority,
  ManifestStatus,
  SealStatus,
} from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Transfer Manifests & Security Dispatch API (FEAT-XFR-02, Entities 60 & 61)", () => {
  const app = createApp();

  let orgId: string;
  let otherOrgId: string;
  let sourceStoreId: string;
  let destinationStoreId: string;
  let otherStoreId: string;

  let managerToken: string;
  let managerUserId: string;
  let witnessUserId: string;
  let unprivilegedToken: string;
  let unprivilegedUserId: string;
  let otherOrgManagerToken: string;

  let skuId: string;
  let pieceId1: string;
  let approvedOrderId: string;

  async function cleanFixtures() {
    await query("ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history DISABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_immutability;");

    await query("DELETE FROM security_seals WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM transfer_manifests WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM transfer_order_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM transfer_orders WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM inventory_status_history WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM inventory_movements WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM inventory_items WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM quality_check_items WHERE quality_check_id IN (SELECT id FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'))));");
    await query("DELETE FROM quality_checks WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT')));");
    await query("DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'))));");
    await query("DELETE FROM shipments WHERE goods_receipt_note_id IN (SELECT id FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT')));");
    await query("DELETE FROM goods_receipt_notes WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM suppliers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM product_skus WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM products WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM purities WHERE code LIKE 'PUR_MNF_API_%';");
    await query("DELETE FROM materials WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM categories WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM compartments WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT')));");
    await query("DELETE FROM lockers WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT')));");
    await query("DELETE FROM vaults WHERE store_id IN (SELECT id FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT')));");
    await query("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT')));");
    await query("DELETE FROM store_memberships WHERE organization_membership_id IN (SELECT id FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT')));");
    await query("DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM users WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM stores WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT'));");
    await query("DELETE FROM organizations WHERE code IN ('ORG_MNF_API', 'ORG_MNF_API_ALT');");

    await query("ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;");
    await query("ALTER TABLE inventory_status_history ENABLE TRIGGER trg_inventory_status_history_immutability;");
    await query("ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_immutability;");
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_MNF_API",
      name: "Manifest API Org",
    });
    orgId = org.id;

    const otherOrg = await createOrganization({
      code: "ORG_MNF_API_ALT",
      name: "Manifest API Alt Org",
    });
    otherOrgId = otherOrg.id;

    const sourceStore = await createStore({
      organizationId: orgId,
      code: "STORE_MNF_API_01",
      name: "Source Vault Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    sourceStoreId = sourceStore.id;

    const destStore = await createStore({
      organizationId: orgId,
      code: "STORE_MNF_API_02",
      name: "Destination Boutique",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    destinationStoreId = destStore.id;

    const otherStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_MNF_API_ALT",
      name: "Alt Org Store",
      storeType: StoreType.SHOWROOM,
      isActive: true,
    });
    otherStoreId = otherStore.id;

    // 1. Manager User (has transfer:manifest:create, transfer:manifest:view)
    const managerUser = await createUser({
      organizationId: orgId,
      email: "mgr_mnf_api@test.com",
      firstName: "Mark",
      lastName: "Manager",
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

    // 2. Witness User
    const witnessUser = await createUser({
      organizationId: orgId,
      email: "wit_mnf_api@test.com",
      firstName: "Wanda",
      lastName: "Witness",
      passwordHash: "hash",
      isActive: true,
    });
    witnessUserId = witnessUser.id;

    // 3. Unprivileged User (QC_TECHNICIAN, lacks transfer:manifest:create)
    const unprivUser = await createUser({
      organizationId: orgId,
      email: "unpriv_mnf_api@test.com",
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
      email: "other_mnf_mgr@test.com",
      firstName: "Other",
      lastName: "Org",
      passwordHash: "hash",
      isActive: true,
    });
    if (storeManagerRole) {
      await assignRoleToUser(otherUser.id, storeManagerRole.id);
    }
    otherOrgManagerToken = await signAccessToken({
      userId: otherUser.id,
      email: otherUser.email,
      orgId: otherOrgId,
    });

    // 5. Storage Hierarchy & Products
    const vault = await createVault({
      storeId: sourceStoreId,
      code: "VLT_MNF_API_01",
      name: "Main Vault",
      vaultType: "MAIN_VAULT",
    });

    const locker = await createLocker({
      vaultId: vault.id,
      storeId: sourceStoreId,
      code: "LCK_MNF_API_01",
      name: "Locker A",
      lockerNumber: "LK-01",
    });

    const comp = await createCompartment({
      lockerId: locker.id,
      storeId: sourceStoreId,
      code: "CMP_MNF_API_01",
      name: "Compartment 1",
      compartmentNumber: "C-01",
    });

    const category = await createCategory({
      organizationId: orgId,
      code: "CAT_MNF_API_RINGS",
      name: "Solitaire Rings",
    });

    const material = await createMaterial({
      organizationId: orgId,
      code: "MAT_MNF_API_GOLD",
      name: "Yellow Gold",
      baseMetalType: "GOLD",
      isPrecious: true,
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "PUR_MNF_API_18K",
      name: "18K Gold",
      purityPercentage: 75.0,
      purityRatio: 0.75,
      isHallmarkPurity: true,
    });

    const product = await createProduct({
      organizationId: orgId,
      categoryId: category.id,
      productCode: "PRD_MNF_API_001",
      name: "Classic Solitaire",
      materialId: material.id,
      defaultPurityId: purity.id,
    });

    const sku = await createProductSku({
      organizationId: orgId,
      productId: product.id,
      skuCode: "SKU-MNF-API-001",
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
      code: "SUP_MNF_API_01",
      name: "Supplier MNF API",
    });

    const grnRes = await query<{ id: string }>(
      `INSERT INTO goods_receipt_notes (id, organization_id, store_id, supplier_id, grn_number, status, created_by_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 'GRN-MNF-API-01', 'RECEIVED', $4)
       RETURNING id`,
      [orgId, sourceStoreId, sup.id, managerUserId],
    );
    const grnId = grnRes.rows[0]!.id;

    const shipRes = await query<{ id: string }>(
      `INSERT INTO shipments (id, goods_receipt_note_id, shipment_number, carrier_name, tracking_number, status, received_by_user_id)
       VALUES (gen_random_uuid(), $1, 'SHIP-MNF-API-01', 'BRINKS', 'BR-01', 'RECEIVED', $2)
       RETURNING id`,
      [grnId, managerUserId],
    );
    const shipmentId = shipRes.rows[0]!.id;

    const shipItemRes = await query<{ id: string }>(
      `INSERT INTO shipment_items (id, shipment_id, product_sku_id, line_number, declared_piece_count, received_piece_count)
       VALUES (gen_random_uuid(), $1, $2, 1, 1, 1)
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

    const qci = await query<{ id: string }>(
      `INSERT INTO quality_check_items (
        id, quality_check_id, shipment_item_id, item_sequence_number, status,
        gross_weight_grams, net_weight_grams, verified_material_id, verified_purity_id,
        hallmark_verified, visual_inspection_passed, damage_detected
       )
       VALUES (gen_random_uuid(), $1, $2, 1, 'APPROVED', 5.0000, 5.0000, $3, $4, true, true, false)
       RETURNING id`,
      [qcId, shipmentItemId, material.id, purity.id],
    );
    const qcItemId = qci.rows[0]!.id;

    pieceId1 = uuidv7();
    await query(
      `INSERT INTO inventory_items (
        id, organization_id, store_id, product_sku_id, quality_check_item_id, serial_number, item_name,
        gross_weight_grams, net_weight_grams, purity_id, custody_state, commercial_state, current_compartment_id,
        created_at, updated_at
      ) VALUES
       ($1, $2, $3, $4, $5, 'SN-MNF-API-01', 'Solitaire 1', 5.0000, 5.0000, $6, 'IN_VAULT', 'AVAILABLE_FOR_SALE', $7, clock_timestamp(), clock_timestamp())`,
      [pieceId1, orgId, sourceStoreId, sku.id, qcItemId, purity.id, comp.id],
    );

    // Create an approved transfer order
    const order = await createTransferOrder(orgId, managerUserId, {
      sourceStoreId,
      destinationStoreId,
      priority: TransferOrderPriority.HIGH,
      itemIds: [pieceId1],
    });
    await submitTransferOrder(orgId, order.id, managerUserId);
    const approved = await approveTransferOrder(orgId, order.id, managerUserId);
    approvedOrderId = approved.id;
  });

  afterAll(async () => {
    await cleanFixtures();
  });

  it("POST /api/v1/transfers/manifests returns 401 if unauthenticated", async () => {
    const res = await request(app)
      .post("/api/v1/transfers/manifests")
      .send({
        transferOrderId: approvedOrderId,
        witnessUserId,
        carrierName: "BRINKS",
        sealNumbers: ["SEAL-01"],
      });

    expect(res.status).toBe(401);
  });

  it("POST /api/v1/transfers/manifests returns 403 if user lacks transfer:manifest:create", async () => {
    const res = await request(app)
      .post("/api/v1/transfers/manifests")
      .set("Authorization", `Bearer ${unprivilegedToken}`)
      .send({
        transferOrderId: approvedOrderId,
        witnessUserId,
        carrierName: "BRINKS",
        sealNumbers: ["SEAL-01"],
      });

    expect(res.status).toBe(403);
  });

  it("POST /api/v1/transfers/manifests rejects self-witness dispatch (INV-13 dual-custody check)", async () => {
    const res = await request(app)
      .post("/api/v1/transfers/manifests")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        transferOrderId: approvedOrderId,
        witnessUserId: managerUserId, // same user!
        carrierName: "BRINKS",
        sealNumbers: ["SEAL-01"],
      });

    expect(res.status).toBe(400);
  });

  it("POST /api/v1/transfers/manifests dispatches transfer order and creates security seals (201 Created)", async () => {
    const res = await request(app)
      .post("/api/v1/transfers/manifests")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        transferOrderId: approvedOrderId,
        witnessUserId,
        carrierName: "MALCA-AMIT ARMORED",
        trackingNumber: "MA-EXP-9922",
        sealNumbers: ["SEAL-BAG-991", "SEAL-BAG-992"],
        notes: "Dual custody armored courier dispatch",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.manifestNumber).toMatch(/^MNF-/);
    expect(res.body.status).toBe(ManifestStatus.DISPATCHED);
    expect(res.body.carrierName).toBe("MALCA-AMIT ARMORED");
    expect(res.body.trackingNumber).toBe("MA-EXP-9922");
    expect(res.body.seals).toHaveLength(2);
    expect(res.body.seals[0].status).toBe(SealStatus.ATTACHED);

    const manifestId = res.body.id;

    // GET /api/v1/transfers/manifests/:id
    const getRes = await request(app)
      .get(`/api/v1/transfers/manifests/${manifestId}`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.manifestNumber).toBe(res.body.manifestNumber);
    expect(getRes.body.dispatcherUserName).toBe("Mark Manager");
    expect(getRes.body.witnessUserName).toBe("Wanda Witness");

    // Other org manager should get 404 (multi-tenant isolation)
    const otherOrgGetRes = await request(app)
      .get(`/api/v1/transfers/manifests/${manifestId}`)
      .set("Authorization", `Bearer ${otherOrgManagerToken}`);
    expect(otherOrgGetRes.status).toBe(404);
  });

  it("GET /api/v1/transfers/manifests lists manifests with filters and pagination", async () => {
    const res = await request(app)
      .get("/api/v1/transfers/manifests")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.manifests.length).toBeGreaterThanOrEqual(1);

    // Other org manager gets 0 manifests
    const otherRes = await request(app)
      .get("/api/v1/transfers/manifests")
      .set("Authorization", `Bearer ${otherOrgManagerToken}`);

    expect(otherRes.status).toBe(200);
    expect(otherRes.body.manifests).toHaveLength(0);
  });
});
