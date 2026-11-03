# Jewellery ERP Platform — Feature Acceptance Criteria Specification

**Document Version:** 1.1  
**Status:** Engineering Execution Baseline — Milestone 0.3.2 Deliverable  
**Date:** 2026-11-03  
**Authors:** Principal Software Architect, Senior QA Engineer, Senior Backend Engineer, Security Engineer  
**Project:** Jewellery ERP Platform (`jewellery-erp-platform`)  
**Repository:** `/home/prasanta/Documents/projects/JewelCore-ERP`

**Authoritative Baseline References:**

- [`docs/implementation/FEATURE_IMPLEMENTATION_MASTER_PLAN.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_IMPLEMENTATION_MASTER_PLAN.md) (v1.1)
- [`docs/implementation/FEATURE_DELIVERY_STANDARD.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_DELIVERY_STANDARD.md) (v1.1)
- [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) (v0.3.3)
- [`docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md) (v1.2.2)

---

## 1. Structure of Acceptance Criteria

Every feature in the Jewellery ERP Platform must satisfy rigorous, unambiguous acceptance criteria formatted in standard Gherkin syntax (`Given / When / Then`). Each scenario is paired with concrete verification assertions covering:

1. **Happy Path Functional Flow**
2. **Negative & Boundary Validation (Zod & HTTP Statuses)**
3. **Security, RBAC & Contextual ABAC Authorization (`INV-11` Multi-Store Isolation; cross-referenced in [`docs/implementation/FEATURE_DELIVERY_STANDARD.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_DELIVERY_STANDARD.md#4-feature-to-authorization-coverage-matrix-rbac--contextual-abac))**
4. **Data Integrity & Metrological Invariants (`INV-01` to `INV-19`)**
5. **Concurrency, OCC Versioning & Row Locking (`INV-08`)**
6. **Audit Trail & Transactional Outbox Delivery (`INV-09`, `INV-10`)**

---

## 2. Platform Foundation (`FOUND`) Acceptance Criteria

### `FEAT-FOUND-01`: Monorepo Architecture & Build Scaffolding

- **Scenario 1: Clean Monorepo Build**  
  _Given_ a clean checkout of the repository,  
  _When_ `pnpm install` and `pnpm build` are executed,  
  _Then_ all workspaces (`apps/web`, `apps/api`, `apps/worker`, `packages/shared`) compile under TypeScript strict mode with zero errors.
- **Scenario 2: Containerized Local Orchestration**  
  _Given_ Docker Engine is running,  
  _When_ `docker compose up -d` is executed,  
  _Then_ PostgreSQL 18 and Redis 7 start, bind to configured ports, pass health checks, and accept TCP client connections.

### `FEAT-FOUND-02`: Database Connectivity, Transaction Engine & Migration Harness

- **Scenario 1: Atomic Transaction Commit**  
  _Given_ an active PostgreSQL connection pool,  
  _When_ a business mutation executes inside `withTransaction` and succeeds,  
  _Then_ all SQL operations commit permanently and the connection is safely released back to the pool.
- **Scenario 2: Automatic Transaction Rollback on Error**  
  _Given_ an active PostgreSQL transaction,  
  _When_ an unhandled exception or SQL error occurs within the transaction block,  
  _Then_ a `ROLLBACK` is immediately executed and no partial database mutations persist.
- **Scenario 3: Native UUIDv7 Primary Key Monotonicity**  
  _Given_ the UUIDv7 generator utility,  
  _When_ 10,000 UUIDs are generated sequentially in a tight loop,  
  _Then_ every identifier is unique and sorts chronologically in strict binary/string ascending order.

### `FEAT-FOUND-03`: Centralized Error Handling, Logging & RFC 7807 Standard

- **Scenario 1: RFC 7807 Problem Details Response**  
  _Given_ an incoming HTTP request causing a known business validation failure,  
  _When_ the controller throws `ValidationError`,  
  _Then_ the response status is `400 Bad Request`, `Content-Type` is `application/problem+json`, and the body contains `type`, `title`, `status`, `detail`, `code`, and `requestId`.
- **Scenario 2: Correlation ID Propagation in Logs**  
  _Given_ an incoming request with header `x-request-id: req_12345`,  
  _When_ processing proceeds through middleware, controllers, and services,  
  _Then_ all Pino structured log entries include `"requestId": "req_12345"` and the HTTP response echoes header `x-request-id`.

### `FEAT-FOUND-04`: Transactional Outbox Engine & BullMQ Worker Baseline

- **Scenario 1: Atomic Outbox Emission (`INV-10`)**  
  _Given_ a business mutation committing within a database transaction,  
  _When_ an event is published via the outbox service,  
  _Then_ a row is inserted into `outbox_events` with `status = 'PENDING'` inside the exact same transaction.
- **Scenario 2: Reliable BullMQ Dispatch & Idempotency**  
  _Given_ pending rows in `outbox_events`,  
  _When_ the outbox polling worker executes,  
  _Then_ events are enqueued into BullMQ, marked `DISPATCHED`, and duplicate queue arrivals are ignored by the worker.
- **Scenario 3: Outbox Worker Failure Handling & Dead-Letter Queue (DLQ)**  
  _Given_ an enqueued event that encounters transient downstream dispatch failures,  
  _When_ BullMQ worker exceeds maximum 3 retry attempts with exponential backoff,  
  _Then_ the event status transitions to `FAILED`, the payload is preserved in the DLQ, and an alert is emitted to structured error logs.

---

## 3. Identity & Access Management (`IAM`) Acceptance Criteria

### `FEAT-IAM-01`: Organization Root & Branch Store Scaffolding

- **Scenario 1: Organization & Store Scaffolding**  
  _Given_ an authorized Executive user,  
  _When_ `POST /api/v1/iam/organizations` is invoked with valid name, code, and default currency `CAD`,  
  _Then_ an organization is created, and sub-stores (e.g. `STORE001` Showroom, `VAULT001` Vault Hub) can be created referencing that organization.
- **Scenario 2: Store Code Uniqueness**  
  _Given_ an existing store with `code = 'STORE001'`,  
  _When_ another store is created with `code = 'STORE001'`,  
  _Then_ the request is rejected with `409 Conflict` and code `ERR_DUPLICATE_STORE_CODE`.
- **Scenario 3: Unauthorized Organization/Store Creation Rejection**  
  _Given_ a user without `iam:admin` permission,  
  _When_ attempting `POST /api/v1/iam/organizations` or `POST /api/v1/iam/stores`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-IAM-02`: User Account Management & Authentication Integration

- **Scenario 1: User Registration & Argon2id Password Hashing**  
  _Given_ valid user registration data,  
  _When_ a user account is created,  
  _Then_ the password hash starts with `$argon2id$`, raw passwords are never logged, and initial status is `ACTIVE`.
- **Scenario 2: JWT Issuance and Verification**  
  _Given_ valid user credentials,  
  _When_ `POST /api/v1/iam/auth/login` is executed,  
  _Then_ an HTTP-only refresh cookie and a short-lived access JWT containing `userId` and `orgId` are returned.
- **Scenario 3: Invalid Authentication Credentials & Brute-Force Rejection**  
  _Given_ invalid password credentials for an existing user account,  
  _When_ `POST /api/v1/iam/auth/login` is attempted,  
  _Then_ the request is rejected with `401 Unauthorized` (`ERR_INVALID_CREDENTIALS`) and repeated failures trigger temporary rate-limiting.

### `FEAT-IAM-03`: Role-Based Access Control (RBAC) & Granular Permission Matrix

- **Scenario 1: Permitted Action Execution**  
  _Given_ a user possessing role `INVENTORY_CONTROLLER` with permission `inventory:transfer`,  
  _When_ invoking `POST /api/v1/inventory/movements`,  
  _Then_ authorization succeeds and the handler executes.
- **Scenario 2: Unauthorized Action Rejection**  
  _Given_ a user possessing role `SALES_ASSOCIATE` without permission `qc:approve`,  
  _When_ invoking `POST /api/v1/qc/items/{id}/approve`,  
  _Then_ the request is rejected immediately with `403 Forbidden` and code `ERR_INSUFFICIENT_PERMISSIONS`.

### `FEAT-IAM-04`: Organization & Store Memberships with Store-Context Switching (`INV-11`)

- **Scenario 1: Valid Store-Context Header Resolution**  
  _Given_ a user assigned to stores `STORE001` and `STORE002`,  
  _When_ sending request with `x-store-id: <STORE001_UUID>`,  
  _Then_ the request context binds `currentStoreId` to `STORE001`.
- **Scenario 2: Cross-Store Access Rejection**  
  _Given_ a user NOT assigned to `STORE003`,  
  _When_ sending request with `x-store-id: <STORE003_UUID>`,  
  _Then_ the request is rejected with `403 Forbidden` and code `ERR_STORE_ACCESS_DENIED`.

---

## 4. Storage Hierarchy & Vault Custody (`STORAGE`) Acceptance Criteria

### `FEAT-STOR-01`: Physical Storage Hierarchy (`INV-05`, `INV-17`)

- **Scenario 1: Valid 3-Tier Hierarchy Creation**  
  _Given_ an authorized Store Manager at `STORE001`,  
  _When_ creating Vault `V1`, Locker `L1` inside `V1`, and Compartment `C1` inside `L1`,  
  _Then_ all three entities share `store_id = STORE001` and hierarchical foreign keys resolve.
- **Scenario 2: Mismatched Store Placement Rejection (`INV-05`)**  
  _Given_ Vault `V1` located in `STORE001`,  
  _When_ creating Locker `L2` inside `V1` with `store_id = STORE002`,  
  _Then_ the database constraint or service validation rejects the insert with `422 Unprocessable Entity` (`ERR_STORAGE_STORE_MISMATCH`).
- **Scenario 3: Unauthorized Storage Hierarchy Creation Rejection**  
  _Given_ a user with role `SALES_ASSOCIATE` without `storage:write` permission,  
  _When_ attempting `POST /api/v1/storage/vaults`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-STOR-02`: Compartment Allocation & Store Storage Directory UI

- **Scenario 1: Real-Time Occupancy Visualizer**  
  _Given_ Compartment `C1` housing 5 active pieces,  
  _When_ the storage directory UI renders,  
  _Then_ `C1` displays current occupancy count, capacity percentage, and link to resident inventory items.
- **Scenario 2: Cross-Store Storage Directory Access Rejection (`INV-11`)**  
  _Given_ an operator assigned strictly to `STORE001`,  
  _When_ requesting the storage directory for `STORE002` via `x-store-id: <STORE002>`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_STORE_ACCESS_DENIED`).

---

## 5. Master Data Taxonomy (`TAXONOMY`) Acceptance Criteria

### `FEAT-TAX-01`: Product Categories & Subcategories

- **Scenario 1: Recursive Category Tree**  
  _Given_ root Category `Rings`,  
  _When_ creating Subcategory `Solitaire Rings` with `parent_category_id = Rings.id`,  
  _Then_ the subcategory is created and category code uniqueness is enforced within the parent scope.
- **Scenario 2: Duplicate Category Code Rejection**  
  _Given_ an existing category with `code = 'RINGS'`,  
  _When_ attempting to create another category with `code = 'RINGS'`,  
  _Then_ the uniqueness constraint aborts the insert with `409 Conflict` (`ERR_DUPLICATE_CATEGORY_CODE`).
- **Scenario 3: Unauthorized Category Creation Rejection**  
  _Given_ a user without `taxonomy:write` permission,  
  _When_ attempting `POST /api/v1/taxonomy/categories`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-TAX-02`: Precious Metal Materials & Purity Registry (`DEC-05`)

- **Scenario 1: Purity Decimal Integrity**  
  _Given_ Material `Gold`,  
  _When_ creating Purity `18K` with `purity_percentage = 75.0000` and `purity_ratio = 0.7500`,  
  _Then_ the values are stored in `NUMERIC(7, 4)` and `NUMERIC(5, 4)` without floating-point truncation.
- **Scenario 2: Purity Exceeding 100% Rejection**  
  _Given_ an attempt to register purity `105.0000%`,  
  _When_ validated by Zod and DB check constraint,  
  _Then_ the insert is rejected with `400 Bad Request` (`purity_percentage <= 100.0000`).
- **Scenario 3: Unauthorized Metal/Purity Registration Rejection**  
  _Given_ a user without `taxonomy:write` permission,  
  _When_ attempting `POST /api/v1/taxonomy/materials`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-TAX-03`: Gemstone Master Registry

- **Scenario 1: Valid Gemstone Classification Master Registration**  
  _Given_ an authorized Taxonomy Administrator with `taxonomy:write` permission,  
  _When_ registering gemstone classification with `code = 'GEM-DIA'`, `name = 'Natural Diamond'`, `gemstone_type = 'PRECIOUS'`, and `default_measurement_unit = 'CARAT'`,  
  _Then_ the gemstone classification record is persisted in `gemstones` with `is_active = TRUE` and candidate business key `(organization_id, code)` enforced per LDM Entity 14.
- **Scenario 2: Duplicate Gemstone Code Rejection**  
  _Given_ an existing gemstone classification with `code = 'GEM-DIA'` within the active organization,  
  _When_ attempting to register another gemstone classification with identical `code = 'GEM-DIA'`,  
  _Then_ the uniqueness constraint aborts the insert with `409 Conflict` (`ERR_DUPLICATE_GEMSTONE_CODE`).
- **Scenario 3: Invalid Gemstone Type Enumeration Rejection**  
  _Given_ a gemstone registration payload with unsupported `gemstone_type = 'SYNTHETIC_PLASTIC'`,  
  _When_ validated against the allowed domain enumeration (`PRECIOUS`, `SEMI_PRECIOUS`, `ORGANIC_PEARL`),  
  _Then_ Zod schema validation rejects the request with `400 Bad Request` (`ERR_INVALID_GEMSTONE_TYPE`).
- **Scenario 4: Unauthorized Gemstone Registration Rejection**  
  _Given_ a user with role `SALES_ASSOCIATE` without `taxonomy:write` permission,  
  _When_ attempting `POST /api/v1/taxonomy/gemstones`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-TAX-04`: Product Master Styles & Catalog Management

- **Scenario 1: Product Style Creation Linked to Category**  
  _Given_ an authorized Catalog Manager with `taxonomy:write` permission and existing Category `Rings`,  
  _When_ creating product style `Classic Solitaire` linked to category `Rings` with `gender = 'UNISEX'` and collection `2026 Bridal`,  
  _Then_ the product record is persisted with a unique product code and valid category foreign key.
- **Scenario 2: Non-Existent Category Reference Rejection**  
  _Given_ a product creation payload referencing non-existent `category_id`,  
  _When_ the database insert is attempted,  
  _Then_ foreign key validation aborts the operation with `422 Unprocessable Entity` (`ERR_CATEGORY_NOT_FOUND`).
- **Scenario 3: Duplicate Product Code Rejection**  
  _Given_ an existing product with `code = 'PROD-001'`,  
  _When_ attempting to create another product with `code = 'PROD-001'`,  
  _Then_ the insert is aborted with `409 Conflict` (`ERR_DUPLICATE_PRODUCT_CODE`).
- **Scenario 4: Unauthorized Product Style Creation Rejection**  
  _Given_ a user with role `QC_TECHNICIAN` without `taxonomy:write` permission,  
  _When_ attempting `POST /api/v1/taxonomy/products`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-TAX-05`: Commercial SKUs & Gemstone Layout Specs (`INV-06`)

- **Scenario 1: Tracking Type Immutability**  
  _Given_ an existing SKU `SKU-DIA-001` with `tracking_type = 'SERIALIZED'`,  
  _When_ an update attempts to change `tracking_type` to `'QUANTITY_BATCH'`,  
  _Then_ the service rejects the mutation with `422 Unprocessable Entity` (`ERR_TRACKING_TYPE_IMMUTABLE`).
- **Scenario 2: SKU Code Uniqueness Enforcement**  
  _Given_ an existing SKU with `sku_code = 'SKU-DIA-001'`,  
  _When_ creating another SKU with identical `sku_code = 'SKU-DIA-001'`,  
  _Then_ the insert is rejected with `409 Conflict` (`ERR_DUPLICATE_SKU_CODE`).
- **Scenario 3: Unauthorized SKU Creation Rejection**  
  _Given_ a user without `taxonomy:write` permission,  
  _When_ attempting `POST /api/v1/taxonomy/skus`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

---

## 6. Procurement & Inbound Intake (`PROCUREMENT`) Acceptance Criteria

### `FEAT-PROC-01`: Supplier Master & Commercial Profile

- **Scenario 1: Supplier Creation & Code Uniqueness**  
  _Given_ an authorized Purchasing Agent,  
  _When_ registering Supplier `De Beers Global` with code `SUP-001`,  
  _Then_ the supplier profile is persisted and duplicate codes are rejected with `409 Conflict`.
- **Scenario 2: Unauthorized Supplier Registration Rejection**  
  _Given_ a user without `procurement:write` permission,  
  _When_ attempting `POST /api/v1/procurement/suppliers`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-PROC-02`: Goods Receipt Note (GRN) Lifecycle

- **Scenario 1: GRN Creation in DRAFT State**  
  _Given_ Supplier `SUP-001` and receiving store `STORE001`,  
  _When_ creating a GRN,  
  _Then_ initial status is `DRAFT`, `received_at` defaults to current timestamp, and receiving user ID is captured.
- **Scenario 2: GRN Completion with Immutable Lock**  
  _Given_ a GRN in `RECEIVED` status with verified shipments,  
  _When_ transitioning to `COMPLETED`,  
  _Then_ the GRN is locked, and no further shipments or items may be appended.
- **Scenario 3: Unauthorized GRN Creation Rejection**  
  _Given_ a user without `procurement:write` permission,  
  _When_ attempting `POST /api/v1/procurement/grns`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-PROC-03`: Inbound Shipments & Line Items Manifest

- **Scenario 1: Line Item Declared Weight Validation**  
  _Given_ an inbound shipment manifest,  
  _When_ inserting a line item with `declared_gross_weight_grams = 15.4520`,  
  _Then_ weight is persisted with 4 decimal places ($0.0001\text{g}$) precision.
- **Scenario 2: Missing Declared Gross Weight Protocol**  
  _Given_ a manifested line item where supplier gross weight is omitted (NULL),  
  _When_ the shipment is processed for QC,  
  _Then_ the item is flagged with `missing_declared_weight = TRUE` and cannot be auto-approved in QC.
- **Scenario 3: Unauthorized Shipment Manifest Submission Rejection**  
  _Given_ a user without `procurement:write` permission,  
  _When_ attempting `POST /api/v1/procurement/shipments`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-PROC-04`: Receiving Staff Assignment (`INV-19`)

- **Scenario 1: Cross-Entity Store & GRN Match**  
  _Given_ a receiving package belonging to `GRN-100` at `STORE001`,  
  _When_ assigning receiving technician `USER-01`,  
  _Then_ `staff_assignments.goods_receipt_note_id` must match `shipment.goods_receipt_note_id`.
- **Scenario 2: Unauthorized Staff Assignment Rejection**  
  _Given_ a user without `procurement:assign` permission,  
  _When_ attempting `POST /api/v1/procurement/assignments`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

---

## 7. Quality Control & Analytical Metrology (`QC`) Acceptance Criteria

### `FEAT-QC-01`: Quality Inspection Session Scaffolding

- **Scenario 1: QC Session Creation from Received Shipment**  
  _Given_ an authorized QC Inspector with `qc:create` permission and a shipment in status `RECEIVED` at `STORE001`,  
  _When_ creating a quality inspection session via `POST /api/v1/qc/checks`,  
  _Then_ a `quality_checks` record is created with `status = 'IN_PROGRESS'`, linked to the target shipment, store, and assigned inspector identity.
- **Scenario 2: Cross-Store QC Session Creation Rejection (`INV-11`)**  
  _Given_ a shipment received at `STORE001`,  
  _When_ an inspector with active store context header `x-store-id: <STORE002>` attempts to initiate an inspection session,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_STORE_ACCESS_DENIED`).
- **Scenario 3: Unreceived Shipment Inspection Rejection**  
  _Given_ a shipment in unverified status `DRAFT`,  
  _When_ attempting to initiate a QC inspection session,  
  _Then_ the request is rejected with `422 Unprocessable Entity` (`ERR_SHIPMENT_NOT_RECEIVED`).
- **Scenario 4: Unauthorized QC Session Creation Rejection**  
  _Given_ a user with role `SALES_ASSOCIATE` without `qc:create` permission,  
  _When_ attempting `POST /api/v1/qc/checks`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).
- **Scenario 5: Sealed Session Immutability Gate**  
  _Given_ a QC session in status `FINALIZED`,  
  _When_ an inspector attempts to add new QC items or modify inspection parameters,  
  _Then_ the service aborts the mutation with `422 Unprocessable Entity` (`ERR_SESSION_SEALED`).

### `FEAT-QC-02`: Analytical Balance Scale Reading Capture (`INV-09`)

- **Scenario 1: Sub-Milligram Analytical Scale Ingestion**  
  _Given_ an analytical balance connected via serial/USB scale bridge,  
  _When_ reading `12.3456g` gross and `0.1200g` tare,  
  _Then_ a record is inserted into `weight_measurements` with `measurement_stage = 'INTAKE_RECEIVING'`, and the record is strictly immutable (no SQL `UPDATE` or `DELETE` permitted).
- **Scenario 2: Unauthorized Analytical Scale Ingestion Rejection**  
  _Given_ a user without `qc:measure` permission,  
  _When_ attempting `POST /api/v1/qc/measurements`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).
- **Scenario 3: Zero or Negative Weight Rejection (`INV-02`)**  
  _Given_ a raw scale reading payload with gross weight `0.0000g` or `-0.5000g`,  
  _When_ submitted to the measurement ingestion endpoint,  
  _Then_ Zod schema validation rejects the payload with `400 Bad Request` (`ERR_INVALID_WEIGHT_VALUE`).

### `FEAT-QC-03`: Mounted Gemstone Carat Parcel Grading

- **Scenario 1: Net Metal Weight Calculation Formula**  
  _Given_ an item with `gross_weight = 10.5000g`, `tare_weight = 0.5000g`, and mounted diamonds totaling `1.5000 ct` ($0.3000\text{g}$),  
  _When_ calculating net weight via $\text{Net} = \text{Gross} - \text{Tare} - \text{Stones}$,  
  _Then_ $\text{net\_weight\_grams} = 10.5000 - 0.5000 - 0.3000 = 9.7000\text{g}$.
- **Scenario 2: Unauthorized Gemstone Parcel Grading Rejection**  
  _Given_ a user without `qc:measure` permission,  
  _When_ attempting `POST /api/v1/qc/items/{id}/gemstones`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-QC-04`: QC Item 3VL Truth Validation & Completeness Gate (`INV-02`, `INV-15`, `INV-18`)

- **Scenario 1: Draft QC Nullability Allowed**  
  _Given_ a newly created `quality_check_items` in status `PENDING`,  
  _When_ inspection attributes (`hallmark_verified`, `visual_inspection_passed`, `verified_material_id`) are NULL,  
  _Then_ the draft record saves successfully.
- **Scenario 2: Non-Null Net Weight Without Gross Weight Rejection (3VL)**  
  _Given_ `quality_check_items` with `gross_weight_grams = NULL` and `net_weight_grams = 5.0000`,  
  _When_ attempting database insert or update,  
  _Then_ PostgreSQL constraint `chk_qc_items_weight_physics` evaluates to `FALSE` and immediately aborts the SQL mutation.
- **Scenario 3: Pre-Approval Completeness Gate Enforcement**  
  _Given_ a QC item in status `PENDING` with `hallmark_verified = NULL`,  
  _When_ a user attempts to set `status = 'APPROVED'`,  
  _Then_ constraint `chk_qc_items_approval_prerequisites` fails because `hallmark_verified IS TRUE` is not satisfied.
- **Scenario 4: Net Weight Exceeds Gross Weight Rejection**  
  _Given_ `gross_weight_grams = 10.0000` and `net_weight_grams = 12.0000`,  
  _When_ saving inspection measurements,  
  _Then_ the operation fails constraint `net_weight_grams <= gross_weight_grams`.
- **Scenario 5: Unauthorized Inspection Item Modification Rejection**  
  _Given_ a user without `qc:inspect` permission,  
  _When_ attempting `PUT /api/v1/qc/items/{id}`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-QC-05`: Intake Weight Tolerance & Discrepancy Gate (`INV-12`)

- **Scenario 1: Within-Tolerance Automatic Approval Clearance**  
  _Given_ declared weight `10.0000g` and observed gross weight `10.0100g` ($\Delta = +0.0100\text{g}$),  
  _When_ the approved absolute tolerance is $\pm 0.0200\text{g}$,  
  _Then_ tolerance evaluation passes and status remains eligible for approval.
- **Scenario 2: Out-of-Tolerance Discrepancy Escrow**  
  _Given_ declared weight `10.0000g` and observed gross weight `10.0800g` ($\Delta = +0.0800\text{g}$),  
  _When_ tolerance check executes,  
  _Then_ the line is flagged with discrepancy status, auto-approval is blocked, and investigation workflow triggers.
- **Scenario 3: Missing Declared Weight Auto-Approval Rejection**  
  _Given_ an inspection item where shipment line declared weight is NULL,  
  _When_ tolerance evaluation runs,  
  _Then_ auto-approval is blocked and the piece requires mandatory manual discrepancy resolution.
- **Scenario 4: Unauthorized Tolerance Parameter Override Rejection**  
  _Given_ a user without `qc:tolerance:admin` permission,  
  _When_ attempting to force auto-approval on an out-of-tolerance item,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-QC-06`: Quality Decision Authorization & Damage-Waiver Protocol (Gap 3)

- **Scenario 1: Standard Approval Decision Recording**  
  _Given_ a fully verified, undamaged QC item,  
  _When_ Inspector invokes `POST /api/v1/qc/items/{id}/decisions` with `decision = 'APPROVED'`,  
  _Then_ an immutable `quality_decisions` row is created, item status becomes `APPROVED`, and outbox event is emitted.
- **Scenario 2: Supervisor Damage Waiver Authorization**  
  _Given_ an item with `damage_detected = TRUE`,  
  _When_ a Store Manager with `qc:waiver` permission approves the piece with `reason_code = 'DAMAGE_WAIVER'` and justification notes,  
  _Then_ the waiver decision commits successfully.
- **Scenario 3: Unauthorized Damage Waiver Rejection**  
  _Given_ an item with `damage_detected = TRUE`,  
  _When_ a standard QC Inspector attempts approval without supervisor credentials,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_SUPERVISOR_WAIVER_REQUIRED`).

---

## 8. Physical Inventory & Custody Ledger (`INVENTORY`) Acceptance Criteria

### `FEAT-INV-01`: Serialized Inventory Piece Birth & Lineage (`INV-14`)

- **Scenario 1: Atomic Serialized Piece Birth from Approved QC Item**  
  _Given_ a `quality_check_items` record with `status = 'APPROVED'`,  
  _When_ `POST /api/v1/inventory/items/birth` is called within a transaction,  
  _Then_ a new `inventory_items` row is created with unique `serial_number`, `quality_check_item_id` bound immutably, `custody_state = 'IN_VAULT'`, `quality_state = 'QC_APPROVED'`, and `commercial_state = 'UNREADY'`.
- **Scenario 2: Duplicate Birth Rejection**  
  _Given_ a QC item that has already produced an `inventory_items` piece,  
  _When_ a second birth creation is attempted for the same `quality_check_item_id`,  
  _Then_ unique constraint `UNIQUE(quality_check_item_id)` rejects the insert with `409 Conflict`.
- **Scenario 3: Unapproved QC Item Birth Rejection**  
  _Given_ a QC item in status `PENDING` or `REJECTED`,  
  _When_ birth creation is attempted,  
  _Then_ service validation rejects the request with `422 Unprocessable Entity` (`ERR_QC_NOT_APPROVED`).
- **Scenario 4: Unauthorized Piece Birth Rejection**  
  _Given_ a user without `inventory:create` permission,  
  _When_ attempting `POST /api/v1/inventory/items/birth`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-INV-02`: Bulk Quantity-Batch Stock Balances (`BIZ-Q02`)

- **Scenario 1: Distinct Non-Negative Stock Balances**  
  _Given_ a bulk finding SKU (e.g. Earring Backings),  
  _When_ updating balances in `inventory_stock_balances`,  
  _Then_ `quantity_on_hand >= 0`, `quantity_reserved >= 0`, and `quantity_on_hand >= quantity_reserved` are strictly enforced by DB check constraints.
- **Scenario 2: Available Quantity Calculation**  
  _Given_ `quantity_on_hand = 100` and `quantity_reserved = 30`,  
  _When_ querying the stock balance,  
  _Then_ `quantity_available` returns exactly 70.
- **Scenario 3: Unauthorized Stock Balance Update Rejection**  
  _Given_ a user without `inventory:write` permission,  
  _When_ attempting to update batch balances via `POST /api/v1/inventory/balances`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-INV-03`: Unified Custody Movement Ledger (`INV-09`, `INV-13`, `INV-16`)

- **Scenario 1: Vault to Display Transfer Movement**  
  _Given_ an active item in Compartment `C1` (`IN_VAULT`),  
  _When_ transferring to Showroom Display Compartment `C2` (`IN_DISPLAY`),  
  _Then_ `inventory_movements` appends a row with `quantity = 1`, `from_compartment_id = C1`, `to_compartment_id = C2`, and item's `current_compartment_id` updates to `C2`.
- **Scenario 2: Custody Departure Compartment Consistency (`INV-13`)**  
  _Given_ an item departing store custody (`to_custody_state = 'RELEASED'`),  
  _When_ the movement is recorded,  
  _Then_ `to_compartment_id` MUST be NULL; any non-null compartment reference is rejected by DB constraint.
- **Scenario 3: Movement SKU and Item Coherence (`INV-16`)**  
  _Given_ Item `ITM-01` of SKU `SKU-A`,  
  _When_ a movement is inserted with `inventory_item_id = ITM-01` and `product_sku_id = SKU-B`,  
  _Then_ the transaction aborts with `422 Unprocessable Entity` (`ERR_MOVEMENT_SKU_MISMATCH`).
- **Scenario 4: Unauthorized Custody Transfer Rejection**  
  _Given_ a user without `inventory:transfer` permission,  
  _When_ attempting `POST /api/v1/inventory/movements`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).
- **Scenario 5: Cross-Store Custody Transfer Rejection (`INV-11`)**  
  _Given_ an item located in store `STORE001`,  
  _When_ an operator authenticated with store context header `x-store-id: <STORE002>` attempts a custody transfer,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_STORE_ACCESS_DENIED`).

