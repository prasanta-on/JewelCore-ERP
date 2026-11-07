import type { Pool, PoolClient } from "pg";
import {
  type StoreCreditAccountRecord,
  type StoreCreditTransactionRecord,
  type StoreCreditTransactionType,
  type ListStoreCreditTransactionsQuery,
  NotFoundError,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface StoreCreditAccountRow {
  id: string;
  organization_id: string;
  customer_id: string;
  account_number: string;
  currency: string;
  balance_cad: string | number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  customer_name?: string | null;
}

export interface StoreCreditTransactionRow {
  id: string;
  organization_id: string;
  store_credit_account_id: string;
  store_id: string;
  transaction_type: string;
  amount_cad: string | number;
  balance_before_cad: string | number;
  balance_after_cad: string | number;
  reference_document_type: string | null;
  reference_document_id: string | null;
  performed_by_user_id: string;
  notes: string | null;
  created_at: Date | string;
  store_name?: string | null;
  performer_name?: string | null;
}

function mapRowToStoreCreditAccount(
  row: StoreCreditAccountRow,
  recentTransactions?: StoreCreditTransactionRecord[],
): StoreCreditAccountRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    accountNumber: row.account_number,
    currency: row.currency,
    balanceCad: Number(row.balance_cad),
    isActive: row.is_active,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at
        : new Date(row.updated_at),
    customerName: row.customer_name ?? undefined,
    recentTransactions,
  };
}

function mapRowToStoreCreditTransaction(
  row: StoreCreditTransactionRow,
): StoreCreditTransactionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeCreditAccountId: row.store_credit_account_id,
    storeId: row.store_id,
    transactionType: row.transaction_type as StoreCreditTransactionType,
    amountCad: Number(row.amount_cad),
    balanceBeforeCad: Number(row.balance_before_cad),
    balanceAfterCad: Number(row.balance_after_cad),
    referenceDocumentType: row.reference_document_type ?? null,
    referenceDocumentId: row.reference_document_id ?? null,
    performedByUserId: row.performed_by_user_id,
    notes: row.notes ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
    storeName: row.store_name ?? undefined,
    performerName: row.performer_name ?? undefined,
  };
}

/**
 * Retrieves or lazily initializes a customer's store credit account (FEAT-RET-03).
 */
