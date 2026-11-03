/**
 * @jewelcore/worker
 * BullMQ background worker engine for asynchronous job processing.
 */

export * from "./config.js";
export * from "./infrastructure/logger.js";
export * from "./infrastructure/redis.js";
export * from "./infrastructure/queueConfig.js";
export * from "./infrastructure/workerFactory.js";
export * from "./engine/eventProcessor.js";
export * from "./lifecycle.js";

import { workerLogger } from "./infrastructure/logger.js";
import { WorkerLifecycleManager } from "./lifecycle.js";

export function bootstrapWorker(): WorkerLifecycleManager {
  workerLogger.info(
    "JewelCore background worker engine initialized (PREP_READY).",
  );

  const lifecycle = new WorkerLifecycleManager();
  lifecycle.setupSignalHandlers();

  return lifecycle;
}

// If executed directly
if (
  process.env.NODE_ENV !== "test" &&
  process.argv[1]?.endsWith("dist/index.js")
) {
  bootstrapWorker();
}
