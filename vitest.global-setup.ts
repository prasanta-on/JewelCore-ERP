import { runAllMigrations, closePool } from "./packages/database/src/index.js";

export async function setup(): Promise<void> {
  const report = await runAllMigrations();
  if (report.status === "FAILED") {
    throw new Error(
      `Global test migration setup failed: ${report.error} in ${report.failedMigration}`,
    );
  }
  await closePool();
}
