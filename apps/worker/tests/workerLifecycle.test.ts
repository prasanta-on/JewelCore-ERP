import { describe, it, expect, vi } from "vitest";
import { WorkerLifecycleManager } from "../src/lifecycle.js";
import type { Worker } from "bullmq";
import type { Redis } from "ioredis";

describe("Worker Lifecycle & Graceful Shutdown (Component C)", () => {
  it("orchestrates graceful shutdown across registered workers and redis clients", async () => {
    const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
    const mockWorker = {
      name: "test-domain-worker",
      close: mockWorkerClose,
    } as unknown as Worker;

    const mockRedisQuit = vi.fn().mockResolvedValue("OK");
    const mockRedis = {
      status: "ready",
      quit: mockRedisQuit,
    } as unknown as Redis;

    const manager = new WorkerLifecycleManager();
    manager.registerWorker(mockWorker);
    manager.registerRedisClient(mockRedis);

    await manager.shutdown("SIGTERM");

    expect(mockWorkerClose).toHaveBeenCalledTimes(1);
    expect(mockRedisQuit).toHaveBeenCalledTimes(1);
  });

  it("handles duplicate shutdown calls idempotently without re-executing", async () => {
    const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
    const mockWorker = {
      name: "test-domain-worker-2",
      close: mockWorkerClose,
    } as unknown as Worker;

    const manager = new WorkerLifecycleManager();
    manager.registerWorker(mockWorker);

    await manager.shutdown("SIGTERM");
    await manager.shutdown("SIGINT");

    expect(mockWorkerClose).toHaveBeenCalledTimes(1);
  });
});
