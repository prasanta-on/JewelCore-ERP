import { z } from "zod";

/**
 * Whitelisted MIME types acceptable for Jewellery ERP document storage.
 * Disallowed executables and scripts are strictly rejected.
 */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
] as const;

export type AllowedDocumentMimeType =
  (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export const mimeTypeSchema = z.string().superRefine((val, ctx) => {
  if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported MIME type '${val}'. Prohibited or unlisted file format.`,
      params: { code: "ERR_UNSUPPORTED_MIME_TYPE" },
    });
  }
});

/**
 * Zod schema for file uploads (accepts JSON with base64 payload).
 * Supports both camelCase and snake_case inputs.
 */
export const uploadFileSchema = z
  .object({
    originalFilename: z
      .string()
      .min(1, "Original filename is required")
      .max(255)
      .optional(),
    original_filename: z.string().min(1).max(255).optional(),
    mimeType: mimeTypeSchema.optional(),
    mime_type: mimeTypeSchema.optional(),
    contentBase64: z
      .string()
      .min(1, "Base64 content payload is required")
      .optional(),
    content_base64: z.string().min(1).optional(),
    fileExtension: z.string().max(20).optional(),
    file_extension: z.string().max(20).optional(),
    storageBucket: z.string().max(100).optional(),
    storage_bucket: z.string().max(100).optional(),
    // Optional initial polymorphic association
    entityType: z.string().max(50).optional(),
    entity_type: z.string().max(50).optional(),
    entityId: z.string().uuid().optional(),
    entity_id: z.string().uuid().optional(),
    associationPurpose: z.string().max(100).optional(),
    association_purpose: z.string().max(100).optional(),
    isPrimary: z.boolean().optional(),
    is_primary: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const filename = data.originalFilename ?? data.original_filename;
    if (!filename) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["originalFilename"],
        message: "Original filename is required",
      });
    }

    const mime = data.mimeType ?? data.mime_type;
    if (!mime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mimeType"],
        message: "MIME type is required",
      });
    }

    const content = data.contentBase64 ?? data.content_base64;
    if (!content) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentBase64"],
        message: "Base64 content payload is required",
      });
    }
  })
  .transform((data) => {
    const filename = (data.originalFilename ?? data.original_filename)!;
    const inferredExt = filename.includes(".")
      ? filename.split(".").pop()!.toLowerCase()
      : "bin";

    return {
      originalFilename: filename,
      mimeType: (data.mimeType ?? data.mime_type)!,
      contentBase64: (data.contentBase64 ?? data.content_base64)!,
      fileExtension: (
        data.fileExtension ??
        data.file_extension ??
        inferredExt
      ).toLowerCase(),
      storageBucket:
        data.storageBucket ?? data.storage_bucket ?? "jewelcore-documents",
      initialAssociation:
        (data.entityType ?? data.entity_type) &&
        (data.entityId ?? data.entity_id)
          ? {
              entityType: (data.entityType ?? data.entity_type)!,
              entityId: (data.entityId ?? data.entity_id)!,
              associationPurpose:
                data.associationPurpose ??
                data.association_purpose ??
                "GENERAL_ATTACHMENT",
              isPrimary: data.isPrimary ?? data.is_primary ?? false,
            }
          : undefined,
    };
  });

export type UploadFileInput = z.input<typeof uploadFileSchema>;
export type UploadFileOutput = z.output<typeof uploadFileSchema>;

/**
 * Zod schema for polymorphic file association.
 * Supports both camelCase and snake_case inputs.
 */
export const createFileAssociationSchema = z
  .object({
    entityType: z.string().min(1, "entityType is required").max(50).optional(),
    entity_type: z.string().min(1).max(50).optional(),
    entityId: z.string().uuid("entityId must be a valid UUID").optional(),
    entity_id: z.string().uuid().optional(),
    associationPurpose: z.string().min(1).max(100).optional(),
    association_purpose: z.string().min(1).max(100).optional(),
    isPrimary: z.boolean().optional(),
    is_primary: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const entityType = data.entityType ?? data.entity_type;
    if (!entityType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entityType"],
        message: "entityType is required",
      });
    }

    const entityId = data.entityId ?? data.entity_id;
    if (!entityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entityId"],
        message: "entityId is required",
      });
    }
  })
  .transform((data) => ({
    entityType: (data.entityType ?? data.entity_type)!,
    entityId: (data.entityId ?? data.entity_id)!,
    associationPurpose:
      data.associationPurpose ?? data.association_purpose ?? "ATTACHMENT",
    isPrimary: data.isPrimary ?? data.is_primary ?? false,
  }));

export type CreateFileAssociationInput = z.input<
  typeof createFileAssociationSchema
>;
export type CreateFileAssociationOutput = z.output<
  typeof createFileAssociationSchema
>;

/**
 * File Object Domain Interface (Entity 41)
 */
export interface FileObject {
  id: string;
  organizationId: string;
  storageBucket: string;
  storageKey: string;
  originalFilename: string;
  fileExtension: string;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  uploadedByUserId: string;
  createdAt: string;
  presignedUrl?: string;
}

/**
 * Polymorphic File Association Domain Interface (Entity 42)
 */
export interface FileAssociation {
  id: string;
  fileObjectId: string;
  entityType: string;
  entityId: string;
  associationPurpose: string;
  isPrimary: boolean;
  createdAt: string;
}
