import type { Pool, PoolClient } from "pg";
import {
  type Vault,
  type Locker,
  type Compartment,
  type VaultType,
  type VaultHierarchyWithOccupancy,
  type LockerHierarchyWithOccupancy,
  type CompartmentWithOccupancy,
  type CompartmentOccupancyStatus,
  UnprocessableEntityError,
} from "@jewelcore/shared";
import { getPool } from "../pool.js";
import { uuidv7 } from "../uuidv7.js";

type Queryable = Pool | PoolClient;

interface VaultRow {
  id: string;
  store_id: string;
  code: string;
  name: string;
  vault_type: VaultType;
  access_level_required: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface LockerRow {
  id: string;
  vault_id: string;
  store_id: string;
  code: string;
  name: string;
  locker_number: string;
  capacity_rating: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CompartmentRow {
  id: string;
  locker_id: string;
  store_id: string;
  code: string;
  name: string;
  compartment_number: string;
  max_weight_capacity_grams: string | number | null;
  max_item_capacity: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToVault(row: VaultRow): Vault {
  return {
    id: row.id,
    storeId: row.store_id,
    code: row.code,
    name: row.name,
    vaultType: row.vault_type,
    accessLevelRequired: row.access_level_required,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToLocker(row: LockerRow): Locker {
  return {
    id: row.id,
    vaultId: row.vault_id,
    storeId: row.store_id,
    code: row.code,
    name: row.name,
    lockerNumber: row.locker_number,
    capacityRating: row.capacity_rating,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToCompartment(row: CompartmentRow): Compartment {
  return {
    id: row.id,
    lockerId: row.locker_id,
    storeId: row.store_id,
    code: row.code,
    name: row.name,
    compartmentNumber: row.compartment_number,
    maxWeightCapacityGrams:
      row.max_weight_capacity_grams !== null
        ? Number(row.max_weight_capacity_grams)
        : null,
    maxItemCapacity: row.max_item_capacity,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new physical Vault (Entity 32) anchored to a specific store branch.
 */
export async function createVault(
  data: {
    id?: string;
    storeId: string;
    code: string;
    name: string;
    vaultType?: VaultType;
    accessLevelRequired?: string;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Vault> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const vaultType = data.vaultType ?? "MAIN_VAULT";
  const accessLevelRequired = data.accessLevelRequired ?? "STORE_MANAGER";
  const isActive = data.isActive ?? true;

  const result = await executor.query<VaultRow>(
    `
    INSERT INTO vaults (
      id, store_id, code, name, vault_type, access_level_required, is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, store_id, code, name, vault_type, access_level_required, is_active, created_at, updated_at;
    `,
    [
      id,
      data.storeId,
      data.code,
      data.name,
      vaultType,
      accessLevelRequired,
      isActive,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to create vault record");
  }

  return mapRowToVault(row);
}

/**
 * Retrieves a vault by its primary key ID.
 */
export async function getVaultById(
  id: string,
  clientOverride?: Queryable,
): Promise<Vault | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<VaultRow>(
    `
    SELECT id, store_id, code, name, vault_type, access_level_required, is_active, created_at, updated_at
    FROM vaults
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToVault(row) : null;
}

/**
 * Retrieves a vault by store ID and vault code.
 */
export async function getVaultByCode(
  storeId: string,
  code: string,
  clientOverride?: Queryable,
): Promise<Vault | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<VaultRow>(
    `
    SELECT id, store_id, code, name, vault_type, access_level_required, is_active, created_at, updated_at
    FROM vaults
    WHERE store_id = $1 AND code = $2;
    `,
    [storeId, code],
  );

  const row = result.rows[0];
  return row ? mapRowToVault(row) : null;
}

/**
 * Lists all vaults belonging to a specific store branch.
 */
export async function listVaultsByStore(
  storeId: string,
  clientOverride?: Queryable,
): Promise<Vault[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<VaultRow>(
    `
    SELECT id, store_id, code, name, vault_type, access_level_required, is_active, created_at, updated_at
    FROM vaults
    WHERE store_id = $1
    ORDER BY code ASC;
    `,
    [storeId],
  );

  return result.rows.map(mapRowToVault);
}

/**
 * Creates a new Locker (Entity 33) inside a parent Vault.
 * Enforces Invariant INV-05: Locker store_id must match parent Vault store_id.
 */
export async function createLocker(
  data: {
    id?: string;
    vaultId: string;
    storeId: string;
    code: string;
    name: string;
    lockerNumber: string;
    capacityRating?: string | null;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Locker> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const isActive = data.isActive ?? true;

  // Pre-validate store_id against parent vault (INV-05)
  const parentVault = await getVaultById(data.vaultId, clientOverride);
  if (!parentVault) {
    throw new UnprocessableEntityError(
      `Parent vault '${data.vaultId}' does not exist`,
      "ERR_VAULT_NOT_FOUND",
    );
  }
  if (parentVault.storeId !== data.storeId) {
    throw new UnprocessableEntityError(
      `Store mismatch: Locker store_id '${data.storeId}' does not match parent Vault store_id '${parentVault.storeId}' (INV-05)`,
      "ERR_STORAGE_STORE_MISMATCH",
    );
  }

  try {
    const result = await executor.query<LockerRow>(
      `
      INSERT INTO lockers (
        id, vault_id, store_id, code, name, locker_number, capacity_rating, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, vault_id, store_id, code, name, locker_number, capacity_rating, is_active, created_at, updated_at;
      `,
      [
        id,
        data.vaultId,
        data.storeId,
        data.code,
        data.name,
        data.lockerNumber,
        data.capacityRating ?? null,
        isActive,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to create locker record");
    }

    return mapRowToLocker(row);
  } catch (err: any) {
    if (err.constraint === "fk_lockers_vault_store") {
      throw new UnprocessableEntityError(
        "Store placement mismatch between locker and parent vault (INV-05)",
        "ERR_STORAGE_STORE_MISMATCH",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a locker by primary key ID.
 */
export async function getLockerById(
  id: string,
  clientOverride?: Queryable,
): Promise<Locker | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<LockerRow>(
    `
    SELECT id, vault_id, store_id, code, name, locker_number, capacity_rating, is_active, created_at, updated_at
    FROM lockers
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToLocker(row) : null;
}

/**
 * Lists all lockers within a parent vault.
 */
export async function listLockersByVault(
  vaultId: string,
  clientOverride?: Queryable,
): Promise<Locker[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<LockerRow>(
    `
    SELECT id, vault_id, store_id, code, name, locker_number, capacity_rating, is_active, created_at, updated_at
    FROM lockers
    WHERE vault_id = $1
    ORDER BY code ASC;
    `,
    [vaultId],
  );

  return result.rows.map(mapRowToLocker);
}

/**
 * Lists all lockers in a store branch.
 */
export async function listLockersByStore(
  storeId: string,
  clientOverride?: Queryable,
): Promise<Locker[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<LockerRow>(
    `
    SELECT id, vault_id, store_id, code, name, locker_number, capacity_rating, is_active, created_at, updated_at
    FROM lockers
    WHERE store_id = $1
    ORDER BY code ASC;
    `,
    [storeId],
  );

  return result.rows.map(mapRowToLocker);
}

/**
 * Creates a new physical Compartment slot (Entity 34) inside a parent Locker.
 * Enforces Invariant INV-05: Compartment store_id must match parent Locker store_id.
 */
export async function createCompartment(
  data: {
    id?: string;
    lockerId: string;
    storeId: string;
    code: string;
    name: string;
    compartmentNumber: string;
    maxWeightCapacityGrams?: number | null;
    maxItemCapacity?: number | null;
    isActive?: boolean;
  },
  clientOverride?: Queryable,
): Promise<Compartment> {
  const executor = clientOverride ?? getPool();
  const id = data.id ?? uuidv7();
  const isActive = data.isActive ?? true;

  // Pre-validate store_id against parent locker (INV-05)
  const parentLocker = await getLockerById(data.lockerId, clientOverride);
  if (!parentLocker) {
    throw new UnprocessableEntityError(
      `Parent locker '${data.lockerId}' does not exist`,
      "ERR_LOCKER_NOT_FOUND",
    );
  }
  if (parentLocker.storeId !== data.storeId) {
    throw new UnprocessableEntityError(
      `Store mismatch: Compartment store_id '${data.storeId}' does not match parent Locker store_id '${parentLocker.storeId}' (INV-05)`,
      "ERR_STORAGE_STORE_MISMATCH",
    );
  }

  try {
    const result = await executor.query<CompartmentRow>(
      `
      INSERT INTO compartments (
        id, locker_id, store_id, code, name, compartment_number,
        max_weight_capacity_grams, max_item_capacity, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, locker_id, store_id, code, name, compartment_number,
                max_weight_capacity_grams, max_item_capacity, is_active, created_at, updated_at;
      `,
      [
        id,
        data.lockerId,
        data.storeId,
        data.code,
        data.name,
        data.compartmentNumber,
        data.maxWeightCapacityGrams ?? null,
        data.maxItemCapacity ?? null,
        isActive,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to create compartment record");
    }

    return mapRowToCompartment(row);
  } catch (err: any) {
    if (err.constraint === "fk_compartments_locker_store") {
      throw new UnprocessableEntityError(
        "Store placement mismatch between compartment and parent locker (INV-05)",
        "ERR_STORAGE_STORE_MISMATCH",
      );
    }
    throw err;
  }
}

/**
 * Retrieves a compartment by primary key ID.
 */
export async function getCompartmentById(
  id: string,
  clientOverride?: Queryable,
): Promise<Compartment | null> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<CompartmentRow>(
    `
    SELECT id, locker_id, store_id, code, name, compartment_number,
           max_weight_capacity_grams, max_item_capacity, is_active, created_at, updated_at
    FROM compartments
    WHERE id = $1;
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapRowToCompartment(row) : null;
}

/**
 * Lists all compartments inside a parent locker.
 */
export async function listCompartmentsByLocker(
  lockerId: string,
  clientOverride?: Queryable,
): Promise<Compartment[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<CompartmentRow>(
    `
    SELECT id, locker_id, store_id, code, name, compartment_number,
           max_weight_capacity_grams, max_item_capacity, is_active, created_at, updated_at
    FROM compartments
    WHERE locker_id = $1
    ORDER BY code ASC;
    `,
    [lockerId],
  );

  return result.rows.map(mapRowToCompartment);
}

/**
 * Lists all compartments across a store branch.
 */
export async function listCompartmentsByStore(
  storeId: string,
  clientOverride?: Queryable,
): Promise<Compartment[]> {
  const executor = clientOverride ?? getPool();
  const result = await executor.query<CompartmentRow>(
    `
    SELECT id, locker_id, store_id, code, name, compartment_number,
           max_weight_capacity_grams, max_item_capacity, is_active, created_at, updated_at
    FROM compartments
    WHERE store_id = $1
    ORDER BY code ASC;
    `,
    [storeId],
  );

  return result.rows.map(mapRowToCompartment);
}

/**
 * Computes live occupancy metrics and status chips for a compartment.
 */
export function computeCompartmentOccupancy(
  comp: Compartment,
  itemCount: number = 0,
): CompartmentWithOccupancy {
  const max = comp.maxItemCapacity;
  let occupancyPercentage: number | null = null;
  let status: CompartmentOccupancyStatus = "AVAILABLE";

  if (max !== null && max > 0) {
    occupancyPercentage = Math.min(100, Math.round((itemCount / max) * 100));
    if (occupancyPercentage >= 100) {
      status = "FULL";
    } else if (occupancyPercentage >= 80) {
      status = "NEAR_CAPACITY";
    } else {
      status = "AVAILABLE";
    }
  } else {
    status = "UNLIMITED";
  }

  return {
    ...comp,
    occupiedItemCount: itemCount,
    occupancyPercentage,
    status,
  };
}

/**
 * Retrieves the complete 3-Tier Storage Hierarchy tree for a store branch
 * with real-time compartment occupancy metrics (INV-05, INV-17).
 * Vault -> Lockers -> Compartments
 */
export async function getStorageHierarchy(
  storeId: string,
  clientOverride?: Queryable,
  occupancyMap?: Map<string, number>,
): Promise<VaultHierarchyWithOccupancy[]> {
  const vaults = await listVaultsByStore(storeId, clientOverride);
  const lockers = await listLockersByStore(storeId, clientOverride);
  const compartments = await listCompartmentsByStore(storeId, clientOverride);

  // If no occupancyMap provided, query active pieces if inventory_items exists, or default to 0
  let counts = occupancyMap;
  if (!counts) {
    counts = new Map<string, number>();
    const executor = clientOverride ?? getPool();
    try {
      const invCheck = await executor.query<{
        current_compartment_id: string;
        item_count: string;
      }>(
        `
        SELECT current_compartment_id, COUNT(*)::text as item_count
        FROM inventory_items
        WHERE store_id = $1 AND current_compartment_id IS NOT NULL AND status != 'RETIRED'
        GROUP BY current_compartment_id;
        `,
        [storeId],
      );
      for (const row of invCheck.rows) {
        counts.set(row.current_compartment_id, Number(row.item_count));
      }
    } catch {
      // inventory_items table not created yet (Phase 0 Sprint 5)
    }
  }

  // Map compartments into locker ID buckets with calculated occupancy
  const compartmentsByLocker = new Map<string, CompartmentWithOccupancy[]>();
  for (const comp of compartments) {
    const itemCount = counts.get(comp.id) ?? 0;
    const compWithOcc = computeCompartmentOccupancy(comp, itemCount);
    const list = compartmentsByLocker.get(comp.lockerId) ?? [];
    list.push(compWithOcc);
    compartmentsByLocker.set(comp.lockerId, list);
  }

  // Map lockers into vault ID buckets with their nested compartments
  const lockersByVault = new Map<string, LockerHierarchyWithOccupancy[]>();
  for (const locker of lockers) {
    const lockerHierarchy: LockerHierarchyWithOccupancy = {
      ...locker,
      compartments: compartmentsByLocker.get(locker.id) ?? [],
    };
    const list = lockersByVault.get(locker.vaultId) ?? [];
    list.push(lockerHierarchy);
    lockersByVault.set(locker.vaultId, list);
  }

  // Build the vault hierarchy root array
  return vaults.map((vault) => ({
    ...vault,
    lockers: lockersByVault.get(vault.id) ?? [],
  }));
}
