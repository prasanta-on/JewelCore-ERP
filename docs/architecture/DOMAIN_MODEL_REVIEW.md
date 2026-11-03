# Jewellery ERP Platform — Quality-Audited Domain Model & Architecture Review

**Document Version:** 1.6  
**Status:** Final Quality-Audited Architecture Review & Baseline Validation  
**Date:** 2026-10-27  
**Author:** Principal Software Architect & PostgreSQL Database Architect  
**Project:** Jewellery ERP Platform  
**Repository:** `jewellery-erp-platform`  
**Target Stack:** Next.js (Web) + Express 5 & TypeScript (API/Worker) + PostgreSQL + Redis/BullMQ

---

## Document Revision History

| Version  | Date       | Author                             | Significant Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ---------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.0** | 2026-10-27 | Principal Architect                | Initial architectural review draft; identified 4-tier asset model, store isolation, and outbox needs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **v1.1** | 2026-10-27 | Principal Architect                | Removed premature adoption claims; introduced 4-scenario RFID failure model; decoupled measurement from financial precision; removed artificial percentage readiness scores.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **v1.2** | 2026-10-27 | Principal Architect & DB Architect | Reconciled decision-register contradictions; distinguished Conceptual, Logical, Physical, and DDL readiness; reassessed PK strategy against PostgreSQL 18; corrected PostgreSQL CHECK constraint claims; clarified Transactional Outbox atomicity boundaries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **v1.3** | 2026-10-27 | Principal Architect & DB Architect | Reconciled readiness verdict to `READY_FOR_LOGICAL_ERD`; unified physical DDL blockers; established UUIDv7 application generation baseline; replaced invalid join locking with aggregate-level locking protocol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **v1.4** | 2026-10-27 | Principal Architect & DB Architect | Comprehensive technical realism pass; corrected outbox delivery boundaries; formalized UUIDv7 application generation policy; corrected purity scale overflow; established 5-path locking protocol; reclassified BIZ-Q04/05/08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **v1.5** | 2026-10-27 | Principal Architect & DB Architect | **Final Precision, Concurrency, Metrology & Terminology Alignment:** <br>1. _Numeric Precision Harmonization:_ Corrected FIND-04 to decouple gemstone carat weights (`NUMERIC(8,4)`) from precious metal gram weights (`NUMERIC(10,4)`), marking all types provisional pending physical-schema approval.<br>2. _Concurrency Realism:_ Removed overbroad deadlock-free claims; specified that per-item serialization occurs when all writers acquire the parent `inventory_items` lock first; required global ID sorting for multi-item operations, partial unique indexes for single-active-assignment enforcement, and application transaction retry handling for PostgreSQL deadlocks (`40P01`).<br>3. _CHECK Constraint NULL Semantics:_ Documented that PostgreSQL CHECK constraints do not reject NULL expressions, requiring mandatory columns (`gross_weight_grams`, `net_weight_grams`, state columns) to be accompanied by `NOT NULL` constraints to guarantee completeness.<br>4. _Outbox & Tenant Alignment:_ Separated atomic PostgreSQL persistence, asynchronous BullMQ publication, at-least-once delivery under retry/recovery assumptions, and consumer idempotency as a duplicate-safety requirement; replaced "tenant index partitioning" with precise terms without implying declarative table partitioning. |
| **v1.6** | 2026-10-27 | Principal Architect & DB Architect | **PostgreSQL 18 UUIDv7 Engine Validation Alignment:** <br>1. _PostgreSQL 18 Validation Correction:_ Removed reference to non-existent `uuid_extract_variant()` function; replaced with `CHECK (uuid_extract_version(id) IS NOT NULL AND uuid_extract_version(id) = 7)`. Documented that `uuid_extract_version()` returns NULL for non-RFC-9562 variants and explicit `IS NOT NULL` prevents CHECK constraint NULL evaluation bypasses.<br>2. _PostgreSQL 14–17 Validation Clarification:_ Reconciled version and variant nibble substring checks, distinguishing version/variant checking from complete UUID internal bitfield validation.<br>3. _Enforcement Policy Agreement:_ Reaffirmed application-level generation and validation in Express 5 as primary policy, clarifying that direct SQL writes bypass application checks unless database check constraints are installed.<br>4. _Reconciled Global References:_ Cleaned up dependent statements across Executive Summary, Section 9.1, DEC-04, and TECH-DEC-06.                                                                                                                                                                                                                                                                                                       |

---

## 1. Executive Assessment

### 1.1 Purpose of This Architectural Review

This review establishes the authoritative architectural baseline for the **Jewellery ERP Platform** (`jewellery-erp-platform`), validating the business domain, structural boundaries, relational integrity rules, and physical asset lifecycle prior to producing database Entity-Relationship Diagrams (ERDs), data dictionaries, and implementation code.

The review audits two current design proposals:

- Proposal Baseline: [`docs/JEWELLERY_ERP_PHASE_0_BASELINE_v0.2.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/JEWELLERY_ERP_PHASE_0_BASELINE_v0.2.md)
- Domain Model Proposal: [`docs/JEWELLERY_ERP_DOMAIN_MODEL_v0.2.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/JEWELLERY_ERP_DOMAIN_MODEL_v0.2.md)

against the reference domain specification:

