import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createUser,
  createSupplier,
  createGrn,
  createFileObject,
  getFileObjectById,
  getFileObjectByStorageKey,
  listFileObjects,
  deleteFileObject,
  createFileAssociation,
  getFileAssociationsByFileId,
  getFileAssociationsByEntity,
  deleteFileAssociation,
} from "../src/index.js";
import { StoreType, ConflictError, NotFoundError } from "@jewelcore/shared";

describe("File Repository Integration Tests (FEAT-GOV-03)", () => {
  let testOrgId: string;
  let testStoreId: string;
  let testUserId: string;
  let testSupplierId: string;
  let testGrnId: string;

  beforeAll(async () => {
    const report = await runAllMigrations();
    if (report.status === "FAILED") {
      throw new Error(
        `Migrations failed: ${report.error} in ${report.failedMigration}`,
      );
    }

    // Clean up stale test data
    await query(
      "DELETE FROM file_associations WHERE entity_type = 'goods_receipt_notes' AND entity_id IN (SELECT id FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-FILE-%');",
    );
    await query(
      "DELETE FROM file_objects WHERE storage_bucket = 'test-file-bucket';",
    );
    await query(
      "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-FILE-%';",
    );
    await query("DELETE FROM suppliers WHERE code LIKE 'SUP_FILE_%';");
    await query(
      "DELETE FROM users WHERE email LIKE 'file_user%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code = 'FILE_STORE_001';");
    await query("DELETE FROM organizations WHERE code = 'FILE_TEST_ORG';");

    // 1. Organization
    const org = await createOrganization({
      code: "FILE_TEST_ORG",
      name: "File Storage Test Enterprise",
    });
    testOrgId = org.id;

    // 2. Store
    const store = await createStore({
      organizationId: testOrgId,
      code: "FILE_STORE_001",
      name: "File Test Store",
      storeType: StoreType.SHOWROOM,
    });
    testStoreId = store.id;

    // 3. User
    const user = await createUser({
      organizationId: testOrgId,
      email: "file_user@jewelcore.local",
      firstName: "File",
      lastName: "Admin",
      passwordHash: "argon2id_mock_hash",
    });
    testUserId = user.id;

    // 4. Supplier
    const supplier = await createSupplier({
      organizationId: testOrgId,
      code: "SUP_FILE_01",
      name: "File Gem Supplier",
    });
    testSupplierId = supplier.id;

    // 5. GRN
    const grn = await createGrn({
      organizationId: testOrgId,
      storeId: testStoreId,
      supplierId: testSupplierId,
      grnNumber: "GRN-FILE-001",
      createdByUserId: testUserId,
    });
    testGrnId = grn.id;
  });

  afterAll(async () => {
    try {
      await query(
        "DELETE FROM file_associations WHERE entity_type = 'goods_receipt_notes' AND entity_id IN (SELECT id FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-FILE-%');",
      );
      await query(
        "DELETE FROM file_objects WHERE storage_bucket = 'test-file-bucket';",
      );
      await query(
        "DELETE FROM goods_receipt_notes WHERE grn_number LIKE 'GRN-FILE-%';",
      );
      await query("DELETE FROM suppliers WHERE code LIKE 'SUP_FILE_%';");
      await query(
        "DELETE FROM users WHERE email LIKE 'file_user%@jewelcore.local';",
      );
      await query("DELETE FROM stores WHERE code = 'FILE_STORE_001';");
      await query("DELETE FROM organizations WHERE code = 'FILE_TEST_ORG';");
    } finally {
      await closePool();
    }
  });

  it("creates a file_object metadata record with sha256 checksum and retrieves by ID and storageKey", async () => {
    const file = await createFileObject({
      organizationId: testOrgId,
      storageBucket: "test-file-bucket",
      storageKey: "org_test/invoices/inv-001.pdf",
      originalFilename: "supplier-invoice-001.pdf",
      fileExtension: "pdf",
      mimeType: "application/pdf",
      byteSize: 1048576,
      sha256Checksum:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      uploadedByUserId: testUserId,
    });

    expect(file.id).toBeDefined();
    expect(file.organization_id).toBe(testOrgId);
    expect(file.storage_key).toBe("org_test/invoices/inv-001.pdf");
    expect(file.original_filename).toBe("supplier-invoice-001.pdf");
    expect(file.mime_type).toBe("application/pdf");
    expect(Number(file.byte_size)).toBe(1048576);
    expect(file.sha256_checksum).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );

    const retrieved = await getFileObjectById(file.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(file.id);

    const byKey = await getFileObjectByStorageKey(
      "org_test/invoices/inv-001.pdf",
    );
    expect(byKey).not.toBeNull();
    expect(byKey?.id).toBe(file.id);
  });

  it("enforces unique constraint on candidate business key storage_key", async () => {
    await expect(
      createFileObject({
        organizationId: testOrgId,
        storageBucket: "test-file-bucket",
        storageKey: "org_test/invoices/inv-001.pdf", // Duplicate key
        originalFilename: "duplicate.pdf",
        fileExtension: "pdf",
        mimeType: "application/pdf",
        byteSize: 2048,
        sha256Checksum: "a".repeat(64),
        uploadedByUserId: testUserId,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("creates a polymorphic file_association to GRN with is_primary = true", async () => {
    const file = await createFileObject({
      organizationId: testOrgId,
      storageBucket: "test-file-bucket",
      storageKey: "org_test/grns/manifest-001.pdf",
      originalFilename: "grn-manifest-001.pdf",
      fileExtension: "pdf",
      mimeType: "application/pdf",
      byteSize: 524288,
      sha256Checksum: "b".repeat(64),
      uploadedByUserId: testUserId,
    });

    const association = await createFileAssociation({
      fileObjectId: file.id,
      entityType: "goods_receipt_notes",
      entityId: testGrnId,
      associationPurpose: "PURCHASE_ORDER_MANIFEST",
      isPrimary: true,
    });

    expect(association.id).toBeDefined();
    expect(association.file_object_id).toBe(file.id);
    expect(association.entity_type).toBe("goods_receipt_notes");
    expect(association.entity_id).toBe(testGrnId);
    expect(association.association_purpose).toBe("PURCHASE_ORDER_MANIFEST");
    expect(association.is_primary).toBe(true);

    // Query associations by file_object_id
    const fileAssocs = await getFileAssociationsByFileId(file.id);
    expect(fileAssocs).toHaveLength(1);
    expect(fileAssocs[0].id).toBe(association.id);

    // Query associations by entity (polymorphic lookup)
    const entityAssocs = await getFileAssociationsByEntity(
      "goods_receipt_notes",
      testGrnId,
    );
    expect(entityAssocs).toHaveLength(1);
    expect(entityAssocs[0].id).toBe(association.id);
    expect(entityAssocs[0].file_object.original_filename).toBe(
      "grn-manifest-001.pdf",
    );
  });

  it("rejects duplicate association for the same file and entity", async () => {
    const file = await createFileObject({
      organizationId: testOrgId,
      storageBucket: "test-file-bucket",
      storageKey: "org_test/grns/dup-assoc.pdf",
      originalFilename: "dup.pdf",
      fileExtension: "pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      sha256Checksum: "c".repeat(64),
      uploadedByUserId: testUserId,
    });

    await createFileAssociation({
      fileObjectId: file.id,
      entityType: "goods_receipt_notes",
      entityId: testGrnId,
      associationPurpose: "INVOICE",
      isPrimary: false,
    });

    await expect(
      createFileAssociation({
        fileObjectId: file.id,
        entityType: "goods_receipt_notes",
        entityId: testGrnId,
        associationPurpose: "INVOICE_COPY",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("cascades deletion of file_associations when file_object is deleted", async () => {
    const file = await createFileObject({
      organizationId: testOrgId,
      storageBucket: "test-file-bucket",
      storageKey: "org_test/grns/cascade-test.pdf",
      originalFilename: "cascade.pdf",
      fileExtension: "pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      sha256Checksum: "d".repeat(64),
      uploadedByUserId: testUserId,
    });

    await createFileAssociation({
      fileObjectId: file.id,
      entityType: "goods_receipt_notes",
      entityId: testGrnId,
      associationPurpose: "TEST_CASCADE",
    });

    expect(await getFileAssociationsByFileId(file.id)).toHaveLength(1);

    const deleted = await deleteFileObject(file.id);
    expect(deleted).toBe(true);

    expect(await getFileObjectById(file.id)).toBeNull();
    expect(await getFileAssociationsByFileId(file.id)).toHaveLength(0);
  });
});
