import type { Pool, PoolClient } from "pg";
import {
  type InventoryMovementRecord,
  type CreateInventoryMovementInput,
  type ListInventoryMovementsQuery,
  type MovementType,
  type CustodyState,
  NotFoundError,
  UnprocessableEntityError,
  ForbiddenError,
  BadRequestError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { withTransaction } from "../transaction.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

interface MovementRow {
  id: string;
  organization_id: string;
  store_id: string;
  inventory_item_id: string | null;
  product_sku_id: string;
  movement_type: MovementType;
  from_compartment_id: string | null;
  to_compartment_id: string | null;
  from_custody_state: CustodyState | null;
  to_custody_state: CustodyState;
  quantity: number;
  weight_grams: string | number | null;
  actor_user_id: string;
  reason_code: string | null;
  reference_document_type: string | null;
  reference_document_id: string | null;
  moved_at: Date;
  created_at: Date;
}

function mapRowToMovement(row: MovementRow): InventoryMovementRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    inventoryItemId: row.inventory_item_id,
    productSkuId: row.product_sku_id,
    movementType: row.movement_type,
    fromCompartmentId: row.from_compartment_id,
    toCompartmentId: row.to_compartment_id,
    fromCustodyState: row.from_custody_state,
    toCustodyState: row.to_custody_state,
    quantity: Number(row.quantity),
    weightGrams:
      row.weight_grams !== null && row.weight_grams !== undefined
        ? Number(row.weight_grams)
        : null,
    actorUserId: row.actor_user_id,
    reasonCode: row.reason_code,
    referenceDocumentType: row.reference_document_type,
    referenceDocumentId: row.reference_document_id,
    movedAt: row.moved_at,
    createdAt: row.created_at,
  };
}

/**
 * Executes and records an atomic inventory custody movement (Entity 30 - FEAT-INV-03).
 *
 * Guarantees:
 * - Append-only ledger immutability (INV-09)
 * - Movement destination compartment consistency (INV-13)
 * - Movement SKU and item coherence (INV-16)
 * - Multi-store context isolation and compartment store boundaries (INV-11)
 * - Serialized piece updates (current_compartment_id, custody_state, OCC version)
 * - Quantity-batch stock balance adjustments in source and destination
 */
