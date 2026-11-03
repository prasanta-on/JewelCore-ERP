import type { JobsOptions } from "bullmq";

/**
 * Standard centralized queue identifiers for JewelCore ERP.
 */
export const QUEUE_NAMES = {
  DOMAIN_EVENTS: "jewelcore:events:domain",
  DEAD_LETTER: "jewelcore:events:dlq",
  RFID_JOBS: "jewelcore:rfid:jobs",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Standard default BullMQ job options enforcing exponential backoff and cleanup policies.
 */
export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: {
    age: 86400, // Retain completed jobs for 24 hours
    count: 1000, // Keep maximum 1000 completed records in Redis
  },
  removeOnFail: {
    age: 604800, // Retain failed jobs for 7 days for forensic analysis
    count: 5000,
  },
};

/**
 * Dead-Letter Queue job options ensuring permanently failed jobs are preserved.
 */
export const dlqJobOptions: JobsOptions = {
  attempts: 1, // Do not automatically retry in DLQ
  removeOnComplete: false,
  removeOnFail: false,
};
