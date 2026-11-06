import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  getRoleByCode,
  assignRoleToUser,
  createSupplier,
  createCategory,
  createMaterial,
  createPurity,
  createProduct,
  createProductSku,
  createGrn,
  closeGrn,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Shipments & Line Items API Endpoints (FEAT-PROC-03)", () => {
  const app = createApp();

  let testOrgId: string;
  let testStoreId: string;
  let testSupplierId: string;
  let testSkuId: string;
  let openGrnId: string;
  let closedGrnId: string;
  let managerToken: string;
  let salesToken: string;
  let createdShipmentId: string;
  let createdItemId: string;

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up any stale data from prior runs
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHP-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHP-API-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-SHP-API-%';",
    );
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SHP-API-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'SHP-API-%';");
    await query("DELETE FROM purities WHERE code LIKE 'SHP_API_%';");
    await query("DELETE FROM materials WHERE code LIKE 'SHP_API_%';");
    await query("DELETE FROM categories WHERE code LIKE 'SHP_API_%';");
    await query("DELETE FROM suppliers WHERE code LIKE 'SHP_API_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'shp_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code = 'SHP_API_STR_01';");
    await query("DELETE FROM organizations WHERE code = 'SHP_API_ORG';");

    // 1. Organization
    const org = await createOrganization({
      code: "SHP_API_ORG",
      name: "Shipment API Enterprise Inc",
    });
    testOrgId = org.id;

    // 2. Store Branch
    const store = await createStore({
      organizationId: testOrgId,
      code: "SHP_API_STR_01",
      name: "Flagship Shipment Intake",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    testStoreId = store.id;

    // 3. Supplier
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "SHP_API_SUPP_01",
      name: "Cartier Paris Atelier",
      currencyCode: "EUR",
      paymentTerms: "NET_30",
    });
    testSupplierId = supplier.id;

    // 4. Taxonomy & Commercial SKU
    const category = await createCategory({
      organizationId: testOrgId,
      code: "SHP_API_CAT_01",
      name: "Necklaces",
    });

    const material = await createMaterial({
      organizationId: testOrgId,
      code: "SHP_API_PT",
      name: "Platinum",
      baseMetalType: "PT",
    });

    const purity = await createPurity({
      materialId: material.id,
      code: "SHP_API_PT950",
      name: "950 Platinum",
      purityPercentage: 95.0,
      purityRatio: 0.95,
    });

    const product = await createProduct({
      organizationId: testOrgId,
      categoryId: category.id,
      materialId: material.id,
      defaultPurityId: purity.id,
      productCode: "SHP-API-NCK-01",
      name: "Diamond Rivière Necklace",
      defaultTrackingType: "SERIALIZED",
    });

    const sku = await createProductSku({
      organizationId: testOrgId,
      productId: product.id,
      skuCode: "SHP-API-SKU-01",
      variantName: "Rivière 16-inch Platinum",
      targetPurityId: purity.id,
      targetGrossWeightGrams: 42.5,
      targetMetalWeightGrams: 35.0,
    });
    testSkuId = sku.id;

    // 5. Manager User (STORE_MANAGER has procurement:write and procurement:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "shp_api_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Shipment",
      lastName: "Manager",
      isActive: true,
    });

    const managerRole = await getRoleByCode("STORE_MANAGER");
    if (managerRole) {
      await assignRoleToUser(manager.id, managerRole.id);
    }

    managerToken = await signAccessToken({
      userId: manager.id,
      orgId: testOrgId,
      email: manager.email,
    });

    // 6. Sales User (SALES_ASSOCIATE lacks procurement:write)
    const salesUser = await createUser({
      organizationId: testOrgId,
      email: "shp_api_sales@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Sales",
      lastName: "Associate",
      isActive: true,
    });

    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    if (salesRole) {
      await assignRoleToUser(salesUser.id, salesRole.id);
    }

    salesToken = await signAccessToken({
      userId: salesUser.id,
      orgId: testOrgId,
      email: salesUser.email,
    });

    // 7. Open GRN
    const openGrn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-SHP-API-OPEN",
      createdByUserId: manager.id,
    });
    openGrnId = openGrn.id;

    // 8. Closed GRN (for immutability tests)
    const closedGrn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-SHP-API-CLOSED",
      createdByUserId: manager.id,
    });
    await closeGrn(closedGrn.id, manager.id, "Audit locked");
    closedGrnId = closedGrn.id;
  });

  afterAll(async () => {
    await query(
      "DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE shipment_number LIKE 'SHP-API-%');",
    );
    await query(
      "DELETE FROM shipments WHERE shipment_number LIKE 'SHP-API-%';",
    );
    await query("DELETE FROM goods_receipt_notes WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM product_skus WHERE sku_code LIKE 'SHP-API-%';");
    await query("DELETE FROM products WHERE product_code LIKE 'SHP-API-%';");
    await query("DELETE FROM purities WHERE code LIKE 'SHP_API_%';");
    await query("DELETE FROM materials WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM categories WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query("DELETE FROM suppliers WHERE organization_id = $1;", [
      testOrgId,
    ]);
    await query(
      "DELETE FROM users WHERE email LIKE 'shp_api_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code = 'SHP_API_STR_01';");
    await query("DELETE FROM organizations WHERE id = $1;", [testOrgId]);
    await closePool();
  });

  // AC Scenario 1: Line Item Declared Weight Validation (DEC-05)
  it("Scenario 1: creates shipment with manifest item and persists DEC-05 4-decimal gross weight (15.4520g)", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/shipments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        goodsReceiptNoteId: openGrnId,
        shipmentNumber: "SHP-API-001",
        carrierName: "Brinks Secure International",
        trackingNumber: "BRINKS-EXP-7788",
        declaredPackageCount: 1,
        receivedPackageCount: 1,
        grossPackageWeightGrams: 150.25,
        items: [
          {
            productSkuId: testSkuId,
            lineNumber: 1,
            supplierItemCode: "CRT-RIV-01",
            declaredPieceCount: 1,
            receivedPieceCount: 1,
            declaredGrossWeightGrams: 15.452, // 4-decimal precision
            declaredNetWeightGrams: 12.0,
            unitLabourMakingCost: 500.0,
            lineTotalSettlement: 15000.0,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.shipmentNumber).toBe("SHP-API-001");
    expect(res.body.data.status).toBe("PENDING");
    expect(res.body.data.items).toHaveLength(1);

    const line = res.body.data.items[0];
    expect(line.lineNumber).toBe(1);
    expect(line.declaredGrossWeightGrams).toBe(15.452);
    expect(line.version).toBe(1);

    createdShipmentId = res.body.data.id;
    createdItemId = line.id;
  });

  // AC Scenario 2: Missing Declared Gross Weight Protocol
  it("Scenario 2: accepts shipment line item with missing (NULL) declared gross weight for downstream QC flagging", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/shipments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        goodsReceiptNoteId: openGrnId,
        shipmentNumber: "SHP-API-002",
        items: [
          {
            productSkuId: testSkuId,
            lineNumber: 1,
            declaredPieceCount: 2,
            declaredGrossWeightGrams: null, // Omitted vendor weight
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].declaredGrossWeightGrams).toBeNull();
  });

  // AC Scenario 3: Unauthorized Shipment Manifest Submission Rejection
  it("Scenario 3: rejects user without procurement:write permission with 403 Forbidden", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/shipments")
      .set("Authorization", `Bearer ${salesToken}`)
      .send({
        goodsReceiptNoteId: openGrnId,
        shipmentNumber: "SHP-API-UNAUTH",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
  });

  // Scenario 4: Validation Error on missing required fields
  it("Scenario 4: rejects creation missing goodsReceiptNoteId with 400 Validation Error", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/shipments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        shipmentNumber: "SHP-API-NO-GRN",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ERR_VALIDATION");
  });

  // Scenario 5: Duplicate Shipment Number Rejection (409 Conflict)
  it("Scenario 5: rejects duplicate shipment number with 409 Conflict", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/shipments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        goodsReceiptNoteId: openGrnId,
        shipmentNumber: "SHP-API-001", // Duplicate
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ERR_DUPLICATE_SHIPMENT_NUMBER");
  });

  // Scenario 6: Retrieve & List Shipments
  it("Scenario 6: retrieves shipment with nested line items and lists shipments by GRN filter", async () => {
    const getRes = await request(app)
      .get(`/api/v1/procurement/shipments/${createdShipmentId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(createdShipmentId);
    expect(getRes.body.data.items).toHaveLength(1);

    const listRes = await request(app)
      .get(`/api/v1/procurement/shipments?goodsReceiptNoteId=${openGrnId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.data.some((s: any) => s.id === createdShipmentId)).toBe(
      true,
    );
  });

  // Scenario 7: Add Line Item to Shipment
  it("Scenario 7: adds line item to shipment and rejects duplicate lineNumber in same shipment", async () => {
    const addRes = await request(app)
      .post(`/api/v1/procurement/shipments/${createdShipmentId}/items`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        productSkuId: testSkuId,
        lineNumber: 2,
        declaredPieceCount: 1,
        declaredGrossWeightGrams: 42.501,
      });

    expect(addRes.status).toBe(201);
    expect(addRes.body.data.lineNumber).toBe(2);
    expect(addRes.body.data.declaredGrossWeightGrams).toBe(42.501);

    // Duplicate lineNumber 2 must fail with 409
    const dupRes = await request(app)
      .post(`/api/v1/procurement/shipments/${createdShipmentId}/items`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        productSkuId: testSkuId,
        lineNumber: 2,
        declaredPieceCount: 1,
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.code).toBe("ERR_DUPLICATE_LINE_NUMBER");
  });

  // Scenario 8: Update Line Item & OCC Concurrency
  it("Scenario 8: updates line item measured gross weight and reconciliation status, incrementing OCC version", async () => {
    const patchRes = await request(app)
      .patch(
        `/api/v1/procurement/shipments/${createdShipmentId}/items/${createdItemId}`,
      )
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        measuredGrossWeightGrams: 15.4522, // 4-decimal balance reading
        reconciliationStatus: "MATCHED",
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.measuredGrossWeightGrams).toBe(15.4522);
    expect(patchRes.body.data.reconciliationStatus).toBe("MATCHED");
    expect(patchRes.body.data.version).toBe(2);
  });

  // Scenario 9: Parent GRN Immutability Lock (INV-06 / INV-19)
  it("Scenario 9: rejects adding shipment under a CLOSED GRN with 422 ERR_GRN_IMMUTABLE", async () => {
    const res = await request(app)
      .post("/api/v1/procurement/shipments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        goodsReceiptNoteId: closedGrnId, // CLOSED GRN
        shipmentNumber: "SHP-API-CLOSED-ERR",
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("ERR_GRN_IMMUTABLE");
  });
});
