import type { Pool, PoolClient } from "pg";
import {
  type QualityCheckRecord,
  type QualityCheckStatusType,
  type InspectionType,
  type WeightMeasurementRecord,
  type MeasurementType,
  type MeasurementStage,
  type QualityCheckItemRecord,
  type ItemGemstoneRecord,
  type StoneType,
  type CertificateAuthority,
  QualityCheckStatus,
  QualityCheckItemStatus,
  SEALED_QC_STATUSES,
  calculateNetWeightGrams,
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

// -------------------------------------------------------------
// QC Items & Mounted Gemstone Parcels (FEAT-QC-03, FEAT-QC-04)
// -------------------------------------------------------------

export interface QualityCheckItemRow {
  id: string;
  quality_check_id: string;
  shipment_item_id: string;
  item_sequence_number: number | string;
  status: QualityCheckItemStatus;
  verified_material_id: string | null;
  verified_purity_id: string | null;
  gross_weight_grams: string | number | null;
  tare_weight_grams: string | number;
  net_weight_grams: string | number | null;
  stone_weight_carats: string | number;
  hallmark_verified: boolean | null;
  visual_inspection_passed: boolean | null;
  damage_detected: boolean | null;
  damage_notes: string | null;
  rejection_reason: string | null;
  decision_by_user_id: string | null;
  decision_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToQualityCheckItem(
  row: QualityCheckItemRow,
): QualityCheckItemRecord {
  return {
    id: row.id,
    qualityCheckId: row.quality_check_id,
    shipmentItemId: row.shipment_item_id,
    itemSequenceNumber: Number(row.item_sequence_number),
    status: row.status,
    verifiedMaterialId: row.verified_material_id,
    verifiedPurityId: row.verified_purity_id,
    grossWeightGrams:
      row.gross_weight_grams !== null
        ? parseFloat(Number(row.gross_weight_grams).toFixed(4))
        : null,
    tareWeightGrams: parseFloat(Number(row.tare_weight_grams).toFixed(4)),
    netWeightGrams:
      row.net_weight_grams !== null
        ? parseFloat(Number(row.net_weight_grams).toFixed(4))
        : null,
    stoneWeightCarats: parseFloat(Number(row.stone_weight_carats).toFixed(4)),
    hallmarkVerified: row.hallmark_verified,
    visualInspectionPassed: row.visual_inspection_passed,
    damageDetected: row.damage_detected,
    damageNotes: row.damage_notes,
    rejectionReason: row.rejection_reason,
    decisionByUserId: row.decision_by_user_id,
    decisionAt: row.decision_at ? new Date(row.decision_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface ItemGemstoneRow {
  id: string;
  quality_check_item_id: string;
  inventory_item_id: string | null;
  gemstone_id: string;
  stone_type: StoneType;
  stone_count: number | string;
  carat_weight: string | number;
  shape: string | null;
  cut_grade: string | null;
  color_grade: string | null;
  clarity_grade: string | null;
  certificate_number: string | null;
  certificate_authority: CertificateAuthority | null;
  certificate_file_id: string | null;
  setting_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export function mapRowToItemGemstone(row: ItemGemstoneRow): ItemGemstoneRecord {
  return {
    id: row.id,
    qualityCheckItemId: row.quality_check_item_id,
    inventoryItemId: row.inventory_item_id,
    gemstoneId: row.gemstone_id,
    stoneType: row.stone_type,
    stoneCount: Number(row.stone_count),
    caratWeight: parseFloat(Number(row.carat_weight).toFixed(4)),
    shape: row.shape,
    cutGrade: row.cut_grade,
    colorGrade: row.color_grade,
    clarityGrade: row.clarity_grade,
    certificateNumber: row.certificate_number,
    certificateAuthority: row.certificate_authority,
    certificateFileId: row.certificate_file_id,
    settingVerified: Boolean(row.setting_verified),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface CreateQualityCheckItemParams {
  id?: string;
  qualityCheckId: string;
  shipmentItemId: string;
  itemSequenceNumber?: number;
  status?: QualityCheckItemStatus;
  verifiedMaterialId?: string | null;
  verifiedPurityId?: string | null;
  grossWeightGrams?: number | null;
  tareWeightGrams?: number;
  netWeightGrams?: number | null;
  stoneWeightCarats?: number;
  hallmarkVerified?: boolean | null;
  visualInspectionPassed?: boolean | null;
  damageDetected?: boolean | null;
  damageNotes?: string | null;
}

export interface CreateItemGemstoneParams {
  id?: string;
  qualityCheckItemId: string;
  inventoryItemId?: string | null;
  gemstoneId: string;
  stoneType: StoneType;
  stoneCount: number;
  caratWeight: number;
  shape?: string | null;
  cutGrade?: string | null;
  colorGrade?: string | null;
  clarityGrade?: string | null;
  certificateNumber?: string | null;
  certificateAuthority?: CertificateAuthority | null;
  certificateFileId?: string | null;
  settingVerified?: boolean;
}

/**
 * Creates a piece-level technical inspection record (Entity 24).
 */
export async function createQualityCheckItem(
  params: CreateQualityCheckItemParams,
  clientOverride?: Queryable,
): Promise<QualityCheckItemRecord> {
  const executeCreation = async (client: Queryable) => {
    let itemSequenceNumber = params.itemSequenceNumber;
    if (!itemSequenceNumber) {
      const seqRes = await client.query<{ next_seq: number }>(
        `
        SELECT COALESCE(MAX(item_sequence_number), 0) + 1 AS next_seq
        FROM quality_check_items
        WHERE quality_check_id = $1 AND shipment_item_id = $2
        `,
        [params.qualityCheckId, params.shipmentItemId],
      );
      itemSequenceNumber = Number(seqRes.rows[0]?.next_seq ?? 1);
    }

    const id = params.id ?? uuidv7();
    const status = params.status ?? QualityCheckItemStatus.PENDING;
    const tareWeightGrams = params.tareWeightGrams ?? 0;
    const stoneWeightCarats = params.stoneWeightCarats ?? 0;

    let netWeightGrams = params.netWeightGrams ?? null;
    if (
      params.grossWeightGrams !== undefined &&
      params.grossWeightGrams !== null &&
      netWeightGrams === null
    ) {
      netWeightGrams = calculateNetWeightGrams(
        params.grossWeightGrams,
        tareWeightGrams,
        stoneWeightCarats,
      );
    }

    const res = await client.query<QualityCheckItemRow>(
      `
      INSERT INTO quality_check_items (
        id,
        quality_check_id,
        shipment_item_id,
        item_sequence_number,
        status,
        verified_material_id,
        verified_purity_id,
        gross_weight_grams,
        tare_weight_grams,
        net_weight_grams,
        stone_weight_carats,
        hallmark_verified,
        visual_inspection_passed,
        damage_detected,
        damage_notes,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, clock_timestamp(), clock_timestamp())
      RETURNING *
      `,
      [
        id,
        params.qualityCheckId,
        params.shipmentItemId,
        itemSequenceNumber,
        status,
        params.verifiedMaterialId ?? null,
        params.verifiedPurityId ?? null,
        params.grossWeightGrams ?? null,
        tareWeightGrams,
        netWeightGrams,
        stoneWeightCarats,
        params.hallmarkVerified ?? null,
        params.visualInspectionPassed ?? null,
        params.damageDetected ?? null,
        params.damageNotes ?? null,
      ],
    );

    const row = res.rows[0];
    if (!row) {
      throw new Error("Failed to insert quality check item record");
    }

    return mapRowToQualityCheckItem(row);
  };

  if (clientOverride) {
    return executeCreation(clientOverride);
  }

  return withTransaction((tx) => executeCreation(tx.rawClient));
}

/**
 * Retrieves a quality check item by ID.
 */
export async function getQualityCheckItemById(
  id: string,
  clientOverride?: Queryable,
): Promise<QualityCheckItemRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<QualityCheckItemRow>(
    `SELECT * FROM quality_check_items WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return mapRowToQualityCheckItem(row);
}

/**
 * Retrieves a quality check item joined with its parent quality check session to check store and session status.
 */
export async function getQualityCheckItemWithSession(
  id: string,
  clientOverride?: Queryable,
): Promise<{
  item: QualityCheckItemRecord;
  sessionStatus: QualityCheckStatusType;
  storeId: string;
} | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<
    QualityCheckItemRow & {
      session_status: QualityCheckStatusType;
      store_id: string;
    }
  >(
    `
    SELECT
      qci.*,
      qc.status AS session_status,
      qc.store_id
    FROM quality_check_items qci
    JOIN quality_checks qc ON qci.quality_check_id = qc.id
    WHERE qci.id = $1
    `,
    [id],
  );

  const row = res.rows[0];
  if (!row) {
    return null;
  }

  return {
    item: mapRowToQualityCheckItem(row),
    sessionStatus: row.session_status,
    storeId: row.store_id,
  };
}

/**
 * Adds a mounted gemstone or parcel to an inspected piece (Entity 26 - FEAT-QC-03).
 *
 * Atomically:
 * 1. Verifies parent inspection session is not sealed (ERR_SESSION_SEALED, 422)
 * 2. Enforces solitaire invariant: stone_type = PRIMARY_SOLITAIRE requires stone_count = 1
 * 3. Inserts into item_gemstones
 * 4. Recalculates total stone weight in carats and net metal weight:
 *    Net = Gross - Tare - Stones (1 ct = 0.2000 g)
 * 5. Updates summary weight fields on quality_check_items
 */
export async function addItemGemstone(
  params: CreateItemGemstoneParams,
  clientOverride?: Queryable,
): Promise<{
  gemstone: ItemGemstoneRecord;
  qcItem: QualityCheckItemRecord;
}> {
  const executeOperation = async (client: Queryable) => {
    // 1. Lock and retrieve quality_check_items joined with quality_checks
    const itemRes = await client.query<
      QualityCheckItemRow & { session_status: QualityCheckStatusType }
    >(
      `
      SELECT
        qci.*,
        qc.status AS session_status
      FROM quality_check_items qci
      JOIN quality_checks qc ON qci.quality_check_id = qc.id
      WHERE qci.id = $1
      FOR UPDATE OF qci
      `,
      [params.qualityCheckItemId],
    );

    const itemRow = itemRes.rows[0];
    if (!itemRow) {
      throw new NotFoundError(
        `Quality check item with ID '${params.qualityCheckItemId}' not found`,
        "ERR_QC_ITEM_NOT_FOUND",
      );
    }

    // 2. Sealed session gate
    if (SEALED_QC_STATUSES.includes(itemRow.session_status)) {
      throw new UnprocessableEntityError(
        `Inspection session is ${itemRow.session_status} and sealed; gemstone additions are strictly prohibited`,
        "ERR_SESSION_SEALED",
      );
    }

    // 3. Solitaire invariant
    if (params.stoneType === "PRIMARY_SOLITAIRE" && params.stoneCount !== 1) {
      throw new BadRequestError(
        "Solitaire stones must possess stone_count = 1",
        "ERR_INVALID_STONE_COUNT",
      );
    }

    if (params.caratWeight <= 0) {
      throw new BadRequestError(
        "Gemstone carat weight must be strictly positive (> 0) (INV-02)",
        "ERR_INVALID_WEIGHT_VALUE",
      );
    }

    // 4. Insert gemstone record
    const gemstoneId = params.id ?? uuidv7();
    const settingVerified = params.settingVerified ?? true;

    const insertRes = await client.query<ItemGemstoneRow>(
      `
      INSERT INTO item_gemstones (
        id,
        quality_check_item_id,
        inventory_item_id,
        gemstone_id,
        stone_type,
        stone_count,
        carat_weight,
        shape,
        cut_grade,
        color_grade,
        clarity_grade,
        certificate_number,
        certificate_authority,
        certificate_file_id,
        setting_verified,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, clock_timestamp(), clock_timestamp())
      RETURNING *
      `,
      [
        gemstoneId,
        params.qualityCheckItemId,
        params.inventoryItemId ?? null,
        params.gemstoneId,
        params.stoneType,
        params.stoneCount,
        params.caratWeight,
        params.shape ?? null,
        params.cutGrade ?? null,
        params.colorGrade ?? null,
        params.clarityGrade ?? null,
        params.certificateNumber ?? null,
        params.certificateAuthority ?? null,
        params.certificateFileId ?? null,
        settingVerified,
      ],
    );

    const createdStoneRow = insertRes.rows[0];
    if (!createdStoneRow) {
      throw new Error("Failed to insert gemstone record");
    }

    // 5. Aggregate cumulative stone carat weight
    const sumRes = await client.query<{ total_carats: string | number }>(
      `
      SELECT COALESCE(SUM(carat_weight), 0) AS total_carats
      FROM item_gemstones
      WHERE quality_check_item_id = $1
      `,
      [params.qualityCheckItemId],
    );
    const totalStoneCarats = parseFloat(
      Number(sumRes.rows[0]?.total_carats ?? 0).toFixed(4),
    );

    // 6. Recalculate net precious metal weight if gross weight exists
    let updatedItemRow: QualityCheckItemRow;
    const grossWeight =
      itemRow.gross_weight_grams !== null
        ? Number(itemRow.gross_weight_grams)
        : null;
    const tareWeight = Number(itemRow.tare_weight_grams ?? 0);

    if (grossWeight !== null) {
      const netWeight = calculateNetWeightGrams(
        grossWeight,
        tareWeight,
        totalStoneCarats,
      );

      const updateRes = await client.query<QualityCheckItemRow>(
        `
        UPDATE quality_check_items
        SET
          stone_weight_carats = $2,
          net_weight_grams = $3,
          updated_at = clock_timestamp()
        WHERE id = $1
        RETURNING *
        `,
        [params.qualityCheckItemId, totalStoneCarats, netWeight],
      );
      updatedItemRow = updateRes.rows[0]!;
    } else {
      const updateRes = await client.query<QualityCheckItemRow>(
        `
        UPDATE quality_check_items
        SET
          stone_weight_carats = $2,
          updated_at = clock_timestamp()
        WHERE id = $1
        RETURNING *
        `,
        [params.qualityCheckItemId, totalStoneCarats],
      );
      updatedItemRow = updateRes.rows[0]!;
    }

    return {
      gemstone: mapRowToItemGemstone(createdStoneRow),
      qcItem: mapRowToQualityCheckItem(updatedItemRow),
    };
  };

  if (clientOverride) {
    return executeOperation(clientOverride);
  }

  return withTransaction((tx) => executeOperation(tx.rawClient));
}

/**
 * Lists all mounted gemstones and parcels for an inspected piece.
 */
export async function listItemGemstonesByQcItemId(
  qcItemId: string,
  clientOverride?: Queryable,
): Promise<ItemGemstoneRecord[]> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<ItemGemstoneRow>(
    `
    SELECT *
    FROM item_gemstones
    WHERE quality_check_item_id = $1
    ORDER BY created_at ASC
    `,
    [qcItemId],
  );

  return res.rows.map(mapRowToItemGemstone);
}

/**
 * Retrieves a mounted gemstone record by ID.
 */
export async function getItemGemstoneById(
  id: string,
  clientOverride?: Queryable,
): Promise<ItemGemstoneRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<ItemGemstoneRow>(
    `SELECT * FROM item_gemstones WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return mapRowToItemGemstone(row);
}
