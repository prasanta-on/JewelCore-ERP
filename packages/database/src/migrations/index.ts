import type { MigrationDefinition } from "../migrator.js";
import { runMigrations, type MigrationReport } from "../migrator.js";
import { migration00001CreateIamOrganizationsAndStores } from "./00001_create_iam_organizations_and_stores.js";

export const allMigrations: MigrationDefinition[] = [
  migration00001CreateIamOrganizationsAndStores,
];

/**
 * Runs all registered schema migrations in deterministic order.
 */
export async function runAllMigrations(): Promise<MigrationReport> {
  return runMigrations(allMigrations);
}

export * from "./00001_create_iam_organizations_and_stores.js";
