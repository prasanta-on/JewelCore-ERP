import { Worker, type Job, type WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";
import type { DomainEventEnvelope } from "@jewelcore/shared";
import { getWorkerConfig } from "../config.js";
import { workerLogger } from "./logger.js";
import { getRedisConnectionOptions } from "./redis.js";
import { EventProcessor } from "../engine/eventProcessor.js";

export interface CreateWorkerOptions {
  concurrency?: number;
  connection?: Redis | WorkerOptions["connection"];
}

/**
 * Factory for creating a standardized BullMQ Worker configured for domain event processing.
 */
export function createDomainEventWorker(
  queueName: string,
  processor: EventProcessor,
  customOptions?: CreateWorkerOptions,
): Worker<DomainEventEnvelope> {
  const config = getWorkerConfig();
  const concurrency = customOptions?.concurrency ?? config.WORKER_CONCURRENCY;
  const connection =
    customOptions?.connection ?? getRedisConnectionOptions(config);

  const worker = new Worker<DomainEventEnvelope>(
    queueName,
    async (job: Job<DomainEventEnvelope>) => {
      const event = job.data;
      await processor.process(event, {
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      });
    },
    {
      concurrency,
      connection,
    },
  );

  worker.on("completed", (job: Job) => {
    workerLogger.info(
      {
        jobId: job.id,
        queue: queueName,
        attemptsMade: job.attemptsMade,
      },
      "BullMQ job completed successfully",
    );
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    workerLogger.error(
      {
        jobId: job?.id,
        queue: queueName,
        err: err.message,
        attemptsMade: job?.attemptsMade,
      },
      "BullMQ job failed",
    );
  });

  worker.on("error", (err: Error) => {
    workerLogger.error(
      {
        queue: queueName,
        err: err.message,
      },
      "BullMQ worker error occurred",
    );
  });

  worker.on("stalled", (jobId: string) => {
    workerLogger.warn(
      {
        jobId,
        queue: queueName,
      },
      "BullMQ job stalled and will be re-attempted",
    );
  });

  return worker;
}
