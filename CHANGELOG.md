# Changelog

All notable changes to the **JewelCore-ERP** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Serialized Piece Birth & Lineage Integrity (`FEAT-INV-01` / `INV-14`, Entity 28)**:
  - Created `inventory_items` table (Entity 28) establishing physical piece identity and immutable lineage linking back to approved QC inspections.
  - Enforced `INV-14` birth certificate immutability via database trigger `trg_inventory_items_birth_lineage`, prohibiting mutations to `quality_check_item_id`.
  - Enforced single-birth guarantee: 1:0..1 constraint on `quality_check_item_id UNIQUE` preventing duplicate item creation (`ERR_DUPLICATE_ITEM_BIRTH`, 409).
  - Enforced organization-scoped unique serial number constraint `(organization_id, serial_number) UNIQUE`.
  - Enforced `INV-06` tracking type gate: serialized piece birth is strictly restricted to SKUs with `tracking_type = 'SERIALIZED'`, rejecting batch SKUs (`QUANTITY_BATCH`) with 422 `ERR_INVALID_TRACKING_TYPE`.
  - Enforced `INV-02` weight physics constraint `chk_inventory_items_weight_physics` ensuring `gross_weight_grams >= net_weight_grams > 0`.
  - Implemented decoupled 4-orthogonal state dimensions initialized at birth:
    - `quality_state = 'QC_APPROVED'`
    - `approval_state = 'DRAFT'`
    - `custody_state = 'IN_VAULT'`
    - `commercial_state = 'UNREADY'`
  - Enforced store-context scoping and multi-store isolation (`INV-11`): compartment store boundary verification (`ERR_COMPARTMENT_STORE_MISMATCH`, 422) and cross-store session isolation (`ERR_STORE_ACCESS_DENIED`, 403).
  - Seeded permission `inventory:create` granted to `SYSTEM_ADMIN`, `STORE_MANAGER`, and `INVENTORY_CONTROLLER`.
  - Implemented REST API endpoints:
    - `POST /api/v1/inventory/items/birth` (`inventory:create`)
    - `GET /api/v1/inventory/items/:id` (`inventory:view`)
    - `GET /api/v1/inventory/items` (`inventory:view`)
  - Integrated OpenAPI 3.1 documentation for inventory schemas and endpoints.
  - Added comprehensive repository and API integration tests (25 test cases passing).

## [0.4.0] - 2026-11-07

### Added

- **Quality Decision Authorization & Damage-Waiver Protocol (`FEAT-QC-06` / `INV-09`, `INV-18` Tier D, Gap 3)**:
  - Implemented immutable `quality_decisions` (Entity 27) append-only audit trail capturing formal inspection outcomes (`APPROVED`, `REJECTED`, `ESCALATED_FOR_REINSPECTION`).
  - Enforced `INV-09` append-only immutability via database trigger `trg_quality_decisions_immutability`, strictly prohibiting `UPDATE` and `DELETE` operations with SQLSTATE `23514`.
  - Implemented Supervisor Damage Waiver protocol (`INV-18` Tier D / Gap 3):
    - Items with detected physical damage (`damage_detected = true`) strictly require `reason_code = 'DAMAGE_WAIVER'` and mandatory non-empty justification notes.
    - Authorized supervisor override permission `qc:waiver` seeded in migration `00020_create_qc_decisions` and granted to `STORE_MANAGER` and `SYSTEM_ADMIN`.
    - Non-supervisors attempting to approve damaged pieces are rejected with 403 `ERR_SUPERVISOR_WAIVER_REQUIRED`.
    - Approvals without `reason_code = 'DAMAGE_WAIVER'` or missing notes on damaged items fail with 422 `ERR_DAMAGE_WAIVER_REQUIRED`.
  - Implemented piece-level and session-level decision endpoints:
    - `POST /api/v1/qc/items/:id/decisions` (`qc:approve` permission)
    - `GET /api/v1/qc/items/:id/decisions` (`qc:view` permission)
    - `POST /api/v1/qc/checks/:id/decisions` (`qc:approve` permission)
    - `GET /api/v1/qc/checks/:id/decisions` (`qc:view` permission)
  - Enforced multi-store isolation (`INV-11` / `ERR_STORE_ACCESS_DENIED`, 403) and sealed session immutability (`ERR_SESSION_SEALED`, 422).
  - Registered all decision schemas and endpoints in OpenAPI 3.1 documentation.
