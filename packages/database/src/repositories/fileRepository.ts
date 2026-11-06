import type { Pool, PoolClient } from "pg";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";
import { ConflictError, NotFoundError } from "@jewelcore/shared";

type Queryable = Pool | PoolClient;

export interface FileObjectRow {
  id: string;
  organization_id: string;
  storage_bucket: string;
  storage_key: string;
  original_filename: string;
  file_extension: string;
  mime_type: string;
  byte_size: string | number;
  sha256_checksum: string;
  uploaded_by_user_id: string;
  created_at: Date;
}

export interface CreateFileObjectParams {
  id?: string;
  organizationId: string;
  storageBucket: string;
  storageKey: string;
  originalFilename: string;
  fileExtension: string;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  uploadedByUserId: string;
}

export interface FileAssociationRow {
  id: string;
  file_object_id: string;
  entity_type: string;
  entity_id: string;
  association_purpose: string;
  is_primary: boolean;
  created_at: Date;
}

export interface CreateFileAssociationParams {
  id?: string;
  fileObjectId: string;
  entityType: string;
  entityId: string;
  associationPurpose: string;
  isPrimary?: boolean;
}

/**
 * Creates and registers a new file object metadata record in the database.
 */
export async function createFileObject(
  params: CreateFileObjectParams,
  clientOverride?: Queryable,
): Promise<FileObjectRow> {
  const executor = clientOverride ?? getPool();
  const id = params.id ?? uuidv7();

  const query = `
    INSERT INTO file_objects (
      id,
      organization_id,
      storage_bucket,
      storage_key,
      original_filename,
      file_extension,
      mime_type,
      byte_size,
      sha256_checksum,
      uploaded_by_user_id,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, clock_timestamp())
    RETURNING *;
  `;

  try {
    const result = await executor.query<FileObjectRow>(query, [
      id,
      params.organizationId,
      params.storageBucket,
      params.storageKey,
      params.originalFilename,
      params.fileExtension,
      params.mimeType,
      params.byteSize,
      params.sha256Checksum,
      params.uploadedByUserId,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert file object");
    }
    return row;
  } catch (err: any) {
    if (err.code === "23505" && err.constraint?.includes("storage_key")) {
      throw new ConflictError(
        `File with storage key '${params.storageKey}' already exists`,
        "ERR_DUPLICATE_STORAGE_KEY",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a file object metadata record by its ID.
 */
export async function getFileObjectById(
  id: string,
  clientOverride?: Queryable,
): Promise<FileObjectRow | null> {
  const executor = clientOverride ?? getPool();
  const query = `
    SELECT *
    FROM file_objects
    WHERE id = $1;
  `;
  const result = await executor.query<FileObjectRow>(query, [id]);
  return result.rows[0] ?? null;
}

/**
 * Retrieves a file object metadata record by its unique storage key.
 */
export async function getFileObjectByStorageKey(
  storageKey: string,
  clientOverride?: Queryable,
): Promise<FileObjectRow | null> {
  const executor = clientOverride ?? getPool();
  const query = `
    SELECT *
    FROM file_objects
    WHERE storage_key = $1;
  `;
  const result = await executor.query<FileObjectRow>(query, [storageKey]);
  return result.rows[0] ?? null;
}

/**
 * Lists file objects with optional filtering by organization or uploader.
 */
export async function listFileObjects(
  filters: {
    organizationId?: string;
    uploadedByUserId?: string;
    limit?: number;
    offset?: number;
  } = {},
  clientOverride?: Queryable,
): Promise<FileObjectRow[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.organizationId) {
    conditions.push(`organization_id = $${paramIdx++}`);
    params.push(filters.organizationId);
  }

  if (filters.uploadedByUserId) {
    conditions.push(`uploaded_by_user_id = $${paramIdx++}`);
    params.push(filters.uploadedByUserId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  params.push(limit, offset);
  const query = `
    SELECT *
    FROM file_objects
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  const result = await executor.query<FileObjectRow>(query, params);
  return result.rows;
}

/**
 * Deletes a file object record by its ID (cascades to file_associations).
 */
export async function deleteFileObject(
  id: string,
  clientOverride?: Queryable,
): Promise<boolean> {
  const executor = clientOverride ?? getPool();
  const query = `
    DELETE FROM file_objects
    WHERE id = $1;
  `;
  const result = await executor.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Creates a polymorphic association between a file object and a domain entity.
 */
export async function createFileAssociation(
  params: CreateFileAssociationParams,
  clientOverride?: Queryable,
): Promise<FileAssociationRow> {
  const executor = clientOverride ?? getPool();

  // Ensure file object exists
  const fileObject = await getFileObjectById(params.fileObjectId, executor);
  if (!fileObject) {
    throw new NotFoundError(
      `File object with ID '${params.fileObjectId}' not found`,
      "ERR_FILE_NOT_FOUND",
    );
  }

  const id = params.id ?? uuidv7();
  const isPrimary = params.isPrimary ?? false;

  const query = `
    INSERT INTO file_associations (
      id,
      file_object_id,
      entity_type,
      entity_id,
      association_purpose,
      is_primary,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp())
    RETURNING *;
  `;

  try {
    const result = await executor.query<FileAssociationRow>(query, [
      id,
      params.fileObjectId,
      params.entityType,
      params.entityId,
      params.associationPurpose,
      isPrimary,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert file association");
    }
    return row;
  } catch (err: any) {
    if (err.code === "23505") {
      throw new ConflictError(
        `File '${params.fileObjectId}' is already associated with ${params.entityType} '${params.entityId}'`,
        "ERR_FILE_ALREADY_ASSOCIATED",
      );
    }
    throw err;
  }
}

/**
 * Retrieves all entity associations for a given file object.
 */
export async function getFileAssociationsByFileId(
  fileObjectId: string,
  clientOverride?: Queryable,
): Promise<FileAssociationRow[]> {
  const executor = clientOverride ?? getPool();
  const query = `
    SELECT *
    FROM file_associations
    WHERE file_object_id = $1
    ORDER BY created_at ASC;
  `;
  const result = await executor.query<FileAssociationRow>(query, [
    fileObjectId,
  ]);
  return result.rows;
}

/**
 * Retrieves all file associations for a specific domain entity.
 */
export async function getFileAssociationsByEntity(
  entityType: string,
  entityId: string,
  clientOverride?: Queryable,
): Promise<Array<FileAssociationRow & { file_object: FileObjectRow }>> {
  const executor = clientOverride ?? getPool();
  const query = `
    SELECT
      fa.*,
      fo.organization_id AS fo_organization_id,
      fo.storage_bucket AS fo_storage_bucket,
      fo.storage_key AS fo_storage_key,
      fo.original_filename AS fo_original_filename,
      fo.file_extension AS fo_file_extension,
      fo.mime_type AS fo_mime_type,
      fo.byte_size AS fo_byte_size,
      fo.sha256_checksum AS fo_sha256_checksum,
      fo.uploaded_by_user_id AS fo_uploaded_by_user_id,
      fo.created_at AS fo_created_at
    FROM file_associations fa
    JOIN file_objects fo ON fa.file_object_id = fo.id
    WHERE fa.entity_type = $1 AND fa.entity_id = $2
    ORDER BY fa.is_primary DESC, fa.created_at ASC;
  `;

  const result = await executor.query(query, [entityType, entityId]);

  return result.rows.map((r: any) => ({
    id: r.id,
    file_object_id: r.file_object_id,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    association_purpose: r.association_purpose,
    is_primary: r.is_primary,
    created_at: r.created_at,
    file_object: {
      id: r.file_object_id,
      organization_id: r.fo_organization_id,
      storage_bucket: r.fo_storage_bucket,
      storage_key: r.fo_storage_key,
      original_filename: r.fo_original_filename,
      file_extension: r.fo_file_extension,
      mime_type: r.fo_mime_type,
      byte_size: r.fo_byte_size,
      sha256_checksum: r.fo_sha256_checksum,
      uploaded_by_user_id: r.fo_uploaded_by_user_id,
      created_at: r.fo_created_at,
    },
  }));
}

/**
 * Deletes a file association by its ID.
 */
export async function deleteFileAssociation(
  id: string,
  clientOverride?: Queryable,
): Promise<boolean> {
  const executor = clientOverride ?? getPool();
  const query = `
    DELETE FROM file_associations
    WHERE id = $1;
  `;
  const result = await executor.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
}