### `FEAT-INV-04`: Multi-Dimensional State History & OCC Concurrency (`INV-08`)

- **Scenario 1: Optimistic Concurrency Control (OCC) Version Increment**  
  _Given_ an item with `version = 3`,  
  _When_ an update commits successfully,  
  _Then_ `version` increments to 4 and a new row is appended to `inventory_status_history`.
- **Scenario 2: Concurrent Modification Lost-Update Prevention**  
  _Given_ two concurrent transactions reading item `ITM-01` at `version = 3`,  
  _When_ Transaction A commits update (`version = 4`),  
  _Then_ Transaction B attempting to commit with expected version 3 is rejected with `409 Conflict` (`ERR_OCC_VERSION_MISMATCH`).
- **Scenario 3: Root Aggregate Row Locking (`SELECT FOR UPDATE`)**  
  _Given_ simultaneous state mutation requests on item `ITM-01`,  
  _When_ both acquire `SELECT ... FOR UPDATE`,  
  _Then_ PostgreSQL forces the second transaction to wait until the first commits, preventing interleaved state corruption.
- **Scenario 4: Unauthorized Status Mutation Rejection**  
  _Given_ a user without `inventory:state:update` permission,  
  _When_ attempting manual state adjustment,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

---

## 9. RFID Infrastructure & Serialization (`RFID`) Acceptance Criteria

