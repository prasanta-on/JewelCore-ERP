import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { getPool } from "./pool.js";

/**
 * Interface representing a client strictly scoped to an active database transaction.
 * Prevents accidental use of global pool queries within a transaction boundary.
 */
export interface TransactionClient {
  readonly inTransaction: true;
  query<R extends QueryResultRow = any>(
    text: string,
    values?: any[],
  ): Promise<QueryResult<R>>;
  readonly rawClient: PoolClient;
}

/**
 * Executes a business operation inside an atomic PostgreSQL transaction.
 *
 * Lifecycle:
 * 1. Checks out a dedicated client from the connection pool.
 * 2. Issues `BEGIN` to start the transaction block.
 * 3. Invokes the caller callback with the transaction-bound client.
 * 4. On successful completion, issues `COMMIT`.
 * 5. On any exception, issues `ROLLBACK` and re-throws the original error.
 *    If rollback itself fails, the original application error is preserved.
 * 6. In all execution paths, guarantees client release back to the pool.
 */
export async function withTransaction<T>(
  callback: (client: TransactionClient) => Promise<T>,
  poolOverride?: Pool,
): Promise<T> {
  const pool = poolOverride ?? getPool();
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to acquire database client from connection pool: ${message}`,
    );
  }

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const txClient: TransactionClient = {
      inTransaction: true,
      query: <R extends QueryResultRow = any>(text: string, values?: any[]) => {
        return values !== undefined
          ? client.query<R>(text, values)
          : client.query<R>(text);
      },
      rawClient: client,
    };

    const result = await callback(txClient);

    await client.query("COMMIT");
    return result;
  } catch (originalError: unknown) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError: unknown) {
        // Rollback failure logged without masking original application error
        const rollbackMsg =
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);
        // eslint-disable-next-line no-console
        console.error(
          `[JewelCore DB] Failed to execute ROLLBACK on transaction: ${rollbackMsg}`,
        );
      }
    }
    throw originalError;
  } finally {
    client.release();
  }
}