export async function getOrCreateStoreCreditAccount(
  params: { customerId: string; organizationId: string },
  clientOverride?: Queryable,
): Promise<StoreCreditAccountRecord> {
  const runner = async (
    client: Queryable,
  ): Promise<StoreCreditAccountRecord> => {
    // 1. Verify customer exists
    const custRes = await client.query<{ id: string; name: string }>(
      `SELECT id, first_name || ' ' || last_name AS name FROM customers WHERE id = $1 AND organization_id = $2`,
      [params.customerId, params.organizationId],
    );
    const cust = custRes.rows[0];
    if (!cust) {
      throw new NotFoundError("Customer", params.customerId);
    }

    // 2. Fetch existing account
    const existingRes = await client.query<StoreCreditAccountRow>(
      `
      SELECT sca.*, c.first_name || ' ' || c.last_name AS customer_name
      FROM store_credit_accounts sca
      JOIN customers c ON c.id = sca.customer_id
      WHERE sca.customer_id = $1 AND sca.organization_id = $2
      `,
      [params.customerId, params.organizationId],
    );

    if (existingRes.rows[0]) {
      return mapRowToStoreCreditAccount(existingRes.rows[0]);
    }

    // 3. Create account if not present
    const accountId = uuidv7();
    const accountNumber = `SCA-${Date.now()}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")}`;

    const insertRes = await client.query<StoreCreditAccountRow>(
      `
      INSERT INTO store_credit_accounts (
        id,
        organization_id,
        customer_id,
        account_number,
        currency,
        balance_cad,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, 'CAD', 0.0000, true, clock_timestamp(), clock_timestamp()
      )
      RETURNING *
      `,
      [accountId, params.organizationId, params.customerId, accountNumber],
    );

    const created = insertRes.rows[0];
    if (!created) {
      throw new Error("Failed to create store credit account");
    }
    created.customer_name = cust.name;

    return mapRowToStoreCreditAccount(created);
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Retrieves a customer's store credit account by Customer ID (FEAT-RET-03).
 */
export async function getStoreCreditAccountByCustomerId(
  params: { customerId: string; organizationId: string },
  clientOverride?: Queryable,
): Promise<StoreCreditAccountRecord> {
  return getOrCreateStoreCreditAccount(params, clientOverride);
}

/**
 * Retrieves a store credit account by account ID.
 */
export async function getStoreCreditAccountById(
  params: { id: string; organizationId: string },
  clientOverride?: Queryable,
): Promise<StoreCreditAccountRecord> {
  const client = clientOverride ?? getPool();

  const res = await client.query<StoreCreditAccountRow>(
    `
    SELECT sca.*, c.first_name || ' ' || c.last_name AS customer_name
    FROM store_credit_accounts sca
    JOIN customers c ON c.id = sca.customer_id
    WHERE sca.id = $1 AND sca.organization_id = $2
    `,
    [params.id, params.organizationId],
  );

  const row = res.rows[0];
  if (!row) {
    throw new NotFoundError("StoreCreditAccount", params.id);
  }

  return mapRowToStoreCreditAccount(row);
}

/**
 * Atomically adjusts or redeems customer store credit, maintaining an immutable ledger (FEAT-RET-03 / INV-09).
 */
export async function adjustStoreCredit(
  params: {
    customerId: string;
    storeId: string;
    organizationId: string;
    performedByUserId: string;
    transactionType: StoreCreditTransactionType;
    amountCad: number;
    referenceDocumentType?: string;
    referenceDocumentId?: string;
    notes?: string;
  },
  clientOverride?: Queryable,
): Promise<{
  account: StoreCreditAccountRecord;
  transaction: StoreCreditTransactionRecord;
}> {
  const runner = async (
    client: Queryable,
  ): Promise<{
    account: StoreCreditAccountRecord;
    transaction: StoreCreditTransactionRecord;
  }> => {
    // 1. Ensure account exists and lock it
    await getOrCreateStoreCreditAccount(
      { customerId: params.customerId, organizationId: params.organizationId },
      client,
    );

    const lockRes = await client.query<StoreCreditAccountRow>(
      `
      SELECT sca.*, c.first_name || ' ' || c.last_name AS customer_name
      FROM store_credit_accounts sca
      JOIN customers c ON c.id = sca.customer_id
      WHERE sca.customer_id = $1 AND sca.organization_id = $2
      FOR UPDATE
      `,
      [params.customerId, params.organizationId],
    );

    const account = lockRes.rows[0];
    if (!account) {
      throw new NotFoundError("StoreCreditAccount", params.customerId);
    }

    if (!account.is_active) {
      throw new UnprocessableEntityError(
        "Store credit account is deactivated and cannot process transactions",
        "ERR_ACCOUNT_DEACTIVATED",
      );
    }

    const currentBalance = Number(account.balance_cad);
    const amount = Number(params.amountCad);

    const isCreditAddition =
      params.transactionType === "ISSUE_REFUND" ||
      params.transactionType === "ISSUE_BUYBACK" ||
      params.transactionType === "ISSUE_PROMOTION" ||
      params.transactionType === "MANUAL_ADJUSTMENT";

    let balanceAfter: number;

    if (isCreditAddition) {
      balanceAfter = currentBalance + amount;
    } else {
      // Deduction: REDEEM_PURCHASE or EXPIRE_CREDIT
      if (amount > currentBalance) {
        throw new UnprocessableEntityError(
          `Insufficient store credit balance (available: ${currentBalance.toFixed(2)}, requested: ${amount.toFixed(2)})`,
          "ERR_INSUFFICIENT_STORE_CREDIT",
        );
      }
      balanceAfter = currentBalance - amount;
    }

    // 2. Append immutable ledger transaction (Entity 57 / INV-09)
    const txId = uuidv7();
    const txInsertRes = await client.query<StoreCreditTransactionRow>(
      `
      INSERT INTO store_credit_transactions (
        id,
        organization_id,
        store_credit_account_id,
        store_id,
        transaction_type,
        amount_cad,
        balance_before_cad,
        balance_after_cad,
        reference_document_type,
        reference_document_id,
        performed_by_user_id,
        notes,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp()
      )
      RETURNING *
      `,
      [
        txId,
        params.organizationId,
        account.id,
        params.storeId,
        params.transactionType,
        amount.toFixed(4),
        currentBalance.toFixed(4),
        balanceAfter.toFixed(4),
        params.referenceDocumentType ?? null,
        params.referenceDocumentId ?? null,
        params.performedByUserId,
        params.notes ?? null,
      ],
    );

    const createdTxRow = txInsertRes.rows[0];
    if (!createdTxRow) {
      throw new Error("Failed to insert store credit transaction record");
    }

    // 3. Update account running balance
    const updateRes = await client.query<StoreCreditAccountRow>(
      `
      UPDATE store_credit_accounts
      SET
        balance_cad = $1,
        updated_at = clock_timestamp()
      WHERE id = $2 AND organization_id = $3
      RETURNING *
      `,
      [balanceAfter.toFixed(4), account.id, params.organizationId],
    );

    const updatedAccountRow = updateRes.rows[0];
    if (!updatedAccountRow) {
      throw new Error("Failed to update store credit account balance");
    }
    updatedAccountRow.customer_name = account.customer_name;

    // 4. Append tamper-evident compliance audit trail event
    await client.query(
      `
      INSERT INTO audit_events (
        id,
        organization_id,
        store_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        payload_before_json,
        payload_after_json,
        occurred_at,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, 'STORE_CREDIT_TRANSACTION', 'STORE_CREDIT_ACCOUNT',
        $5, $6, $7, clock_timestamp(), clock_timestamp()
      )
      `,
      [
        uuidv7(),
        params.organizationId,
        params.storeId,
        params.performedByUserId,
        account.id,
        JSON.stringify({ balanceCad: currentBalance }),
        JSON.stringify({
          balanceCad: balanceAfter,
          transactionId: txId,
          transactionType: params.transactionType,
          amountCad: amount,
        }),
      ],
    );

    return {
      account: mapRowToStoreCreditAccount(updatedAccountRow),
      transaction: mapRowToStoreCreditTransaction(createdTxRow),
    };
  };

  if (clientOverride) {
    return runner(clientOverride);
  }
  return withTransaction((tx) => runner(tx.rawClient));
}

/**
 * Lists store credit transactions for an account with pagination (FEAT-RET-03).
 */
export async function listStoreCreditTransactions(
  params: {
    storeCreditAccountId: string;
    organizationId: string;
  } & ListStoreCreditTransactionsQuery,
  clientOverride?: Queryable,
): Promise<{
  data: StoreCreditTransactionRecord[];
  total: number;
  limit: number;
  offset: number;
}> {
  const client = clientOverride ?? getPool();
  const conditions: string[] = [
    "sct.store_credit_account_id = $1",
    "sct.organization_id = $2",
  ];
  const values: unknown[] = [params.storeCreditAccountId, params.organizationId];
  let paramIdx = 3;

  if (params.storeId) {
    conditions.push(`sct.store_id = $${paramIdx++}`);
    values.push(params.storeId);
  }

  if (params.transactionType) {
    conditions.push(`sct.transaction_type = $${paramIdx++}`);
    values.push(params.transactionType);
  }

  const whereClause = conditions.join(" AND ");

  const countRes = await client.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM store_credit_transactions sct WHERE ${whereClause}`,
    values,
  );
  const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const pageValues = [...values, limit, offset];

  const dataRes = await client.query<StoreCreditTransactionRow>(
    `
    SELECT
      sct.*,
      s.name AS store_name,
      u.first_name || ' ' || u.last_name AS performer_name
    FROM store_credit_transactions sct
    JOIN stores s ON s.id = sct.store_id
    JOIN users u ON u.id = sct.performed_by_user_id
    WHERE ${whereClause}
    ORDER BY sct.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `,
    pageValues,
  );

  const data = dataRes.rows.map(mapRowToStoreCreditTransaction);

  return {
    data,
    total,
    limit,
    offset,
  };
}
