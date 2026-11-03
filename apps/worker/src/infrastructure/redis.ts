import { Redis, type RedisOptions } from "ioredis";
import { getWorkerConfig, type WorkerConfig } from "../config.js";
import { workerLogger } from "./logger.js";

/**
 * Derives BullMQ-compatible Redis connection options from the worker configuration.
 * Note: BullMQ requires maxRetriesPerRequest: null on client connections.
 */
export function getRedisConnectionOptions(
  configOverride?: WorkerConfig,
): RedisOptions {
  const config = configOverride ?? getWorkerConfig();

  const options: RedisOptions = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    db: config.REDIS_DB,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      // Exponential backoff with a cap at 3000ms
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  };

  if (config.REDIS_PASSWORD) {
    options.password = config.REDIS_PASSWORD;
  }

  if (config.REDIS_TLS) {
    options.tls = {};
  }

  return options;
}

/**
 * Creates and initializes an ioredis client instance.
 */
export function createRedisConnection(configOverride?: WorkerConfig): Redis {
  const options = getRedisConnectionOptions(configOverride);
  const client = new Redis(options);

  client.on("connect", () => {
    workerLogger.info(
      { host: options.host, port: options.port },
      "Connected to Redis instance",
    );
  });

  client.on("error", (err: Error) => {
    workerLogger.error({ err: err.message }, "Redis connection error occurred");
  });

  client.on("close", () => {
    workerLogger.warn("Redis connection closed");
  });

  return client;
}