- **Intake Weight Tolerance & Discrepancy Gate (`FEAT-QC-05` / `INV-12`)**:
  - Implemented configurable intake weight discrepancy evaluation engine:
    - Default $\pm 0.0200\text{g}$ absolute tolerance threshold under `BIZ-Q03` baseline.
    - Automatic clearance for within-tolerance pieces ($\Delta \le \pm 0.0200\text{g}$), updating `shipment_items.reconciliation_status = 'MATCHED'` and enabling piece approval.
    - Out-of-tolerance discrepancy escrow ($\Delta > \pm 0.0200\text{g}$), flagging `shipment_items.reconciliation_status = 'DISCREPANCY'` and blocking automated approval (`ERR_WEIGHT_TOLERANCE_EXCEEDED`, 422).
    - Strict fail-closed missing weight protocol: manifest lines with missing declared gross weight (`NULL`) flag discrepancy and block automated approval (`ERR_MISSING_DECLARED_WEIGHT`, 422).
    - Authorized administrative override: permission `qc:tolerance:admin` seeded in migration `00019_create_qc_tolerance_permissions` to authorize discrepancy overrides with audit justification, while rejecting unauthorized override attempts with 403 (`ERR_INSUFFICIENT_PERMISSIONS`).
    - Sealed session immutability gate: tolerance evaluation on sealed sessions rejected with 422 (`ERR_SESSION_SEALED`).
  - Added endpoint `POST /api/v1/qc/items/:id/tolerance-check` with active store-context scoping (`INV-11`) and OpenAPI 3.1 schema registration.
- **QC Item 3VL Inspection & Completeness Gate (`FEAT-QC-04`)**:
  - Implemented piece-level 3VL (Three-Valued Logic) quality inspection workflows for `quality_check_items` (Entity 24):
    - Rigorous 3VL boolean predicates (`hallmark_verified IS TRUE`, `visual_inspection_passed IS TRUE`) preventing unperformed inspections (`NULL` evaluating to `UNKNOWN`) from passing approval.
    - Tier B row-local physical invariants (`net_weight_grams <= gross_weight_grams`, positive weights `INV-02`, damage notes mandatory if damage detected).
    - Tier C transactional balance verification: approval strictly requires at least one certified `GROSS_WEIGHT` measurement in `weight_measurements` (`ERR_MISSING_SCALE_OBSERVATION`, 422).
    - Tier D operational supervisor damage waiver: approval of items with `damage_detected = true` requires explicit supervisor waiver authorization (`ERR_DAMAGE_WAIVER_REQUIRED`, 422).
    - Sealed session immutability gate: mutating items in `SEALED` inspection sessions rejected with 422 (`ERR_SESSION_SEALED`).
  - Implemented endpoints `PUT /api/v1/qc/items/:id`, `PATCH /api/v1/qc/items/:id` (`qc:inspect` permission) and `GET /api/v1/qc/checks/:id/items` (`qc:view` permission) with RFC 7807 error format and OpenAPI 3.1 documentation.
- **Mounted Gemstone Carat Parcel Grading (`FEAT-QC-03`)**:
  - Implemented `item_gemstones` (Entity 26) mounted stone and parcel grading engine:
    - Supported stone types: `PRIMARY_SOLITAIRE`, `ACCENT_MELEE`, and `PARCEL`.
    - Enforced single-stone invariant on primary solitaires (`chk_item_gemstones_solitaire`: `stone_type != 'PRIMARY_SOLITAIRE' OR stone_count = 1`).
    - Stored gemstone carat weights under `DEC-05` standard (`NUMERIC(8, 4)` carats).
  - Implemented `quality_check_items` (Entity 24) piece-level technical inspection table with 3VL checks and weight physics constraints.
  - Implemented Net Metal Weight Calculation formula:
    $$\text{Net} = \text{Gross} - \text{Tare} - \text{Stones} \quad (1\text{ carat} = 0.2000\text{ grams})$$
    with automatic atomic synchronization on gemstone additions.
  - Created endpoints `POST /api/v1/qc/items/:id/gemstones` and `GET /api/v1/qc/items/:id/gemstones` with RBAC authorization (`qc:measure` and `qc:view`), store-context isolation (`INV-11`), and sealed session protection (`ERR_SESSION_SEALED`, 422).
