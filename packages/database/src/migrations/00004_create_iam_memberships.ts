import type { MigrationDefinition } from "../migrator.js";

export const migration00004CreateIamMemberships: MigrationDefinition = {
  name: "00004_create_iam_memberships",
  up: `
    -- 1. Organization Memberships table (Entity 4)
    CREATE TABLE IF NOT EXISTS organization_memberships (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_organization_memberships UNIQUE (organization_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON organization_memberships(organization_id);
    CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON organization_memberships(user_id);

    -- 2. Store Memberships table (Entity 5)
    CREATE TABLE IF NOT EXISTS store_memberships (
      id UUID PRIMARY KEY,
      organization_membership_id UUID NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      is_default BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_store_memberships UNIQUE (organization_membership_id, store_id)
    );

    CREATE INDEX IF NOT EXISTS idx_store_memberships_org_membership_id ON store_memberships(organization_membership_id);
    CREATE INDEX IF NOT EXISTS idx_store_memberships_store_id ON store_memberships(store_id);

    -- Enforce invariant: at most one active default store per organization membership
    CREATE UNIQUE INDEX IF NOT EXISTS uq_store_memberships_single_default
      ON store_memberships(organization_membership_id)
      WHERE is_default = true AND is_active = true;

    -- 3. Membership Roles table (Entity 9)
    CREATE TABLE IF NOT EXISTS membership_roles (
      id UUID PRIMARY KEY,
      store_membership_id UUID NOT NULL REFERENCES store_memberships(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_membership_roles UNIQUE (store_membership_id, role_id)
    );

    CREATE INDEX IF NOT EXISTS idx_membership_roles_store_membership_id ON membership_roles(store_membership_id);
    CREATE INDEX IF NOT EXISTS idx_membership_roles_role_id ON membership_roles(role_id);
  `,
  down: `
    DROP TABLE IF EXISTS membership_roles CASCADE;
    DROP TABLE IF EXISTS store_memberships CASCADE;
    DROP TABLE IF EXISTS organization_memberships CASCADE;
  `,
};
