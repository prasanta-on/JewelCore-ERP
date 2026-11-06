import type { MigrationDefinition } from "../migrator.js";
import { runMigrations, type MigrationReport } from "../migrator.js";
import { migration00001CreateIamOrganizationsAndStores } from "./00001_create_iam_organizations_and_stores.js";
import { migration00002CreateIamUsers } from "./00002_create_iam_users.js";
import { migration00003CreateIamRbac } from "./00003_create_iam_rbac.js";
import { migration00004CreateIamMemberships } from "./00004_create_iam_memberships.js";
import { migration00005CreateStorageHierarchy } from "./00005_create_storage_hierarchy.js";
import { migration00006CreateTaxonomyCategories } from "./00006_create_taxonomy_categories.js";
import { migration00007CreateTaxonomyMaterialsAndPurities } from "./00007_create_taxonomy_materials_and_purities.js";
import { migration00008CreateTaxonomyGemstones } from "./00008_create_taxonomy_gemstones.js";

export const allMigrations: MigrationDefinition[] = [
  migration00001CreateIamOrganizationsAndStores,
  migration00002CreateIamUsers,
  migration00003CreateIamRbac,
  migration00004CreateIamMemberships,
  migration00005CreateStorageHierarchy,
  migration00006CreateTaxonomyCategories,
  migration00007CreateTaxonomyMaterialsAndPurities,
  migration00008CreateTaxonomyGemstones,
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
export * from "./00005_create_storage_hierarchy.js";
export * from "./00006_create_taxonomy_categories.js";
export * from "./00007_create_taxonomy_materials_and_purities.js";
export * from "./00008_create_taxonomy_gemstones.js";


