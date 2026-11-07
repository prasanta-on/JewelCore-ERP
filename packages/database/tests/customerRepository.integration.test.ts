import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createCustomer,
  updateCustomer,
  getCustomerById,
  listCustomers,
} from "../src/index.js";
import { CustomerStatus, ConflictError } from "@jewelcore/shared";

describe("Customer Master Repository (FEAT-SALES-01, Entity 48)", () => {
  let orgId: string;
  let altOrgId: string;

  let customer1Id: string;
  let customer2Id: string;

  async function cleanFixtures() {
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_CUST_REPO', 'ORG_CUST_REPO_ALT'));",
    );
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_CUST_REPO', 'ORG_CUST_REPO_ALT');",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_CUST_REPO",
      name: "Luxury Retail Jewels Org",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_CUST_REPO_ALT",
      name: "Competitor Retail Jewels Org",
    });
    altOrgId = altOrg.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("Scenario 1: creates a full customer profile with contact, KYC tags, and address", async () => {
    const customer = await createCustomer({
      organizationId: orgId,
      customerCode: "CUST-VIP-001",
      firstName: "Eleanor",
      lastName: "Vance",
      email: "eleanor.vance@highjewels.ca",
      phone: "+1-416-555-0199",
      addressLine1: "100 Bloor St West",
      addressLine2: "Suite 450",
      city: "Toronto",
      stateProvince: "ON",
      postalCode: "M5S 1M4",
      country: "CA",
      taxIdentifier: "TAX-ON-9988",
      tags: ["Frequent Buyer", "VIP"],
      notes: "Prefers D-F color diamonds in platinum settings.",
      status: CustomerStatus.ACTIVE,
    });

    expect(customer.id).toBeDefined();
    expect(customer.organizationId).toBe(orgId);
    expect(customer.customerCode).toBe("CUST-VIP-001");
    expect(customer.firstName).toBe("Eleanor");
    expect(customer.lastName).toBe("Vance");
    expect(customer.email).toBe("eleanor.vance@highjewels.ca");
    expect(customer.tags).toEqual(["Frequent Buyer", "VIP"]);
    expect(customer.status).toBe(CustomerStatus.ACTIVE);

    customer1Id = customer.id;
  });

  it("Scenario 2: rejects duplicate customer code within the same organization", async () => {
    await expect(
      createCustomer({
        organizationId: orgId,
        customerCode: "CUST-VIP-001",
        firstName: "Duplicate",
        lastName: "Attempt",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("Scenario 3: allows identical customer code in a different organization (multi-tenant boundary)", async () => {
    const altCustomer = await createCustomer({
      organizationId: altOrgId,
      customerCode: "CUST-VIP-001",
      firstName: "Eleanor",
      lastName: "Other",
      email: "eleanor@competitor.ca",
    });

    expect(altCustomer.id).toBeDefined();
    expect(altCustomer.organizationId).toBe(altOrgId);
    expect(altCustomer.customerCode).toBe("CUST-VIP-001");
  });

  it("Scenario 4: updates customer contact details, tags, and status", async () => {
    const updated = await updateCustomer(
      customer1Id,
      {
        phone: "+1-416-555-9999",
        tags: ["Frequent Buyer", "VIP", "High Net Worth"],
        notes: "Updated preference: bespoke solitaire rings.",
      },
      orgId,
    );

    expect(updated.id).toBe(customer1Id);
    expect(updated.phone).toBe("+1-416-555-9999");
    expect(updated.tags).toEqual(["Frequent Buyer", "VIP", "High Net Worth"]);
    expect(updated.notes).toBe("Updated preference: bespoke solitaire rings.");
  });

  it("Scenario 5: creates second customer and lists customers with search filtering", async () => {
    const customer2 = await createCustomer({
      organizationId: orgId,
      customerCode: "CUST-REG-002",
      firstName: "Marcus",
      lastName: "Aurelius",
      email: "marcus@philosophy.ca",
      phone: "+1-647-555-0122",
      tags: ["Walk-in"],
      status: CustomerStatus.ACTIVE,
    });
    customer2Id = customer2.id;

    // Search by name "Marcus"
    const searchRes = await listCustomers({
      organizationId: orgId,
      search: "Marcus",
    });
    expect(searchRes.total).toBe(1);
    expect(searchRes.data[0]!.customerCode).toBe("CUST-REG-002");

    // Search by email "highjewels.ca"
    const searchEmail = await listCustomers({
      organizationId: orgId,
      search: "highjewels.ca",
    });
    expect(searchEmail.total).toBe(1);
    expect(searchEmail.data[0]!.id).toBe(customer1Id);
  });

  it("Scenario 6: lists customers filtered by tag", async () => {
    const vipList = await listCustomers({
      organizationId: orgId,
      tag: "VIP",
    });

    expect(vipList.total).toBe(1);
    expect(vipList.data[0]!.id).toBe(customer1Id);
  });

  it("Scenario 7: enforces multi-tenant boundary on customer lookup", async () => {
    const crossLookup = await getCustomerById({
      id: customer1Id,
      organizationId: altOrgId,
    });

    expect(crossLookup).toBeNull();
  });
});
