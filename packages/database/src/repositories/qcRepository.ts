import type { Pool, PoolClient } from "pg";
import {
  type QualityCheckRecord,
  type QualityCheckStatusType,
  type InspectionType,
  type WeightMeasurementRecord,
  type MeasurementType,
  type MeasurementStage,
  QualityCheckStatus,
  SEALED_QC_STATUSES,
  ConflictError,
  UnprocessableEntityError,
  NotFoundError,
  BadRequestError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";
import { withTransaction } from "../transaction.js";

type Queryable = Pool | PoolClient;

export interface QualityCheckRow {
  id: string;
  shipment_id: string;
  store_id: string;
  inspector_user_id: string;
  session_sequence_number: number | string;
  status: QualityCheckStatusType;
  inspection_type: InspectionType;
  started_at: Date;
  completed_at: Date | null;
  rejection_reason_code: string | null;
  rejection_notes: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToQualityCheck(row: QualityCheckRow): QualityCheckRecord {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    storeId: row.store_id,
    inspectorUserId: row.inspector_user_id,
    sessionSequenceNumber: Number(row.session_sequence_number),
    status: row.status,
    inspectionType: row.inspection_type,
    startedAt: row.started_at,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    rejectionReasonCode: row.rejection_reason_code,
    rejectionNotes: row.rejection_notes,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateQualityCheckParams {
  id?: string;
  shipmentId: string;
  storeId: string;
  inspectorUserId: string;
  inspectionType?: InspectionType;
  status?: QualityCheckStatusType;
}

export interface UpdateQualityCheckParams {
  status?: QualityCheckStatusType;
  completedAt?: Date | string | null;
  rejectionReasonCode?: string | null;
  rejectionNotes?: string | null;
  expectedVersion?: number;
}

export interface ListQualityChecksFilter {
  shipmentId?: string;
  storeId?: string;
  status?: QualityCheckStatusType;
  limit?: number;
  offset?: number;
}

export interface ShipmentWithStoreRow {
  id: string;
  goods_receipt_note_id: string;
  shipment_number: string;
  status: string;
  store_id: string;
  organization_id: string;
}

/**
 * Retrieves a shipment joined with its parent GRN to access its store and org context.
 */
export async function getShipmentWithStore(
  shipmentId: string,
  clientOverride?: Queryable,
): Promise<{
  id: string;
  goodsReceiptNoteId: string;
  shipmentNumber: string;
  status: string;
  storeId: string;
  organizationId: string;
} | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<ShipmentWithStoreRow>(
    `
    SELECT
      s.id,
      s.goods_receipt_note_id,
      s.shipment_number,
      s.status,
      grn.store_id,
      grn.organization_id
    FROM shipments s
    JOIN goods_receipt_notes grn ON s.goods_receipt_note_id = grn.id
    WHERE s.id = $1
    `,
    [shipmentId],
  );

  const r = res.rows[0];
  if (!r) {
    return null;
  }

  return {
    id: r.id,
    goodsReceiptNoteId: r.goods_receipt_note_id,
    shipmentNumber: r.shipment_number,
    status: r.status,
    storeId: r.store_id,
    organizationId: r.organization_id,
  };
}

/**
 * Creates a new quality inspection session for a shipment.
 * Locks the parent shipment to calculate the next session sequence number atomically.
 */
export async function createQualityCheck(
  params: CreateQualityCheckParams,
  clientOverride?: Queryable,
): Promise<QualityCheckRecord> {
  const executeCreation = async (client: Queryable) => {
    // 1. Lock shipment row to serialize concurrent QC session allocations for this shipment
    await client.query(`SELECT id FROM shipments WHERE id = $1 FOR UPDATE`, [
      params.shipmentId,
    ]);

    // 2. Compute 1-indexed monotonic session_sequence_number
    const seqResult = await client.query<{ next_seq: number }>(
      `
      SELECT COALESCE(MAX(session_sequence_number), 0) + 1 AS next_seq
      FROM quality_checks
      WHERE shipment_id = $1
      `,
      [params.shipmentId],
    );
    const firstSeqRow = seqResult.rows[0];
    const sessionSequenceNumber = Number(firstSeqRow?.next_seq ?? 1);

    const checkId = params.id ?? uuidv7();
    const status = params.status ?? QualityCheckStatus.IN_PROGRESS;
    const inspectionType = params.inspectionType ?? "INITIAL_INTAKE";

    const insertResult = await client.query<QualityCheckRow>(
      `
      INSERT INTO quality_checks (
        id,
        shipment_id,
        store_id,
        inspector_user_id,
        session_sequence_number,
        status,
        inspection_type,
        started_at,
        version,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp(), 1, clock_timestamp(), clock_timestamp())
      RETURNING *
      `,
      [
        checkId,
        params.shipmentId,
        params.storeId,
        params.inspectorUserId,
        sessionSequenceNumber,
        status,
        inspectionType,
      ],
    );

    const createdRow = insertResult.rows[0];
    if (!createdRow) {
      throw new Error("Failed to insert quality check record");
    }

    return mapRowToQualityCheck(createdRow);
  };

  if (clientOverride) {
    return executeCreation(clientOverride);
  }

  return withTransaction((tx) => executeCreation(tx.rawClient));
}

/**
 * Retrieves a quality check session by ID.
 */
export async function getQualityCheckById(
  id: string,
  clientOverride?: Queryable,
): Promise<QualityCheckRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<QualityCheckRow>(
    `SELECT * FROM quality_checks WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return mapRowToQualityCheck(row);
}

/**
 * Lists quality inspection sessions matching optional filters.
 */
export async function listQualityChecks(
  filter: ListQualityChecksFilter = {},
  clientOverride?: Queryable,
): Promise<{ items: QualityCheckRecord[]; total: number }> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filter.shipmentId) {
    conditions.push(`shipment_id = $${paramIdx++}`);
    params.push(filter.shipmentId);
  }

  if (filter.storeId) {
    conditions.push(`store_id = $${paramIdx++}`);
    params.push(filter.storeId);
  }

  if (filter.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(filter.status);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await executor.query<{ total: string | number }>(
    `SELECT COUNT(*) AS total FROM quality_checks ${whereClause}`,
    params,
  );
  const total = Number(countRes.rows[0]?.total ?? 0);

  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  params.push(limit, offset);
  const dataRes = await executor.query<QualityCheckRow>(
    `
    SELECT *
    FROM quality_checks
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `,
    params,
  );

  return {
    items: dataRes.rows.map(mapRowToQualityCheck),
    total,
  };
}

/**
 * Updates a quality inspection session.
 * Enforces the Sealed Session Immutability Gate (Scenario 5, ERR_SESSION_SEALED)
 * and Optimistic Concurrency Control (OCC).
 */
export async function updateQualityCheck(
  id: string,
  params: UpdateQualityCheckParams,
  clientOverride?: Queryable,
): Promise<QualityCheckRecord> {
  const executeUpdate = async (client: Queryable) => {
    // 1. Fetch current record
    const existingRes = await client.query<QualityCheckRow>(
      `SELECT * FROM quality_checks WHERE id = $1 FOR UPDATE`,
      [id],
    );

    const current = existingRes.rows[0];
    if (!current) {
      throw new NotFoundError(
        `Quality inspection session with ID '${id}' not found`,
        "ERR_QC_NOT_FOUND",
      );
    }

    // 2. Sealed Session Immutability Gate
    if (SEALED_QC_STATUSES.includes(current.status)) {
      throw new UnprocessableEntityError(
        `Inspection session is ${current.status} and sealed; modifications are strictly prohibited`,
        "ERR_SESSION_SEALED",
      );
    }

    // 3. Optimistic Concurrency Control (OCC)
    if (
      params.expectedVersion !== undefined &&
      current.version !== params.expectedVersion
    ) {
      throw new ConflictError(
        `OCC version conflict: expected version ${params.expectedVersion}, but found ${current.version}`,
        "ERR_CONCURRENCY_CONFLICT",
      );
    }

    const newStatus = params.status ?? current.status;
    let completedAt: Date | string | null = current.completed_at;

    if (params.completedAt !== undefined) {
      completedAt = params.completedAt;
    } else if (
      SEALED_QC_STATUSES.includes(newStatus) &&
      !current.completed_at
    ) {
      completedAt = new Date();
    }

    const rejectionReasonCode =
      params.rejectionReasonCode !== undefined
        ? params.rejectionReasonCode
        : current.rejection_reason_code;

    const rejectionNotes =
      params.rejectionNotes !== undefined
        ? params.rejectionNotes
        : current.rejection_notes;

    const updateRes = await client.query<QualityCheckRow>(
      `
      UPDATE quality_checks
      SET
        status = $2,
        completed_at = $3,
        rejection_reason_code = $4,
        rejection_notes = $5,
        version = version + 1,
        updated_at = clock_timestamp()
      WHERE id = $1 AND version = $6
      RETURNING *
      `,
      [
        id,
        newStatus,
        completedAt,
        rejectionReasonCode,
        rejectionNotes,
        current.version,
      ],
    );

    const updatedRow = updateRes.rows[0];
    if (!updatedRow) {
      throw new ConflictError(
        "OCC conflict during update; record modified concurrently",
        "ERR_CONCURRENCY_CONFLICT",
      );
    }

    return mapRowToQualityCheck(updatedRow);
  };

  if (clientOverride) {
    return executeUpdate(clientOverride);
  }

  return withTransaction((tx) => executeUpdate(tx.rawClient));
}

// -------------------------------------------------------------
// Analytical Balance Metrology (FEAT-QC-02 / INV-02, INV-09)
// -------------------------------------------------------------

export interface WeightMeasurementRow {
  id: string;
  quality_check_id: string | null;
  quality_check_item_id: string | null;
  balance_device_id: string;
  measurement_type: MeasurementType;
  measurement_stage: MeasurementStage;
  measured_weight: string | number;
  tare_weight: string | number;
  net_weight: string | number;
  measurement_unit: string;
  is_calibrated: boolean;
  measured_by_user_id: string;
  measured_at: Date;
  created_at: Date;
}

export function mapRowToWeightMeasurement(
  row: WeightMeasurementRow,
): WeightMeasurementRecord {
  return {
    id: row.id,
    qualityCheckId: row.quality_check_id,
    qualityCheckItemId: row.quality_check_item_id,
    balanceDeviceId: row.balance_device_id,
    measurementType: row.measurement_type,
    measurementStage: row.measurement_stage,
    measuredWeight: parseFloat(Number(row.measured_weight).toFixed(4)),
    tareWeight: parseFloat(Number(row.tare_weight).toFixed(4)),
    netWeight: parseFloat(Number(row.net_weight).toFixed(4)),
    measurementUnit: row.measurement_unit,
    isCalibrated: Boolean(row.is_calibrated),
    measuredByUserId: row.measured_by_user_id,
    measuredAt: new Date(row.measured_at),
    createdAt: new Date(row.created_at),
  };
}

export interface CreateWeightMeasurementParams {
  id?: string;
  qualityCheckId?: string | null;
  qualityCheckItemId?: string | null;
  balanceDeviceId?: string;
  measurementType?: MeasurementType;
  measurementStage?: MeasurementStage;
  measuredWeight: number;
  tareWeight?: number;
  measurementUnit?: string;
  isCalibrated?: boolean;
  measuredByUserId: string;
  measuredAt?: Date | string;
}

export interface ListWeightMeasurementsFilter {
  qualityCheckId?: string;
  qualityCheckItemId?: string;
  balanceDeviceId?: string;
  measurementStage?: string;
  limit?: number;
  offset?: number;
}

/**
 * Persists an immutable analytical balance scale reading (FEAT-QC-02 / INV-02, INV-09).
 * Enforces positive gross weight and DEC-05 4-decimal precision.
 */
export async function createWeightMeasurement(
  params: CreateWeightMeasurementParams,
  clientOverride?: Queryable,
): Promise<WeightMeasurementRecord> {
  const executor = clientOverride ?? getPool();

  if (params.measuredWeight <= 0) {
    throw new BadRequestError(
      "Gross weight must be strictly positive (> 0) (INV-02)",
      "ERR_INVALID_WEIGHT_VALUE",
    );
  }

  const tareWeight = params.tareWeight ?? 0;
  if (tareWeight < 0) {
    throw new BadRequestError(
      "Tare weight cannot be negative (INV-02)",
      "ERR_INVALID_WEIGHT_VALUE",
    );
  }

  if (params.measuredWeight < tareWeight) {
    throw new BadRequestError(
      "Gross measured weight must be greater than or equal to tare weight (INV-02)",
      "ERR_INVALID_WEIGHT_VALUE",
    );
  }

  const id = params.id ?? uuidv7();
  const balanceDeviceId = params.balanceDeviceId ?? "SCALE-BRIDGE-01";
  const measurementType = params.measurementType ?? "GROSS_WEIGHT";
  const measurementStage = params.measurementStage ?? "INTAKE_RECEIVING";
  const measurementUnit = params.measurementUnit ?? "GRAMS";
  const isCalibrated = params.isCalibrated ?? true;
  const measuredAt = params.measuredAt
    ? new Date(params.measuredAt)
    : new Date();

  const res = await executor.query<WeightMeasurementRow>(
    `
    INSERT INTO weight_measurements (
      id,
      quality_check_id,
      quality_check_item_id,
      balance_device_id,
      measurement_type,
      measurement_stage,
      measured_weight,
      tare_weight,
      measurement_unit,
      is_calibrated,
      measured_by_user_id,
      measured_at,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp())
    RETURNING *
    `,
    [
      id,
      params.qualityCheckId ?? null,
      params.qualityCheckItemId ?? null,
      balanceDeviceId,
      measurementType,
      measurementStage,
      params.measuredWeight,
      tareWeight,
      measurementUnit,
      isCalibrated,
      params.measuredByUserId,
      measuredAt,
    ],
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error("Failed to insert weight measurement record");
  }

  return mapRowToWeightMeasurement(row);
}

/**
 * Retrieves a weight measurement by its primary surrogate key.
 */
export async function getWeightMeasurementById(
  id: string,
  clientOverride?: Queryable,
): Promise<WeightMeasurementRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<WeightMeasurementRow>(
    `SELECT * FROM weight_measurements WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return mapRowToWeightMeasurement(row);
}

/**
 * Lists weight measurements matching optional query filters.
 */
export async function listWeightMeasurements(
  filter: ListWeightMeasurementsFilter = {},
  clientOverride?: Queryable,
): Promise<{ items: WeightMeasurementRecord[]; total: number }> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filter.qualityCheckId) {
    conditions.push(`quality_check_id = $${paramIdx++}`);
    params.push(filter.qualityCheckId);
  }

  if (filter.qualityCheckItemId) {
    conditions.push(`quality_check_item_id = $${paramIdx++}`);
    params.push(filter.qualityCheckItemId);
  }

  if (filter.balanceDeviceId) {
    conditions.push(`balance_device_id = $${paramIdx++}`);
    params.push(filter.balanceDeviceId);
  }

  if (filter.measurementStage) {
    conditions.push(`measurement_stage = $${paramIdx++}`);
    params.push(filter.measurementStage);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await executor.query<{ total: string | number }>(
    `SELECT COUNT(*) AS total FROM weight_measurements ${whereClause}`,
    params,
  );
  const total = Number(countRes.rows[0]?.total ?? 0);

  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  params.push(limit, offset);
  const dataRes = await executor.query<WeightMeasurementRow>(
    `
    SELECT *
    FROM weight_measurements
    ${whereClause}
    ORDER BY measured_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `,
    params,
  );

  return {
    items: dataRes.rows.map(mapRowToWeightMeasurement),
    total,
  };
}