### `FEAT-RFID-01`: EPC Tag Master Registry & Hardware Transponder Lifecycle

- **Scenario 1: RFID Tag Registration**  
  _Given_ an authorized RFID Operator with `rfid:write` permission,  
  _When_ registering a new EPC Gen 2 tag with valid EPC URI (`urn:epc:tag:sgtin-96:3.0614141.812345.6789`) and frequency band `UHF 860-960 MHz`,  
  _Then_ the tag record is created in `rfid_tags` with initial status `UNENCODED` and tid memory bank checksum captured.
- **Scenario 2: Duplicate EPC Identifier Rejection**  
  _Given_ an existing tag with `epc = 'urn:epc:tag:sgtin-96:3.0614141.812345.6789'`,  
  _When_ attempting to register another tag with identical EPC string,  
  _Then_ the database uniqueness constraint aborts the insert with `409 Conflict` (`ERR_DUPLICATE_EPC`).
- **Scenario 3: Tag State Lifecycle Progression**  
  _Given_ a tag in status `UNENCODED`,  
  _When_ completing physical printer encoding and hardware verification,  
  _Then_ status advances to `ACTIVE` and `encoded_at` timestamp is durably set.
- **Scenario 4: Prohibited State Transition Rejection**  
  _Given_ a tag in terminal status `RETIRED`,  
  _When_ attempting to reactivate the tag back to `ACTIVE`,  
  _Then_ the state machine transition is rejected with `422 Unprocessable Entity` (`ERR_INVALID_TAG_LIFECYCLE_STATE`).