export async function createInventoryMovement(
  input: CreateInventoryMovementInput & { storeId?: string },
  context: { userId: string },
  clientOverride?: Queryable,
): Promise<InventoryMovementRecord> {
  const executeMovement = async (
    client: Queryable,
  ): Promise<InventoryMovementRecord> => {
    // 1. Resolve store boundary
    let effectiveStoreId = input.storeId;

    // Validate from-compartment store boundary
    if (input.fromCompartmentId) {
      const fromCompRes = await client.query<{ id: string; store_id: string }>(
        `SELECT id, store_id FROM compartments WHERE id = $1`,
        [input.fromCompartmentId],
      );
      const fromComp = fromCompRes.rows[0];
      if (!fromComp) {
        throw new NotFoundError(
          `Source compartment '${input.fromCompartmentId}' not found`,
          "ERR_COMPARTMENT_NOT_FOUND",
        );
      }
      if (!effectiveStoreId) {
        effectiveStoreId = fromComp.store_id;
      } else if (effectiveStoreId !== fromComp.store_id) {
        throw new UnprocessableEntityError(
          `Source compartment '${input.fromCompartmentId}' belongs to store '${fromComp.store_id}', not active store '${effectiveStoreId}' (INV-11)`,
          "ERR_COMPARTMENT_STORE_MISMATCH",
        );
      }
    }

    // Validate to-compartment store boundary
    if (input.toCompartmentId) {
      const toCompRes = await client.query<{ id: string; store_id: string }>(
        `SELECT id, store_id FROM compartments WHERE id = $1`,
        [input.toCompartmentId],
      );
      const toComp = toCompRes.rows[0];
      if (!toComp) {
        throw new NotFoundError(
          `Destination compartment '${input.toCompartmentId}' not found`,
          "ERR_COMPARTMENT_NOT_FOUND",
        );
      }
      if (!effectiveStoreId) {
        effectiveStoreId = toComp.store_id;
      } else if (effectiveStoreId !== toComp.store_id) {
        throw new UnprocessableEntityError(
          `Destination compartment '${input.toCompartmentId}' belongs to store '${toComp.store_id}', not active store '${effectiveStoreId}' (INV-11)`,
          "ERR_COMPARTMENT_STORE_MISMATCH",
        );
      }
    }

    if (!effectiveStoreId) {
      throw new BadRequestError(
        "Store ID must be specified or inferrable from compartment context",
        "ERR_MISSING_STORE_ID",
      );
    }

    let organizationId: string;
    let effectiveFromCustodyState = input.fromCustodyState ?? null;
    let effectiveFromCompartmentId = input.fromCompartmentId ?? null;
    let effectiveWeight = input.weightGrams ?? null;

    // 2. Serialized Movement (inventoryItemId IS NOT NULL)
    if (input.inventoryItemId) {
      if (input.quantity !== 1) {
        throw new BadRequestError(
          "Serialized inventory movements strictly require quantity = 1",
          "ERR_INVALID_SERIALIZED_QUANTITY",
        );
      }

      // Root aggregate lock on physical piece
      const itemRes = await client.query<{
        id: string;
        organization_id: string;
        store_id: string;
        product_sku_id: string;
        custody_state: CustodyState;
        current_compartment_id: string | null;
        gross_weight_grams: string | number;
        version: number;
      }>(`SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE`, [
        input.inventoryItemId,
      ]);

      const item = itemRes.rows[0];
      if (!item) {
        throw new NotFoundError(
          `Inventory item with ID '${input.inventoryItemId}' not found`,
          "ERR_INVENTORY_ITEM_NOT_FOUND",
        );
      }

      // Invariant INV-11: Store boundary check on piece
      if (item.store_id !== effectiveStoreId) {
        throw new ForbiddenError(
          `Cross-store access denied: item belongs to store '${item.store_id}', but movement request is scoped to '${effectiveStoreId}' (INV-11)`,
          "ERR_STORE_ACCESS_DENIED",
        );
      }

      // Invariant INV-16: Movement SKU and item coherence
      if (item.product_sku_id !== input.productSkuId) {
        throw new UnprocessableEntityError(
          `Movement SKU '${input.productSkuId}' does not match inventory item SKU '${item.product_sku_id}' (INV-16)`,
          "ERR_MOVEMENT_SKU_MISMATCH",
        );
      }

      organizationId = item.organization_id;
      effectiveFromCustodyState = input.fromCustodyState ?? item.custody_state;
      effectiveFromCompartmentId =
        input.fromCompartmentId ?? item.current_compartment_id;
      effectiveWeight = input.weightGrams ?? Number(item.gross_weight_grams);

      // Update physical inventory item state
      await client.query(
        `
        UPDATE inventory_items SET
          custody_state = $2,
          current_compartment_id = $3,
          version = version + 1,
          updated_at = clock_timestamp()
        WHERE id = $1
        `,
        [
          input.inventoryItemId,
          input.toCustodyState,
          input.toCompartmentId ?? null,
        ],
      );
    }
    // 3. Quantity-Batch Movement (inventoryItemId IS NULL)
    else {
      // Validate SKU exists and has tracking_type = 'QUANTITY_BATCH' (INV-06)
      const skuRes = await client.query<{
        id: string;
        organization_id: string;
        sku_code: string;
        tracking_type: string;
      }>(
        `SELECT id, organization_id, sku_code, tracking_type FROM product_skus WHERE id = $1`,
        [input.productSkuId],
      );

      const sku = skuRes.rows[0];
      if (!sku) {
        throw new NotFoundError(
          `Product SKU with ID '${input.productSkuId}' not found`,
          "ERR_SKU_NOT_FOUND",
        );
      }

      if (sku.tracking_type !== "QUANTITY_BATCH") {
        throw new UnprocessableEntityError(
          `Quantity-batch movements are restricted to QUANTITY_BATCH SKUs (INV-06). SKU '${sku.sku_code}' has tracking type '${sku.tracking_type}'`,
          "ERR_INVALID_TRACKING_TYPE",
        );
      }

      organizationId = sku.organization_id;

      // Decrement source stock balance if fromCompartmentId is specified
      if (input.fromCompartmentId) {
        const fromBalRes = await client.query<{
          id: string;
          quantity_on_hand: number;
        }>(
          `
          SELECT id, quantity_on_hand
          FROM inventory_stock_balances
          WHERE store_id = $1 AND product_sku_id = $2 AND compartment_id = $3
          FOR UPDATE
          `,
          [effectiveStoreId, input.productSkuId, input.fromCompartmentId],
        );

        const fromBal = fromBalRes.rows[0];
        if (!fromBal || fromBal.quantity_on_hand < input.quantity) {
          throw new UnprocessableEntityError(
            `Insufficient stock balance in source compartment. Available: ${fromBal?.quantity_on_hand ?? 0}, Requested: ${input.quantity}`,
            "ERR_INSUFFICIENT_STOCK_BALANCE",
          );
        }

        await client.query(
          `
          UPDATE inventory_stock_balances SET
            quantity_on_hand = quantity_on_hand - $2,
            last_movement_at = clock_timestamp(),
            version = version + 1,
            updated_at = clock_timestamp()
          WHERE id = $1
          `,
          [fromBal.id, input.quantity],
        );
      }

      // Increment destination stock balance if toCompartmentId is specified
      if (input.toCompartmentId) {
        const toBalId = uuidv7();
        await client.query(
          `
          INSERT INTO inventory_stock_balances (
            id,
            organization_id,
            store_id,
            product_sku_id,
            compartment_id,
            quantity_on_hand,
            quantity_reserved,
            total_weight_grams,
            last_movement_at,
            version,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, 0, $7,
            clock_timestamp(), 1, clock_timestamp(), clock_timestamp()
          )
          ON CONFLICT (store_id, product_sku_id, compartment_id) DO UPDATE SET
            quantity_on_hand = inventory_stock_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
            last_movement_at = clock_timestamp(),
            version = inventory_stock_balances.version + 1,
            updated_at = clock_timestamp()
          `,
          [
            toBalId,
            organizationId,
            effectiveStoreId,
            input.productSkuId,
            input.toCompartmentId,
            input.quantity,
            effectiveWeight ?? 0,
          ],
        );
      }
    }

    // 4. Record immutable ledger row
    const movementId = uuidv7();
    const insertRes = await client.query<MovementRow>(
      `
      INSERT INTO inventory_movements (
        id,
        organization_id,
        store_id,
        inventory_item_id,
        product_sku_id,
        movement_type,
        from_compartment_id,
        to_compartment_id,
        from_custody_state,
        to_custody_state,
        quantity,
        weight_grams,
        actor_user_id,
        reason_code,
        reference_document_type,
        reference_document_id,
        moved_at,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        clock_timestamp(), clock_timestamp()
      )
      RETURNING *
      `,
      [
        movementId,
        organizationId,
        effectiveStoreId,
        input.inventoryItemId ?? null,
        input.productSkuId,
        input.movementType,
        effectiveFromCompartmentId,
        input.toCompartmentId ?? null,
        effectiveFromCustodyState,
        input.toCustodyState,
        input.quantity,
        effectiveWeight,
        context.userId,
        input.reasonCode ?? null,
        input.referenceDocumentType ?? null,
        input.referenceDocumentId ?? null,
      ],
    );

    const row = insertRes.rows[0];
    if (!row) {
      throw new Error("Failed to insert inventory movement ledger row");
    }

    return mapRowToMovement(row);
  };

  if (clientOverride) {
    return executeMovement(clientOverride);
  }
  return withTransaction((tx) => executeMovement(tx.rawClient));
}

