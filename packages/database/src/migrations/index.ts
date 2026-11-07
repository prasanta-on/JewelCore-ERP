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
import { migration00009CreateTaxonomyProducts } from "./00009_create_taxonomy_products.js";
import { migration00010CreateTaxonomySkusAndSpecs } from "./00010_create_taxonomy_skus_and_specs.js";
import { migration00011CreateProcurementSuppliers } from "./00011_create_procurement_suppliers.js";
import { migration00012CreateProcurementGrns } from "./00012_create_procurement_grns.js";
import { migration00013CreateProcurementShipments } from "./00013_create_procurement_shipments.js";
import { migration00014CreateProcurementStaffAssignments } from "./00014_create_procurement_staff_assignments.js";
import { migration00015CreateGovernanceFileStorage } from "./00015_create_governance_file_storage.js";
import { migration00016CreateQcQualityChecks } from "./00016_create_qc_quality_checks.js";
import { migration00017CreateQcWeightMeasurements } from "./00017_create_qc_weight_measurements.js";
import { migration00018CreateQcItemsAndGemstones } from "./00018_create_qc_items_and_gemstones.js";
import { migration00019CreateQcTolerancePermissions } from "./00019_create_qc_tolerance_permissions.js";
import { migration00020CreateQcDecisions } from "./00020_create_qc_decisions.js";
import { migration00021CreateInventoryItems } from "./00021_create_inventory_items.js";
import { migration00022CreateInventoryStockBalances } from "./00022_create_inventory_stock_balances.js";
import { migration00023CreateInventoryMovements } from "./00023_create_inventory_movements.js";
import { migration00024CreateInventoryStatusHistory } from "./00024_create_inventory_status_history.js";
import { migration00025CreateRfidTags } from "./00025_create_rfid_tags.js";
import { migration00026CreateRfidTagAssignments } from "./00026_create_rfid_tag_assignments.js";
import { migration00027CreateStockApprovals } from "./00027_create_stock_approvals.js";
import { migration00028CreateRfidJobs } from "./00028_create_rfid_jobs.js";
import { migration00029CreateAuditEvents } from "./00029_create_audit_events.js";
import { migration00030CreatePricingMetalRates } from "./00030_create_pricing_metal_rates.js";
import { migration00031CreatePricingPolicies } from "./00031_create_pricing_policies.js";
import { migration00032CreateGemstonePriceMatrices } from "./00032_create_gemstone_price_matrices.js";
import { migration00033CreatePriceSnapshots } from "./00033_create_price_snapshots.js";
import { migration00034CreateSalesCustomers } from "./00034_create_sales_customers.js";
import { migration00035CreateSalesInvoices } from "./00035_create_sales_invoices.js";
import { migration00036CreateSalesPayments } from "./00036_create_sales_payments.js";
import { migration00037CreateSalesFinalization } from "./00037_create_sales_finalization.js";
import { migration00038CreateSalesReturns } from "./00038_create_sales_returns.js";

export const allMigrations: MigrationDefinition[] = [
  migration00001CreateIamOrganizationsAndStores,
  migration00002CreateIamUsers,
  migration00003CreateIamRbac,
  migration00004CreateIamMemberships,
  migration00005CreateStorageHierarchy,
  migration00006CreateTaxonomyCategories,
  migration00007CreateTaxonomyMaterialsAndPurities,
  migration00008CreateTaxonomyGemstones,
  migration00009CreateTaxonomyProducts,
  migration00010CreateTaxonomySkusAndSpecs,
  migration00011CreateProcurementSuppliers,
  migration00012CreateProcurementGrns,
  migration00013CreateProcurementShipments,
  migration00014CreateProcurementStaffAssignments,
  migration00015CreateGovernanceFileStorage,
  migration00016CreateQcQualityChecks,
  migration00017CreateQcWeightMeasurements,
  migration00018CreateQcItemsAndGemstones,
  migration00019CreateQcTolerancePermissions,
  migration00020CreateQcDecisions,
  migration00021CreateInventoryItems,
  migration00022CreateInventoryStockBalances,
  migration00023CreateInventoryMovements,
  migration00024CreateInventoryStatusHistory,
  migration00025CreateRfidTags,
  migration00026CreateRfidTagAssignments,
  migration00027CreateStockApprovals,
  migration00028CreateRfidJobs,
  migration00029CreateAuditEvents,
  migration00030CreatePricingMetalRates,
  migration00031CreatePricingPolicies,
  migration00032CreateGemstonePriceMatrices,
  migration00033CreatePriceSnapshots,
  migration00034CreateSalesCustomers,
  migration00035CreateSalesInvoices,
  migration00036CreateSalesPayments,
  migration00037CreateSalesFinalization,
  migration00038CreateSalesReturns,
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
export * from "./00009_create_taxonomy_products.js";
export * from "./00010_create_taxonomy_skus_and_specs.js";
export * from "./00011_create_procurement_suppliers.js";
export * from "./00012_create_procurement_grns.js";
export * from "./00013_create_procurement_shipments.js";
export * from "./00014_create_procurement_staff_assignments.js";
export * from "./00015_create_governance_file_storage.js";
export * from "./00016_create_qc_quality_checks.js";
export * from "./00017_create_qc_weight_measurements.js";
export * from "./00018_create_qc_items_and_gemstones.js";
export * from "./00019_create_qc_tolerance_permissions.js";
export * from "./00020_create_qc_decisions.js";
export * from "./00021_create_inventory_items.js";
export * from "./00022_create_inventory_stock_balances.js";
export * from "./00023_create_inventory_movements.js";
export * from "./00024_create_inventory_status_history.js";
export * from "./00025_create_rfid_tags.js";
export * from "./00026_create_rfid_tag_assignments.js";
export * from "./00027_create_stock_approvals.js";
export * from "./00028_create_rfid_jobs.js";
export * from "./00029_create_audit_events.js";
export * from "./00030_create_pricing_metal_rates.js";
export * from "./00031_create_pricing_policies.js";
export * from "./00032_create_gemstone_price_matrices.js";
export * from "./00033_create_price_snapshots.js";
export * from "./00034_create_sales_customers.js";
export * from "./00035_create_sales_invoices.js";
export * from "./00036_create_sales_payments.js";
export * from "./00037_create_sales_finalization.js";
export * from "./00038_create_sales_returns.js";
