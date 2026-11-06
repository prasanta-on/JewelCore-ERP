import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import {
  BadRequestError,
  NotFoundError,
  ValidationError,
  ALLOWED_DOCUMENT_MIME_TYPES,
  uploadFileSchema,
  createFileAssociationSchema,
} from "@jewelcore/shared";
import {
  uuidv7,
  createFileObject,
  getFileObjectById,
  createFileAssociation,
  getFileAssociationsByFileId,
  getFileAssociationsByEntity,
  deleteFileAssociation,
} from "@jewelcore/database";
import { getStorageProvider } from "./storageProvider.js";

/**
 * Handles binary file upload with cryptographic SHA-256 metadata extraction.
 * Conforms to Scenario 1, 3 & 5 of FEAT-GOV-03.
 */
export async function uploadFileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new BadRequestError("User authentication context is required");
    }

    const orgId =
      req.user?.orgId ??
      req.user?.organizationId ??
      req.storeContext?.organizationId ??
      req.body.organizationId ??
      req.body.organization_id;

    if (!orgId) {
      throw new BadRequestError(
        "Organization context is required to upload files",
        "ERR_MISSING_ORG_CONTEXT",
      );
    }

    // Explicitly validate MIME type prior to parse to guarantee RFC 7807 ERR_UNSUPPORTED_MIME_TYPE
    const rawMime = req.body.mimeType ?? req.body.mime_type;
    if (
      rawMime &&
      !(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(rawMime)
    ) {
      throw new BadRequestError(
        `MIME type '${rawMime}' is unsupported or prohibited for document storage`,
        "ERR_UNSUPPORTED_MIME_TYPE",
      );
    }

    const parseResult = uploadFileSchema.safeParse(req.body);
    if (!parseResult.success) {
      // Check if any issue was ERR_UNSUPPORTED_MIME_TYPE
      const isMimeError = parseResult.error.issues.some(
        (i: any) =>
          i.params?.code === "ERR_UNSUPPORTED_MIME_TYPE" ||
          i.path?.includes("mimeType") ||
          i.path?.includes("mime_type"),
      );

      if (isMimeError) {
        throw new BadRequestError(
          `MIME type '${rawMime}' is unsupported or prohibited`,
          "ERR_UNSUPPORTED_MIME_TYPE",
        );
      }

      throw new ValidationError(
        "Invalid file upload payload",
        parseResult.error.issues.map((issue) => ({
          name: issue.path.join("."),
          reason: issue.message,
        })),
      );
    }

    const {
      originalFilename,
      mimeType,
      contentBase64,
      fileExtension,
      storageBucket,
      initialAssociation,
    } = parseResult.data;

    // Decode binary payload
    const buffer = Buffer.from(contentBase64, "base64");
    const byteSize = buffer.length;

    // Calculate cryptographic SHA-256 digest
    const sha256Checksum = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    // Generate unique S3 storage key
    const fileId = uuidv7();
    const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `${orgId}/documents/${fileId}-${sanitizedFilename}`;

    // Store binary in object storage
    const storageProvider = getStorageProvider();
    await storageProvider.putObject(
      storageBucket,
      storageKey,
      buffer,
      mimeType,
    );

    // Generate presigned retrieval URL
    const presignedUrl = await storageProvider.getPresignedUrl(
      storageBucket,
      storageKey,
    );

    // Persist file metadata record in PostgreSQL
    const fileObject = await createFileObject({
      id: fileId,
      organizationId: orgId,
      storageBucket,
      storageKey,
      originalFilename,
      fileExtension,
      mimeType,
      byteSize,
      sha256Checksum,
      uploadedByUserId: userId,
    });

    // Optional initial polymorphic association
    let associationRecord = null;
    if (initialAssociation) {
      associationRecord = await createFileAssociation({
        fileObjectId: fileId,
        entityType: initialAssociation.entityType,
        entityId: initialAssociation.entityId,
        associationPurpose: initialAssociation.associationPurpose,
        isPrimary: initialAssociation.isPrimary,
      });
    }

    res.status(201).json({
      id: fileObject.id,
      organizationId: fileObject.organization_id,
      storageBucket: fileObject.storage_bucket,
      storageKey: fileObject.storage_key,
      originalFilename: fileObject.original_filename,
      fileExtension: fileObject.file_extension,
      mimeType: fileObject.mime_type,
      byteSize: Number(fileObject.byte_size),
      sha256Checksum: fileObject.sha256_checksum,
      uploadedByUserId: fileObject.uploaded_by_user_id,
      presignedUrl,
      createdAt: fileObject.created_at,
      association: associationRecord
        ? {
            id: associationRecord.id,
            entityType: associationRecord.entity_type,
            entityId: associationRecord.entity_id,
            associationPurpose: associationRecord.association_purpose,
            isPrimary: associationRecord.is_primary,
            createdAt: associationRecord.created_at,
          }
        : undefined,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves file metadata by ID with fresh presigned retrieval URL.
 */
export async function getFileHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("File ID parameter is required");
    }
    const file = await getFileObjectById(id);
    if (!file) {
      throw new NotFoundError(
        `File with ID '${id}' not found`,
        "ERR_FILE_NOT_FOUND",
      );
    }

    const storageProvider = getStorageProvider();
    const presignedUrl = await storageProvider.getPresignedUrl(
      file.storage_bucket,
      file.storage_key,
    );

    res.status(200).json({
      id: file.id,
      organizationId: file.organization_id,
      storageBucket: file.storage_bucket,
      storageKey: file.storage_key,
      originalFilename: file.original_filename,
      fileExtension: file.file_extension,
      mimeType: file.mime_type,
      byteSize: Number(file.byte_size),
      sha256Checksum: file.sha256_checksum,
      uploadedByUserId: file.uploaded_by_user_id,
      presignedUrl,
      createdAt: file.created_at,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Streams binary file content and verifies zero checksum drift (Scenario 4).
 */
export async function getFileContentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("File ID parameter is required");
    }
    const file = await getFileObjectById(id);
    if (!file) {
      throw new NotFoundError(
        `File with ID '${id}' not found`,
        "ERR_FILE_NOT_FOUND",
      );
    }

    const storageProvider = getStorageProvider();
    const buffer = await storageProvider.getObject(
      file.storage_bucket,
      file.storage_key,
    );

    // Cryptographic checksum verification (zero checksum drift check)
    const computedHash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    if (computedHash !== file.sha256_checksum) {
      throw new BadRequestError(
        `Cryptographic integrity error: Checksum mismatch for file '${id}'`,
        "ERR_CHECKSUM_INTEGRITY_MISMATCH",
      );
    }

    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("X-Sha256-Checksum", file.sha256_checksum);
    res.setHeader("X-Checksum-Verified", "true");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(file.original_filename)}"`,
    );

    res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
}