/**
 * Retrieves a movement record by UUID.
 */
export async function getInventoryMovementById(
  id: string,
  clientOverride?: Queryable,
): Promise<InventoryMovementRecord | null> {
  const executor = clientOverride ?? getPool();
  const res = await executor.query<MovementRow>(
    `SELECT * FROM inventory_movements WHERE id = $1`,
    [id],
  );

  return res.rows[0] ? mapRowToMovement(res.rows[0]) : null;
}

/**
 * Lists movement ledger records matching filter criteria.
 */
export async function listInventoryMovements(
  filters: ListInventoryMovementsQuery,
  clientOverride?: Queryable,
): Promise<InventoryMovementRecord[]> {
  const executor = clientOverride ?? getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.storeId) {
    conditions.push(`store_id = $${paramIndex++}`);
    params.push(filters.storeId);
  }

  if (filters.inventoryItemId) {
    conditions.push(`inventory_item_id = $${paramIndex++}`);
    params.push(filters.inventoryItemId);
  }

  if (filters.productSkuId) {
    conditions.push(`product_sku_id = $${paramIndex++}`);
    params.push(filters.productSkuId);
  }

  if (filters.movementType) {
    conditions.push(`movement_type = $${paramIndex++}`);
    params.push(filters.movementType);
  }

  if (filters.toCustodyState) {
    conditions.push(`to_custody_state = $${paramIndex++}`);
    params.push(filters.toCustodyState);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(filters.limit);
  const limitIndex = paramIndex++;
  params.push(filters.offset);
  const offsetIndex = paramIndex++;

  const sql = `
    SELECT *
    FROM inventory_movements
    ${whereClause}
    ORDER BY moved_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const res = await executor.query<MovementRow>(sql, params);
  return res.rows.map(mapRowToMovement);
}
