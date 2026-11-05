import type { MigrationDefinition } from "../migrator.js";
import { runMigrations, type MigrationReport } from "../migrator.js";
import { migration00001CreateIamOrganizationsAndStores } from "./00001_create_iam_organizations_and_stores.js";
import { migration00002CreateIamUsers } from "./00002_create_iam_users.js";
import { migration00003CreateIamRbac } from "./00003_create_iam_rbac.js";
import { migration00004CreateIamMemberships } from "./00004_create_iam_memberships.js";

export const allMigrations: MigrationDefinition[] = [
  migration00001CreateIamOrganizationsAndStores,
  migration00002CreateIamUsers,
  migration00003CreateIamRbac,
  migration00004CreateIamMemberships,
];

/**
 * Runs all registered schema migrations in deterministic order.
 */
export async function runAllMigrations(): Promise<MigrationReport> {
  return runMigrations(allMigrations);
}

export * from "./00001_create_iam_organizations_and_stores.js";
export * from "./00002_create_iam_users.js";
export * from "./00003_create_iam_rbac.js";
export * from "./00004_create_iam_memberships.js";


