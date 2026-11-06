# Changelog

All notable changes to the **JewelCore-ERP** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-11-06

### Added
- **Master Data Taxonomy Tree (`FEAT-TAX-01`)**:
  - Implemented product classification hierarchy across `categories` (Entity 10) and `subcategories` (Entity 11).
  - Added recursive tree aggregation endpoint `GET /api/v1/taxonomy/tree`.
- **Precious Metals & Purity Registry (`FEAT-TAX-02`)**:
  - Implemented precious metal master `materials` (Entity 12) for Gold (`AU`), Platinum (`PT`), and Silver (`AG`).
  - Implemented alloy purity standards `purities` (Entity 13) strictly enforcing the **`DEC-05` metrological precision standard**:
    - Purity Percentage: `NUMERIC(7, 4)` ($0.0000\%$ to $100.0000\%$).
    - Purity Ratio: `NUMERIC(5, 4)` ($0.0000$ to $1.0000$).
- **Gemstone Master Classification Registry (`FEAT-TAX-03`)**:
  - Implemented `gemstones` (Entity 14) supporting `PRECIOUS`, `SEMI_PRECIOUS`, and `ORGANIC_PEARL`.
  - Added physical mineral attributes: Mohs hardness (`NUMERIC(3, 1)`), Refractive Index (`NUMERIC(4, 3)`), and Specific Gravity (`NUMERIC(4, 2)`).
- **Product Master Styles & Design Catalog (`FEAT-TAX-04`)**:
  - Implemented `products` (Entity 15) design style templates linking Category, Subcategory, Material, and Default Purity.
  - Enforced candidate business key `(organization_id, product_code)` isolation.
- **Commercial Variant SKUs & Gemstone Specs (`FEAT-TAX-05`)**:
  - Implemented `product_skus` (Entity 16) with candidate business key `(organization_id, sku_code)` and check constraint `target_gross_weight_grams >= target_metal_weight_grams`.
  - Enforced **`INV-06` Tracking Type Immutability**: SKUs inherit `tracking_type` (`SERIALIZED` vs `QUANTITY_BATCH`) from parent style upon creation; subsequent modification attempts abort with `422 Unprocessable Entity` (`ERR_TRACKING_TYPE_IMMUTABLE`).
  - Implemented `product_gemstone_specs` (Entity 17) for multi-stone Bill of Materials per SKU with carat weight scales (`NUMERIC(8, 4)`) and primary stone designations.
- **Supplier Master & Profiles (`FEAT-PROC-01`)**:
  - Implemented `suppliers` (Entity 18) vendor directory with settlement currency codes, commercial payment terms (`NET_30`, `CONSIGNMENT`), and tax identifiers.
  - Seeded domain permissions `procurement:write` and `procurement:read`.
- **Interactive OpenAPI 3.0 & Swagger UI Documentation**:
  - Automated OpenAPI schema generation using `@asteasolutions/zod-to-openapi` directly derived from `@jewelcore/shared` Zod schemas.
  - Interactive Swagger UI mounted at `/api-docs` and raw spec at `/api-docs/openapi.json`.

---

## [0.1.0] - 2026-11-06

### Added
- **Monorepo Foundation & Build Tooling (`FEAT-FOUND-01`)**:
  - Initialized pnpm monorepo with workspace packages (`@jewelcore/shared`, `@jewelcore/database`, `@jewelcore/api`, `@jewelcore/worker`, `apps/web`).
  - Configured Turborepo, TypeScript, ESLint, Prettier, and Vitest test runners.
- **Database Connection & Transaction Engine (`FEAT-FOUND-02`)**:
  - Production PostgreSQL connection pool harness with isolated transaction execution engine (`withTransaction`).
  - RFC 9562 UUIDv7 generator (`uuidv7`) for k-sorted surrogate primary keys.
  - Deterministic schema migration harness with tracking in `schema_migrations`.
- **Centralized Logging & Error Handling (`FEAT-FOUND-03`)**:
  - Structured JSON logging using Pino with correlation ID propagation (`X-Correlation-Id`).
  - Centralized RFC 7807 Problem Details error handler returning `application/problem+json`.
- **Transactional Outbox & Async Worker (`FEAT-FOUND-04`)**:
  - Outbox schema contracts and BullMQ Redis background worker pipeline.
- **Organizations & Store Branches (`FEAT-IAM-01`)**:
  - Multi-tenant enterprise foundation supporting multiple store branches per organization (`BIZ-Q01` Option A).
- **User Accounts & Authentication Engine (`FEAT-IAM-02`)**:
  - User identity engine with Argon2id password hashing and stateless JWT bearer token authentication (`/api/v1/auth/login`, `/register`, `/me`).
- **RBAC Roles & Granular Permissions (`FEAT-IAM-03`)**:
  - Built-in system roles (`SUPER_ADMIN`, `STORE_MANAGER`, `QC_TECHNICIAN`, `VAULT_OFFICER`, `SALES_ASSOCIATE`) backed by 20+ granular permissions.
- **Memberships & Multi-Branch Custody Isolation (`FEAT-IAM-04` / `INV-11`)**:
  - Scoped branch memberships with database constraint enforcing at most one default store per organization.
  - Store-context switching middleware enforcing physical custody boundaries via `X-Store-Id` header.
- **3-Tier Physical Storage Hierarchy (`FEAT-STOR-01` / `INV-05` / `INV-17`)**:
  - Modeled high-security storage containers: **Vaults $\rightarrow$ Lockers $\rightarrow$ Compartments**.
  - Enforced composite physical storage constraints `(store_id, vault_id)` and `(store_id, locker_id)` to prevent cross-store physical containment leakage.
- **Compartment Directory & Visualizer UI (`FEAT-STOR-02`)**:
  - Hierarchical storage directory endpoint `/api/v1/storage/directory` aggregating real-time occupancy.
  - Next.js 15 visual storage directory dashboard.
