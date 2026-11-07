# Changelog

All notable changes to the **JewelCore-ERP** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.8.0] - 2026-11-07

### Added

- **Customer Master, Profiles & KYC (`FEAT-SALES-01`, Entity 48)**:
  - Created `customers` table (Entity 48) with organization-scoped unique customer codes, contact details, Canadian postal and tax identifiers, dynamic tags, notes, and lifecycle status (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
  - Implemented `createCustomer`, `updateCustomer`, `getCustomerById`, and `listCustomers` repository methods with multi-tenant boundary isolation.
  - Seeded permissions: `customers:create`, `customers:view`, `customers:update`.
  - Implemented REST API endpoints:
    - `POST /api/v1/sales/customers` (`customers:create`) - Register new customer profile.
    - `GET /api/v1/sales/customers` (`customers:view`) - List customers with search, tag, and status filtering.
    - `GET /api/v1/sales/customers/:id` (`customers:view`) - Retrieve customer profile by ID.
    - `PATCH /api/v1/sales/customers/:id` (`customers:update`) - Update customer contact details and tags.

- **Sales Invoices & Serialized Line Items (`FEAT-SALES-02`, Entities 49 & 50)**:
  - Created `sales_invoices` (Entity 49) and `sales_invoice_items` (Entity 50) tables.
  - Supported multi-line serialized jewellery piece sales, granular tax calculations (Canadian HST/PST), discounts, subtotal, total amount, paid amount, and balance due tracking.
  - POS Floor Reservation (`INV-08`): Atomically transitions piece `commercial_state` to `RESERVED` upon invoice creation with `SELECT ... FOR UPDATE` locking to prevent simultaneous double-selling.
  - Cancellation Workflow: Cancelling pending/draft invoices automatically releases reserved pieces back to `AVAILABLE_FOR_SALE`.
  - Seeded permissions: `sales:invoice:create`, `sales:invoice:view`, `sales:invoice:cancel`.
  - Implemented REST API endpoints:
    - `POST /api/v1/sales/invoices` (`sales:invoice:create`) - Generate new sales invoice with serialized pieces.
    - `GET /api/v1/sales/invoices` (`sales:invoice:view`) - List sales invoices with store, customer, status, and query filtering.
    - `GET /api/v1/sales/invoices/:id` (`sales:invoice:view`) - Retrieve sales invoice details with line items.
    - `POST /api/v1/sales/invoices/:id/cancel` (`sales:invoice:cancel`) - Cancel pending invoice and unreserve pieces.

- **Multi-Mode Payments & Split Tender Engine (`FEAT-SALES-03`, Entity 51)**:
  - Created `sales_payments` table (Entity 51) supporting diverse tender modes (`CASH`, `CREDIT_CARD`, `DEBIT_CARD`, `BANK_TRANSFER`, `CHEQUE`, `STORE_CREDIT`, `GIFT_CARD`).
  - Implemented split tender settlement: Allows multiple payments against an invoice until `balance_due_cad` reaches zero.
  - Enforced `INV-09` Append-Only Immutability: PostgreSQL database trigger `trg_sales_payments_immutability` guarantees that payment records cannot be altered or removed.
  - Automatic Status Progression: Invoices transition from `PENDING_PAYMENT` $\to$ `PARTIALLY_PAID` $\to$ `PAID` with overpayment protection (`ERR_PAYMENT_EXCEEDS_BALANCE`).
  - Seeded permissions: `sales:payment:record`, `sales:payment:view`.
  - Implemented REST API endpoints:
    - `POST /api/v1/sales/payments` (`sales:payment:record`) - Record payment tender against invoice.
    - `GET /api/v1/sales/payments` (`sales:payment:view`) - List payments filtered by invoice, method, and status.
    - `GET /api/v1/sales/payments/:id` (`sales:payment:view`) - Retrieve payment record by ID.

- **Atomic Sale Finalization & Custody Release Engine (`FEAT-SALES-04`)**:
  - Implemented `finalizeSaleAndReleaseCustody` transactional engine with pessimistic row locking.
  - Requires invoice to be fully settled (`status = 'PAID'`, `balance_due_cad = 0`) before custody handover.
  - Physical Custody Handover:
    - Transitions piece `commercial_state` $\to$ `SOLD` and `custody_state` $\to$ `RELEASED`.
    - Clears piece `current_compartment_id` (null) as piece leaves store custody.
    - Appends immutable `CUSTODY_DEPARTURE` movement record to `inventory_movements` (Entity 30 / `INV-09`).
    - Records state transitions in `inventory_status_history` (Entity 31) for both commercial and custody dimensions.
    - Records tamper-evident audit event in `audit_events` (Entity 36 / `FEAT-GOV-02`).
    - Stamps invoice with `released_at` timestamp and `released_by_user_id`.
  - Prevents repeated custody handover attempts with conflict rejection (`ERR_CUSTODY_ALREADY_RELEASED`).
  - Seeded permission: `sales:custody:release`.
  - Implemented REST API endpoint:
    - `POST /api/v1/sales/invoices/:id/finalize-release` (`sales:custody:release`) - Finalize sale and release custody of paid pieces.

## [0.7.0] - 2026-11-07

### Added

- **Precious Metal Spot Rates Registry (`FEAT-PRICE-01`, Entity 44)**:
  - Created `daily_market_rates` table (Entity 44) tracking precious metal spot prices (`GOLD`, `SILVER`, `PLATINUM`, `PALLADIUM`) per gram in CAD.
  - Implemented `recordDailyMarketRate`, `getLatestEffectiveRate`, and `listDailyMarketRates` repository methods with store-level overrides and corporate-wide defaults.
  - Enforced `INV-09` Append-Only Immutability: PostgreSQL database trigger `trg_daily_market_rates_immutability` strictly prohibits `UPDATE` and `DELETE` queries.
  - Seeded permissions: `pricing:rate:create`, `pricing:rate:view`, `pricing:policy:manage`, `pricing:calculate`.
  - Implemented REST API endpoints:
    - `POST /api/v1/pricing/rates` (`pricing:rate:create`) - Record and publish precious metal market spot rate.
    - `GET /api/v1/pricing/rates/latest` (`pricing:rate:view`) - Resolve effective market spot rate for metal type and store.
    - `GET /api/v1/pricing/rates` (`pricing:rate:view`) - List spot rates with metal, status, and pagination filters.
    - `GET /api/v1/pricing/rates/:id` (`pricing:rate:view`) - Retrieve spot rate by ID.

- **Making Charge Rules & Pricing Policies (`FEAT-PRICE-02`, Entity 45)**:
  - Created `pricing_policies` table (Entity 45) governing making/labour charge models (`PER_GRAM`, `FIXED_PIECE`, `PERCENTAGE_OF_METAL`), wastage percentage, hallmarking and certification fees, default margins, and minimum retail floor prices.
  - Implemented hierarchical waterfall specificity resolution: Product+Store -> Product Corporate -> Category+Store -> Category Corporate -> Store Default -> Corporate Default.
  - Seeded permission `pricing:policy:view` (granted to `SYSTEM_ADMIN`, `STORE_MANAGER`, `SALES_ASSOCIATE`, `INVENTORY_CONTROLLER`).
  - Implemented REST API endpoints:
    - `POST /api/v1/pricing/policies` (`pricing:policy:manage`) - Create pricing policy.
    - `PATCH /api/v1/pricing/policies/:id` (`pricing:policy:manage`) - Update pricing policy.
    - `GET /api/v1/pricing/policies/resolve` (`pricing:policy:view`) - Resolve applicable pricing policy via waterfall resolution.
    - `GET /api/v1/pricing/policies` (`pricing:policy:view`) - List pricing policies with filtering and pagination.
    - `GET /api/v1/pricing/policies/:id` (`pricing:policy:view`) - Lookup pricing policy by ID.

- **Gemstone Valuation Matrix (`FEAT-PRICE-03`, Entity 46)**:
  - Created `gemstone_price_matrices` table (Entity 46) providing 4Cs grading rates (carat weight bracket, cut grade, color grade, clarity grade) per carat in CAD.
  - Implemented scored specificity ranking waterfall query in PostgreSQL: exact 4Cs matches rank highest, gracefully falling back to color+clarity, clarity, or baseline carat tier brackets.
  - Seeded permissions `pricing:matrix:manage` and `pricing:matrix:view`.
  - Implemented REST API endpoints:
    - `POST /api/v1/pricing/gemstone-matrices` (`pricing:matrix:manage`) - Create valuation matrix entry.
    - `PATCH /api/v1/pricing/gemstone-matrices/:id` (`pricing:matrix:manage`) - Update matrix rate per carat.
    - `GET /api/v1/pricing/gemstone-matrices/resolve` (`pricing:matrix:view`) - Resolve best matching gemstone rate per carat.
    - `GET /api/v1/pricing/gemstone-matrices` (`pricing:matrix:view`) - List matrix entries with gemstone filtering.
    - `GET /api/v1/pricing/gemstone-matrices/:id` (`pricing:matrix:view`) - Retrieve matrix entry by ID.

- **Dynamic Price Calculator & Snapshot Engine (`FEAT-PRICE-04`, Entity 47)**:
  - Created `price_snapshots` table (Entity 47) capturing point-in-time commercial piece valuations with complete multi-component cost breakdowns.
  - Implemented mathematical valuation formula:
    - Fine metal component: $\text{net weight} \times \text{purity ratio} \times \text{24K spot rate}$.
    - Gemstones: $\sum (\text{carat weight} \times \text{resolved rate/ct})$.
    - Making charge: resolved policy $\text{PER\_GRAM} \mid \text{FIXED\_PIECE} \mid \text{PERCENTAGE\_OF\_METAL}$.
    - Wastage: metal cost $\times$ wastage $\%$.
    - Ancillary fees: hallmarking fee $+$ certification fee.
    - Cost price: metal $+$ gemstones $+$ making $+$ wastage $+$ ancillary.
    - Selling price: $\max(\text{cost price} \times (1 + \text{margin}), \text{min retail floor})$.
  - Implemented atomic piece snapshotting (`snapshotPiecePrice`) with OCC row version locking (`version = version + 1`) and automatic update of `inventory_items.cost_price_cad` and `selling_price_cad`.
  - Implemented store-wide batch revaluation (`revalueStoreInventory`) to recalculate and snapshot all sellable inventory pieces upon market spot rate shifts.
  - Implemented sales-floor simulation tool (`calculateCustomValuation`) for ad-hoc quotation without database mutations.
  - Enforced `INV-09` Append-Only Immutability: database trigger `trg_price_snapshots_immutability` strictly prohibits `UPDATE` and `DELETE` queries on `price_snapshots`.
  - Seeded permissions: `pricing:revalue` (granted to `SYSTEM_ADMIN`, `STORE_MANAGER`) and `pricing:snapshot:view` (granted to `SYSTEM_ADMIN`, `STORE_MANAGER`, `SALES_ASSOCIATE`, `INVENTORY_CONTROLLER`).
  - Implemented REST API endpoints:
    - `POST /api/v1/pricing/calculate` (`pricing:calculate`) - Simulate piece valuation or preview item calculation.
    - `POST /api/v1/pricing/items/:id/snapshot` (`pricing:calculate`) - Calculate, store immutable snapshot, and update inventory piece prices.
    - `POST /api/v1/pricing/revalue-store` (`pricing:revalue`) - Batch revalue all inventory items in a store branch.
    - `GET /api/v1/pricing/items/:id/snapshots` (`pricing:snapshot:view`) - View historical price snapshot ledger for a piece.
    - `GET /api/v1/pricing/snapshots` (`pricing:snapshot:view`) - List price snapshots with store and pagination filters.
    - `GET /api/v1/pricing/snapshots/:id` (`pricing:snapshot:view`) - Retrieve single snapshot and breakdown by ID.

## [0.6.0] - 2026-11-07

### Added

- **Immutable Compliance Audit Trail Engine (`FEAT-GOV-02` / `INV-09`, Entity 40)**:
  - Created `audit_events` table (Entity 40) managing tamper-evident regulatory compliance and security audit logs across operational mutations.
  - Implemented `recordAuditEvent`, `getAuditEventById`, and `listAuditEvents` repository methods capturing actor, client IP address, dotted action verb, resource reference, reason, and prior/post JSON state snapshots.
  - Enforced `INV-09` Append-Only Immutability: PostgreSQL database trigger `trg_audit_events_immutability` strictly prohibits `UPDATE` and `DELETE` operations on `audit_events`.
  - Seeded permission `audit:read` (granted to `SYSTEM_ADMIN` and `STORE_MANAGER`) and strictly rejected unauthorized access attempts (e.g. `SALES_ASSOCIATE`) with 403 Forbidden (`ERR_INSUFFICIENT_PERMISSIONS`).
  - Implemented REST API endpoints mounted under `/api/v1/governance`:
    - `POST /api/v1/governance/audit-events` (`audit:read`) - Capture point-in-time material mutation audit event.
    - `GET /api/v1/governance/audit-events/:id` (`audit:read`) - Retrieve compliance audit event by ID with tenant boundary isolation.
    - `GET /api/v1/governance/audit-events` (`audit:read`) - Query and filter compliance audit events with pagination and resource/date criteria.
  - Added full OpenAPI 3.0 path definitions and request/response schemas.
  - Added comprehensive repository and API integration tests (9 test cases passing).

- **Async RFID Print & Encoding Worker Adapter (`FEAT-RFID-03`, Entities 37, 38 & 43)**:
  - Created `rfid_jobs` table (Entity 37) managing batch print and transponder encoding queues with status tracking (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`) and aggregate item metrics (`total_items`, `completed_items`, `failed_items`).
  - Created `rfid_job_items` table (Entity 38) tracking granular piece encoding status (`PENDING`, `ENCODED`, `FAILED`), hardware error messages, retry counts, and bound tag references.
  - Implemented transactional outbox event emission (`rfid.job.created`) into `outbox_events` (Entity 43 - `FEAT-FOUND-04`) inside the same atomic database transaction as job creation.
  - Implemented hardware isolation via `RfidPrinterAdapter` interface and `SimulatedRfidPrinterAdapter` with failure injection for transient disconnect testing.
  - Implemented `executeRfidJobWorker` with exponential backoff retry (up to 3 attempts), automatic tag master creation (`createRfidTag`), and piece binding (`assignRfidTag`).
  - Seeded permissions: `rfid:encode` (granted to `SYSTEM_ADMIN`, `STORE_MANAGER`, `INVENTORY_CONTROLLER`) and `rfid:jobs:view` (granted to `SYSTEM_ADMIN`, `STORE_MANAGER`, `INVENTORY_CONTROLLER`, `SALES_ASSOCIATE`).
  - Implemented REST API endpoints mounted under `/api/v1/rfid`:
    - `POST /api/v1/rfid/jobs` (`rfid:encode`) - Create and enqueue batch RFID print and encoding job.
    - `GET /api/v1/rfid/jobs/:id` (`rfid:view`) - Retrieve batch job header and progress by ID.
    - `GET /api/v1/rfid/jobs/:id/items` (`rfid:view`) - List granular items for a batch job.
    - `GET /api/v1/rfid/jobs` (`rfid:view`) - List batch jobs with status and store filtering.
    - `POST /api/v1/rfid/jobs/:id/process` (`rfid:encode`) - Trigger synchronous or worker execution with exponential backoff and transient failure retry.
  - Added OpenAPI 3.0 path definitions and schemas.
  - Added comprehensive repository and API integration tests (12 test cases passing).

- **Commercial Stock Approval & Availability Gate (`FEAT-GOV-01` / `INV-01`, Entity 39)**:
  - Created `stock_approvals` table (Entity 39) managing managerial stock approval authorization and gating commercial availability for finished inventory pieces.
  - Enforced `INV-01` Commercial Availability Quad-Prerequisite Gate: finished pieces can only transition to `commercial_state = 'AVAILABLE_FOR_SALE'` if:
    1. `quality_state = 'QC_APPROVED'` (analytical metrology inspection approved).
    2. `custody_state IN ('IN_VAULT', 'IN_DISPLAY')` (piece is physically secured in an authorized store vault or display case).
    3. Active RFID tag transponder bound (`rfid_tag_assignments` active record exists).
  - Enforced `INV-08` Root Aggregate Row Locking: approval mutations lock the parent piece row using `SELECT ... FOR UPDATE` on `inventory_items`.
  - Enforced `INV-11` Multi-Store Boundary Isolation: cross-store approval attempts are rejected with 403 Forbidden (`ERR_STORE_ACCESS_DENIED`).
  - Enforced `INV-09` Append-Only Immutability: database trigger `trg_stock_approvals_immutability` strictly prohibits `UPDATE` and `DELETE` queries against `stock_approvals`.
  - Automatically records dual-dimension audit trail in `inventory_status_history` on approval:
    - `APPROVAL` dimension: `DRAFT` / `PENDING_APPROVAL` -> `APPROVED` (or `REJECTED`).
    - `COMMERCIAL` dimension: `UNREADY` -> `AVAILABLE_FOR_SALE` (or maintained in `UNREADY`).
  - Seeded permissions: `stock:approve` (granted to `SYSTEM_ADMIN`, `STORE_MANAGER`) and `stock:view` (granted to `SYSTEM_ADMIN`, `STORE_MANAGER`, `INVENTORY_CONTROLLER`, `SALES_ASSOCIATE`).
  - Implemented REST API endpoints mounted under `/api/v1/governance`:
    - `POST /api/v1/governance/stock-approvals` (`stock:approve`) - Authorize managerial stock approval or rejection.
    - `GET /api/v1/governance/stock-approvals/:id` (`stock:view`) - Retrieve stock approval record by ID.
    - `GET /api/v1/governance/stock-approvals` (`stock:view`) - List stock approvals with item, status, store, and pagination filters.
    - `GET /api/v1/governance/items/:itemId/latest-approval` (`stock:view`) - Retrieve latest stock approval for a piece.
  - Added full OpenAPI 3.0 path documentation and schemas.
  - Added comprehensive repository and API integration tests (17 test cases passing).

- **Single-Active Tag Binding & Detachment Lifecycle (`FEAT-RFID-02` / `INV-03`, `INV-04`, `INV-07`, Entity 36)**:
  - Created `rfid_tag_assignments` table (Entity 36) managing the full auditable lifecycle binding of an RFID tag transponder to a physical serialized jewellery item.
  - Enforced `INV-03`: Single Active Tag per Serialized Item via partial unique index `uq_rfid_tag_assignments_active_item` on `(inventory_item_id) WHERE status = 'ACTIVE'`.
  - Enforced `INV-04`: Single Active Item per Tag Transponder via partial unique index `uq_rfid_tag_assignments_active_tag` on `(rfid_tag_id) WHERE status = 'ACTIVE'`.
  - Enforced `INV-08` Root Aggregate Row Locking: all tag assignment and detachment mutations serialize on the parent piece using `SELECT ... FOR UPDATE` on `inventory_items`.
  - Prohibits binding terminal transponders (status `RETIRED` or `DAMAGED`) with 422 Unprocessable Entity (`ERR_TAG_TERMINAL_STATUS`).
  - Automatically activates and encodes unencoded tags (`status = 'UNENCODED' -> 'ACTIVE'`) and sets `encoded_at` timestamp upon piece binding.
  - Enforced `INV-07` Automatic Commercial Availability Reversion: retiring or detaching an active tag from an item in `AVAILABLE_FOR_SALE` commercial state automatically reverts `commercial_state = 'UNREADY'`, increments item OCC `version`, and writes an immutable audit record to `inventory_status_history`.
  - Implemented REST API endpoints:
    - `POST /api/v1/rfid/assignments` (`rfid:write`) - Bind RFID tag to serialized piece.
    - `PATCH /api/v1/rfid/assignments/:id/retire` (`rfid:write`) - Retire/detach tag assignment with reason (`DAMAGED`, `DETACHED`, `ITEM_SOLD`, `RETURN_TO_VENDOR`).
    - `GET /api/v1/rfid/assignments/:id` (`rfid:view`) - Retrieve assignment by ID.
    - `GET /api/v1/rfid/assignments` (`rfid:view`) - List assignments with item, tag, status, and pagination filters.
    - `GET /api/v1/rfid/items/:itemId/assignment` (`rfid:view`) - Retrieve current active assignment for an item.
  - Added full OpenAPI 3.0 path definitions and request/response schemas.
  - Added comprehensive repository and API integration tests (24 test cases passing).

- **EPC Tag Master Registry & Lifecycle (`FEAT-RFID-01`, Entity 35)**:
  - Created `rfid_tags` table (Entity 35) providing global hardware transponder tracking with unique EPC constraint per tenant (`(organization_id, epc) UNIQUE`).
  - Supported multi-band transponder frequencies (`UHF_860_960_MHZ`, `HF_13_56_MHZ`, `NFC`) and TID tracking with indexing.
  - Implemented tag lifecycle state machine (`UNENCODED` -> `ACTIVE` -> `RETIRED` / `DAMAGED`), strictly preventing transitions out of terminal statuses (`RETIRED`, `DAMAGED`) and rejecting no-op updates with descriptive error codes.
  - Automatically records lifecycle timestamps (`encoded_at` when activated, `retired_at` when retired/damaged).
  - Seeded fine-grained permissions: `rfid:write` (granted to `SYSTEM_ADMIN`, `STORE_MANAGER`, `INVENTORY_CONTROLLER`) and `rfid:view` (granted to `SYSTEM_ADMIN`, `STORE_MANAGER`, `INVENTORY_CONTROLLER`, `SALES_ASSOCIATE`).
  - Implemented REST API endpoints mounted under `/api/v1/rfid`:
    - `POST /api/v1/rfid/tags` (`rfid:write`) - Register new transponder tag.
    - `GET /api/v1/rfid/tags` (`rfid:view`) - List tags with status, EPC substring, and pagination filters.
    - `GET /api/v1/rfid/tags/:id` (`rfid:view`) - Retrieve tag by primary UUID or EPC string with multi-tenant scoping.
    - `PATCH /api/v1/rfid/tags/:id/status` (`rfid:write`) - Update lifecycle status with state machine validation.
  - Added full OpenAPI 3.0 path documentation and schemas.
  - Added comprehensive repository and API integration tests (25 test cases passing).

## [0.5.0] - 2026-11-07

### Added

- **Multi-Dimensional State History & OCC Concurrency Engine (`FEAT-INV-04` / `INV-08`, Entity 31)**:
  - Created `inventory_status_history` table (Entity 31) establishing an append-only transition audit log across the 4 orthogonal state dimensions: `QUALITY`, `APPROVAL`, `CUSTODY`, and `COMMERCIAL`.
  - Implemented database trigger `trg_inventory_status_history_immutability` enforcing strict append-only audit immutability (`INV-09`), prohibiting `UPDATE` and `DELETE` operations with SQLSTATE `23514`.
  - Enforced Root Aggregate Row Locking (`INV-08`): state mutation requests serialize on the parent `inventory_items` row using `SELECT ... FOR UPDATE`, eliminating concurrent interleaving and lost updates.
  - Enforced Optimistic Concurrency Control (OCC): updates verify `expectedVersion` matches the current version, incrementing `version = version + 1` upon success and rejecting stale concurrent transactions with 409 Conflict (`ERR_OCC_VERSION_MISMATCH`).
  - Implemented Commercial Readiness Gate (`ERR_COMMERCIAL_STATE_INVALID_PREREQUISITE`, 422): transitioning commercial state to `AVAILABLE_FOR_SALE` strictly requires `quality_state = 'QC_APPROVED'`, `approval_state = 'APPROVED'`, and `custody_state IN ('IN_VAULT', 'IN_DISPLAY')`.
  - Seeded permission `inventory:state:update` and mapped to `SYSTEM_ADMIN`, `STORE_MANAGER`, and `INVENTORY_CONTROLLER`.
  - Implemented REST API endpoints:
    - `PATCH /api/v1/inventory/items/:id/state` (`inventory:state:update`)
    - `GET /api/v1/inventory/items/:id/history` (`inventory:view`)
    - `GET /api/v1/inventory/status-history` (`inventory:view`)
  - Integrated OpenAPI 3.1 documentation for state update schemas and history endpoints.
  - Added comprehensive repository and API integration tests (24 test cases passing).

- **Unified Custody Movement Ledger (`FEAT-INV-03` / `INV-09`, `INV-13`, `INV-16`, Entity 30)**:
  - Created `inventory_movements` table (Entity 30) establishing an immutable audit ledger of every internal physical custody transfer across the store storage hierarchy.
  - Supported comprehensive `MovementType` operations: `INTAKE_PLACEMENT`, `VAULT_TRANSFER`, `DISPLAY_PLACEMENT`, `RETURN_TO_VAULT`, `AUDIT_ADJUSTMENT`, and `CUSTODY_DEPARTURE`.
  - Enforced `INV-09` append-only audit immutability via database trigger `trg_inventory_movements_immutability`, strictly prohibiting `UPDATE` and `DELETE` operations with SQLSTATE `23514`.
  - Enforced `INV-13` destination compartment consistency:
    - Mandatory compartment (`to_compartment_id IS NOT NULL`) when transferring to compartment custody states (`IN_VAULT`, `IN_DISPLAY`).
    - Mandatory null compartment (`to_compartment_id IS NULL`) when departing or staged in non-compartment states (`INTAKE_STAGING`, `IN_TRANSIT`, `MISSING`, `RELEASED`).
  - Enforced `INV-16` movement SKU and item coherence via database trigger `trg_inventory_movements_sku_coherence` and service validation (`ERR_MOVEMENT_SKU_MISMATCH`, 422).
  - Enforced strict serialized movement constraint: movements referencing `inventory_item_id` strictly require `quantity = 1` (`chk_movements_serialized_qty`).
  - Atomic piece updates: atomically updates `inventory_items` piece's `current_compartment_id`, `custody_state`, and increments OCC `version` under an exclusive root lock (`FOR UPDATE`).
  - Atomic bulk balance adjustments: atomically decrements source balance and increments/upserts destination balance for non-serialized batch components with insufficient balance guard (`ERR_INSUFFICIENT_STOCK_BALANCE`, 422).
  - Enforced store boundary and multi-store isolation (`INV-11`): cross-store compartment rejection (`ERR_COMPARTMENT_STORE_MISMATCH`, 422) and store-context scoping (`ERR_STORE_ACCESS_DENIED`, 403).
  - Wired permission `inventory:transfer` to movement execution and `inventory:view` to ledger lookup and filtered listing.
  - Implemented REST API endpoints:
    - `POST /api/v1/inventory/movements` (`inventory:transfer`)
    - `GET /api/v1/inventory/movements/:id` (`inventory:view`)
    - `GET /api/v1/inventory/movements` (`inventory:view`)
  - Integrated OpenAPI 3.1 documentation for movement schemas and endpoints.
  - Added comprehensive repository and API integration tests (25 test cases passing).

- **Bulk Quantity-Batch Stock Balances (`FEAT-INV-02` / `BIZ-Q02`, Entity 29)**:
  - Created `inventory_stock_balances` table (Entity 29) to manage non-serialized components (earring backs, findings, loose pearls, packaging) per `(store_id, product_sku_id, compartment_id)`.
  - Enforced `INV-06` tracking type gate restricting stock balances strictly to `QUANTITY_BATCH` SKUs (`ERR_INVALID_TRACKING_TYPE`, 422).
  - Enforced distinct non-negative check constraints: `quantity_on_hand >= 0`, `quantity_reserved >= 0`, and `quantity_on_hand >= quantity_reserved` (`chk_stock_balances_qty_available`).
  - Implemented PostgreSQL generated stored column: `quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED`.
  - Implemented Optimistic Concurrency Control (OCC) version checking on balance updates (`ERR_OCC_VERSION_MISMATCH`, 409).
  - Seeded permission `inventory:write` and mapped to `SYSTEM_ADMIN`, `STORE_MANAGER`, and `INVENTORY_CONTROLLER`.
  - Implemented REST API endpoints:
    - `POST /api/v1/inventory/balances` (`inventory:write`)
    - `GET /api/v1/inventory/balances` (`inventory:view`)
    - `GET /api/v1/inventory/balances/:id` (`inventory:view`)
    - `PATCH /api/v1/inventory/balances/:id` (`inventory:write`)
  - Integrated OpenAPI 3.1 documentation for balance endpoints and schemas.
  - Configured `fileParallelism: false` in `vitest.config.ts` ensuring deterministic, race-condition-free database integration test execution.
  - Added comprehensive repository and API integration tests (24 test cases passing).

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