- **Scenario 5: Unauthorized Tag Registration Rejection**  
  _Given_ a user without `rfid:write` permission,  
  _When_ attempting `POST /api/v1/rfid/tags`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-RFID-02`: Single-Active Tag Binding & Detachment (`INV-03`, `INV-04`, `INV-07`)

- **Scenario 1: Active Tag Binding**  
  _Given_ Item `ITM-01` without an active tag, and unassigned RFID Tag `TAG-01`,  
  _When_ `POST /api/v1/rfid/assignments` executes,  
  _Then_ an active assignment is created, linking `TAG-01` to `ITM-01`.
- **Scenario 2: Multiple Active Tags per Item Rejection (`INV-03`)**  
  _Given_ Item `ITM-01` with active `TAG-01`,  
  _When_ attempting to bind `TAG-02` to `ITM-01` without retiring `TAG-01`,  
  _Then_ partial unique index `UNIQUE(inventory_item_id) WHERE status = 'ACTIVE'` aborts the insert with `409 Conflict`.
- **Scenario 3: Tag Reused on Another Item Rejection (`INV-04`)**  
  _Given_ `TAG-01` actively bound to `ITM-01`,  
  _When_ attempting to bind `TAG-01` to `ITM-02`,  
  _Then_ partial unique index `UNIQUE(rfid_tag_id) WHERE status = 'ACTIVE'` aborts the insert.
- **Scenario 4: Automatic Commercial Availability Reversion upon Tag Retirement (`INV-07`)**  
  _Given_ an item in `commercial_state = 'AVAILABLE_FOR_SALE'`,  
  _When_ its active RFID tag is marked `DAMAGED` or `RETIRED`,  
  _Then_ the item's `commercial_state` atomically reverts to `UNREADY` within the same transaction.
- **Scenario 5: Unauthorized Tag Assignment Rejection**  
  _Given_ a user without `rfid:write` permission,  
  _When_ attempting `POST /api/v1/rfid/assignments`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-RFID-03`: Asynchronous RFID Print & Encoding Worker Adapter

