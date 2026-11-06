import crypto from "node:crypto";
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
  createGrn,
} from "@jewelcore/database";
import { StoreType } from "@jewelcore/shared";
import { signAccessToken } from "../src/modules/auth/authUtils.js";

describe("Polymorphic Document & File Storage API (FEAT-GOV-03)", () => {
  const app = createApp();

  let testOrgId: string;
  let testStoreId: string;
  let testSupplierId: string;
  let testGrnId: string;
  let managerToken: string;
  let unauthorizedToken: string;
  let uploadedFileId: string;
  let pdfSha256: string;
  const samplePdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000118 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n168\n%%EOF\n",
  );

  beforeAll(async () => {
    await runAllMigrations();

    // Clean up any stale data from prior runs
    await query(
      "DELETE FROM file_associations WHERE entity_type = 'goods_receipt_notes' AND entity_id IN (SELECT id FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-GOV-%');",
    );
    await query(
      "DELETE FROM file_objects WHERE original_filename LIKE 'test-invoice-%';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-GOV-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'GOV_SUPP_%';");
    await query("DELETE FROM users WHERE email LIKE 'gov_%@jewelcore.local';");
    await query("DELETE FROM stores WHERE code = 'GOV_STORE_001';");
    await query("DELETE FROM organizations WHERE code = 'GOV_TEST_ORG';");

    // Compute expected PDF SHA-256
    pdfSha256 = crypto
      .createHash("sha256")
      .update(samplePdfBuffer)
      .digest("hex");

    // 1. Organization
    const org = await createOrganization({
      code: "GOV_TEST_ORG",
      name: "Governance Document Enterprise",
    });
    testOrgId = org.id;

    // 2. Store
    const store = await createStore({
      organizationId: testOrgId,
      code: "GOV_STORE_001",
      name: "Central Receiving Vault Branch",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    testStoreId = store.id;

    // 3. Supplier
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "GOV_SUPP_01",
      name: "Cartier International Supplier",
    });
    testSupplierId = supplier.id;

    // 4. Authorized User (STORE_MANAGER with documents:write and documents:read)
    const manager = await createUser({
      organizationId: testOrgId,
      email: "gov_manager@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Document",
      lastName: "Officer",
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

    // 5. Unauthorized User (SALES_ASSOCIATE lacks documents:write)
    const unauthorizedUser = await createUser({
      organizationId: testOrgId,
      email: "gov_sales@jewelcore.local",
      passwordHash: "$argon2id$v=19$fake",
      firstName: "Sales",
      lastName: "Clerk",
      isActive: true,
    });

    const salesRole = await getRoleByCode("SALES_ASSOCIATE");
    if (salesRole) {
      await assignRoleToUser(unauthorizedUser.id, salesRole.id);
    }

    unauthorizedToken = await signAccessToken({
      userId: unauthorizedUser.id,
      orgId: testOrgId,
      email: unauthorizedUser.email,
    });

    // 6. Target Goods Receipt Note
    const grn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-GOV-001",
      createdByUserId: manager.id,
    });
    testGrnId = grn.id;
  });

  afterAll(async () => {
    try {
      await query(
        "DELETE FROM file_associations WHERE entity_type = 'goods_receipt_notes' AND entity_id IN (SELECT id FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-GOV-%');",
      );
      await query(
        "DELETE FROM file_objects WHERE original_filename LIKE 'test-invoice-%';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-GOV-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'GOV_SUPP_%';");
      await query(
        "DELETE FROM users WHERE email LIKE 'gov_%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code = 'GOV_STORE_001';");
      await query("DELETE FROM organizations WHERE code = 'GOV_TEST_ORG';");
    } catch {
      // Ignore cleanup error if tables do not exist
    } finally {
      await closePool();
    }
  });

  // -------------------------------------------------------------
  // Scenario 1: Secure File Upload with Metadata Extraction
  // -------------------------------------------------------------
  it("Scenario 1: uploads a supplier invoice PDF with metadata extraction and presigned retrieval URL", async () => {
    const res = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", testStoreId)
      .send({
        originalFilename: "test-invoice-001.pdf",
        mimeType: "application/pdf",
        contentBase64: samplePdfBuffer.toString("base64"),
        storageBucket: "jewelcore-documents",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.organizationId).toBe(testOrgId);
    expect(res.body.storageBucket).toBe("jewelcore-documents");
    expect(res.body.storageKey).toContain(testOrgId);
    expect(res.body.storageKey).toContain("test-invoice-001.pdf");
    expect(res.body.originalFilename).toBe("test-invoice-001.pdf");
    expect(res.body.fileExtension).toBe("pdf");
    expect(res.body.mimeType).toBe("application/pdf");
    expect(res.body.byteSize).toBe(samplePdfBuffer.length);
    expect(res.body.sha256Checksum).toBe(pdfSha256);
    expect(res.body.presignedUrl).toBeDefined();
    expect(res.body.presignedUrl).toContain("https://storage.jewelcore.local");
    expect(res.body.presignedUrl).toContain("signature=");

    uploadedFileId = res.body.id;
  });

  // -------------------------------------------------------------
  // Scenario 2: Polymorphic Entity Association to Purchase Order Manifest
  // -------------------------------------------------------------
  it("Scenario 2: associates the file to a Goods Receipt Note with is_primary = TRUE and verifies queryability", async () => {
    const assocRes = await request(app)
      .post(`/api/v1/files/${uploadedFileId}/associations`)
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", testStoreId)
      .send({
        entity_type: "goods_receipt_notes",
        entity_id: testGrnId,
        association_purpose: "PURCHASE_ORDER_MANIFEST",
        is_primary: true,
      });

    expect(assocRes.status).toBe(201);
    expect(assocRes.body.id).toBeDefined();
    expect(assocRes.body.fileObjectId).toBe(uploadedFileId);
    expect(assocRes.body.entityType).toBe("goods_receipt_notes");
    expect(assocRes.body.entityId).toBe(testGrnId);
    expect(assocRes.body.associationPurpose).toBe("PURCHASE_ORDER_MANIFEST");
    expect(assocRes.body.isPrimary).toBe(true);

    // Verify attachment is queryable under the GRN record
    const queryRes = await request(app)
      .get("/api/v1/files/associations")
      .query({
        entityType: "goods_receipt_notes",
        entityId: testGrnId,
      })
      .set("Authorization", `Bearer ${managerToken}`);

    expect(queryRes.status).toBe(200);
    expect(Array.isArray(queryRes.body)).toBe(true);
    expect(queryRes.body.length).toBeGreaterThanOrEqual(1);

    const match = queryRes.body.find(
      (a: any) => a.fileObjectId === uploadedFileId,
    );
    expect(match).toBeDefined();
    expect(match.entityType).toBe("goods_receipt_notes");
    expect(match.entityId).toBe(testGrnId);
    expect(match.isPrimary).toBe(true);
    expect(match.fileObject).toBeDefined();
    expect(match.fileObject.originalFilename).toBe("test-invoice-001.pdf");
    expect(match.fileObject.sha256Checksum).toBe(pdfSha256);
  });

  // -------------------------------------------------------------
  // Scenario 3: Prohibited File MIME Type Rejection
  // -------------------------------------------------------------
  it("Scenario 3: rejects disallowed executable MIME type with 400 Bad Request and ERR_UNSUPPORTED_MIME_TYPE", async () => {
    const res = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${managerToken}`)
      .set("x-store-id", testStoreId)
      .send({
        originalFilename: "payload.exe",
        mimeType: "application/x-dosexec",
        contentBase64: Buffer.from("MZ\x90\x00\x03\x00\x00\x00").toString(
          "base64",
        ),
      });

    expect(res.status).toBe(400);
    expect(res.body.type).toBe("https://jewelcore.com/errors/validation");
    expect(res.body.code).toBe("ERR_UNSUPPORTED_MIME_TYPE");
    expect(res.body.detail).toContain("application/x-dosexec");
  });

  // -------------------------------------------------------------
  // Scenario 4: Cryptographic Checksum Integrity Verification
  // -------------------------------------------------------------
  it("Scenario 4: retrieves file content and verifies cryptographic SHA-256 checksum with zero drift", async () => {
    // 1. Content streaming endpoint
    const contentRes = await request(app)
      .get(`/api/v1/files/${uploadedFileId}/content`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(contentRes.status).toBe(200);
    expect(contentRes.headers["content-type"]).toContain("application/pdf");
    expect(contentRes.headers["x-sha256-checksum"]).toBe(pdfSha256);
    expect(contentRes.headers["x-checksum-verified"]).toBe("true");

    // Recalculate checksum on received buffer
    const receivedBuffer = Buffer.from(contentRes.body);
    const computedHash = crypto
      .createHash("sha256")
      .update(receivedBuffer)
      .digest("hex");
    expect(computedHash).toBe(pdfSha256);

    // 2. Explicit verify endpoint
    const verifyRes = await request(app)
      .get(`/api/v1/files/${uploadedFileId}/verify`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.verified).toBe(true);
    expect(verifyRes.body.drift).toBe(false);
    expect(verifyRes.body.recordedChecksum).toBe(pdfSha256);
    expect(verifyRes.body.computedChecksum).toBe(pdfSha256);
  });

  // -------------------------------------------------------------
  // Scenario 5: Unauthorized Document Upload Rejection
  // -------------------------------------------------------------
  it("Scenario 5: rejects upload from user lacking documents:write permission with 403 Forbidden and ERR_INSUFFICIENT_PERMISSIONS", async () => {
    const res = await request(app)
      .post("/api/v1/files")
      .set("Authorization", `Bearer ${unauthorizedToken}`)
      .set("x-store-id", testStoreId)
      .send({
        originalFilename: "unauthorized.pdf",
        mimeType: "application/pdf",
        contentBase64: samplePdfBuffer.toString("base64"),
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ERR_INSUFFICIENT_PERMISSIONS");
    expect(res.body.detail).toContain("documents:write");
  });

  // -------------------------------------------------------------
  // Scenario 5b: Unauthenticated Document Upload Rejection
  // -------------------------------------------------------------
  it("Scenario 5b: rejects upload from unauthenticated client with 401 Unauthorized", async () => {
    const res = await request(app)
      .post("/api/v1/files")
      .send({
        originalFilename: "noauth.pdf",
        mimeType: "application/pdf",
        contentBase64: samplePdfBuffer.toString("base64"),
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ERR_UNAUTHORIZED");
  });
});
