import type { Worker } from "bullmq";
import type { Redis } from "ioredis";
import { workerLogger } from "./infrastructure/logger.js";

export interface LifecycleResources {
  workers?: Worker[];
  redisClients?: Redis[];
}

export class WorkerLifecycleManager {
  private isShuttingDown = false;
  private readonly workers: Worker[] = [];
  private readonly redisClients: Redis[] = [];

  constructor(resources?: LifecycleResources) {
    if (resources?.workers) {
      this.workers.push(...resources.workers);
    }
    if (resources?.redisClients) {
      this.redisClients.push(...resources.redisClients);
    }
  }

  public registerWorker(worker: Worker): void {
    this.workers.push(worker);
  }

  public registerRedisClient(client: Redis): void {
    this.redisClients.push(client);
  }

  public async shutdown(signal: string = "SIGTERM"): Promise<void> {
    if (this.isShuttingDown) {
      workerLogger.warn(
        "Shutdown already in progress; ignoring subsequent signal",
      );
      return;
    }

    this.isShuttingDown = true;
    workerLogger.info(
      { signal },
      "Received shutdown signal. Commencing graceful worker shutdown...",
    );

    // 1. Close BullMQ Workers (stops accepting new jobs, waits for active jobs to finish)
    for (const worker of this.workers) {
      try {
        workerLogger.info({ name: worker.name }, "Closing BullMQ worker...");
        await worker.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        workerLogger.error(
          { err: message, name: worker.name },
          "Error while closing BullMQ worker",
        );
      }
    }

    // 2. Disconnect Redis Clients
    for (const client of this.redisClients) {
      try {
        if (client.status === "ready" || client.status === "connect") {
          await client.quit();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        workerLogger.error(
          { err: message },
          "Error while disconnecting Redis client",
        );
      }
    }

    workerLogger.info("All worker resources shut down gracefully.");
  }

  public setupSignalHandlers(): void {
    const handleSignal = async (signal: string) => {
      await this.shutdown(signal);
      process.exit(0);
    };

    process.on("SIGTERM", () => void handleSignal("SIGTERM"));
    process.on("SIGINT", () => void handleSignal("SIGINT"));
  }
}