- **Scenario 1: Async RFID Job Queueing**  
  _Given_ 50 inventory pieces requiring RFID encoding,  
  _When_ creating an encoding batch job,  
  _Then_ `rfid_jobs` record is created in status `QUEUED`, 50 `rfid_job_items` are created, and an outbox event enqueues BullMQ processing.
- **Scenario 2: Hardware Printer Isolation & Retry**  
  _Given_ the RFID printer adapter experiences a transient socket disconnect,  
  _When_ the BullMQ worker executes,  
  _Then_ the job retries with exponential backoff (up to 3 attempts) before marking the job item `FAILED`.
- **Scenario 3: Unauthorized Batch Print Job Creation**  
  _Given_ a user without `rfid:encode` permission,  
  _When_ attempting `POST /api/v1/rfid/jobs`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

---

## 10. Governance, Stock Approval & Audit (`GOVERNANCE`) Acceptance Criteria

### `FEAT-GOV-01`: Commercial Stock Approval & Availability Gate (`INV-01`)

- **Scenario 1: Full Prerequisites Satisfied — AVAILABLE_FOR_SALE**  
  _Given_ an inventory item with:
  1. `quality_state = 'QC_APPROVED'`,
  2. `approval_state = 'APPROVED'`,
  3. `custody_state = 'IN_VAULT'` (or `'IN_DISPLAY'`), and
  4. an active RFID tag bound (`INV-03`),  
     _When_ `POST /api/v1/governance/stock-approvals` executes,  
     _Then_ `commercial_state` transitions to `AVAILABLE_FOR_SALE`, `stock_approvals` row is persisted, and audit event is recorded.
