import type { Pool, PoolClient } from "pg";
import {
  type RfidJobRecord,
  type RfidJobItemRecord,
  type CreateRfidJobInput,
  type ListRfidJobsQuery,
  RfidJobStatus,
  RfidJobItemStatus,
  NotFoundError,
  ForbiddenError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

export interface RfidJobRow {
  id: string;
  organization_id: string;
  store_id: string;
  created_by_user_id: string;
  printer_device_id: string;
  job_name: string | null;
  status: RfidJobStatus;
  total_items: number;
  completed_items: number;
  failed_items: number;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RfidJobItemRow {
  id: string;
  job_id: string;
  inventory_item_id: string;
  rfid_tag_id: string | null;
  target_epc: string | null;
  status: RfidJobItemStatus;
  attempts: number;
  error_message: string | null;
  encoded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToRfidJob(row: RfidJobRow): RfidJobRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    createdByUserId: row.created_by_user_id,
    printerDeviceId: row.printer_device_id,
    jobName: row.job_name,
    status: row.status,
    totalItems: row.total_items,
    completedItems: row.completed_items,
    failedItems: row.failed_items,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToRfidJobItem(row: RfidJobItemRow): RfidJobItemRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    inventoryItemId: row.inventory_item_id,
    rfidTagId: row.rfid_tag_id,
    targetEpc: row.target_epc,
    status: row.status,
    attempts: row.attempts,
    errorMessage: row.error_message,
    encodedAt: row.encoded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a batch RFID print & encoding job with transactional items and outbox event (FEAT-RFID-03, Entities 37 & 38).
 */
export async function createRfidJob(
  input: CreateRfidJobInput & {
    organizationId: string;
    storeId: string;
  },
  context: { userId: string },
  clientOverride?: Queryable,
): Promise<{ job: RfidJobRecord; items: RfidJobItemRecord[] }> {
  const executeCreate = async (client: Queryable) => {
    // 1. Verify store exists and belongs to organization
    const storeRes = await client.query<{
      id: string;
      organization_id: string;
    }>(`SELECT id, organization_id FROM stores WHERE id = $1`, [input.storeId]);

    const store = storeRes.rows[0];
    if (!store || store.organization_id !== input.organizationId) {
      throw new ForbiddenError(
        `Store with ID '${input.storeId}' not found or belongs to another organization`,
        "ERR_STORE_ACCESS_DENIED",
      );
    }

    // 2. Insert rfid_jobs header
    const jobId = uuidv7();
    const jobRes = await client.query<RfidJobRow>(
      `INSERT INTO rfid_jobs (
        id,
        organization_id,
        store_id,
        created_by_user_id,
        printer_device_id,
        job_name,
        status,
        total_items,
        completed_items,
        failed_items,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', $7, 0, 0, clock_timestamp(), clock_timestamp())
      RETURNING *`,
      [
        jobId,
        input.organizationId,
        input.storeId,
        context.userId,
        input.printerDeviceId,
        input.jobName ?? null,
        input.items.length,
      ],
    );

    const job = mapRowToRfidJob(jobRes.rows[0]!);

    // 3. Batch insert rfid_job_items
    const items: RfidJobItemRecord[] = [];
    for (const itemInput of input.items) {
      const itemId = uuidv7();
      const itemRes = await client.query<RfidJobItemRow>(
        `INSERT INTO rfid_job_items (
          id,
          job_id,
          inventory_item_id,
          target_epc,
          status,
          attempts,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, 'PENDING', 0, clock_timestamp(), clock_timestamp())
        RETURNING *`,
        [itemId, jobId, itemInput.inventoryItemId, itemInput.targetEpc ?? null],
      );
      items.push(mapRowToRfidJobItem(itemRes.rows[0]!));
    }

    // 4. Create Transactional Outbox Event (FEAT-FOUND-04)
    const outboxId = uuidv7();
    await client.query(
      `INSERT INTO outbox_events (
        id,
        topic,
        payload_json,
        status,
        created_at
      ) VALUES ($1, 'rfid.job.created', $2, 'PENDING', clock_timestamp())`,
      [
        outboxId,
        JSON.stringify({
          jobId,
          organizationId: input.organizationId,
          storeId: input.storeId,
          printerDeviceId: input.printerDeviceId,
          totalItems: items.length,
        }),
      ],
    );

    return { job, items };
  };

  if (clientOverride) {
    return executeCreate(clientOverride);
  }

  return withTransaction((tx) => executeCreate(tx.rawClient));
}

/**
 * Retrieves an RFID batch job by ID.
 */
export async function getRfidJobById(
  id: string,
  organizationId: string,
  clientOverride?: Queryable,
): Promise<RfidJobRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<RfidJobRow>(
    `SELECT * FROM rfid_jobs WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );

  return res.rows[0] ? mapRowToRfidJob(res.rows[0]) : null;
}

/**
 * Lists all items belonging to an RFID batch job.
 */
export async function listRfidJobItems(
  jobId: string,
  clientOverride?: Queryable,
): Promise<RfidJobItemRecord[]> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<RfidJobItemRow>(
    `SELECT * FROM rfid_job_items WHERE job_id = $1 ORDER BY created_at ASC`,
    [jobId],
  );

  return res.rows.map(mapRowToRfidJobItem);
}

/**
 * Processes an individual item outcome in a batch RFID job (worker execution).
 */
export async function processRfidJobItem(
  jobItemId: string,
  outcome: {
    status: RfidJobItemStatus;
    rfidTagId?: string;
    errorMessage?: string;
  },
  clientOverride?: Queryable,
): Promise<RfidJobItemRecord> {
  const executeProcess = async (client: Queryable) => {
    // 1. Lock and update the job item
    const itemRes = await client.query<RfidJobItemRow>(
      `UPDATE rfid_job_items
       SET status = $1::varchar,
           rfid_tag_id = COALESCE($2::uuid, rfid_tag_id),
           error_message = $3::text,
           attempts = attempts + 1,
           encoded_at = CASE WHEN $1::varchar = 'ENCODED' THEN clock_timestamp() ELSE encoded_at END,
           updated_at = clock_timestamp()
       WHERE id = $4::uuid
       RETURNING *`,
      [
        outcome.status,
        outcome.rfidTagId ?? null,
        outcome.errorMessage ?? null,
        jobItemId,
      ],
    );

    const item = itemRes.rows[0];
    if (!item) {
      throw new NotFoundError(
        `RFID job item with ID '${jobItemId}' not found`,
        "ERR_JOB_ITEM_NOT_FOUND",
      );
    }

    // 2. Lock parent job header and recalculate counts
    const countsRes = await client.query<{
      completed: string;
      failed: string;
      pending: string;
      total: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'ENCODED') AS completed,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
        COUNT(*) AS total
       FROM rfid_job_items
       WHERE job_id = $1`,
      [item.job_id],
    );

    const counts = countsRes.rows[0]!;
    const completed = parseInt(counts.completed, 10);
    const failed = parseInt(counts.failed, 10);
    const pending = parseInt(counts.pending, 10);

    let nextJobStatus: RfidJobStatus = RfidJobStatus.PROCESSING;
    let completedAt: Date | null = null;

    if (pending === 0) {
      if (completed > 0) {
        nextJobStatus = RfidJobStatus.COMPLETED;
      } else {
        nextJobStatus = RfidJobStatus.FAILED;
      }
      completedAt = new Date();
    }

    await client.query(
      `UPDATE rfid_jobs
       SET status = $1,
           completed_items = $2,
           failed_items = $3,
           started_at = COALESCE(started_at, clock_timestamp()),
           completed_at = CASE WHEN $4::timestamptz IS NOT NULL THEN clock_timestamp() ELSE completed_at END,
           updated_at = clock_timestamp()
       WHERE id = $5`,
      [nextJobStatus, completed, failed, completedAt, item.job_id],
    );

    return mapRowToRfidJobItem(item);
  };

  if (clientOverride) {
    return executeProcess(clientOverride);
  }

  return withTransaction((tx) => executeProcess(tx.rawClient));
}

/**
 * Updates an RFID job's status manually (e.g., worker status transition).
 */
export async function updateRfidJobStatus(
  jobId: string,
  status: RfidJobStatus,
  errorMessage?: string,
  clientOverride?: Queryable,
): Promise<RfidJobRecord> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<RfidJobRow>(
    `UPDATE rfid_jobs
     SET status = $1,
         error_message = COALESCE($2, error_message),
         started_at = CASE WHEN $1 = 'PROCESSING' AND started_at IS NULL THEN clock_timestamp() ELSE started_at END,
         completed_at = CASE WHEN $1 IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN clock_timestamp() ELSE completed_at END,
         updated_at = clock_timestamp()
     WHERE id = $3
     RETURNING *`,
    [status, errorMessage ?? null, jobId],
  );

  const row = res.rows[0];
  if (!row) {
    throw new NotFoundError(
      `RFID job with ID '${jobId}' not found`,
      "ERR_JOB_NOT_FOUND",
    );
  }

  return mapRowToRfidJob(row);
}

/**
 * Lists RFID batch jobs with filtering and pagination.
 */
export async function listRfidJobs(
  filters: ListRfidJobsQuery,
  clientOverride?: Queryable,
): Promise<RfidJobRecord[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.organizationId) {
    conditions.push(`organization_id = $${paramIndex++}`);
    params.push(filters.organizationId);
  }

  if (filters.storeId) {
    conditions.push(`store_id = $${paramIndex++}`);
    params.push(filters.storeId);
  }

  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  if (filters.printerDeviceId) {
    conditions.push(`printer_device_id = $${paramIndex++}`);
    params.push(filters.printerDeviceId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(filters.limit);
  const limitIndex = paramIndex++;
  params.push(filters.offset);
  const offsetIndex = paramIndex++;

  const sql = `
    SELECT *
    FROM rfid_jobs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const res = await executor.query<RfidJobRow>(sql, params);
  return res.rows.map(mapRowToRfidJob);
}
