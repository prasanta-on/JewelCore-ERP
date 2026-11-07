import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runAllMigrations,
  closePool,
  query,
  createOrganization,
  createStore,
  createCustomer,
  getOrCreateStoreCreditAccount,
  getStoreCreditAccountByCustomerId,
  getStoreCreditAccountById,
  adjustStoreCredit,
  listStoreCreditTransactions,
} from "../src/index.js";
import {
  StoreType,
  StoreCreditTransactionType,
  UnprocessableEntityError,
} from "@jewelcore/shared";

describe("Store Credit Repository (FEAT-RET-03, Entities 56 & 57 / INV-09)", () => {
  let orgId: string;
  let otherOrgId: string;
  let storeId: string;
  let otherStoreId: string;
  let userId: string;
  let customerId: string;

  let createdAccountId: string;

  async function cleanFixtures() {
    await query(
      "ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutability;",
    );
    await query(
      "ALTER TABLE store_credit_transactions DISABLE TRIGGER trg_store_credit_transactions_immutability;",
    );

    await query(
      "DELETE FROM store_credit_transactions WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_REPO', 'ORG_SC_REPO_ALT'));",
    );
    await query(
      "DELETE FROM store_credit_accounts WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_REPO', 'ORG_SC_REPO_ALT'));",
    );
    await query(
      "DELETE FROM audit_events WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_REPO', 'ORG_SC_REPO_ALT'));",
    );
    await query(
      "DELETE FROM customers WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_REPO', 'ORG_SC_REPO_ALT'));",
    );
    await query(
      "DELETE FROM store_memberships WHERE store_id IN (SELECT id FROM stores WHERE code LIKE 'STORE_SC_REPO_%');",
    );
    await query(
      "DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE code IN ('ORG_SC_REPO', 'ORG_SC_REPO_ALT'));",
    );
    await query(
      "DELETE FROM users WHERE email LIKE 'sc_repo_%@jewelcore.local';",
    );
    await query("DELETE FROM stores WHERE code LIKE 'STORE_SC_REPO_%';");
    await query(
      "DELETE FROM organizations WHERE code IN ('ORG_SC_REPO', 'ORG_SC_REPO_ALT');",
    );

    await query(
      "ALTER TABLE store_credit_transactions ENABLE TRIGGER trg_store_credit_transactions_immutability;",
    );
    await query(
      "ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutability;",
    );
  }

  beforeAll(async () => {
    await runAllMigrations();
    await cleanFixtures();

    const org = await createOrganization({
      code: "ORG_SC_REPO",
      name: "Store Credit Ledger Corp",
    });
    orgId = org.id;

    const altOrg = await createOrganization({
      code: "ORG_SC_REPO_ALT",
      name: "Alt Credit Group",
    });
    otherOrgId = altOrg.id;

    const store = await createStore({
      organizationId: orgId,
      code: "STORE_SC_REPO_01",
      name: "Credit Central Toronto",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    storeId = store.id;

    const altStore = await createStore({
      organizationId: otherOrgId,
      code: "STORE_SC_REPO_ALT",
      name: "Alt Store Montreal",
      storeType: StoreType.RETAIL_STORE,
      isActive: true,
    });
    otherStoreId = altStore.id;

    const userRes = await query<{ id: string }>(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active)
       VALUES (gen_random_uuid(), $1, 'sc_repo_admin@jewelcore.local', 'hash', 'Store', 'Cashier', true)
       RETURNING id`,
      [orgId],
    );
    userId = userRes.rows[0]!.id;

    const cust = await createCustomer({
      organizationId: orgId,
      primaryStoreId: storeId,
      customerCode: "CUST-SC-REPO-01",
      customerType: "INDIVIDUAL",
      firstName: "Penelope",
      lastName: "Cruz",
      email: "penelope.sc@example.com",
    });
    customerId = cust.id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await closePool();
  });

  it("lazily initializes store credit account with 0.0000 balance (FEAT-RET-03)", async () => {
    const account = await getOrCreateStoreCreditAccount({
      customerId,
      organizationId: orgId,
    });

    expect(account.id).toBeDefined();
    expect(account.customerId).toBe(customerId);
    expect(account.accountNumber).toMatch(/^SCA-/);
    expect(account.balanceCad).toBe(0);
    expect(account.isActive).toBe(true);

    createdAccountId = account.id;

    // Idempotent: retrieving again returns identical account
    const secondFetch = await getStoreCreditAccountByCustomerId({
      customerId,
      organizationId: orgId,
    });
    expect(secondFetch.id).toBe(account.id);
  });

  it("adds store credit on customer return and buyback issuances", async () => {
    // 1. Issue return refund credit $500
    const refundRes = await adjustStoreCredit({
      customerId,
      storeId,
      organizationId: orgId,
      performedByUserId: userId,
      transactionType: StoreCreditTransactionType.ISSUE_REFUND,
      amountCad: 500.0,
      referenceDocumentType: "SALES_RETURN",
      notes: "Customer return refund tender",
    });

    expect(refundRes.account.balanceCad).toBe(500.0);
    expect(refundRes.transaction.amountCad).toBe(500.0);
    expect(refundRes.transaction.balanceBeforeCad).toBe(0.0);
    expect(refundRes.transaction.balanceAfterCad).toBe(500.0);
    expect(refundRes.transaction.transactionType).toBe("ISSUE_REFUND");

    // 2. Issue scrap gold buyback credit $250
    const buybackRes = await adjustStoreCredit({
      customerId,
      storeId,
      organizationId: orgId,
      performedByUserId: userId,
      transactionType: StoreCreditTransactionType.ISSUE_BUYBACK,
      amountCad: 250.0,
      referenceDocumentType: "GOLD_BUYBACK_ORDER",
      notes: "Old gold trade-in credit",
    });

    expect(buybackRes.account.balanceCad).toBe(750.0);
    expect(buybackRes.transaction.balanceBeforeCad).toBe(500.0);
    expect(buybackRes.transaction.balanceAfterCad).toBe(750.0);
  });

  it("redeems store credit tender against purchase and decrements balance", async () => {
    // Redeem $300 against a sale
    const redeemRes = await adjustStoreCredit({
      customerId,
      storeId,
      organizationId: orgId,
      performedByUserId: userId,
      transactionType: StoreCreditTransactionType.REDEEM_PURCHASE,
      amountCad: 300.0,
      referenceDocumentType: "SALES_INVOICE",
      notes: "POS split tender redemption",
    });

    expect(redeemRes.account.balanceCad).toBe(450.0);
    expect(redeemRes.transaction.amountCad).toBe(300.0);
    expect(redeemRes.transaction.balanceBeforeCad).toBe(750.0);
    expect(redeemRes.transaction.balanceAfterCad).toBe(450.0);
    expect(redeemRes.transaction.transactionType).toBe("REDEEM_PURCHASE");
  });

  it("rejects redemption if requested amount exceeds available balance", async () => {
    await expect(
      adjustStoreCredit({
        customerId,
        storeId,
        organizationId: orgId,
        performedByUserId: userId,
        transactionType: StoreCreditTransactionType.REDEEM_PURCHASE,
        amountCad: 500.0, // exceeds available $450
        notes: "Attempted overdraft",
      }),
    ).rejects.toThrow(UnprocessableEntityError);

    // Verify balance unchanged
    const account = await getStoreCreditAccountById({
      id: createdAccountId,
      organizationId: orgId,
    });
    expect(account.balanceCad).toBe(450.0);
  });

  it("enforces append-only immutability trigger on store_credit_transactions (INV-09)", async () => {
    const txRes = await query<{ id: string }>(
      `SELECT id FROM store_credit_transactions WHERE store_credit_account_id = $1 LIMIT 1`,
      [createdAccountId],
    );
    const txId = txRes.rows[0]!.id;

    // Attempt direct UPDATE -> should fail
    await expect(
      query(
        `UPDATE store_credit_transactions SET amount_cad = 9999.00 WHERE id = $1`,
        [txId],
      ),
    ).rejects.toThrow(/INV-09/);

    // Attempt direct DELETE -> should fail
    await expect(
      query(`DELETE FROM store_credit_transactions WHERE id = $1`, [txId]),
    ).rejects.toThrow(/INV-09/);
  });

  it("lists store credit transactions with pagination and joins", async () => {
    const listRes = await listStoreCreditTransactions({
      storeCreditAccountId: createdAccountId,
      organizationId: orgId,
      limit: 10,
      offset: 0,
    });

    expect(listRes.total).toBe(3);
    expect(listRes.data).toHaveLength(3);
    expect(listRes.data[0]!.storeName).toBe("Credit Central Toronto");
    expect(listRes.data[0]!.performerName).toBe("Store Cashier");
  });
});