- **Scenario 2: Missing Active RFID Tag Rejection (`INV-01`)**  
  _Given_ an item with `quality_state = 'QC_APPROVED'`, `approval_state = 'APPROVED'`, but NO active RFID tag,  
  _When_ stock approval is attempted,  
  _Then_ the request is rejected with `422 Unprocessable Entity` (`ERR_INV_01_TAG_REQUIRED`).
- **Scenario 3: Non-Vault/Non-Display Custody Rejection (`INV-01`)**  
  _Given_ an item with `custody_state = 'IN_TRANSIT'`,  
  _When_ stock approval is attempted,  
  _Then_ the request is rejected with `422 Unprocessable Entity` (`ERR_INV_01_INVALID_CUSTODY_STATE`).
- **Scenario 4: Unauthorized Stock Approval Rejection**  
  _Given_ a user with role `SALES_ASSOCIATE` without `governance:approve` permission,  
  _When_ attempting `POST /api/v1/governance/stock-approvals`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-GOV-02`: Immutable Compliance Audit Trail Engine (`INV-09`)

- **Scenario 1: Material Mutation Audit Capture**  
  _Given_ any material state transition (stock approval, custody transfer, QC decision),  
  _When_ the transaction commits,  
  _Then_ a row is inserted in `audit_events` with actor ID, IP address, user agent, previous state JSON, new state JSON, and immutable timestamp.
- **Scenario 2: Audit Tamper Prevention**  
  _Given_ the `audit_events` table,  
  _When_ any SQL `UPDATE` or `DELETE` is executed against it,  
  _Then_ PostgreSQL rejects the operation via database trigger/rules.
- **Scenario 3: Unauthorized Audit Trail Access Rejection**  
  _Given_ a user without `audit:read` permission,  
  _When_ attempting `GET /api/v1/governance/audit-events`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

### `FEAT-GOV-03`: Polymorphic Document & File Storage

- **Scenario 1: Secure File Upload with Metadata Extraction**  
  _Given_ an authorized user with `documents:write` permission and active store context `STORE001`,  
  _When_ uploading a supplier invoice PDF via `POST /api/v1/files` with valid MIME type `application/pdf`,  
  _Then_ the binary payload is stored in S3-compatible object storage, a `file_objects` row is created with SHA-256 checksum and byte length, and a presigned retrieval URL is returned.
- **Scenario 2: Polymorphic Entity Association to Purchase Order Manifest**  
  _Given_ an existing `file_objects` record and a valid Goods Receipt Note `GRN-100`,  
  _When_ associating the file via `POST /api/v1/files/{fileId}/associations` with `entity_type = 'goods_receipt_notes'` and `entity_id = <GRN_UUID>`,  
  _Then_ a `file_associations` row is persisted with `is_primary = TRUE` and the attachment is queryable under the GRN record.
- **Scenario 3: Prohibited File MIME Type Rejection**  
  _Given_ an upload payload with disallowed executable MIME type `application/x-dosexec`,  
  _When_ submitted to `POST /api/v1/files`,  
  _Then_ Zod/service validation rejects the upload with `400 Bad Request` (`ERR_UNSUPPORTED_MIME_TYPE`).
- **Scenario 4: Cryptographic Checksum Integrity Verification**  
  _Given_ a stored file record with recorded `sha256_checksum`,  
  _When_ the file is retrieved and verified against the stored hash,  
  _Then_ the verification succeeds with zero checksum drift.
- **Scenario 5: Unauthorized Document Upload Rejection**  
  _Given_ an unauthenticated or unauthorized user without `documents:write` permission,  
  _When_ attempting file upload via `POST /api/v1/files`,  
  _Then_ the request is rejected with `403 Forbidden` (`ERR_INSUFFICIENT_PERMISSIONS`).

---

_End of Feature Acceptance Criteria Specification (v1.1)._
