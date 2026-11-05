import {
  type CreateOrganizationInput,
  type CreateStoreInput,
  type Organization,
  type Store,
  ConflictError,
  NotFoundError,
} from "@jewelcore/shared";
import {
  createOrganization,
  getOrganizationById,
  getOrganizationByCode,
  listOrganizations,
  createStore,
  getStoreById,
  getStoreByCode,
  listStoresByOrganization,
  listAllStores,
} from "@jewelcore/database";

export async function createOrganizationService(
  input: CreateOrganizationInput,
): Promise<Organization> {
  const existing = await getOrganizationByCode(input.code);
  if (existing) {
    throw new ConflictError(
      `Organization with code '${input.code}' already exists`,
      "ERR_DUPLICATE_ORG_CODE",
    );
  }

  return createOrganization(input);
}

export async function getOrganizationService(id: string): Promise<Organization> {
  const org = await getOrganizationById(id);
  if (!org) {
    throw new NotFoundError("Organization", id);
  }
  return org;
}

export async function listOrganizationsService(): Promise<Organization[]> {
  return listOrganizations();
}

export async function createStoreService(input: CreateStoreInput): Promise<Store> {
  // 1. Verify parent organization exists
  const parentOrg = await getOrganizationById(input.organizationId);
  if (!parentOrg) {
    throw new NotFoundError("Organization", input.organizationId);
  }

  // 2. Check for code collision
  const existingStore = await getStoreByCode(input.code);
  if (existingStore) {
    throw new ConflictError(
      `Store with code '${input.code}' already exists`,
      "ERR_DUPLICATE_STORE_CODE",
    );
  }

  // 3. Persist store
  return createStore(input);
}

export async function getStoreService(id: string): Promise<Store> {
  const store = await getStoreById(id);
  if (!store) {
    throw new NotFoundError("Store", id);
  }
  return store;
}

export async function listStoresService(organizationId?: string): Promise<Store[]> {
  if (organizationId) {
    return listStoresByOrganization(organizationId);
  }
  return listAllStores();
}
