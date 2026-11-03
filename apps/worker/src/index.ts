/**
 * @jewelcore/worker
 * BullMQ background worker engine for asynchronous job processing.
 */

// eslint-disable-next-line no-console
console.log("[JewelCore Worker] Worker engine baseline initialized.");

process.on("SIGTERM", () => {
  // eslint-disable-next-line no-console
  console.log("[JewelCore Worker] SIGTERM received. Shutting down worker...");
  process.exit(0);
});