- Reference Specification: [`JEWELLERY_ERP_PROJECT_OVERVIEW.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/JEWELLERY_ERP_PROJECT_OVERVIEW.md)

### 1.2 Final Architecture & Domain Verdict

The core physical asset lifecycle—advancing inventory through **Supplier Procurement / GRN Intake**, **Item-Level Quality Control (QC)**, **Asset Identification (SKU & Serial)**, **RFID Tagging**, **Physical Storage Placement (Vault $\rightarrow$ Locker $\rightarrow$ Compartment)**, **Stock Approval**, and **Commercial Stock Availability**—is fundamentally sound and necessary for high-value jewellery asset protection.

This v1.6 review establishes critical technical corrections:

1. **Justified Readiness Verdict (`READY_FOR_LOGICAL_ERD`):** All 7 core operational domains satisfy logical modeling prerequisites. Logical Entity-Relationship Diagrams (entities, relationships, foreign key cardinalities, business keys, and orthogonal state dimensions) can proceed immediately under explicitly documented baseline assumptions. Physical DDL specifications and database migration executions remain conditionally paused pending client confirmation of physical schema parameters.
2. **PostgreSQL Concurrency & Invariant Realism:** Demonstrates that multi-table business invariants (e.g., verifying active RFID tag presence before an item becomes sellable) cannot be enforced by row-local `CHECK` constraints. Establishes a comprehensive **Root Aggregate Locking Protocol** on `inventory_items FOR UPDATE` coordinating all 5 state-changing paths (stock approval, commercial-state transitions, active tag assignment, tag retirement, and tag replacement). Operations on an individual item serialize when all writers acquire the parent lock first; multi-item operations require global lock ordering, and the application must handle deadlocks (`40P01`) via transactional retries.
3. **Coherent Primary Key Enforcement Strategy:** Standardizes on **Application-Generated UUIDv7** across all approved Express 5 write paths, stored in PostgreSQL native `uuid` columns without default clauses. Details application validation controls, explicit direct-SQL limitations, and optional database-level check constraints (leveraging PostgreSQL 18's `uuid_extract_version(id) IS NOT NULL AND uuid_extract_version(id) = 7` or PostgreSQL 14–17 version/variant substring checks), while reiterating that UUIDv7 exposes creation timestamps and must never serve as an authorization mechanism.
4. **Inventory Tracking Policy:** Formally models `tracking_type` (`SERIALIZED` vs. `QUANTITY_BATCH`) as an immutable attribute on `ProductSku`, populated at creation time from the `Product` default. Distinguishes mutable current stock balances from append-only stock movement ledgers.
5. **Transactional Outbox Clarification:** Explicitly defines the atomicity and delivery boundaries: business-state mutations and outbox-event insertions commit atomically within local PostgreSQL transactions. An outbox record alone does not guarantee queue delivery; a separate background dispatcher subsequently publishes pending events to Redis/BullMQ with at-least-once delivery under documented retry and recovery assumptions. Consumer idempotency is enforced as a separate duplicate-safety requirement. No distributed 2PC transactions exist between PostgreSQL and Redis.

### 1.3 Target Architecture Guardrails

- **Backend Framework:** **Express 5 + TypeScript** in a modular monolith structure. Historical references to NestJS decorators, modules, and guards in `JEWELLERY_ERP_PROJECT_OVERVIEW.md` are preserved strictly as reference context, **not** as implementation targets.
- **Persistence:** **PostgreSQL** is the sole authoritative source of truth for all business, transactional, and inventory states.
- **Asynchronous Execution:** **Redis + BullMQ** executes in a dedicated background worker process (`apps/worker`), strictly decoupled from HTTP request lifecycles.
- **Identity & Authorization:** OIDC/SSO authentication integrated through a clean Express middleware boundary, combined with fine-grained Role-Based Access Control (RBAC) and resource/store-scoped policies.

---

## 2. Source Document Inventory & Discrepancy Analysis

### 2.1 Document Register

| Document Identifier          | Location                                      | Version / Status           | Role in Review                                                                                                                                               |
| ---------------------------- | --------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DOC-01: Phase 0 Baseline** | `docs/JEWELLERY_ERP_PHASE_0_BASELINE_v0.2.md` | v0.2 / Draft               | **Current Design Proposal**: Defines project boundaries, engineering exit criteria, open decisions (D-01–D-12), and Core Asset Lifecycle MVP scope.          |
| **DOC-02: Domain Model**     | `docs/JEWELLERY_ERP_DOMAIN_MODEL_v0.2.md`     | v0.2 / Draft               | **Current Design Proposal**: Defines domain entities, state machines, preliminary cardinalities, and Priority 0/1 decision gates.                            |
| **DOC-03: Project Overview** | `JEWELLERY_ERP_PROJECT_OVERVIEW.md`           | Neutralized Greenfield Ref | **Historical / Reference Spec**: 129 sections detailing observed behaviors, UI screens, NestJS implementation details, UAT staging data, and domain nuances. |

### 2.2 Reconciled Document Discrepancy Matrix

The source documents contain direct tensions that cannot be silently merged. Each is recorded below with its operational consequences and architectural resolution:

```
+-------------------------------------------------------------------------------------------------------------------------------+
| Discrepancy ID | Area               | DOC-01 / DOC-02 (Proposals)     | DOC-03 (Reference Overview)     | Architectural Resolution    |
+-------------------------------------------------------------------------------------------------------------------------------+
| DISC-01        | Backend Framework  | Express 5 + TypeScript          | NestJS (Controllers, Modules,   | Express 5 is mandatory.     |
|                |                    | Modular Monolith                | Guards, Interceptors, DI)       | Translate NestJS patterns   |
|                |                    |                                 |                                 | to idiomatic Express layers |
+-------------------------------------------------------------------------------------------------------------------------------+
| DISC-02        | SKU vs. Serial No. | SKU questioned: is it 1 piece   | SKU treated as serialized item  | Decouple Catalog SKU        |
|                |                    | or batch quantity? (D-02)       | ID (e.g. B10000C2 has 10g wt)   | from Serialized Asset ID    |
+-------------------------------------------------------------------------------------------------------------------------------+
| DISC-03        | QC State Machine   | Draft -> Pending -> Approved    | Draft -> Pending -> Approved    | Treat "Published" as        |
|                |                    | or Rejected -> Handoff          | -> Rejected -> Published        | proposed handoff event      |
+-------------------------------------------------------------------------------------------------------------------------------+
| DISC-04        | Tenancy & Stores   | Organization and Store distinct | Multi-branch with store codes   | Preserve multi-tenant       |
|                |                    | SaaS vs. Multi-branch open      | (STORE001) & Head Office GUID   | compatibility in schema     |
+-------------------------------------------------------------------------------------------------------------------------------+
| DISC-05        | Gemstone In QC     | ItemGemstone captured in QC     | QC shows "No stone details",    | Formalize progressive       |
|                |                    | inspection                      | Final catalog has rich 4Cs      | gemstone enrichment         |
+-------------------------------------------------------------------------------------------------------------------------------+
```

---

## 3. Confirmed Business Requirements vs. Assumptions & Boundaries

To establish rigorous architectural boundaries, we distinguish confirmed requirements from proposed designs, unvalidated assumptions, and out-of-scope items.

### 3.1 Confirmed Business Requirements (Documented in Project Documents)

1. **End-to-End Asset Traceability:** The platform must trace every physical jewellery asset from initial supplier intake, through GRN, shipment, QC verification, SKU/RFID identification, physical vault placement, and stock approval.
2. **Multi-Store Physical Separation:** High-value inventory must be physically and logically assigned to an exact store location (`Vault -> Locker -> Compartment`).
3. **Backend-Enforced Authorization:** Every state mutation must be authorized against caller identity, active store context, and granular operational permissions (e.g., `ADMIN.PRODUCT.MASTER.CATEGORIES.CREATE`).
4. **Separation of Quality Inspection and Catalog Availability:** Creating an inventory record does not make it sellable. Passing QC and receiving explicit stock approval are mandatory gates.
5. **Damaged Tag Lifecycle:** A damaged or corrupted RFID tag must be replaceable without destroying the physical item's identity, serial number, or historical audit trail.
6. **Dual Weight Tracking:** The system must record supplier-declared weights and physically measured gross/net weights, preserving variances for auditing.

### 3.2 Proposed Designs (Engineering Recommendations Under Review)

1. **Monorepo Topology:** pnpm monorepo containing `apps/web` (Next.js), `apps/api` (Express 5), and `apps/worker` (BullMQ consumer).
2. **Four-Tier Identity Decoupling:** Separating `Product` $\rightarrow$ `ProductSku` $\rightarrow$ `InventoryItem` $\rightarrow$ `RFIDTag`.
3. **Multi-Dimensional State Matrix:** Replacing a monolithic `status` column with orthogonal dimensions: Quality State, Approval State, Physical Custody, and Commercial Availability.
4. **Transactional Outbox:** Utilizing PostgreSQL `outbox_events` to reliably dispatch asynchronous queue messages without dual-write inconsistency.

### 3.3 Assumptions Requiring Business Validation (Open Uncertainties)

1. **Serialization Scope (`BIZ-Q02`):** Assuming whether Phase 0 handles 100% serialized jewellery or must immediately scaffold physical balance tables for non-serialized findings and beads. (Does not block logical modeling).
2. **Tenancy Model (`BIZ-Q01`):** Business confirmation on whether `Organization` is strictly a corporate umbrella for one brand's branches or a multi-tenant isolation boundary for commercial SaaS. (Does not block logical modeling; handled via `organization_id` on root entities).
3. **Weight Measurement Tolerances (`BIZ-Q03`):** No source document defines the exact numerical variance (e.g., $\pm 0.01\text{g}$) that triggers an intake rejection or supervisor sign-off.
4. **Commercial Pricing & Rounding Formulas (`BIZ-Q06`, `BIZ-Q07`, `BIZ-Q08`):** Specific retail markup formulas, making charge structures (flat fee vs. per-gram rate), gemstone buyback valuation policies, and customer invoice rounding rules remain unverified and belong to deferred commercial/retail modules. In-scope Phase 0 supplier procurement line item financial precision is governed separately under `DEC-05`.

### 3.4 Out-of-Scope Capabilities (Explicitly Deferred from MVP)

- General ledger posting, journal entries, and financial-period close (Accounts module).
- Treasury operations and cash drawer balancing.
- Retail Point-of-Sale (POS) cashier checkout, customer trade-in settlement, and refund processing.
- Live automated bullion/commodity spot price feeds from external market providers.
- Real hardware RFID printing protocol integration (MVP uses a simulated/virtual adapter).
- Distributed microservices architecture, event sourcing, or distributed database topologies.

---

## 4. Proposed Architecture Assessment

### 4.1 Target Framework: Express 5 + TypeScript Modular Monolith

The decision to utilize **Express 5** replaces the historical NestJS implementation while preserving a **Modular Monolith** architecture.

```
                                  +------------------------------------+
                                  |         Next.js Frontend           |
                                  |     (React, TypeScript, Tailwind)  |
                                  +-----------------+------------------+
                                                    | HTTPS / REST / JSON
                                                    v
+----------------------------------------------------------------------------------------------------+
| Express 5 Modular Monolith (apps/api)                                                              |
|                                                                                                    |
|  [ Global Middleware: Security Headers, CORS, Rate Limit, Request Tracing, Centralized Error ]     |
|                                                                                                    |
|  [ Auth Boundary: JWT / OIDC Verification -> Resolve User, Tenant & Active Store Context ]         |
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  | Domain Modules (Feature Folders)                                                             |  |
|  |                                                                                              |  |
|  |  +---------------------+  +--------------------+  +--------------------+  +---------------+  |  |
|  |  | Identity & Access   |  | Master Data        |  | Procurement & GRN  |  | Quality Ctrl  |  |  |
|  |  | - routes            |  | - routes           |  | - routes           |  | - routes      |  |  |
|  |  | - controllers       |  | - controllers      |  | - controllers      |  | - controllers |  |  |
|  |  | - services/policies |  | - services         |  | - services         |  | - services    |  |  |
|  |  | - repositories      |  | - repositories     |  | - repositories     |  | - repos       |  |  |
|  |  +----------+----------+  +---------+----------+  +---------+----------+  +-------+-------+  |  |
|  |             |                       |                       |                     |          |  |
|  |  +----------+----------+  +---------+----------+  +---------+----------+  +-------+-------+  |  |
|  |  | Inventory & Stock   |  | RFID Tracking      |  | Storage & Vault    |  | Audit & Docs  |  |  |
|  |  | - routes            |  | - routes           |  | - routes           |  | - routes      |  |  |
|  |  | - controllers       |  | - controllers      |  | - controllers      |  | - controllers |  |  |
|  |  | - services          |  | - queue producer   |  | - services         |  | - services    |  |  |
|  |  | - repositories      |  | - repositories     |  | - repositories     |  | - storage adp |  |  |
|  |  +---------------------+  +---------+----------+  +--------------------+  +---------------+  |  |
|  +-------------------------------------+--------------------------------------------------------+  |
|                                        |                                                           |
|             Transactional Data Access  | Enqueue Jobs via Outbox                                   |
|                                        v                                                           |
+----------------------------------------+-----------------------------------------------------------+
        |                                |
        v                                v
+------------------+             +------------------+
| PostgreSQL 16/18 |             | Redis 7+         |
| (ACID Relational |             | (BullMQ Queues)  |
| Source of Truth) |             +--------+---------+
+------------------+                      |
                                          v
                                 +------------------------------------+
                                 | Background Worker (apps/worker)    |
                                 | - RFID Print Job Processor         |
                                 | - Inventory Audit Ledger Processor |
                                 | - Outbox Event Dispatcher          |
                                 +-----------------+------------------+
                                                   | TCP / WebSocket
                                                   v
                                 +------------------------------------+
                                 | Local Print Client / RFID Hardware |
                                 +------------------------------------+
```

#### Avoiding "NestJS Emulation Syndrome" in Express

Express must not be burdened with home-grown dependency injection containers, complex reflection systems, or custom parameter decorators that mimic NestJS. Instead, idiomatic enterprise Express architecture requires:

- **Feature-Based Module Packaging:** Each domain module lives in `src/modules/<domain>/` and exposes an explicit `createRouter(dependencies)` factory.
- **Explicit Composition Root:** Dependencies (repositories, services, queue producers) are instantiated deterministically during server bootstrap in `src/app.ts`.
- **Policy Enforcement via Middleware:** Declarative permission checks are expressed as functional middleware pipelines:
  ```typescript
  router.post(
    "/grn/:id/approve",
    authenticateJwt,
    requireStoreContext,
    authorizePolicy("PROCUREMENT.GRN.APPROVE"),
    validateSchema(ApproveGrnSchema),
    grnController.approve,
  );
  ```
- **Domain Service Transactions:** Business logic and multi-table transactions remain inside Domain Services, utilizing PostgreSQL transactional clients (`EntityManager` / `QueryRunner`).

### 4.2 Persistence Layer Evaluation: TypeORM vs. PostgreSQL Demands

The baseline retains **TypeORM** provisionally from the reference specification. An architectural evaluation highlights significant friction points:

1. **Active Record vs. Data Mapper:** Active Record binds domain logic to persistence concerns. The Data Mapper pattern (`Repository<T>`) is required.
2. **Transaction Management:** TypeORM's implicit entity managers can leak state across concurrent requests. Explicit `QueryRunner` or `dataSource.transaction(async (trx) => ...)` must be strictly enforced.
3. **Migration Drift:** TypeORM schema synchronization (`synchronize: true`) is catastrophic in multi-store enterprise environments. Versioned, raw SQL or strictly audited TypeORM migrations are mandatory.
4. **Alternative Consideration:** Prisma offers superior type generation but struggles with complex relational joins, locking clauses (`FOR UPDATE`), and fine-grained composite foreign keys. Modern query builders such as **Kysely** or **Drizzle ORM** provide lightweight, fully type-safe SQL abstractions without TypeORM's entity caching and proxy quirks.
   > **Recommendation:** If TypeORM is retained, forbid `synchronize: true` in all environments, ban cascading entity mutations on core transactional entities, and mandate explicit query runners for state transitions.

### 4.3 Background Worker Topology

- The BullMQ worker executes in an isolated Node.js process (`apps/worker`), importing domain models and persistence adapters as shared packages (`packages/database`).
- This guarantees that compute-intensive batch jobs (RFID batch serialization, inventory audit ledger compaction) do not block Express HTTP event loops.

---

## 5. Domain Entity and Relationship Review

We evaluate the candidate entities across the 8 core operational contexts proposed in `DOC-02` against real-world jewellery domain constraints:

### 5.1 Context 1: Identity & Access Management (IAM)

- **`Organization`**: Represents the corporate legal entity or enterprise tenant.
- **`Store`**: Represents a physical retail showroom, warehouse, or regional division (e.g., `STORE001 - Platinum Division`).
- **`User`**: Digital identity representing employees, inventory controllers, managers, and accountants.
- **`OrganizationMembership` & `StoreAssignment`**: Maps users to organizations and specific stores.
- **`Role` & `Permission`**: Granular RBAC definitions (e.g., `mj.role.store.inventory.controller`).
- **`RolePermission` & `UserRoleAssignment`**: Relational join tables.
- **Critical Evaluation:** A user may work across multiple branches (e.g., a Regional Manager covering `STORE001` and `STORE002`), but an operational action (such as receiving a GRN or unlocking a vault) must be performed under an **explicit active store context**.

### 5.2 Context 2: Master Data

- **`Category` & `Subcategory`**: Classification tree (e.g., `Gold Jewellery (GJ)` -> `Gold Ring`).
- **`Product`**: Abstract product definition (e.g., `MJPROD/B1 - Gold Engagement Ring`). Owns default tracking type.
- **`Material`**: Base metal classification (e.g., `One Gold (OG)`, `Platinum (PL)`, `Silver (SI)`).
- **`Purity`**: Karatage or fineness bound to a material (e.g., `24K -> 99.99%`, `22K -> 91.60%`, `Silver 925 -> 92.50%`).
- **`Gemstone`**: Master catalog of precious and semi-precious stones (e.g., `Diamond`, `Emerald`, `Ruby`).
- **Critical Evaluation:** A `Product` definition must NOT contain specific piece weights, measured purity, or RFID tags. It defines default attributes (category, design code, standard metal type), serving as a factory prototype.

### 5.3 Context 3: Supplier & Procurement

- **`Supplier`**: Corporate or individual vendor profile with tax identifiers, contact info, and address.
- **`GoodsReceiptNote` (GRN)**: The formal legal document recording intake of goods from a supplier.
- **`Shipment`**: A physical package or consignment delivered under a GRN (e.g., `Trishla lot`, `Turkish lot`).
- **`ShipmentItem`**: Declared line items within a shipment, recording declared gross weight, quantity, and labour costs. (Consolidates earlier redundant `IntakeRecord` proposal).
- **`StaffAssignment`**: Tracks staff assigned to inspect and process shipments.
- **Critical Evaluation:** A `GRN` contains one or more `Shipments`. Each `Shipment` contains multiple `ShipmentItems`.

### 5.4 Context 4: Quality Control (QC)

- **`QualityCheck`**: Header tracking the overall inspection workflow for a shipment.
- **`QualityCheckItem`**: The individual inspection record for a candidate inventory piece.
- **`WeightMeasurement`**: Historical and verified weight records (Gross, Net, QC weight).
- **`ItemGemstoneDetail`**: Specific stone details identified during inspection (carat, cut, color, clarity, stone weight).
- **`QualityDecision`**: Immutable record of approval, rejection, reason code, and inspector signature.
- **Critical Evaluation:** QC must not overwrite supplier-declared values. The schema must record `declared_gross_weight` vs. `measured_gross_weight` and `declared_purity` vs. `verified_purity`.

### 5.5 Context 5: Physical Inventory & Asset Identity

- **`InventoryItem`**: The core physical asset. Represents exactly one unique piece of jewellery.
- **`ProductSku`**: The commercial stock-keeping unit / variant code (e.g., `B10000C2`). Owns immutable `tracking_type`.
- **`InventoryMovement`**: Append-only audit record of custody changes and physical transfers.
- **`StockApproval`**: Formal business sign-off releasing an item from intake to sellable stock.
- **`StockAuditLedger`**: Periodic snapshot and daily physical audit reconciliation log.

### 5.6 Context 6: Storage & Custody Hierarchy

- **`Vault`**: Secure room or main safe within a store.
- **`Locker`**: Secure cabinet or safe located inside a vault.
- **`Compartment`**: Specific shelf, drawer, or tray within a locker.
- **`InventoryLocation`**: The foreign key reference on `InventoryItem` establishing current custody.
- **Critical Evaluation:** Every Vault, Locker, and Compartment belongs to exactly one `Store`. Cross-store placement is physically impossible and must be prevented by composite foreign key constraints.

### 5.7 Context 7: RFID Identity & Execution

- **`RFIDTag`**: Physical tag entity storing EPC (Electronic Product Code) and TID (Transponder ID).
- **`RFIDTagAssignment`**: Auditable historical join table linking an `InventoryItem` to an `RFIDTag`.
- **`RFIDJob`**: Asynchronous batch job entity tracking tagging commands (`QualityCheck.RFIDTagging` or `DamagedTag/Relocation.RFIDTagging`).
- **`RFIDJobItem`**: Join entity linking an RFID job to specific inventory items.

### 5.8 Context 8: Cross-Cutting & Operational Infrastructure

- **`AuditEvent`**: Tamper-resistant log capturing `actor_id`, `store_id`, `action`, `resource_type`, `resource_id`, `before_state`, and `after_state`.
- **`FileObject`**: S3 object storage metadata (bucket, key, MIME type, file size, checksum).
- **`FileAssociation`**: Polymorphic or relational links between `FileObject` and business entities (e.g., GRN delivery slips, gemstone lab certificates).
- **`TransactionalOutbox` (`outbox_events`)**: Reliable event dispatch table for asynchronous BullMQ integration.

---

## 6. Organization and Store Model Assessment

### 6.1 Multi-Tenant SaaS vs. Multi-Branch Enterprise

A recurring ambiguity between `DOC-01`, `DOC-02`, and `DOC-03` is whether the platform is:

- **A Single Enterprise with Multiple Branches:** One parent company with multiple retail showrooms (`STORE001`, `STORE002`), centralized product catalogs, shared customer profiles, and cross-branch inventory transfers.
- **A Multi-Tenant SaaS Platform:** Distinct, mutually untrusted jewellery companies sharing the software infrastructure, requiring absolute cryptographic or database-level isolation.

```
                      +---------------------------------------+
                      |       Enterprise / Organization       |
                      |   (Shared Master Data, Roles, Users)   |
                      +-------------------+-------------------+
                                          |
                 +------------------------+------------------------+
                 |                                                 |
                 v                                                 v
  +------------------------------+                  +------------------------------+
  |    Store 001 (Platinum)      |                  |     Store 002 (Silver)       |
  | - Vaults, Lockers, Shelves   |                  | - Vaults, Lockers, Shelves   |
  | - Physical Inventory Custody |                  | - Physical Inventory Custody |
  | - Local Staff Assignments    |                  | - Local Staff Assignments    |
  | - Local Print Clients        |                  | - Local Print Clients        |
  +------------------------------+                  +------------------------------+
                 ^                                                 ^
                 |=========== Cross-Store Transfer Request ========|
                              (In-Transit Escrow Custody)
```

#### Logical Model Strategy for Tenancy

To prevent schema rework regardless of how business stakeholders resolve `BIZ-Q01`:

1. **Include `organization_id` on all top-level aggregates:** Master data (`products`, `categories`, `materials`, `purities`), root operational records (`grns`, `stores`, `users`).
2. **If Single-Enterprise:** `organization_id` serves as a standard corporate umbrella; catalogue queries omit tenant filtering or bind to the single default enterprise ID.
3. **If Multi-Tenant SaaS:** `organization_id` serves as the tenant isolation key enforced in all database queries and repository scopes.
   This structural baseline allows logical ERD modeling to proceed immediately.

### 6.2 Conceptual Request Context Pipeline

Every incoming API request must be evaluated through a 6-factor authorization pipeline:

```
[ Incoming HTTP Request ]
          |
          v
  1. Authenticated Identity (JWT / Session Token -> User ID)
          |
          v
  2. Organization Context (Derived from User Membership)
          |
          v
  3. Active Store Context (Header: X-Store-Context or Session Store GUID)
          |
          v
  4. Assigned Permissions (Evaluated for User + Store combination)
          |
          v
  5. Target Resource Scope (Does Target Entity belong to Organization & Store?)
          |
          v
  6. Business State Validity (Is Entity in a valid lifecycle state for this command?)
          |
          v
[ Authorize & Execute Command ]
```

### 6.3 PostgreSQL Isolation Controls

1. **Composite Storage Integrity:** To prevent an item in `STORE001` from being assigned to a locker in `STORE002`, the storage schema must enforce composite keys:
   - `stores(id)`
   - `vaults(id, store_id)`
   - `lockers(id, vault_id, store_id)`
   - `compartments(id, locker_id, store_id)`
   - `inventory_items(id, compartment_id, store_id)`  
     This ensures PostgreSQL physically rejects cross-store placement at the foreign key level.
2. **Repository-Level Store Context:** Repositories must mandate `store_id` on store-scoped queries. Automated integration tests verify that cross-store IDs return 404/403.

---

## 7. Product, Inventory Item, SKU, and RFID Analysis

A foundational risk identified in `JEWELLERY_ERP_PROJECT_OVERVIEW.md` is the conflation of catalogue definitions, commercial codes, physical items, and transponder tags.

### 7.1 Deconstructing the Four Tiers of Asset Identity

```
+----------------------------------------------------------------------------------------------------+
| Tier 1: Abstract Product Definition (Product)                                                     |
| - Definition: Conceptual jewellery design/model produced or procured repeatedly.                  |
| - Business Attributes: Name, Category, Subcategory, Target Metal, Design Code (e.g. MJPROD/B1).    |
| - Creation-Time Default: `default_tracking_type: 'SERIALIZED' | 'QUANTITY_BATCH'`.                |
| - Relational Cardinality: 1 Product has Many SKUs.                                                |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| Tier 2: Commercial Variant / Stock-Keeping Unit (ProductSku)                                      |
| - Definition: Commercial catalog variant representing specific attributes (metal, purity, size).    |
| - Business Attributes: SKU Code (e.g. B10000C2), Target Karat (24K), Ring Size, Standard Stone Spec. |
| - Tracking Policy: Immutable `tracking_type: 'SERIALIZED' | 'QUANTITY_BATCH'` (set at creation).   |
| - Relational Cardinality: 1 SKU has Many Physical Items (Serialized) OR 1 Balance Row (Batch).    |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| Tier 3: Physical Serialized Asset (InventoryItem)                                                  |
| - Definition: Exactly ONE physical, tangible piece of jewellery existing in the physical world.   |
| - Business Attributes: Unique Serial Number, Exact Measured Weight (10.042g), Net Weight, Custody. |
| - Relational Cardinality: 1 InventoryItem has Many Historical Tag Assignments (1 Active).          |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| Tier 4: Physical Identification Transponder (RFIDTag)                                             |
| - Definition: The physical RFID inlay or adhesive smart tag attached to the physical piece.        |
| - Business Attributes: EPC (Electronic Product Code), TID (Silicon Transponder ID), Status.        |
| - Relational Cardinality: 1 Physical Tag is bound to 1 InventoryItem at any single point in time.  |
+----------------------------------------------------------------------------------------------------+
```

### 7.2 Inventory Tracking Policy: Creation-Time Defaults vs. Runtime Enforcement

The domain model must accommodate both individually tracked high-value assets and bulk commercial sundries:

1. **Creation-Time Default vs. SKU Policy:**
   - The `products` table defines `default_tracking_type: VARCHAR(20) CHECK (default_tracking_type IN ('SERIALIZED', 'QUANTITY_BATCH'))`.
   - When a `ProductSku` is created, the application populates its `tracking_type` from the product's default, allowing operator override during SKU creation.
   - **Crucial Distinction:** `tracking_type` is stored **explicitly and immutably on `ProductSku`**. It is **not** dynamically evaluated at runtime via a fallback coalesce query. This guarantees that if a product's default is altered in the future, existing SKUs and historical inventory integrity remain completely unaffected.
2. **Behavior for `SERIALIZED`:**
   - Every physical piece receives a dedicated `inventory_items` row with an individual serial number, exact measured weights (gross/net to 0.1 mg), specific storage placement (`compartment_id`), and orthogonal lifecycle states.
   - For items requiring RFID, an active `rfid_tag_assignments` record links the item to an encoded tag.
3. **Behavior for `QUANTITY_BATCH`:**
   - Low-value findings (clasps, jump rings, silicone backs) and commercial silver beads share a single SKU and do not create individual `inventory_items` rows.
   - **Current Balance vs. Movement Ledger:**
     - `inventory_stock_balances`: A mutable current-state projection recording `(sku_id, store_id, quantity_on_hand, total_weight_grams)`. This is a state table, **not** an auditable ledger.
     - `inventory_stock_movements`: The append-only transactional ledger recording every increment, decrement, intake receipt, scrap deduction, or store transfer with actor, timestamp, and document reference.
4. **Scope Dependency (`BIZ-Q02`):**
   - Whether quantity-based stock tables are scaffolded in Phase 0 DDL or deferred to Phase 1 depends on business confirmation of `BIZ-Q02`.
   - The logical data model represents both paths via `ProductSku.tracking_type`, ensuring zero logical rework.

### 7.3 Auditable RFID Tag Assignment History Model

RFID tags in retail environments frequently suffer damage: antenna tearing, chip delamination, or adhesive failure. Furthermore, cross-store relocation often requires re-encoding tags.

- **Terminology Correction (Auditable Lifecycle vs. Pure Append-Only):**
  Describing a table that updates `status` and `retired_at` as "append-only" is a misnomer. The architecture adopts an **Auditable Assignment Lifecycle History Model**:
  ```sql
  CREATE TABLE rfid_tag_assignments (
      id UUID PRIMARY KEY,
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
      rfid_tag_id UUID NOT NULL REFERENCES rfid_tags(id),
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      assigned_by UUID NOT NULL REFERENCES users(id),
      retired_at TIMESTAMPTZ,
      retired_by UUID REFERENCES users(id),
      retirement_reason TEXT CHECK (retirement_reason IN ('DAMAGED', 'LOST', 'RELOCATION', 'RETAGGING', 'DEFECTIVE')),
      status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED'))
  );

  -- PostgreSQL Partial Unique Index: Exactly one active tag per inventory item
  CREATE UNIQUE INDEX idx_one_active_tag_per_item
  ON rfid_tag_assignments(inventory_item_id)
  WHERE status = 'ACTIVE';

  -- PostgreSQL Partial Unique Index: Exactly one active item per tag
  CREATE UNIQUE INDEX idx_one_active_item_per_tag
  ON rfid_tag_assignments(rfid_tag_id)
  WHERE status = 'ACTIVE';
  ```
- **Lifecycle Integrity Rules:**
  - Rows are **never deleted**.
  - A row is inserted with `status = 'ACTIVE'` and `retired_at = NULL`.
  - Upon tag damage or replacement, the existing active row receives a **single update** setting `status = 'RETIRED'`, `retired_at = clock_timestamp()`, `retired_by`, and `retirement_reason`.
  - A new assignment row is inserted for the replacement tag with `status = 'ACTIVE'`.
  - The partial unique index guarantees that at most one active tag can be linked to an item at any point in time, while full historical traceability is preserved across all previous tag bindings.

---

## 8. Business Workflow and State-Transition Review

The jewellery platform lifecycle is a sequence of distinct business gates. Conflating these workflows into a single monolithic status field creates severe consistency bugs.

```
[ Supplier ]
     |
     v
[ 1. GRN / Shipment Intake ] ---------> [ State: DRAFT -> IN_PROGRESS -> CLOSED ]
     |
     v
[ 2. Item-Level QC Inspection ] ------> [ State: DRAFT -> PENDING -> APPROVED / REJECTED ]
     |                                                                   |
     +--- (If Approved) -------------------------------------------------+
     |
     v
[ 3. SKU & Serial Generation ] -------> [ State: PENDING_TAGGING ]
     |
     v
[ 4. RFID Batch Job ] ----------------> [ Technical State: QUEUED -> PRINTING -> COMPLETED ]
     |
     v
[ 5. Physical Storage Placement ] ----> [ Custody: UNASSIGNED -> VAULT / LOCKER / COMPARTMENT ]
     |
     v
[ 6. Stock Approval Gate ] -----------> [ State: APPROVAL_PENDING -> APPROVED ]
     |
     v
[ 7. Commercial Stock Catalog ] ------> [ Availability: AVAILABLE_IN_STOCK -> RESERVED -> SOLD ]
```

### 8.1 Detailed Workflow State Machines

#### A. Goods Receipt Note (GRN) Lifecycle

- **States:** `DRAFT` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `CLOSED` (Terminal) $\rightarrow$ `CANCELLED` (Terminal).
- **Proposed Baseline Preconditions for Closure (`BIZ-Q04`):**
  - As a proposed baseline policy, a GRN transitions to `CLOSED` when all associated `Shipments` are received, all `ShipmentItems` have completed QC (either approved or rejected), and total intake quantities match verified counts.
  - _Unresolved Business Question (`BIZ-Q04`):_ Business stakeholders must confirm whether partial closure is permitted when some lines remain rejected or under supplier dispute.
  - _Technical Enforcement Note:_ Because PostgreSQL table-local `CHECK` constraints cannot execute subqueries against child `shipments` or `shipment_items` tables, GRN closure validation is enforced inside the `GrnService.closeGrn()` application transaction in Express 5. Consequently, `BIZ-Q04` is an **Application-Level Workflow Governance Rule** that does not alter table schemas or block physical DDL.
- **Immutability Invariant:** A `CLOSED` GRN cannot be edited, deleted, or reopened. Corrections require an auditable `IntakeDiscrepancyAdjustment` record.

#### B. Quality Control (QC) Lifecycle

- **States:** `DRAFT` $\rightarrow$ `PENDING_INSPECTION` $\rightarrow$ `UNDER_INSPECTION` $\rightarrow$ `APPROVED` or `REJECTED` $\rightarrow$ `HANDED_OFF`.
- **Preconditions:** Inspector must possess `QC.INSPECTION.EXECUTE` permission and an active store assignment matching the GRN store.
- **Data Capture Rules:** Gross weight, net weight, verified purity, and gemstone details must be recorded. If verified weight deviates from declared weight beyond configured tolerances (`BIZ-Q03`), an explicit manager override reason is required.
- **Proposed Interpretation of "Published" State (`DISC-03`):**
  - In `DOC-03`, QC screens display a `Published` status.
  - In the greenfield domain model, this is interpreted as a **proposed architectural handoff event**: the moment a QC-approved inspection item is instantiated into the durable `inventory_items` table and enqueued for RFID tag printing. This interpretation is subject to client validation during workflow approval.

#### C. RFID Job Execution Lifecycle

- **States:** `CREATED` $\rightarrow$ `QUEUED` $\rightarrow$ `PROCESSING` $\rightarrow$ `PRINTING` $\rightarrow$ `COMPLETED` | `FAILED` | `CANCELLED`.
- **Separation of Concerns:** An RFID job reaching `COMPLETED` proves only that the background worker transmitted data to the local print service. It does **not** grant the inventory item `AVAILABLE_IN_STOCK` status.

#### D. Multi-Dimensional Inventory State Matrix

To prevent invalid state combinations, the `inventory_items` table must utilize four explicit, orthogonal status dimensions rather than one overloaded enum:

```
+----------------------------------------------------------------------------------------------------+
| Dimension 1: Quality State (quality_state)                                                         |
| Values: PENDING_QC, QC_APPROVED, QC_REJECTED, RE_INSPECTION                                        |
+----------------------------------------------------------------------------------------------------+
| Dimension 2: Physical Custody State (custody_state)                                                |
| Values: INTAKE_STAGING, IN_VAULT, IN_DISPLAY, IN_TRANSIT, EXTERNAL_REPAIR, MISSING                 |
+----------------------------------------------------------------------------------------------------+
| Dimension 3: Approval State (approval_state)                                                       |
| Values: NOT_SUBMITTED, APPROVAL_PENDING, APPROVED, REJECTED                                        |
+----------------------------------------------------------------------------------------------------+
| Dimension 4: Commercial Availability (commercial_state)                                            |
| Values: UNREADY, AVAILABLE_FOR_SALE, RESERVED, SOLD, ON_CONSIGNMENT, MELTED_DOWN                   |
+----------------------------------------------------------------------------------------------------+
```

---

## 9. PostgreSQL Data Integrity Requirements

### 9.1 Reassessing the Primary-Key Strategy (PostgreSQL 18 vs. 16/17, UUIDv7, UUIDv4, BIGINT)

An earlier draft recommended a blocking technical spike for UUIDv7 based on PostgreSQL 16. We re-evaluate this decision against modern PostgreSQL capabilities and managed hosting realities.

```
+-------------------------------------------------------------------------------------------------------------------------------+
| Strategy                 | PostgreSQL Compatibility   | Hosting & Migration Realities          | Indexing & Operational Trade-offs|
+-------------------------------------------------------------------------------------------------------------------------------+
| 1. DB-Native UUIDv7      | Native in PostgreSQL 18+   | Not available out-of-the-box in PG 16/ | Time-ordered B-Tree clustering;  |
|    `DEFAULT uuidv7()`    | (`uuidv7()` in core).      | 17 on managed AWS RDS, Aurora, or Cloud| non-sequential; 16-byte UUID.    |
|                          | Requires extension in <18. | SQL without C-extension approval.      | Exposes creation timestamp.      |
+-------------------------------------------------------------------------------------------------------------------------------+
| 2. App-Generated UUIDv7  | Fully compatible with ALL  | Fully portable across all cloud engines| Identical B-Tree clustering to   |
|    (Express / TypeScript)| PostgreSQL versions (14+). | (RDS, Aurora, Supabase, Neon). Zero   | native UUIDv7; allows client-side|
|    Strict write-path gen | Stores in native `uuid`.   | database extensions required.          | pre-allocation before DB write.  |
+-------------------------------------------------------------------------------------------------------------------------------+
| 3. Random UUIDv4         | Native in all PG versions  | Universally supported via              | Non-sequential bit distribution; |
|    `gen_random_uuid()`   | (PG 13+ core).             | `gen_random_uuid()`.                   | increases B-Tree index page      |
|                          |                            |                                        | splits as index exceeds cache.   |
+-------------------------------------------------------------------------------------------------------------------------------+
| 4. BIGINT Identity       | Native in all PG versions  | Universally supported via              | Compact (8 bytes); sequential    |
|    `BIGINT IDENTITY`     | (PG 10+ standard).         | `GENERATED ALWAYS AS IDENTITY`.        | numbers leak business volume and |
|                          |                            |                                        | invite enumeration attacks.      |
+-------------------------------------------------------------------------------------------------------------------------------+
```

#### Coherent Primary Key Enforcement Policy: Application-Level Generation with Explicit Boundaries

- **Policy Selection:** Standardize on **Application-Level Generation and Validation** across all approved write paths in Express 5 entity factories and domain repositories, stored in standard PostgreSQL native `uuid` columns.
- **DDL Column Definition:** Defined strictly as `id UUID PRIMARY KEY` **without a database `DEFAULT` clause**.
  - _What this guarantees:_ Omitting a default clause ensures that any application query or automated process that accidentally omits an identifier will fail immediately (`null value in column "id" of relation violates not-null constraint"`). This strictly eliminates accidental database-level fallback to legacy UUIDv4 (`gen_random_uuid()`).
  - _Mandatory Technical Distinction:_ Omitting a default clause **does not** reject an explicitly supplied UUIDv4. Because PostgreSQL's native `uuid` data type accepts any valid 128-bit RFC 4122/9562 identifier, an explicit `INSERT ... VALUES (gen_random_uuid(), ...)` or direct SQL write supplying a UUIDv4 string will succeed unless an engine-level check constraint is added.
- **Enforcement Mechanisms Across System Layers:**
  1. _Application-Level Enforcement (Primary Policy):_ All approved write paths generate UUIDv7 identifiers in Express 5 domain factories prior to SQL execution. Application domain schemas (e.g., Zod validators) validate that generated identifiers strictly adhere to the RFC 9562 UUIDv7 layout (verifying version nibble `7` at character offset 15 and RFC variant bits `10xx` at character offset 20: `xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx`).
  2. _Direct SQL Writes & Migrations:_ Manual DBA maintenance scripts, data migration seeders, and direct SQL statements fall outside the Express application boundary. Application-level validation cannot protect direct database writes; direct SQL writes bypass application checks unless database check constraints are installed.
  3. _Optional Database-Level Version Enforcement (If Strict DB Gating Is Mandated):_
     - In **PostgreSQL 18+**: Native version inspection is available via the core `uuid_extract_version()` function. PostgreSQL 18 documents `uuid_extract_version(uuid)`, which returns the UUID version for UUIDs using RFC 9562-compatible variants and returns `NULL` for other variants; PostgreSQL 18 does **not** provide a built-in `uuid_extract_variant()` function. Because PostgreSQL `CHECK` constraints accept expressions that evaluate to `TRUE` or `NULL`, an explicit `IS NOT NULL` condition is necessary:
       ```sql
       ALTER TABLE inventory_items
       ADD CONSTRAINT chk_inventory_items_uuidv7
       CHECK (
           uuid_extract_version(id) IS NOT NULL
           AND uuid_extract_version(id) = 7
       );
       ```
       _How this works:_
       - PostgreSQL 18's `uuid_extract_version()` returns the UUID version for UUIDs using RFC 9562-compatible variants and returns `NULL` for other variants.
       - The explicit `IS NOT NULL` condition is necessary because PostgreSQL CHECK constraints accept expressions that evaluate to `TRUE` or `NULL` (rejecting only `FALSE`).
       - Together, these conditions require UUID version 7 and reject unsupported variants.
       - This example illustrates optional database-level enforcement. Application-generated UUIDv7 with application-level validation remains the primary policy.
     - In **PostgreSQL 14–17** (and managed cloud databases lacking PG18 native functions): Database-level version and variant checking can be implemented via string extraction on the version nibble (offset 15) and variant nibble (offset 20):
       ```sql
       ALTER TABLE inventory_items
       ADD CONSTRAINT chk_inventory_items_uuidv7
       CHECK (
           substring(id::text from 15 for 1) = '7' AND
           substring(id::text from 20 for 1) IN ('8', '9', 'a', 'b', 'A', 'B')
       );
       ```
       _Distinction between Version Checking and Complete Format Validation:_ Because PostgreSQL's native `uuid` data type enforces syntactically valid 128-bit hex formatting, these substring checks verify the RFC 9562 version 7 and variant 1 bits. However, database check constraints do not validate complete UUIDv7 internal bitfield properties (such as monotonic timestamp ordering or counter sequence bits). Full format generation, validation, and lifecycle integrity remain governed primarily by Express 5 application factories.
- **Security Notice (UUIDv7 Information Disclosure):**
  - UUIDv7 embeds a 48-bit Unix millisecond epoch timestamp in high-order bits. Consequently, IDs **expose the approximate creation time** of the entity.
  - Identifiers must **never** be treated as unguessable secret tokens, bearer credentials, or authorization capabilities. Access control must always be evaluated through authenticated caller context, active store context, and RBAC policies.
- **Architectural Conclusion:** A blocking technical spike is **unnecessary**. Primary-key generation mechanics are resolved and **do not block conceptual or logical domain modeling**.

### 9.2 Decoupling Measurement Precision from Financial Precision

Numeric precision must not be finalized by casual convention. Precision must be explicitly categorized across **six distinct operational and financial concerns**, clearly distinguishing physical metrology from financial settlements:

#### 1. Physical Measurement Resolution (Instrument Precision)

- Analytical laboratory balances in jewellery manufacturing measure gold and platinum down to 0.001g (1 milligram) or 0.0001g (0.1 milligram).
- Certified diamond carat balances measure gemstones to 0.001 carat (sub-point resolution; $1\text{ pt} = 0.01\text{ ct} = 0.002\text{ g}$).

#### 2. Measurement Storage Precision (Proposed Column Data Types)

- **Precious Metal Weight (Grams):** Proposed `NUMERIC(10, 4)` supports individual item or bulk lot weights up to 999,999.9999 grams (approx. 1,000 kg) with 0.1 mg scale. Unit conversions (Tolas: $1\text{ tola} = 11.6638\text{g}$; Troy Ounces: $1\text{ oz t} = 31.1035\text{g}$) must be computed at high precision before persisting to 4 decimal places.
- **Gemstone Weight (Carats):** Proposed `NUMERIC(8, 4)` supports gemstones up to 9,999.9999 carats with sub-point precision.
- **Metal Purity (Fineness & Karatage):**
  - _Percentage Representation:_ Proposed **`NUMERIC(7, 4)`** supports percentages from $0.0000\%$ to $100.0000\%$ ($24\text{K} = 99.9900\%$; $22\text{K} = 91.6000\%$ or $91.6667\%$; $18\text{K} = 75.0000\%$; Silver $925 = 92.5000\%$).
    > [!IMPORTANT]
    > **Mathematical Correction:** The previous draft proposed `NUMERIC(6, 4)` for purity percentage. In PostgreSQL, `NUMERIC(6, 4)` allocates only $6 - 4 = 2$ integer digits, yielding a maximum representable value of `99.9999`. Storing pure $100.0000\%$ produces an immediate numeric overflow error (`ERROR: numeric field overflow`). Pure metal representation requires 3 integer digits, mandating **`NUMERIC(7, 4)`** (range `0.0000` to `100.0000`).
  - _Decimal Ratio Representation:_ Proposed **`NUMERIC(5, 4)`** supports ratios from $0.0000$ to $1.0000$ (1 integer digit + 4 fractional digits).

#### 3. Intake Discrepancy Tolerance Threshold (`BIZ-Q03`)

- A configurable business policy threshold (e.g., $\pm 0.01\text{g}$ vs. $\pm 0.05\text{g}$) defining the allowable variance between supplier-declared gross weight and measured intake gross weight before triggering an intake block or requiring supervisor sign-off.
- This is a governance rule evaluated against stored measurement data, distinct from column data types.

#### 4. Financial Calculation Precision (Intermediate Pricing & Rates)

- **Metal Spot Rates:** Quoted in currency per gram or per troy ounce. Requires at least 4 decimal places to prevent cumulative rounding losses on bulk orders: proposed `NUMERIC(14, 4)` (e.g., $\$94.2580 / \text{g}$).
- **Making / Labour Charges:** Quoted as a rate per gram (e.g., $\$8.5000 / \text{g}$) or a flat fee: proposed `NUMERIC(12, 4)`.
- **Intermediate Valuations:** Accumulated line item valuations, wastage additions, and item-level valuations maintain 4 decimals: proposed `NUMERIC(14, 4)`.

#### 5. Currency Settlement Scale (Document Totals)

- In-scope supplier procurement settlement totals (`shipment_items` line totals and GRN invoice summaries) must round to legal currency subunits (CAD/USD: 2 decimal places, proposed `NUMERIC(14, 2)`).

#### 6. Customer Invoice Rounding Rules (`BIZ-Q08`)

- Governs the mathematical rounding algorithm (Banker's Half-Even vs. Commercial Half-Up) applied to customer retail invoices and Point-of-Sale checkouts.
- Because retail POS, cashier checkouts, and customer sales invoicing are explicitly deferred from the Phase 0 MVP, `BIZ-Q08` is **deferred to Phase 1 commercial modules** and does not block Phase 0 Core Asset Lifecycle physical DDL. In-scope Phase 0 supplier procurement line item precision is governed by `DEC-05`.

> [!NOTE]
> All proposed numeric scales and types are engineering baseline recommendations subject to formal stakeholder sign-off prior to executing physical DDL migrations.

### 9.3 Valid PostgreSQL Integrity Enforcement & Comprehensive Aggregate Locking Protocol

Ordinary PostgreSQL `CHECK` constraints cannot perform subqueries against other tables. Attempting to check for an active RFID tag via a subquery in a check constraint produces `ERROR: cannot use subquery in check constraint`.

#### A. Table-Local CHECK Constraints & NULL Semantics (Engine-Level)

Enforce row-internal physical and state invariants directly on `inventory_items`:

> [!IMPORTANT]
> **PostgreSQL CHECK Constraint NULL Semantics & Mandatory Data Completeness:**
> In PostgreSQL, a `CHECK` constraint evaluates to satisfied if the expression evaluates to `TRUE` or `NULL`; it only rejects rows when the expression evaluates to `FALSE`. If measurement columns (`gross_weight_grams`, `net_weight_grams`) or state columns are nullable, expressions such as `gross_weight_grams > 0 AND net_weight_grams > 0 AND gross_weight_grams >= net_weight_grams` evaluate to `NULL`, allowing incomplete rows to bypass integrity checks.
>
> Therefore, table-local `CHECK` constraints alone cannot enforce data completeness. To guarantee data presence, mandatory columns must be accompanied by explicit `NOT NULL` constraints. Data completeness is strictly enforced at key lifecycle points: while preliminary draft records may exist during initial intake staging, at **QC Approval** (when `quality_check_items` is approved and `inventory_items` is created) and at **Stock Approval** (when transitioning to commercial readiness), weight measurements and all four state dimensions must be populated and non-null.

```sql
-- Enforce data presence and completeness at item creation / QC approval
ALTER TABLE inventory_items
    ALTER COLUMN gross_weight_grams SET NOT NULL,
    ALTER COLUMN net_weight_grams SET NOT NULL,
    ALTER COLUMN quality_state SET NOT NULL,
    ALTER COLUMN approval_state SET NOT NULL,
    ALTER COLUMN custody_state SET NOT NULL,
    ALTER COLUMN commercial_state SET NOT NULL;

-- Valid weight physics: gross must be strictly positive and >= net
ALTER TABLE inventory_items
ADD CONSTRAINT chk_inventory_weights
CHECK (gross_weight_grams > 0 AND net_weight_grams > 0 AND gross_weight_grams >= net_weight_grams);

-- Valid row-local commercial state conditions
ALTER TABLE inventory_items
ADD CONSTRAINT chk_local_commercial_prerequisites
CHECK (
    commercial_state != 'AVAILABLE_FOR_SALE' OR
    (quality_state = 'QC_APPROVED' AND approval_state = 'APPROVED' AND custody_state IN ('IN_VAULT', 'IN_DISPLAY'))
);
```

#### B. Engine Constraint vs. Multi-Table Prerequisite

- **Partial Unique Indexes (Engine Level):**
  ```sql
  -- Guarantee an inventory item has at most one active tag assignment:
  CREATE UNIQUE INDEX idx_one_active_tag_per_item
  ON rfid_tag_assignments(inventory_item_id)
  WHERE status = 'ACTIVE';

  -- Guarantee an RFID tag is assigned to at most one active inventory item:
  CREATE UNIQUE INDEX idx_one_active_item_per_tag
  ON rfid_tag_assignments(rfid_tag_id)
  WHERE status = 'ACTIVE';
  ```
  These PostgreSQL engine constraints guarantee that an inventory item can have **at most one** active tag assignment at any point in time, and an RFID tag cannot be concurrently linked to multiple active items.
- **Active Tag Mandatory Prerequisite (Multi-Table Invariant):**
  Crucially, partial unique indexes enforce _cardinality upper bounds_ ($\le 1$), **not** presence ($\ge 1$). A partial unique index _cannot_ enforce that an item has **at least one** active tag when marked sellable. Because this invariant spans two tables (`inventory_items` and `rfid_tag_assignments`), it cannot be enforced by a table-local CHECK constraint. It must be enforced inside application service transactions coordinated by root aggregate row locking.

#### C. Comprehensive Root Aggregate Locking Protocol Across All 5 State-Changing Paths

To eliminate concurrency hazards where concurrent transactions alter tag assignments or commercial states out of order, the architecture mandates that **all five state-changing paths** touching the active RFID prerequisite acquire the parent root aggregate lock first:

```
+----------------------------------------------------------------------------------------------------+
| 1. PATH 1: Stock Approval Flow (StockApprovalService.approveItem)                                  |
|    - BEGIN TRANSACTION;                                                                            |
|    - Lock root aggregate: SELECT id, version, quality_state, approval_state, custody_state,         |
|      commercial_state FROM inventory_items WHERE id = :itemId FOR UPDATE;                          |
|    - If item SKU tracking_type = 'SERIALIZED':                                                     |
|      Query active tag: SELECT id, rfid_tag_id FROM rfid_tag_assignments                             |
|      WHERE inventory_item_id = :itemId AND status = 'ACTIVE' FOR UPDATE;                           |
|      If no active tag -> ROLLBACK with InvariantViolationException;                                |
|    - Update: UPDATE inventory_items SET approval_state = 'APPROVED',                               |
|      commercial_state = 'AVAILABLE_FOR_SALE', version = version + 1 WHERE id = :itemId;             |
|    - COMMIT;                                                                                       |
+----------------------------------------------------------------------------------------------------+
                                                  |
                         Serializes on `inventory_items(:itemId)` Lock
                                                  v
+----------------------------------------------------------------------------------------------------+
| 2. PATH 2: Commercial Availability Transitions (InventoryCommercialService.updateState)            |
|    - BEGIN TRANSACTION;                                                                            |
|    - Lock root aggregate: SELECT id, version, approval_state, custody_state, commercial_state       |
|      FROM inventory_items WHERE id = :itemId FOR UPDATE;                                           |
|    - If target commercial_state = 'AVAILABLE_FOR_SALE':                                            |
|      Verify quality_state = 'QC_APPROVED', approval_state = 'APPROVED', custody IN ('IN_VAULT',    |
|      'IN_DISPLAY'), and verify active tag assignment exists if serialized;                         |
|    - If target commercial_state IN ('RESERVED', 'SOLD', 'ON_CONSIGNMENT', 'UNREADY'):              |
|      Update commercial_state and increment version;                                                |
|    - COMMIT;                                                                                       |
+----------------------------------------------------------------------------------------------------+
                                                  |
                         Serializes on `inventory_items(:itemId)` Lock
                                                  v
+----------------------------------------------------------------------------------------------------+
| 3. PATH 3: Initial Active Tag Assignment (RFIDService.assignTag)                                   |
|    - BEGIN TRANSACTION;                                                                            |
|    - MUST acquire lock on parent inventory_items row FIRST:                                         |
|      SELECT id, version FROM inventory_items WHERE id = :itemId FOR UPDATE;                         |
|    - Verify item is serialized and not in terminal state;                                           |
|    - Insert into rfid_tag_assignments (id, inventory_item_id, rfid_tag_id, status)                 |
|      VALUES (..., :itemId, :tagId, 'ACTIVE');                                                      |
|      (Engine partial unique index guarantees at most one active tag);                              |
|    - COMMIT;                                                                                       |
+----------------------------------------------------------------------------------------------------+
                                                  |
                         Serializes on `inventory_items(:itemId)` Lock
                                                  v
+----------------------------------------------------------------------------------------------------+
| 4. PATH 4: Tag Retirement (RFIDService.retireTag)                                                  |
|    - BEGIN TRANSACTION;                                                                            |
|    - MUST acquire lock on parent inventory_items row FIRST:                                         |
|      SELECT id, commercial_state FROM inventory_items WHERE id = :itemId FOR UPDATE;               |
|    - If commercial_state = 'AVAILABLE_FOR_SALE':                                                    |
|      Atomically transition commercial_state = 'UNREADY' (item cannot be sellable without tag);     |
|    - UPDATE rfid_tag_assignments SET status = 'RETIRED', retired_at = clock_timestamp(),            |
|      retired_by = :userId, retirement_reason = :reason                                              |
|      WHERE id = :assignmentId AND status = 'ACTIVE';                                               |
|    - COMMIT;                                                                                       |
+----------------------------------------------------------------------------------------------------+
                                                  |
                         Serializes on `inventory_items(:itemId)` Lock
                                                  v
+----------------------------------------------------------------------------------------------------+
| 5. PATH 5: Tag Replacement & Reassignment (RFIDService.replaceTag)                                 |
|    - BEGIN TRANSACTION;                                                                            |
|    - MUST acquire lock on parent inventory_items row FIRST:                                         |
|      SELECT id, commercial_state FROM inventory_items WHERE id = :itemId FOR UPDATE;               |
|    - Retire existing tag: UPDATE rfid_tag_assignments SET status = 'RETIRED', ...                   |
|      WHERE inventory_item_id = :itemId AND status = 'ACTIVE';                                      |
|    - Insert new assignment: INSERT INTO rfid_tag_assignments (..., :itemId, :newTagId, 'ACTIVE');   |
|    - If commercial_state = 'AVAILABLE_FOR_SALE', maintain state or update audit log;                |
|    - COMMIT;                                                                                       |
+----------------------------------------------------------------------------------------------------+
```

#### D. Concurrency Principles & Scope of Protocol

- **Per-Item Serialization:** Operations affecting the same inventory item serialize because all five write paths acquire the parent `inventory_items` lock (`FOR UPDATE`) first, before querying or modifying `rfid_tag_assignments`.
- **Deadlock Realism & Multi-Item Ordering:**
  - The root aggregate locking protocol serializes single-item operations but does **not** guarantee deadlock-free execution across all possible concurrent transactions.
  - When transactions operate on multiple items concurrently (e.g., bulk stock approvals, batch transfers between vaults, or intake reconciliations), acquiring locks in conflicting orders will trigger PostgreSQL deadlocks (`SQLSTATE 40P01`).
  - To prevent circular wait states, multi-item operations must acquire parent locks in a consistent, deterministic global order (e.g., sorting item UUIDs in ascending lexicographical order prior to issuing `FOR UPDATE` queries).
  - Application service transaction handlers must anticipate deadlock exceptions (`40P01`) and serialization failures (`40001`), implementing automated retries with exponential backoff and jitter.
- **Pessimistic vs. Optimistic Concurrency:**
  - _Pessimistic Row Locking (`FOR UPDATE`):_ Mandated for short-lived, high-stakes transactional state transitions across related tables to ensure atomic consistency.
  - _Optimistic Concurrency Control (OCC via `version` column):_ Used for user-facing UI interactions (e.g., editing item descriptions, notes, or storage compartments) to detect concurrent modifications without holding database locks open during human think-time.
- **Strict Protocol Scope & Adherence Requirement:**
  - Coordinated root aggregate locking provides application-level integrity guarantees _if and only if every write path touching item lifecycle or tag assignments strictly adheres to the protocol_ by acquiring the parent `inventory_items` lock first.
  - Direct SQL updates or uncoordinated service methods that bypass the parent row lock will violate concurrency guarantees.
- **No Unnecessary Triggers:**
  - Complex business triggers on PostgreSQL tables are avoided. Application service transactions provide superior observability, unit testability, and typed error handling in TypeScript, while the combination of table-local CHECK constraints, partial unique indexes, and coordinated root row locks provides robust data integrity.

### 9.4 Foreign Key Referential Actions

- **Master Data References (`product_id`, `category_id`, `purity_id`):** `ON DELETE RESTRICT`. A category, purity, or product definition cannot be deleted if active inventory items or QC records reference it.
- **Direct Aggregate Children (`shipments` under `grn`, `shipment_items` under `shipments`):** `ON DELETE RESTRICT` for committed transactions; `ON DELETE CASCADE` is permitted strictly for temporary draft entities prior to submission.
- **Soft Deletion Strategy:** Avoid blanket `deleted_at` columns on transactional records. Inventory movements, audit events, QC decisions, and financial records must be **immutable and append-only**. Deactivation of master data uses `is_active: boolean`.

---

## 10. Transaction and Concurrency Risks

### 10.1 Multi-Dependent Atomic Write Operations

The following business workflows require atomic PostgreSQL transactions to prevent partial writes and corrupted inventory states:

1. **QC Approval & Inventory Creation:**
   - Step 1: Update `quality_check_items` status to `APPROVED`.
   - Step 2: Insert into `inventory_items` (assign unique serial number, link measured weights).
   - Step 3: Insert initial record into `inventory_movements` (custody = `INTAKE_STAGING`).
   - Step 4: Insert into `outbox_events` (topic = `INVENTORY.ITEM_APPROVED`).
   - _Failure to commit atomically results in approved QC records with phantom or missing physical assets._

2. **Storage Placement & Vault Transfer:**
   - Step 1: Verify destination compartment belongs to the item's store.
   - Step 2: Update `inventory_items.compartment_id` and `inventory_items.custody_state`.
   - Step 3: Insert into `inventory_movements` (recording `from_compartment_id`, `to_compartment_id`, `actor_id`).

3. **Stock Approval Sign-Off:**
   - Step 1: Verify caller possesses `STOCK.APPROVAL.EXECUTE` permission.
   - Step 2: _Proposed Conditional Rule (`BIZ-Q05`):_ If segregation of duties is confirmed mandatory by stakeholders, verify approver is strictly different from the user who performed QC inspection. (Application-level domain service validation; does not block physical DDL).
   - Step 3: Acquire root aggregate lock on `inventory_items` and verify active RFID tag assignment (if serialized).
   - Step 4: Update `inventory_items.approval_state = 'APPROVED'` and `commercial_state = 'AVAILABLE_FOR_SALE'`.
   - Step 5: Insert record into `stock_approvals`.

### 10.2 Concurrency Hazards & Control Strategies

- **Race Condition: Double Storage Relocation:** Two showroom associates attempt to assign the same physical item to two different vault compartments simultaneously.
  - **Mitigation:** Optimistic Concurrency Control (OCC) using an integer `version` column on `inventory_items`:
    ```sql
    UPDATE inventory_items
    SET compartment_id = :newCompartment, version = version + 1
    WHERE id = :itemId AND version = :currentVersion;
    ```
    If rows affected = 0, throw a `ConflictException` (409) instructing the client to reload current state.

### 10.3 Transactional Outbox Pattern & Delivery Semantics

To avoid dual-write inconsistencies between PostgreSQL and Redis BullMQ, the architecture establishes explicit transactional boundaries, delivery semantics, and failure recovery mechanisms:

```
+----------------------------------------------------------------------------------------------------+
| 1. Local PostgreSQL Transaction (Atomic Persistence Boundary)                                      |
|    BEGIN TRANSACTION;                                                                              |
|      - Update Inventory / QC state                                                                 |
|      - INSERT INTO outbox_events (id, topic, payload, status) VALUES (..., 'PENDING');             |
|    COMMIT;                                                                                         |
|    (Result: Atomic local persistence. Either both the business state change and the outbox event   |
|     persist to disk, or neither does. An outbox row alone does NOT guarantee queue delivery.)      |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| 2. Outbox Dispatcher Process (Asynchronous Event Hand-Off)                                         |
|    - An independent background worker poll loop processes pending records:                         |
|      SELECT * FROM outbox_events WHERE status = 'PENDING' FOR UPDATE SKIP LOCKED LIMIT 50;         |
|    - Publishes event payload to Redis BullMQ: await rfidPrintQueue.add(event.topic, event.payload) |
|    - Upon successful Redis ACK: UPDATE outbox_events SET status = 'PUBLISHED' WHERE id = :id;      |
|    - Boundary Reality: PostgreSQL and Redis do NOT participate in a distributed 2PC transaction.  |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
| 3. Delivery Semantics, Failure Recovery & Consumer Duplicate Safety Boundary                        |
|    - Local Persistence vs. Queue Delivery (No Distributed 2PC):                                    |
|      * Inserting an outbox record guarantees local PostgreSQL transactional persistence only.       |
|      * An outbox row alone does NOT guarantee successful queue delivery to Redis/BullMQ.           |
|      * PostgreSQL and Redis operate across decoupled operational boundaries without 2PC.            |
|    - At-Least-Once Delivery Guarantees & Assumptions:                                              |
|      * At-least-once delivery is achieved via dispatcher polling, retry, and recovery loops under  |
|        the operational assumption that Redis and the dispatcher process are eventually available.   |
|      * If the dispatcher crashes or disconnects after enqueuing to Redis but before updating        |
|        outbox status to 'PUBLISHED', the event is re-polled upon restart and dispatched again.      |
|    - Consumer Idempotency as an Independent Duplicate-Safety Requirement:                           |
|      * Consumer idempotency does NOT create the delivery guarantee; it is a separate safety         |
|        requirement to protect business state against duplicate deliveries.                          |
|      * Downstream BullMQ consumers MUST safely process duplicate events idempotently (e.g., by      |
|        evaluating entity status, checking idempotency keys, or using unique event IDs).             |
|    - Transient Outage & Retry Recovery:                                                            |
|      * Undispatched events remain recoverable and observable in PostgreSQL (status = 'PENDING')     |
|        and are automatically retried across subsequent polling loops once Redis is restored.        |
|    - Persistent Dispatch Failures & Dead-Letter Handling:                                          |
|      * If Redis or network connectivity remains down across configured backoff cycles, records     |
|        transition to `FAILED` after reaching maximum retry thresholds, triggering dead-letter       |
|        logging and operational alerting (PagerDuty/Slack) for administrative intervention.          |
+----------------------------------------------------------------------------------------------------+
```

---

## 11. Authentication and Authorization Review

### 11.1 Identity Provider (IdP) Integration Boundaries

The platform relies on an SSO / OIDC authentication architecture.

```
+----------------------------------------------------------------------------------------------------+
| External OIDC / SSO Identity Provider (Keycloak / Auth0 / Okta / Azure AD)                         |
| - Authenticates user credentials, MFA, biometric login.                                            |
| - Issues signed OIDC JWT (sub, email, name, exp, iss).                                             |
+----------------------------------------------------------------------------------------------------+
                                                  |
                                                  v  (Authorization: Bearer <JWT>)
+----------------------------------------------------------------------------------------------------+
| Express API Auth Middleware (apps/api/src/shared/middleware/auth.middleware.ts)                    |
| - Verifies JWT signature against IdP JWKS (JSON Web Key Set).                                      |
| - Extracts external Subject ID (`sub`).                                                            |
| - Queries local database: resolves User ID, Organization Memberships, and Store Permissions.       |
| - Attaches RequestContext to Express Request object (`req.context`).                               |
+----------------------------------------------------------------------------------------------------+
```

### 11.2 Request Context Structure

```typescript
export interface RequestContext {
  identity: {
    userId: string;
    email: string;
    isGlobalAdmin: boolean;
  };
  organization: {
    organizationId: string;
    organizationCode: string;
  };
  store: {
    storeId: string;
    storeCode: string;
    storeRole: string;
  };
  permissions: Set<string>;
  correlationId: string;
}
```

### 11.3 Granular Policy Evaluation Architecture

Rather than simple role checks (`if (user.role === 'admin')`), authorization evaluates explicit policies matching the format: `<DOMAIN>.<RESOURCE>.<ACTION>`:

- `PROCUREMENT.GRN.CREATE`
- `PROCUREMENT.GRN.CLOSE`
- `QC.INSPECTION.EXECUTE`
- `INVENTORY.RFID.TRIGGER_PRINT`
- `INVENTORY.STOCK.APPROVE`
- `STORAGE.VAULT.TRANSFER`

#### Global Administrator Governance

As observed in `DOC-03`, a `Global Administrator` role exists with elevated system-wide privileges.

- **Architectural Safeguard:** A global administrator must NOT bypass business-state validation. Even a global admin cannot approve an inventory item that failed QC or mark a closed GRN as draft.
- Every action taken under global admin privileges must emit an explicit high-priority audit record (`severity: 'SECURITY_CRITICAL'`).

---

## 12. Background Job and RFID Execution Review

### 12.1 The Redis / BullMQ Architecture in Express

Asynchronous processing is necessary because physical RFID hardware operations are slow, latency-variable, and prone to environmental failures (ribbon jams, power outages, local network drops).

```
[ Express API (Producer) ]
            |
            | 1. Enqueue Job via Outbox Dispatcher
            v
+----------------------------------------------------------------------------------------------------+
| Redis 7+ BullMQ Queue: `rfid-print-jobs`                                                           |
| - Payload: { jobId, storeId, hostId, items: [ { itemId, serialNumber, epc, sku, metal, weight } ] }|
+----------------------------------------------------------------------------------------------------+
            |
            | 2. Worker Consumer Pulls Job
            v
+----------------------------------------------------------------------------------------------------+
| Dedicated Background Worker Process (apps/worker)                                                  |
| - Validates Job Preconditions against PostgreSQL                                                   |
| - Updates Job Status to 'PRINTING'                                                                 |
+----------------------------------------------------------------------------------------------------+
            |
            | 3. Network Call (mTLS / WebSocket / Agent)
            v
+----------------------------------------------------------------------------------------------------+
| Local Print Client (Store PC: e.g. LAPTOP-K074QR9M)                                                |
| - Interacts with Zebra / Sato / Citizen RFID Printer via local USB / Ethernet                      |
| - Encodes EPC Memory Bank + Thermal Transfers Barcode / Text Label                                 |
| - Reads TID to verify successful burn                                                              |
+----------------------------------------------------------------------------------------------------+
            |
            | 4. Hardware Result Callback
            v
+----------------------------------------------------------------------------------------------------+
| Worker Updates PostgreSQL:                                                                        |
| - Records RFIDTag record (EPC, TID)                                                                |
| - Creates active RFIDTagAssignment                                                                 |
| - Updates Job Status to 'COMPLETED' (or 'FAILED')                                                  |
+----------------------------------------------------------------------------------------------------+
```

### 12.2 Reassessed RFID Failure Handling: Four Distinct Failure Scenarios

The earlier blanket proposal that "all retries must be disabled (`attempts: 1`)" was technically flawed. Blind retries of physical commands cause duplicate tags, but disabling all software retries prevents recovery from transient network or database blips.

The architecture must distinguish four discrete failure scenarios:

```
+----------------------------------------------------------------------------------------------------+
| Scenario 1: Failures Occurring Before Operation Dispatch                                           |
| - Description: Transient Redis connection drop, database lock timeout while loading job context,   |
|   or worker outbox serialization failure before transmitting data to the local print client.       |
| - Physical Outcome: Hardware was NEVER contacted; no tag has been printed or burned.               |
| - Recommended Handling: SAFE FOR AUTOMATIC RETRY. BullMQ configured with exponential backoff       |
|   (e.g., 3 attempts, initial delay 2s).                                                            |
+----------------------------------------------------------------------------------------------------+
| Scenario 2: Failures with Confirmed Dispatch but Unconfirmed Completion                            |
| - Description: Payload sent to local client via HTTP/WebSocket, but connection drops, times out,    |
|   or worker crashes before receiving completion response.                                          |
| - Physical Outcome: AMBIGUOUS. The printer may have burned the tag, failed halfway, or queued it.   |
| - Recommended Handling: STRICTLY FORBID AUTOMATIC RETRY. Worker transitions job to                 |
|   `NEEDS_RECONCILIATION`. Outbox processing halts for this job. BullMQ does NOT re-queue.          |
|   Requires operator physical verification in the showroom.                                         |
+----------------------------------------------------------------------------------------------------+
| Scenario 3: Failures After Confirmed Successful Physical Operation                                 |
| - Description: Local print client reports success (TID and EPC verified on silicon), but the worker|
|   fails to update PostgreSQL due to database restart or network partition.                         |
| - Physical Outcome: The physical tag exists and is valid; digital state is temporarily lagging.    |
| - Recommended Handling: SAFE FOR IDEMPOTENT SOFTWARE RETRY. The worker retries the database update|
|   using the returned EPC/TID as an idempotency key: `ON CONFLICT (epc) DO UPDATE...`               |
+----------------------------------------------------------------------------------------------------+
| Scenario 4: Confirmed Hardware Errors & Defective Media                                             |
| - Description: Local client reports printer ribbon jam, out-of-labels, RFID chip write-verify      |
|   mismatch, or defective silicon transponder.                                                      |
| - Physical Outcome: Tag is physically destroyed, misprinted, or unencoded.                          |
| - Recommended Handling: TERMINAL FAILURE. BullMQ marks job `FAILED_HARDWARE_ERROR`. If a physical  |
|   tag was partially spoiled, the operator triggers a `Void & Re-tag` flow with a fresh EPC.        |
+----------------------------------------------------------------------------------------------------+
```

> **Fundamental Principle:** BullMQ alone cannot guarantee exactly-once physical execution. Software idempotency must be coupled with physical verification gateways for ambiguous hardware outcomes.

---

## 13. Jewellery-Specific Financial and Measurement Questions

Jewellery operations have unique domain characteristics that standard ERP schemas cannot handle without explicit business rules.

### 13.1 Weight Mechanics & Measurement Tolerances

1. **Gross vs. Net Weight:**
   - **Gross Weight:** Total weight of the jewellery piece, including precious metals, gemstones, pearls, enamels, and non-metal elements.
   - **Net Weight:** Weight of the precious metal alone (Gross Weight minus Total Gemstone Weight).
   - **Financial Consequence:** The metal value is calculated strictly on **Net Weight**, whereas freight, customs, and initial physical intake track **Gross Weight**.
2. **Tolerance Thresholds:** High-precision scales fluctuate due to air currents, dust, or calibration differences.
   - _Question for Stakeholders (`BIZ-Q03`):_ What is the acceptable tolerance between Supplier Declared Gross Weight and Measured Intake Gross Weight? (Typical industry standard: ±0.01g for gold, ±0.001ct for diamonds). If variance exceeds this, does the system block intake or generate a supplier discrepancy claim?

### 13.2 Gemstone Characteristics & The "Section 108" Anomaly

In `JEWELLERY_ERP_PROJECT_OVERVIEW.md` Section 108, an observation notes that the QC screen in UAT showed _"No stone details found"_, while the final stock catalog displayed rich gemstone grading (_Natural Pearl, Princess Cut, Flawless Clarity, D1 Color_).

- **Domain Root Cause Analysis:** In jewellery procurement, raw shipments are often received with bulk gemstone estimates. Detailed gemological grading (the 4Cs: Carat, Cut, Color, Clarity) and certificate linking (GIA, IGI) occur as a **secondary enrichment step** during QC inspection or prior to catalog publishing.
- **Architectural Resolution:** The domain model must provide an explicit `item_gemstones` sub-entity linked to `inventory_items`, allowing progressive enrichment between initial intake and final stock approval.

### 13.3 Commercial & Retail Pricing Formulas

Pricing in jewellery is dynamic and depends on daily fluctuating metal spot rates:

- **Retail Selling Price Formula (Target Baseline Proposal):**
  $$\text{Retail Price} = (\text{Net Weight} \times \text{Spot Rate} \times \text{Purity \%}) + (\text{Gross Weight} \times \text{Labour/Making Charge}) + \text{Gemstone Value} + \text{Wastage Allowance}$$
- **Buyback Valuation Formula (Target Baseline Proposal):**
  $$\text{Buyback Price} = (\text{Net Weight} \times \text{Buyback Spot Rate} \times \text{Purity \%}) - \text{Refining Melt Deduction}$$
- _Unresolved Business Decisions:_
  - `BIZ-Q06`: Are making charges calculated per gram, as a fixed flat rate per design, or as a percentage of metal value?
  - `BIZ-Q07`: Does buyback include stone value recovery, or is buyback strictly calculated on melt metal?
  - `BIZ-Q08`: What exact legal rounding rule governs customer invoice totals?
  - How frequently are spot rates updated (daily manual entry vs. real-time market API)?

> **Preservation of Business Uncertainty:** These pricing formulas and numeric precision recommendations are engineering proposals, **not** stakeholder-confirmed requirements. They do not block logical modeling but must be confirmed before commercial checkout DDL is finalized.

---

## 14. Missing Entities and Potentially Unnecessary Entities

### 14.1 Missing Entities Required for Core MVP

1. **`TransactionalOutbox` (`outbox_events`):** Required to eliminate the dual-write hazard between PostgreSQL state commits and BullMQ queue dispatches.
2. **`ItemGemstoneDetail` (`item_gemstones`):** Required to support individual stone weights, caratage, cuts, and certification numbers, resolving the Section 108 discrepancy.
3. **`DailyMarketSpotRate` (`daily_market_rates`):** Required to capture effective store/organization metal spot prices per purity for retail and buyback pricing.
4. **`InventoryTransferRequest` & `InventoryTransferItem`:** Required to model safe custody transfers when moving physical assets between `STORE001` and `STORE002` (in-transit escrow state).
5. **`StockAuditReconciliation` (`stock_audit_records`):** Required to support the physical stock audit ledger described in `DOC-03`, comparing digital inventory with physical RFID scan counts.

### 14.2 Potentially Unnecessary or Premature Entities for Phase 0

1. **`GeneralLedgerJournal`, `LedgerAccount`, `TreasuryTransaction`:** Explicitly deferred by Phase 0 Baseline. Introducing complex financial ledger tables now will divert focus from core physical asset traceability.
2. **Redundant Intake Entities (`IntakeRecord` vs. `ShipmentItem`):** In `DOC-02`, both `IntakeRecord` and `ShipmentItem` are proposed. They represent the exact same concept: the received line item of a shipment. **Recommendation:** Consolidate into `shipment_items`.
3. **`UINavigationTree` Database Entity:** In `DOC-03`, `/api/v1/RBAC/get.iam.ui.navigation.tree` is mentioned. UI navigation structures should be derived dynamically from user permissions in application code rather than stored in a mutable relational table.

---

## 15. Conflicting or Ambiguous Requirements

```
+----------------------------------------------------------------------------------------------------+
| Conflict 1: NestJS Framework Artifacts vs. Express 5 Greenfield Mandate                           |
| - Evidence: DOC-03 describes NestJS guards, interceptors, modules, and decorators throughout.       |
| - Impact: Risk of junior engineers attempting to recreate NestJS DI containers inside Express.      |
| - Resolution: Enforce Express idiomatic patterns: explicit composition root, functional middleware.|
+----------------------------------------------------------------------------------------------------+
| Conflict 2: Physical Piece Serial vs. Commercial Stock Keeping Unit (SKU)                          |
| - Evidence: DOC-03 uses SKU as unique piece code (B10000C2), but D-02 questions serialization.    |
| - Impact: Inability to support non-serialized batch items; schema breakage if SKU is made UNIQUE. |
| - Resolution: Formally split Product SKU (variant definition) from InventoryItem (serialized piece)|
+----------------------------------------------------------------------------------------------------+
| Conflict 3: GRN Closure Rules vs. Incomplete Quality Inspection                                    |
| - Evidence: DOC-02 leaves GRN closure rules open; DOC-03 shows Closed GRNs with pending lines.     |
| - Impact: Corrupted procurement accounting; intake quantities failing to match stock check-ins.     |
| - Resolution: Disallow GRN closure until 100% of shipment items are resolved (proposed baseline     |
|   enforced in GrnService application transaction; subject to BIZ-Q04 stakeholder confirmation).     |
+----------------------------------------------------------------------------------------------------+
| Conflict 4: Multi-Tenant SaaS vs. Multi-Branch Operating Model                                     |
| - Evidence: DOC-01/02 references "Organization / Tenant (exact meaning TBD)".                      |
| - Impact: Unclear data-sharing rules for customers, products, and cross-store inventory lookups.   |
| - Resolution: Preserve multi-tenant compatibility via `organization_id` on root aggregates.        |
+----------------------------------------------------------------------------------------------------+
```

---

## 16. Corrected Findings Register

Each significant finding identified during the architectural audit is documented below with its impact, technical evidence, and recommended resolution. Existing finding IDs (`FIND-01` through `FIND-08`) are preserved.

```
+-----------------------------------------------------------------------------------------------------+
| FINDING ID: FIND-01                                              | PRIORITY: P0 (BLOCKS PHYSICAL DDL|
+------------------------------------------------------------------+----------------------------------+
| Affected Entity / Document: `InventoryItem` vs `SKU` | DOC-01 (D-02), DOC-02 (Sec 2.5), DOC-03 (Sec 61)   |
+-----------------------------------------------------------------------------------------------------+
| EVIDENCE:                                                                                           |
| DOC-03 Section 42 lists SKU "B10000C2" with 10g weight, treating it as an individual piece. DOC-01  |
| Section 16 Decision D-02 explicitly asks: "Is each jewellery piece individually serialized?"        |
|                                                                                                     |
| EXPLANATION:                                                                                        |
| Conflating the commercial catalog variant (SKU) with the serialized physical asset makes it         |
| impossible to handle multiple identical physical items sharing one design, and prevents handling    |
| non-serialized bulk stock (silver findings, beads).                                                |
|                                                                                                     |
| BUSINESS IMPACT:                                                                                    |
| Retail stock counts will fail; duplicate SKU errors will reject valid inventory intake; bulk stock  |
| cannot be tracked.                                                                                  |
|                                                                                                     |
| RECOMMENDED RESOLUTION:                                                                             |
| Create two distinct relational tables: `product_skus` (defines commercial variant, code, target     |
| specifications, `tracking_type`) and `inventory_items` (contains individual serial number, exact    |
| measured weights, physical custody, and link to SKU). Logical model can proceed immediately.        |
|                                                                                                     |
| BLOCKS LOGICAL ERD: NO                                           | BLOCKS PHYSICAL DDL: YES         |
| DEPENDENT BUSINESS QUESTION: BIZ-Q02 (Serialization Scope)       | CONFIDENCE: HIGH                 |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| FINDING ID: FIND-02                                              | PRIORITY: P0 (BLOCKS PHYSICAL DDL|
+------------------------------------------------------------------+----------------------------------+
| Affected Entity / Document: Storage & Organization Model | DOC-01 (D-01), DOC-02 (Sec 2.7), DOC-03  |
+-----------------------------------------------------------------------------------------------------+
| EVIDENCE:                                                                                           |
| DOC-02 Section 2.7 shows hierarchy: Store -> Vault -> Locker -> Compartment. DOC-01 D-01 lists      |
| Organization vs Store tenancy as unresolved.                                                        |
|                                                                                                     |
| EXPLANATION:                                                                                        |
| Without composite foreign keys incorporating `store_id`, an item physically stored in Store A could |
| be assigned to a vault compartment belonging to Store B via a corrupted or manipulated API payload. |
|                                                                                                     |
| BUSINESS IMPACT:                                                                                    |
| Severe physical security violation: digital custody reports will direct showroom staff to search   |
| the wrong physical vault in the wrong store.                                                        |
|                                                                                                     |
| RECOMMENDED RESOLUTION:                                                                             |
| Model `Organization` as enterprise parent and `Store` as operational branch. Enforce composite      |
| unique and foreign key constraints on `(id, store_id)` across Vaults, Lockers, Compartments, and    |
| Inventory Items. Logical model proceeds with `organization_id` on root entities.                    |
|                                                                                                     |
| BLOCKS LOGICAL ERD: NO                                           | BLOCKS PHYSICAL DDL: YES         |
| DEPENDENT BUSINESS QUESTION: BIZ-Q01 (Tenancy Model)             | CONFIDENCE: HIGH                 |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| FINDING ID: FIND-03                                              | PRIORITY: P0 (ARCHITECTURAL FIX) |
+------------------------------------------------------------------+----------------------------------+
| Affected Entity / Document: `RFIDTag` & Replacement History | DOC-02 (Sec 2.6), DOC-03 (Sec 60)     |
+-----------------------------------------------------------------------------------------------------+
| EVIDENCE:                                                                                           |
| DOC-03 Section 60 highlights `DamagedTag/Relocation.RFIDTagging` jobs. DOC-02 Section 2.6 requires   |
| tag replacement without losing physical item identity.                                              |
|                                                                                                     |
| EXPLANATION:                                                                                        |
| If `rfid_tag` or `rfid_epc` is modeled as a direct column on `inventory_items`, replacing a tag     |
| erases historical traceability and breaks historical scan audit logs.                               |
|                                                                                                     |
| BUSINESS IMPACT:                                                                                    |
| Audit investigations cannot verify which physical tag was on an item when it was audited or moved. |
|                                                                                                     |
| RECOMMENDED RESOLUTION:                                                                             |
| Decouple tags into `rfid_tags` and `rfid_tag_assignments`. Enforce partial unique indexes in        |
| PostgreSQL so an item has at most one ACTIVE tag, and a tag has at most one ACTIVE item, while     |
| retaining auditable lifecycle history. Coordinated locking on `inventory_items` governs lifecycle.  |
|                                                                                                     |
| BLOCKS LOGICAL ERD: NO                                           | BLOCKS PHYSICAL DDL: NO          |
| CONFIDENCE: HIGH                                                                                    |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| FINDING ID: FIND-04                                              | PRIORITY: P0 (BLOCKS PHYSICAL DDL|
+------------------------------------------------------------------+----------------------------------+
| Affected Entity / Document: Monetary & Weight Precision | DOC-01 (Sec 10.12), DOC-02 (Sec 8.7)      |
+-----------------------------------------------------------------------------------------------------+
| EVIDENCE:                                                                                           |
| DOC-01 Rule 12 forbids binary floating-point. DOC-02 Decision 7/8 leaves weight and monetary         |
| precision unresolved.                                                                               |
|                                                                                                     |
| EXPLANATION:                                                                                        |
| Standardizing column definitions on imprecise types (`FLOAT`, `DOUBLE PRECISION`, or generic        |
| `NUMERIC` without precision/scale) causes calculation drift and rounding discrepancies.             |
|                                                                                                     |
| BUSINESS IMPACT:                                                                                    |
| Cumulative financial errors on gold transactions; regulatory non-compliance on precious metal       |
| weights.                                                                                            |
|                                                                                                     |
| RECOMMENDED RESOLUTION:                                                                             |
| Establish provisional engineering types: precious metals `NUMERIC(10, 4)` grams, gemstones          |
| `NUMERIC(8, 4)` carats, purity `NUMERIC(7, 4)` percentage (or `NUMERIC(5, 4)` ratio), spot rates     |
| `NUMERIC(14, 4)`, and settlement totals `NUMERIC(14, 2)`. All proposed types remain provisional      |
| pending client sign-off under DEC-05; logical modeling defines attributes and units unblocked.      |
|                                                                                                     |
| BLOCKS LOGICAL ERD: NO (Units known)                             | BLOCKS PHYSICAL DDL: YES         |
| DEPENDENT BUSINESS QUESTIONS: BIZ-Q03 (Weight Tol), DEC-05 (Scale)| CONFIDENCE: HIGH               |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| FINDING ID: FIND-05                                              | PRIORITY: P1 (BLOCKS WORKER IMPL)|
+------------------------------------------------------------------+----------------------------------+
| Affected Entity / Document: Queue & DB Dual-Write Hazard | DOC-01 (Sec 11), DOC-02 (Sec 6.3)        |
+-----------------------------------------------------------------------------------------------------+
| EVIDENCE:                                                                                           |
| DOC-01 Section 11 and DOC-02 Section 6.3 state: "Do not assume a PostgreSQL transaction can         |
| atomically commit a Redis job."                                                                     |
|                                                                                                     |
| EXPLANATION:                                                                                        |
| Direct invocations of `bullmq.add()` inside Express handlers after DB commit can fail silently if   |
| Redis drops, leaves the queue partitioned, or restarts, creating phantom unqueued state mutations. |
|                                                                                                     |
| BUSINESS IMPACT:                                                                                    |
| Physical tags will not print; items get stuck in limbo between QC and storage.                      |
|                                                                                                     |
| RECOMMENDED RESOLUTION:                                                                             |
| Implement an `outbox_events` table in PostgreSQL written atomically in the same transaction as the  |
| domain mutation. A separate dispatcher process publishes pending events to BullMQ, achieving        |
| at-least-once delivery under retry/recovery assumptions, while consumers enforce idempotency as an  |
| independent duplicate-safety requirement. An outbox record alone does not guarantee queue delivery; |
| persistent failures require defined retry thresholds and operational alerting. No distributed 2PC. |
|                                                                                                     |
| BLOCKS LOGICAL ERD: NO                                           | BLOCKS PHYSICAL DDL: NO          |
| CONFIDENCE: HIGH                                                                                    |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| FINDING ID: FIND-06                                              | PRIORITY: P1 (ENRICHMENT MODEL)  |
+------------------------------------------------------------------+----------------------------------+
| Affected Entity / Document: Gemstone Enrichment Lifecycle | DOC-03 (Sec 55, 108)                    |
+-----------------------------------------------------------------------------------------------------+
| EVIDENCE:                                                                                           |
| DOC-03 Section 108 records that UAT QC screens show "No stone details", while final catalog shows  |
| rich 4Cs grading data.                                                                              |
|                                                                                                     |
| EXPLANATION:                                                                                        |
| Early intake inspection only checks gross presence of stones; detailed 4Cs grading and certificate  |
| binding occurs after initial intake but before stock approval.                                      |
|                                                                                                     |
| BUSINESS IMPACT:                                                                                    |
| Showroom staff cannot display certified stone credentials to buyers; high-value diamond data lost.  |
|                                                                                                     |
| RECOMMENDED RESOLUTION:                                                                             |
| Model `item_gemstones` with progressive validation: nullable 4Cs at intake, mandatory grading fields |
| enforced before stock approval if category is `Diamond Jewellery (DJ)`.                             |
|                                                                                                     |
| BLOCKS LOGICAL ERD: NO                                           | BLOCKS PHYSICAL DDL: NO          |
| CONFIDENCE: HIGH                                                                                    |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| FINDING ID: FIND-07                                              | PRIORITY: P2 (DESIGN DEBT)       |
+------------------------------------------------------------------+----------------------------------+
| Affected Entity / Document: Express Modular Monolith Scaffolding | DOC-01 (Sec 6, 8), DOC-03        |
+-----------------------------------------------------------------------------------------------------+
| EVIDENCE:                                                                                           |
| DOC-03 is structured around NestJS modules and decorators; DOC-01 mandates Express 5.               |
|                                                                                                     |
| EXPLANATION:                                                                                        |
| Without explicit conventions, Express monoliths devolve into spaghetti code with circular router    |
| dependencies and cross-module database mutations.                                                   |
|                                                                                                     |
| BUSINESS IMPACT:                                                                                    |
| High refactoring costs, brittle integration tests, and unpredictable middleware execution order.   |
|                                                                                                     |
| RECOMMENDED RESOLUTION:                                                                             |
| Enforce strict feature-module boundaries with explicit router factories and shared middleware in    |
| `apps/api/src/modules/`.                                                                            |
|                                                                                                     |
| BLOCKS LOGICAL ERD: NO                                           | BLOCKS PHYSICAL DDL: NO          |
| CONFIDENCE: HIGH                                                                                    |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| FINDING ID: FIND-08                                              | PRIORITY: P2 (DESIGN DEBT)       |
+------------------------------------------------------------------+----------------------------------+
| Affected Entity / Document: Consolidation of Intake vs Shipment Line | DOC-02 (Sec 2.3)             |
+-----------------------------------------------------------------------------------------------------+
| EVIDENCE:                                                                                           |
| DOC-02 proposes both `IntakeRecord` and `Shipment` received items. DOC-03 Section 38/39 uses both.  |
|                                                                                                     |
| EXPLANATION:                                                                                        |
| Having both `IntakeRecord` and `ShipmentItem` creates an unnecessary 1:1 join with identical data.  |
|                                                                                                     |
| BUSINESS IMPACT:                                                                                    |
| Query complexity, redundant tables, and confusion during GRN processing.                           |
|                                                                                                     |
| RECOMMENDED RESOLUTION:                                                                             |
| Consolidate into `shipment_items` representing the individual intake line items under a `shipment`.|
|                                                                                                     |
| BLOCKS LOGICAL ERD: NO                                           | BLOCKS PHYSICAL DDL: NO          |
| CONFIDENCE: HIGH                                                                                    |
+-----------------------------------------------------------------------------------------------------+
```

---

## 17. Revalidated High-Impact Architectural Decisions

This section performs an independent quality re-validation of the ten high-impact architectural decisions. For each decision, we record the original proposal, documented evidence, engineering trade-offs, risks, recommendation, formal status, and whether it blocks database design (distinguishing logical modeling from physical DDL).

Allowed Decision Statuses: `PROPOSED`, `APPROVED`, `REQUIRES_BUSINESS_CONFIRMATION`, `REQUIRES_TECHNICAL_VALIDATION`, `DEFERRED`, `REJECTED`.

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 01: Product, ProductSku, InventoryItem, and RFIDTag Decoupling                             |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    DOC-03 Section 61 conceptualized Product -> SKU -> RFID. Earlier draft proposed strict 4-tier     |
|    decoupling: Product (design), ProductSku (variant), InventoryItem (physical piece), RFIDTag.     |
| 2. Evidence from Documents:                                                                         |
|    DOC-01 D-02 explicitly asks: "Is each piece serialized, or can a SKU represent a batch?"         |
|    DOC-03 Section 42 lists SKU B10000C2 with 10g weight, treating it as an individual piece.        |
| 3. Engineering Trade-Offs:                                                                          |
|    - 4-Tier Model: Adds relational joins for simple items, but cleanly separates catalogue variant  |
|      specifications from physical serialized assets, allowing multiple pieces to share one SKU.     |
|    - Collapsed Model (SKU = Item): Simpler schema, but catastrophic failure when procuring 20 rings |
|      of the same design or handling non-serialized findings (clasps, beads).                        |
| 4. Business & Technical Risks:                                                                      |
|    Conflating SKU with serialized item prevents quantity-based inventory and causes duplicate SKU   |
|    database collisions.                                                                             |
| 5. Recommended Decision:                                                                            |
|    Adopt the 4-tier model for high-value precious jewellery. Place immutable `tracking_type` on     |
|    `ProductSku` (populated from `Product.default_tracking_type` at creation) to allow both          |
|    serialized items and quantity-batch balances.                                                    |
| 6. Decision Status: PROPOSED                                                                        |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (Logical model represents both paths via `ProductSku.tracking_type`).   |
|    - BLOCKS PHYSICAL DDL: YES (Pending BIZ-Q02 on whether batch balance table is in Phase 0 DDL).   |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 02: Enterprise Multi-Branch vs. Multi-Tenant Architecture                                  |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    Earlier draft declared the system "Enterprise Multi-Branch by default" and called it adopted.    |
| 2. Evidence from Documents:                                                                         |
|    DOC-01 D-01 lists: "One organization or true multi-tenant platform? Status: Open."                |
|    DOC-03 Section 15 notes active store STORE001 and Canadian stores under a Head Office GUID.      |
| 3. Engineering Trade-Offs:                                                                          |
|    - Single-Enterprise Multi-Branch: Shared catalogue, centralized customers, simpler foreign keys. |
|    - Multi-Tenant SaaS: Strict database/row-level tenant scoping via composite tenant indexes and    |
|      tenant-aware foreign keys on every table; prevents data leakage between rival retailers, but   |
|      increases query complexity and schema maintenance overhead.                                    |
| 4. Business & Technical Risks:                                                                      |
|    Prematurely locking the schema to single-enterprise will require expensive schema migrations if  |
|    the commercial goal is a multi-tenant SaaS offering for external retail brands.                  |
| 5. Recommended Decision:                                                                            |
|    Maintain `organization_id` on all root aggregates as a prospective tenant key. Logical modeling  |
|    proceeds unblocked; lock physical composite tenant indexes, tenant-aware foreign keys, and       |
|    organization scoping after BIZ-Q01.                                                              |
| 6. Decision Status: REQUIRES_BUSINESS_CONFIRMATION                                                  |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (Logical entities include `organization_id` as foreign key).            |
|    - BLOCKS PHYSICAL DDL: YES (Physical composite tenant indexes depend on BIZ-Q01).                |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 03: Organization and Store Ownership Model                                                 |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    Selective ownership: Master data owned by Organization; Inventory, Storage, and Staff owned by   |
|    Store.                                                                                           |
| 2. Evidence from Documents:                                                                         |
|    DOC-02 Section 2.1: "Requests must resolve authenticated user, active membership, store, and      |
|    resource scope." DOC-03 Section 68 lists store codes STORE001, STORE002.                         |
| 3. Engineering Trade-Offs:                                                                          |
|    - Selective Ownership: Highly accurate real-world reflection; prevents redundant store copies of  |
|      standard gold purities and categories.                                                         |
|    - Blanket Store Ownership: Duplicates product master data per store; high maintenance overhead.  |
| 4. Business & Technical Risks:                                                                      |
|    Omitting `store_id` on physical storage tables allows items in Store A to be assigned to Store B. |
| 5. Recommended Decision:                                                                            |
|    Organization owns `Product`, `Category`, `Material`, `Purity`, `Gemstone`, `Role`.                |
|    Store owns `Vault`, `Locker`, `Compartment`, `InventoryItem` (current custody), `GRN`, `RFIDJob`. |
| 6. Decision Status: PROPOSED                                                                        |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (Ownership relationships are fully mapped).                             |
|    - BLOCKS PHYSICAL DDL: NO (Composite foreign keys (id, store_id) are validated).                 |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 04: Primary Key Strategy (Application-Generated UUIDv7)                                    |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    Earlier draft recommended an unnecessary blocking technical spike for UUIDv7 in PostgreSQL 16.    |
| 2. Evidence from Documents:                                                                         |
|    DOC-01/02/03 do not mandate UUIDv7. PostgreSQL 18 includes native `uuidv7()`.                    |
| 3. Engineering Trade-Offs:                                                                          |
|    - App-Generated UUIDv7: Fully portable across all PostgreSQL versions (PG 14-18) and managed cloud|
|      engines (RDS, Aurora, Supabase, Neon). Excellent B-Tree clustering, client pre-allocable.      |
|    - BIGSERIAL: Compact (8 bytes), but sequential numbers leak business volumes and order counts.   |
| 4. Business & Technical Risks:                                                                      |
|    Waiting for a database spike blocks conceptual/logical work unnecessarily for a solved pattern.  |
| 5. Recommended Decision:                                                                            |
|    Standardize on Application-Level Generation and Validation of UUIDv7 in Express 5 entity          |
|    factories (validating RFC 9562 version 7 and variant bits), stored in native `uuid` columns with  |
|    `id UUID PRIMARY KEY` and NO default clause. Omitting the default prevents accidental fallback to |
|    legacy UUIDv4. Direct SQL writes fall outside this application boundary unless engine check       |
|    constraints (PG18 uuid_extract_version IS NOT NULL AND = 7 or PG14–17 substring checks) are       |
|    installed. UUIDv7 exposes timestamp metadata and must never serve as an authorization token.       |
| 6. Decision Status: PROPOSED (Resolved technically; no blocking spike required)                     |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (PK strategy does not block conceptual/logical modeling).               |
|    - BLOCKS PHYSICAL DDL: NO (Standard `uuid` column type applies across all tables).               |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 05: PostgreSQL Numeric Precision for Weights, Purity, and Prices                           |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    Earlier draft proposed `NUMERIC(10, 4)` for all weights and `NUMERIC(14, 4)` for money.          |
| 2. Evidence from Documents:                                                                         |
|    DOC-01 Rule 12 forbids binary floating point. DOC-02 Decision 7/8 marks precision as Open.       |
|    DOC-03 Section 45 shows weights in grams (GM) and Section 39 shows CAD$.                         |
| 3. Engineering Trade-Offs:                                                                          |
|    - Decoupled Precision: Physical measurement precision reflects balance resolution (0.1mg);       |
|      financial precision reflects currency settlement, labour making rates, and spot rates.         |
| 4. Business & Technical Risks:                                                                      |
|    Inaccurate scale causes rounding drift on precious metals or regulatory non-compliance with legal|
|    metrology requirements.                                                                          |
| 5. Recommended Decision:                                                                            |
|    Metal weights: proposed `NUMERIC(10, 4)` grams. Gemstones: proposed `NUMERIC(8, 4)` carats.      |
|    Purity: proposed `NUMERIC(7, 4)` percentage (0.0000% to 100.0000%, correcting NUMERIC(6,4)      |
|    overflow at 100%) or `NUMERIC(5, 4)` ratio. Unit labour rates: proposed `NUMERIC(12, 4)`. Metal   |
|    spot rates: proposed `NUMERIC(14, 4)`. In-scope supplier procurement line totals: proposed       |
|    `NUMERIC(14, 2)`. Confirm BIZ-Q03 (tolerance) and DEC-05 (storage scales). Customer invoice      |
|    rounding (BIZ-Q08) belongs to deferred commercial modules.                                       |
| 6. Decision Status: REQUIRES_BUSINESS_CONFIRMATION                                                  |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (Logical attributes and measurement units are fully defined).           |
|    - BLOCKS PHYSICAL DDL: YES (Physical column precision for weights, purity, and in-scope          |
|      procurement line totals requires client sign-off under DEC-05).                                |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 06: RFID Tag Assignment History and Decoupling                                             |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    Model `rfid_tags` and `rfid_tag_assignments` ledger with PostgreSQL partial unique indexes.      |
| 2. Evidence from Documents:                                                                         |
|    DOC-01 Rule 6: "Item identity and RFID identity must be separate so a damaged tag can be replaced|
|    without losing history." DOC-03 Section 60 highlights damaged tag replacement jobs.               |
| 3. Engineering Trade-Offs:                                                                          |
|    - Auditable Assignment Model: Rows are never deleted; retirement updates status and timestamps;  |
|      partial unique index guarantees at most one active tag per item while retaining full history.  |
|    - Direct Column: Simpler queries, but irrevocably overwrites history when a tag breaks.          |
| 4. Business & Technical Risks:                                                                      |
|    Direct column prevents forensic audit investigations on previously scanned tags.                 |
| 5. Recommended Decision:                                                                            |
|    Adopt the auditable `rfid_tag_assignments` table with partial unique index for ACTIVE tags.     |
| 6. Decision Status: PROPOSED                                                                        |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (Relational structure is defined).                                      |
|    - BLOCKS PHYSICAL DDL: NO (Partial index syntax `WHERE status = 'ACTIVE'` is verified).          |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 07: Transactional Outbox Pattern for BullMQ Queue Dispatch                                 |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    Introduce `outbox_events` table in PostgreSQL to eliminate the queue dual-write problem.         |
| 2. Evidence from Documents:                                                                         |
|    DOC-01 Section 11 & DOC-02 Section 6: "Do not assume PostgreSQL can atomically commit Redis state|
|    Evaluate transactional outbox or another reliable handoff pattern."                              |
| 3. Engineering Trade-Offs:                                                                          |
|    - Transactional Outbox Pattern: Business mutations and outbox events commit atomically in local   |
|      PostgreSQL transactions. An outbox record alone does not guarantee queue delivery; a separate   |
|      background dispatcher publishes pending events to BullMQ. At-least-once delivery is achieved    |
|      via dispatcher polling, retries, and crash-recovery under operational availability assumptions. |
|      Downstream consumers enforce idempotency as an independent duplicate-safety requirement.       |
|      Persistent failures trigger observable FAILED states, dead-letter logging, and alerts. No 2PC.  |
|    - Direct Queue Push: Simpler code, but risks silent job loss if Redis drops during HTTP request. |
| 4. Business & Technical Risks:                                                                      |
|    Direct push causes phantom inventory states (approved in DB, but never printed or queued).      |
| 5. Recommended Decision:                                                                            |
|    Adopt `outbox_events` in PostgreSQL for asynchronous triggers. Rely on dispatcher retries and     |
|    consumer idempotency for duplicate safety, with alerting for persistent dispatch failures.       |
| 6. Decision Status: PROPOSED                                                                        |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (Table is independent operational infrastructure).                      |
|    - BLOCKS PHYSICAL DDL: NO (Schema is simple: id, topic, payload, status, created_at).            |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 08: RFID Failure Handling, Retry Behavior, and Reconciliation Gateway                      |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    Earlier draft proposed blanket `attempts: 1` disabling all retries.                              |
| 2. Evidence from Documents:                                                                         |
|    DOC-01 Rule 11: "Queue retries must not silently duplicate business state or assume printing      |
|    succeeded when outcome is ambiguous." DOC-03 Section 52 notes local print client architecture.   |
| 3. Engineering Trade-Offs:                                                                          |
|    - Blanket Disabling: Prevents duplicate tags, but crashes on transient network drops.            |
|    - 4-Scenario Model: Auto-retry for software pre-dispatch, halt on in-flight timeout, idempotent   |
|      retry for post-print DB update, manual void flow for hardware faults.                          |
| 4. Business & Technical Risks:                                                                      |
|    Blind retries print duplicate physical tags, breaking physical retail inventory counts.          |
| 5. Recommended Decision:                                                                            |
|    Adopt the 4-Scenario failure model. Implement an operator reconciliation gateway for in-flight   |
|    timeouts. Prohibit BullMQ automatic retries for unconfirmed physical print dispatches.            |
| 6. Decision Status: PROPOSED                                                                        |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (Failure states handled in RFID job status enum).                       |
|    - BLOCKS PHYSICAL DDL: NO (Column types for job status confirmed).                               |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 09: GRN, Shipment, Intake, and QC Aggregate Hierarchy                                      |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    Consolidate redundant `IntakeRecord` and `ShipmentItem` into unified `ShipmentItem` line items.  |
| 2. Evidence from Documents:                                                                         |
|    DOC-02 Section 2.3 proposes both IntakeRecord and ShipmentItem. DOC-03 Section 38/39 uses both.  |
| 3. Engineering Trade-Offs:                                                                          |
|    - Consolidated Hierarchy: `GRN 1->* Shipment 1->* ShipmentItem 1->1 QCItem`. Clear, non-redundant.|
|    - Separate IntakeRecord: Creates a useless 1:1 join with identical weight and quantity data.     |
| 4. Business & Technical Risks:                                                                      |
|    Redundant tables create data synchronization anomalies during intake.                            |
| 5. Recommended Decision:                                                                            |
|    Standardize on `GRN` -> `Shipment` -> `ShipmentItem`. Link `QualityCheckItem` directly to         |
|    `ShipmentItem`.                                                                                  |
| 6. Decision Status: PROPOSED                                                                        |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (Hierarchy is clear and validated).                                     |
|    - BLOCKS PHYSICAL DDL: NO (Table schemas confirmed).                                             |
+-----------------------------------------------------------------------------------------------------+
```

```
+-----------------------------------------------------------------------------------------------------+
| DECISION 10: Multi-Dimensional Inventory State Transitions & Approval Gate                          |
+-----------------------------------------------------------------------------------------------------+
| 1. Original Proposal:                                                                               |
|    Replace monolithic status enum with 4 orthogonal dimensions: Quality, Custody, Approval,         |
|    Commercial Availability.                                                                         |
| 2. Evidence from Documents:                                                                         |
|    DOC-02 Section 4.3: "Avoid one oversized status enum if several independent dimensions exist."   |
|    DOC-03 Section 54/57/79 highlights InStock, Under QC, Approval Pending, Out of Stock.             |
| 3. Engineering Trade-Offs:                                                                          |
|    - Orthogonal Matrix: Eliminates combinatorial status explosions and allows database check        |
|      constraints on commercial eligibility.                                                         |
|    - Single Enum: Brittle, leads to invalid states where unapproved items appear sellable.          |
| 4. Business & Technical Risks:                                                                      |
|    Unverified stock accidentally marked sellable before physical vault placement or manager sign-off|
| 5. Recommended Decision:                                                                            |
|    Adopt the 4 orthogonal dimensions on `inventory_items`. Enforce row-internal invariants via CHECK |
|    constraints paired with NOT NULL columns to prevent NULL bypasses. Guarantee single active tag   |
|    assignment via engine partial unique indexes (item-per-tag and tag-per-item). Coordinate multi-   |
|    table active RFID prerequisites via Root Aggregate Locking on `inventory_items FOR UPDATE` across|
|    all 5 paths. Single items serialize; multi-item flows sort IDs; app retries deadlocks (40P01).   |
| 6. Decision Status: PROPOSED                                                                        |
| 7. Blocks Database Design:                                                                          |
|    - BLOCKS LOGICAL ERD: NO (State dimensions and transitions are defined).                         |
|    - BLOCKS PHYSICAL DDL: NO (CHECK constraint syntax and locking protocol validated).             |
+-----------------------------------------------------------------------------------------------------+
```

---

## 18. Business Decisions Requiring Stakeholder Confirmation

Before physical database DDL and migrations can be executed, the following business policy questions must be formally answered by domain stakeholders.

> **Logical Modeling Impact:** None of these questions block the Logical ERD. The logical model can represent all paths using the explicitly documented baseline assumptions.

```
+----------------------------------------------------------------------------------------------------+
| Category 1: Tenancy & Serialization Scope (P0 Blockers for Physical DDL)                           |
+----------------------------------------------------------------------------------------------------+
| BIZ-Q01: Is the platform intended strictly as an internal system for ONE enterprise and its        |
|          branches, or will it be commercialized as a multi-tenant SaaS for external jewellery      |
|          companies? (Blocks composite tenant indexes and tenant-scoped foreign keys; logical model |
|          includes `organization_id` on root entities).                                             |
| BIZ-Q02: Will 100% of physical inventory in Phase 0 be individually serialized, or must the core   |
|          schema immediately provide balance tables for non-serialized findings and beads?          |
|          (Blocks whether `inventory_stock_balances` DDL is scaffolded in Phase 0; logical model     |
|          represents both via `ProductSku.tracking_type`).                                          |
+----------------------------------------------------------------------------------------------------+
| Category 2: Procurement & Quality Intake Governance                                                |
+----------------------------------------------------------------------------------------------------+
| BIZ-Q03: What is the formal acceptable tolerance threshold (e.g. ±0.01g vs ±0.05g) between         |
|          Supplier Declared Gross Weight and Measured Intake Gross Weight? (Blocks intake check     |
|          constraint threshold in Procurement/QC DDL; logical model captures declared vs measured).|
| BIZ-Q04: Can a GRN be closed if some line items remain rejected or pending re-inspection, or must   |
|          all shipment lines be resolved before GRN closure? (Application-level workflow rule in     |
|          GrnService; does NOT block physical DDL due to PostgreSQL multi-table check constraints).  |
| BIZ-Q05: Is Segregation of Duties legally or operationally required between the user performing    |
|          Quality Inspection and the user granting Stock Approval? (Application service policy in    |
|          StockApprovalService; conditional proposal, does NOT block physical DDL).                 |
+----------------------------------------------------------------------------------------------------+
| Category 3: Jewellery Valuation & Commercial Policies                                              |
+----------------------------------------------------------------------------------------------------+
| BIZ-Q06: How are labour/making charges calculated (flat fee per item, per gram of metal, or as a    |
|          percentage markup)? (Deferred module; does not block Core Phase 0 DDL).                   |
| BIZ-Q07: In customer gold buyback, are gemstones and pearls valued and refunded, or is buyback     |
|          strictly calculated on the meltable net gold weight? (Deferred module).                   |
| BIZ-Q08: What legal rounding rule governs customer invoice totals (Banker's Half-Even vs Half-Up)?  |
|          (Deferred commercial module; does NOT block Phase 0 DDL. In-scope procurement line item   |
|          financial scale is governed by DEC-05).                                                   |
+----------------------------------------------------------------------------------------------------+
```

---

## 19. Technical Decisions Suitable for Immediate Approval

The following technical decisions fall strictly within engineering scope and are ready for architecture sign-off:

1. **`TECH-DEC-01`: Express 5 Modular Monolith Structure:**
   Adopt domain feature modules in `apps/api/src/modules/<domain>/` with explicit composition roots and functional policy middleware.
2. **`TECH-DEC-02`: Four-Tier Asset Decoupling:**
   Model `products`, `product_skus`, `inventory_items`, and `rfid_tags` as separate relational entities.
3. **`TECH-DEC-03`: Auditable RFID Tag Assignment History:**
   Implement `rfid_tag_assignments` with partial unique index (`WHERE status = 'ACTIVE'`) to support damage replacement without identity loss.
4. **`TECH-DEC-04`: Composite Foreign Keys for Storage Isolation:**
   Enforce `(id, store_id)` composite constraints across Vaults, Lockers, Compartments, and Inventory Items.
5. **`TECH-DEC-05`: Transactional Outbox Pattern:**
   Use PostgreSQL `outbox_events` to atomically persist domain events alongside business mutations. A dedicated dispatcher handles asynchronous BullMQ publication with at-least-once delivery under retry/recovery assumptions, while consumers enforce idempotency as an independent duplicate-safety requirement (no distributed 2PC). Persistent failures trigger observable `FAILED` states, dead-letter logging, and alerting.
6. **`TECH-DEC-06`: Application-Generated UUIDv7 Primary Keys:**
   Standardize on application-level generation and validation in Express 5 entity factories/repositories (validating RFC 9562 version 7 and variant bits), stored in native `uuid` columns with `id UUID PRIMARY KEY` and no default clause (preventing silent database UUIDv4 fallback). Direct SQL writes fall outside this application boundary unless engine check constraints (PG18 `uuid_extract_version(id) IS NOT NULL AND uuid_extract_version(id) = 7` or PG14–17 version/variant substring checks) are installed. Identifiers must never serve as authorization tokens.
7. **`TECH-DEC-07`: Banning Floating-Point Types:**
   Use PostgreSQL `NUMERIC` types exclusively: proposed provisional engineering baseline of `NUMERIC(10, 4)` for precious metal gram weights, `NUMERIC(8, 4)` for gemstone carat weights, `NUMERIC(7, 4)` for purity percentage (0.0000% to 100.0000%, correcting NUMERIC(6,4) overflow) or `NUMERIC(5, 4)` for ratio, `NUMERIC(14, 4)` for spot rates, `NUMERIC(12, 4)` for labour rates, and `NUMERIC(14, 2)` for settlement amounts. All proposed types remain provisional pending stakeholder confirmation under `DEC-05`.
8. **`TECH-DEC-08`: Comprehensive Root Aggregate Locking Protocol:**
   Coordinate multi-table stock approval, commercial-state transitions, active tag assignment, tag retirement, and tag replacement by acquiring the parent `inventory_items` row lock (`FOR UPDATE`) first. Operations on an individual item serialize when all writers lock the parent first; multi-item transactions must acquire locks in consistent global order (sorting item IDs); application service handlers must retry on PostgreSQL deadlocks (`40P01`) and serialization failures (`40001`).

---

## 20. Database ERD Readiness Matrix

Database readiness is explicitly evaluated across **five distinct modeling and execution tiers**:

1. **Conceptual Readiness:** Entity boundaries, domain glossaries, aggregate roots, and business responsibilities.
2. **Logical ERD Readiness:** Normalized relational entities, foreign key cardinalities, business keys, attribute definitions, and orthogonal state dimensions.
3. **Physical ERD Design Readiness:** Concrete table schemas, column data types, nullability, primary/foreign keys, and index designs.
4. **Domain-Specific DDL Specification Readiness:** Validated, executable PostgreSQL DDL syntax, check constraints, partial indexes, and referential actions for individual domain modules.
5. **Project-Wide Migration Execution Approval:** The formal architectural and stakeholder sign-off to execute migration scripts and instantiate tables in a live target database.

```
+-----------------------------------------------------------------------------------------------------------------------------------------+
| Domain Context              | Conceptual | Logical ERD | Physical ERD | Domain DDL   | Migration Exec | Criteria & Remaining Dependencies       |
+-----------------------------------------------------------------------------------------------------------------------------------------+
| Identity & Access (IAM)     | READY      | READY       | READY        | READY        | CONDITIONAL    | App UUIDv7 resolved. Paused for project.|
| Master Data Taxonomy        | READY      | READY       | CONDITIONAL  | CONDITIONAL  | CONDITIONAL    | Needs BIZ-Q01 (tenant idx) & DEC-05.    |
| Storage & Custody           | READY      | READY       | CONDITIONAL  | CONDITIONAL  | CONDITIONAL    | Store keys done; needs BIZ-Q01 tenant.  |
| Procurement & GRN           | READY      | READY       | CONDITIONAL  | CONDITIONAL  | CONDITIONAL    | Needs BIZ-Q03 (tol) & DEC-05 (labour).  |
| Quality Control (QC)        | READY      | READY       | CONDITIONAL  | CONDITIONAL  | CONDITIONAL    | Needs BIZ-Q03 (tol) & DEC-05 (weights). |
| Physical Inventory & RFID   | READY      | READY       | CONDITIONAL  | CONDITIONAL  | CONDITIONAL    | Needs BIZ-Q02 (batch DDL) & DEC-05.     |
| RFID Job Infrastructure     | READY      | READY       | READY        | READY        | CONDITIONAL    | Outbox schema done. Paused for project. |
| Commercial & Pricing        | READY      | DEFERRED    | DEFERRED     | DEFERRED     | DEFERRED       | Phase 0 Non-Goal (Accounting/POS).      |
+-----------------------------------------------------------------------------------------------------------------------------------------+
```

### Explanation of Readiness Tiers & Domain Dependencies:

1. **Individual Domain DDL vs. Project-Wide Migration Execution:**
   - Specific isolated infrastructure domains (**Identity & Access** and **RFID Job Infrastructure**) have completely resolved data types, constraints, and schemas, making their _Domain DDL Specification_ structurally **`READY`**.
   - However, **Project-Wide Migration Execution Approval** across ALL domains remains strictly **`CONDITIONAL / PAUSED`**. Executing DDL migrations in a target database before client sign-off on tenancy architecture (`BIZ-Q01`) and physical precision (`DEC-05`) would create severe schema migration drift and costly alter-table rollbacks across foreign-key-dependent operational tables.
2. **Operational Domain Dependencies:**
   - _Master Data:_ Physical ERD and DDL are conditional on `BIZ-Q01` (composite tenant indexes and tenant-aware foreign keys) and `DEC-05` (confirming `purities.purity_percentage NUMERIC(7,4)` vs. `purity_ratio NUMERIC(5,4)`).
   - _Storage & Custody:_ Store custody keys are validated; conditional on `BIZ-Q01` regarding composite tenant indexes and organization scoping.
   - _Procurement & GRN:_ Physical ERD and DDL are conditional on `BIZ-Q03` (intake gross weight tolerance threshold) and `DEC-05` (supplier line labour cost precision `NUMERIC(12,4)` and item total precision `NUMERIC(14,2)` in `shipment_items`).
   - _Quality Control (QC):_ Physical ERD and DDL are conditional on `BIZ-Q03` (tolerance check threshold) and `DEC-05` (metal gross/net weight `NUMERIC(10,4)` and gemstone carat weight `NUMERIC(8,4)`).
   - _Physical Inventory & RFID:_ Physical ERD and DDL are conditional on `BIZ-Q02` (confirming whether `inventory_stock_balances` and `inventory_stock_movements` tables are scaffolded in Phase 0 DDL) and `DEC-05` (weight column precision on `inventory_items`).

### Comprehensive Synthesis of Blockers:

#### 1. Blockers for Logical ERD Modeling:

**NONE (0 Blockers)**. All 7 core operational domains are **`READY`** for Logical ERD modeling. The entity model, relationships, cardinalities, business keys, and orthogonal state dimensions are fully defined and technically sound under the documented baseline assumptions.

#### 2. Blockers for Physical DDL Specifications & Migration Execution:

Physical DDL script generation and database migration executions remain **`CONDITIONAL`** on client confirmation of the following four specific parameters:

1. **`BIZ-Q01` (Tenancy Architecture):** Determines physical composite tenant indexes and tenant-aware foreign keys (`organization_id` on all tables vs. enterprise umbrella).
2. **`BIZ-Q02` (Serialization Scope):** Determines whether `inventory_stock_balances` and `inventory_stock_movements` tables are scaffolded in Phase 0 DDL or deferred.
3. **`BIZ-Q03` (Intake Weight Tolerance Threshold):** Determines the numerical variance threshold for intake gross weight discrepancy checking in Procurement (`shipment_items`) and QC (`quality_check_items`).
4. **`DEC-05` (Physical Precision & In-Scope Procurement Financial Scales):** Determines exact physical column scales for:
   - Metal purity in Master Data: `NUMERIC(7,4)` percentage vs. `NUMERIC(5,4)` ratio.
   - Metal and gemstone weights in Inventory and QC: `NUMERIC(10,4)` grams and `NUMERIC(8,4)` carats.
   - Supplier procurement line items in `shipment_items`: unit labour making cost `NUMERIC(12,4)` and item line total settlement `NUMERIC(14,2)`.

#### 3. Explicit Reconciliation of Non-Blockers:

- **`BIZ-Q04` (GRN Closure Preconditions):** Does **NOT** block physical DDL. Because PostgreSQL cannot evaluate multi-table queries in table-local check constraints, GRN closure validation is enforced in the `GrnService.closeGrn()` application transaction in Express 5. Table schemas for `goods_receipt_notes` and `shipment_items` remain unaffected.
- **`BIZ-Q05` (Segregation of Duties):** Does **NOT** block physical DDL. Conditional application service authorization check in `StockApprovalService`; schema already stores standard `user_id` foreign keys.
- **`BIZ-Q08` (Customer Invoice Rounding):** Does **NOT** block Phase 0 physical DDL. Customer sales invoices, Point-of-Sale cashiers, and retail settlement are explicitly deferred from the Phase 0 MVP to Phase 1 commercial modules.

---

## 21. Recommended Next Implementation Milestone & Final Architecture Verdict

### Final Architecture Verdict:

```
================================================================================
                           READY_FOR_LOGICAL_ERD
================================================================================
```

### Explanation of Verdict:

1. **Why `READY_FOR_LOGICAL_ERD`?**
   - The conceptual model and domain boundaries are fully reconciled and technically verified.
   - The logical model can proceed immediately to produce normalized Entity-Relationship Diagrams (ERDs) and table relationship definitions because:
     - The four-tier identity hierarchy (`Product` $\rightarrow$ `ProductSku` $\rightarrow$ `InventoryItem` $\rightarrow$ `RFIDTag`) models both serialized items and batch balance variants via immutable `ProductSku.tracking_type`.
     - Multi-branch and prospective multi-tenant architectures are supported by including `organization_id` on root aggregates.
     - Storage custody is physically protected via composite store foreign keys.
     - The primary-key strategy is resolved via Application-Generated UUIDv7.
     - Concurrency is resolved via the comprehensive Root Aggregate Locking Protocol across all 5 state-changing paths.
   - **No logical modeling blockers remain.**
2. **Distinction from Physical Schema & Migration Approval:**
   - Physical DDL script execution and database migration creation remain paused pending formal client confirmation of the four physical DDL parameters (`BIZ-Q01`, `BIZ-Q02`, `BIZ-Q03`, and `DEC-05`).

### Phased Implementation Roadmap:

```
[ Current Milestone: Milestone 0.2.1 — Quality Review & Technical Alignment Complete ]
  - Authoritative Architecture Review published: docs/architecture/DOMAIN_MODEL_REVIEW.md (v1.6)
                         |
                         v
[ Milestone 0.3: Core Logical ERD & Data Dictionary v0.1 ]
  - Produce `docs/architecture/LOGICAL_DATA_MODEL.md`:
    * Logical Entity-Relationship Diagrams (Mermaid ERD)
    * Entity definitions, foreign key cardinalities, and business keys
    * Four-tier inventory tracking representation (Serialized + Batch balance)
    * Multi-dimensional state transition tables
                         |
                         v
[ Milestone 0.3.1: Stakeholder Decision Gate ]
  - Present BIZ-Q01, BIZ-Q02, BIZ-Q03, and DEC-05 to client stakeholders for formal sign-off
                         |
                         v
[ Milestone 0.4: Physical DDL & Migration Specification ]
  - Publish `docs/architecture/PHYSICAL_SCHEMA_AND_MIGRATIONS.md`:
    * Executable PostgreSQL DDL with confirmed NUMERIC scales
    * Verified check constraints and partial unique indexes
                         |
                         v
[ Milestone 1.0: Phase 1 Monorepo Engineering Foundation ]
  - Scaffold pnpm monorepo: `apps/web` (Next.js), `apps/api` (Express 5), `apps/worker` (BullMQ)
  - Execute PostgreSQL migrations and implement Express request-context middleware
```

---

_End of Final Architecture Review._