/**
 * Validates cryptographic checksum without streaming payload (Scenario 4).
 */
export async function verifyFileChecksumHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("File ID parameter is required");
    }
    const file = await getFileObjectById(id);
    if (!file) {
      throw new NotFoundError(
        `File with ID '${id}' not found`,
        "ERR_FILE_NOT_FOUND",
      );
    }

    const storageProvider = getStorageProvider();
    const buffer = await storageProvider.getObject(
      file.storage_bucket,
      file.storage_key,
    );

    const computedHash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    const matches = computedHash === file.sha256_checksum;

    res.status(200).json({
      fileId: file.id,
      verified: matches,
      drift: !matches,
      recordedChecksum: file.sha256_checksum,
      computedChecksum: computedHash,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a polymorphic association linking a file to a domain record (Scenario 2).
 */
export async function createFileAssociationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const fileId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!fileId) {
      throw new BadRequestError("File ID parameter is required");
    }

    const parseResult = createFileAssociationSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError(
        "Invalid file association payload",
        parseResult.error.issues.map((i) => ({
          name: i.path.join("."),
          reason: i.message,
        })),
      );
    }

    const { entityType, entityId, associationPurpose, isPrimary } =
      parseResult.data;

    const association = await createFileAssociation({
      fileObjectId: fileId,
      entityType,
      entityId,
      associationPurpose,
      isPrimary,
    });

    res.status(201).json({
      id: association.id,
      fileObjectId: association.file_object_id,
      entityType: association.entity_type,
      entityId: association.entity_id,
      associationPurpose: association.association_purpose,
      isPrimary: association.is_primary,
      createdAt: association.created_at,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists associations for a specific file or queries associations by entity.
 */
export async function getFileAssociationsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const fileId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const { entityType, entity_type, entityId, entity_id } =
      req.query as Record<string, string | undefined>;

    const targetEntityType = entityType ?? entity_type;
    const targetEntityId = entityId ?? entity_id;

    if (targetEntityType && targetEntityId) {
      // Lookup files associated with a specific business entity (Scenario 2)
      const results = await getFileAssociationsByEntity(
        targetEntityType,
        targetEntityId,
      );

      res.status(200).json(
        results.map((r) => ({
          id: r.id,
          fileObjectId: r.file_object_id,
          entityType: r.entity_type,
          entityId: r.entity_id,
          associationPurpose: r.association_purpose,
          isPrimary: r.is_primary,
          createdAt: r.created_at,
          fileObject: {
            id: r.file_object.id,
            organizationId: r.file_object.organization_id,
            storageBucket: r.file_object.storage_bucket,
            storageKey: r.file_object.storage_key,
            originalFilename: r.file_object.original_filename,
            fileExtension: r.file_object.file_extension,
            mimeType: r.file_object.mime_type,
            byteSize: Number(r.file_object.byte_size),
            sha256Checksum: r.file_object.sha256_checksum,
            uploadedByUserId: r.file_object.uploaded_by_user_id,
            createdAt: r.file_object.created_at,
          },
        })),
      );
      return;
    }

    if (fileId) {
      // Lookup associations for a specific file
      const results = await getFileAssociationsByFileId(fileId);
      res.status(200).json(
        results.map((r) => ({
          id: r.id,
          fileObjectId: r.file_object_id,
          entityType: r.entity_type,
          entityId: r.entity_id,
          associationPurpose: r.association_purpose,
          isPrimary: r.is_primary,
          createdAt: r.created_at,
        })),
      );
      return;
    }

    throw new BadRequestError(
      "Either fileId param or entityType and entityId query parameters are required",
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a file association by ID.
 */
export async function deleteFileAssociationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new BadRequestError("Association ID parameter is required");
    }
    const deleted = await deleteFileAssociation(id);
    if (!deleted) {
      throw new NotFoundError(
        `File association with ID '${id}' not found`,
        "ERR_ASSOCIATION_NOT_FOUND",
      );
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
