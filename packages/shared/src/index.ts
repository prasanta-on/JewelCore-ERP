import { z } from "zod";

export * from "./errors.js";

/**
 * Common Zod Schemas
 */
export const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * JewelCore Master Domain Enums (aligned with Logical Data Model v0.3.3)
 */
export const GemstoneType = {
  PRECIOUS: "PRECIOUS",
  SEMI_PRECIOUS: "SEMI_PRECIOUS",
  ORGANIC_PEARL: "ORGANIC_PEARL",
} as const;

export type GemstoneType = (typeof GemstoneType)[keyof typeof GemstoneType];

export const MeasurementUnit = {
  CARAT: "CARAT",
  GRAM: "GRAM",
} as const;

export type MeasurementUnit =
  (typeof MeasurementUnit)[keyof typeof MeasurementUnit];

/**
 * Event Architecture & Transactional Outbox Exports (FEAT-FOUND-04)
 */
export * from "./events/errorContracts.js";
export * from "./events/eventEnvelope.js";
export * from "./events/outboxContracts.js";
export * from "./events/idempotencyContracts.js";

/**
 * Identity & Access Management Domain Exports (FEAT-IAM-01)
 */
export * from "./iam/index.js";
export * from "./storage/index.js";
export * from "./taxonomy/index.js";
export * from "./procurement/index.js";
export * from "./governance/index.js";
export * from "./qc/index.js";
export * from "./inventory/index.js";
export * from "./rfid/index.js";
export * from "./pricing/index.js";