- **Analytical Balance Metrology (`FEAT-QC-02`)**:
  - Implemented `weight_measurements` (Entity 25) analytical balance scale reading ingestion with generated stored `net_weight` column.
  - Enforced `INV-09` append-only immutability via PostgreSQL trigger `trg_weight_measurements_immutability`.
  - Added endpoint `POST /api/v1/qc/measurements` with `qc:measure` permission check and positive weight physics validation (`INV-02`).
- **Quality Inspection Sessions (`FEAT-QC-01`)**:
  - Implemented `quality_checks` (Entity 23) inspection session headers with candidate key `(shipment_id, session_sequence_number)`.
  - Enforced Sealed Session Immutability Gate (`ERR_SESSION_SEALED`, 422) and OCC concurrency.

---

## [0.3.0] - 2026-11-07

### Added

- **Goods Receipt Notes (GRN) Lifecycle (`FEAT-PROC-02`)**:
  - Implemented `goods_receipt_notes` (Entity 19) lifecycle engine with status states `DRAFT` and `CLOSED`.
  - Enforced `INV-06` immutability guarantee: closed GRNs lock inbound manifests and reject subsequent mutations with `422 Unprocessable Entity` (`ERR_GRN_IMMUTABLE`).
- **Inbound Shipments & Manifest Line Items (`FEAT-PROC-03`)**:
  - Implemented `shipments` (Entity 20) with carrier tracking codes, gross package weights, and unique numbers per organization.
  - Implemented `shipment_items` (Entity 21) Bill of Lading manifests strictly conforming to **`DEC-05` metrological precision standard**:
    - Declared Gross Weight: `NUMERIC(10, 4)` grams.
    - Declared Net Weight: `NUMERIC(10, 4)` grams.
    - Measured Gross Intake Weight: `NUMERIC(10, 4)` grams.
  - Implemented Optimistic Concurrency Control (OCC) version tracking (`version` counter) on line item revisions.
- **Receiving Staff Assignment & Handoff (`FEAT-PROC-04`)**:
  - Implemented `staff_assignments` (Entity 22) operational custody delegation linking receiving technicians, inspectors, and approvers.
  - Enforced **`INV-19` Contextual Parent Consistency**: Staff assignments scoped to a shipment must verify that the shipment belongs to the referenced GRN (`ERR_ASSIGNMENT_GRN_MISMATCH`).
- **Polymorphic Document & Object Storage (`FEAT-GOV-03`)**:
  - Implemented `file_objects` (Entity 41) metadata registry with SHA-256 cryptographic digests, byte length extraction, and S3-compatible key paths.
  - Implemented `file_associations` (Entity 42) polymorphic linkage connecting attachments (supplier invoices, assay certificates, intake defect photos) to any domain entity with primary document designation (`is_primary = TRUE`).
  - Implemented `ObjectStorageProvider` abstraction with in-memory provider and HMAC-signed presigned retrieval URLs.
  - Added cryptographic verification endpoint (`/api/v1/files/:id/verify`) guaranteeing zero checksum drift.
  - Enforced strict MIME type whitelisting, rejecting disallowed executables with `400 Bad Request` (`ERR_UNSUPPORTED_MIME_TYPE`).
- **CI/CD Concurrency & Database Advisory Locking**:
  - Integrated PostgreSQL session-level advisory locks (`pg_advisory_lock`) in migration runner preventing catalog DDL race conditions during parallel Vitest execution in GitHub Actions CI.
  - Added Vitest `globalSetup` to execute schema migrations deterministically prior to test worker initialization.

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
