# Jewellery ERP Platform — Feature Implementation Master Plan

**Document Version:** 1.1  
**Status:** Engineering Execution Baseline — Milestone 0.3.2 Deliverable  
**Date:** 2026-11-03  
**Authors:** Principal Software Architect, Senior Backend Engineer, Senior Frontend Engineer, Database Architect, DevOps Engineer, Security Engineer, QA Engineer  
**Project:** Jewellery ERP Platform (`jewellery-erp-platform`)  
**Repository:** `/home/prasanta/Documents/projects/JewelCore-ERP`  
**Target Stack:** Next.js (Web Frontend) + Node.js & Express 5 (Backend API/Worker) + PostgreSQL 18 + Redis 7 & BullMQ + Zod + Vitest

**Authoritative Baseline References:**

- [`JEWELLERY_ERP_PROJECT_OVERVIEW.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/JEWELLERY_ERP_PROJECT_OVERVIEW.md)
- [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) (v0.3.3, 43 entities across 8 domains)
- [`docs/architecture/DOMAIN_MODEL_REVIEW.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/DOMAIN_MODEL_REVIEW.md) (v1.6)
- [`docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md) (v1.2.2)
- [`docs/architecture/PHYSICAL_SCHEMA_PO_DECISION_WORKSHEET.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/PHYSICAL_SCHEMA_PO_DECISION_WORKSHEET.md) (v1.0)
- [`docs/JEWELLERY_ERP_PHASE_0_BASELINE_v0.2.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/JEWELLERY_ERP_PHASE_0_BASELINE_v0.2.md)
- [`docs/JEWELLERY_ERP_DOMAIN_MODEL_v0.2.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/JEWELLERY_ERP_DOMAIN_MODEL_v0.2.md)

---

## 1. Executive Summary & Delivery Strategy

### 1.1 Engineering Vision

The **Jewellery ERP Platform** is an enterprise-grade operational and financial platform designed for high-value jewellery manufacturing, multi-branch vault custody, analytical quality inspection, serialized RFID tracking, and supply chain governance. Unlike generic e-commerce or standard inventory software, this system enforces rigorous physical metrology (sub-milligram analytical scale precision, 4-decimal carat scales, hallmark certifications), orthogonal state lifecycles, tamper-evident audit ledgers, and strict store custody isolation.

Milestone 0.3 established a fully normalized, verified, and internally consistent 43-entity Logical Relational Data Model ([`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) v0.3.3). This Master Plan establishes the production-grade, feature-by-feature implementation framework to transition the platform from architectural specification into executable, verified software.

### 1.2 Vertical Slice Feature Delivery Model

Every feature in this platform is engineered and delivered as an independent, fully testable **vertical slice**:

- **No Horizontal Layer Slicing:** Engineering will not build all database tables, then all API routes, and finally all UI screens. Such horizontal layering hides integration risk, delays stakeholder validation, and accumulates integration debt.
- **Six-Stage Discipline:** Every vertical slice must traverse six mandatory engineering stages:
  1. _Stage 1: Requirement Analysis_ (User stories, RBAC, invariants, acceptance criteria).
  2. _Stage 2: Architecture & Data Design_ (Entity mapping, transaction boundaries, concurrency locks, audit events).
  3. _Stage 3: Backend Implementation_ (Routes, Express 5 controllers, application services, repositories, Zod validation, authorization middleware).
  4. _Stage 4: Frontend Implementation_ (Next.js App Router, React Hook Form + Zod, responsive UI, 4 UI states: idle, loading, error, empty).
  5. _Stage 5: Testing & QA_ (Vitest unit tests, Supertest API integration tests, PostgreSQL transaction rollback tests, 3VL edge cases).
  6. _Stage 6: Feature Completion & Review_ (Acceptance verification, security review, performance audit, known limitations).

### 1.3 Governance Guardrails & Pre-Implementation Discipline

Under the active Milestone 0.3.1 governance protocol, **physical DDL generation, table migrations, and live application code execution remain strictly paused** pending formal stakeholder resolution of the four physical-schema decision gates:

1. `BIZ-Q01`: Tenancy Model Architecture (Single-Enterprise Multi-Branch vs. Multi-Tenant SaaS).
2. `BIZ-Q02`: Inventory Tracking Scope (Hybrid Dual Tracking vs. Serialized Only).
3. `BIZ-Q03`: Intake Weight Tolerance Policy (Configurable Dual-Tier Gate with 6 operational parameters).
4. `DEC-05`: Proposed Physical Numeric Precision Matrix (15 attribute categories & 4 accounting policies).

This Master Plan defines the complete inventory, dependency mapping, and architectural prerequisites so that the development team can immediately commence execution the moment stakeholder sign-offs are recorded.

---

## 2. Target Architecture & Technology Stack

The platform is architected as a **Modular Monolith** in a single monorepo, balancing rapid local iteration and transactional consistency with clear module boundaries. Microservices are explicitly rejected for Phase 0 to eliminate distributed two-phase commit (2PC) failure modes and multi-service deployment overhead.

```text
+---------------------------------------------------------------------------------------------------+
|                                  Next.js 15 Web Application (App Router)                          |
|                     (React 19, TypeScript, Tailwind CSS, TanStack Query, React Hook Form)         |
+---------------------------------------------------------------------------------------------------+
                                                  | HTTPS / REST JSON (RFC 7807 Error Responses)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                Express 5 Modular Monolith API Gateway                              |
|   +-------------------------------------------------------------------------------------------+   |
|   | Global Middleware: Request ID, Structured Pino Logging, Helmet, CORS, Tenant/Store Context|   |
|   +-------------------------------------------------------------------------------------------+   |
|   | Authentication & Authorization Middleware: JWT Bearer Verify -> RBAC / Store Policy Check |   |
|   +-------------------------------------------------------------------------------------------+   |
|   | Domain Modules (Controller -> Service -> Repository -> Data Mapper):                      |   |
|   |   - IAM & Tenancy             - Storage & Vaults            - Master Data Taxonomy        |   |
|   |   - Procurement & Intake      - Quality Control (QC)        - Physical Inventory Ledger   |   |
|   |   - RFID Tag & Hardware       - Stock Approvals             - Compliance Audit & Outbox   |   |
|   +-------------------------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------------------------+
                     |                                              |
     Durable SQL Mutations                                   Atomic Outbox Inserts
                     v                                              v
+------------------------------------------+       +------------------------------------------------+
|       PostgreSQL 18 Database Engine      |       |             PostgreSQL 18 outbox_events        |
|  - 43 Relational Tables (UUIDv7 PKs)     |       +------------------------------------------------+
|  - Row-Level Locks (SELECT FOR UPDATE)   |                                |
|  - 3VL Boolean Check Constraints         |                     Polling / CDC Worker
|  - Optimistic Concurrency Control (OCC)  |                                v
|  - Third Normal Form (3NF) Partitioning  |       +------------------------------------------------+
+------------------------------------------+       |               Redis 7.4 + BullMQ               |
                                                   |       (Asynchronous Background Queues)         |
                                                   +------------------------------------------------+
                                                                            |
                                                                   Async Job Execution
                                                                            v
                                                   +------------------------------------------------+
                                                   |         Express 5 Background Worker Process    |
                                                   |  - RFID Hardware Batch Print / Verify Worker   |
                                                   |  - Compliance Audit Exporter Worker            |
                                                   |  - Zero-Balance Stock Purge/Archive Worker     |
                                                   +------------------------------------------------+
```

### 2.1 Technology Stack Specifications

| Layer                   | Technology                      | Version             | Architectural Responsibility                                                                                                                                                    |
| ----------------------- | ------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend Framework**  | Next.js                         | 15.x (App Router)   | Server-rendered pages, layout nesting, streaming SSR, route handlers.                                                                                                           |
| **Frontend UI / State** | React, Tailwind, TanStack Query | React 19, v5        | Component rendering, zero-runtime styling, cache invalidation, optimistic updates.                                                                                              |
| **Frontend Validation** | Zod + React Hook Form           | Latest              | Client-side validation sharing identical Zod schemas with backend contracts.                                                                                                    |
| **Backend Runtime**     | Node.js (LTS)                   | 22.x LTS            | High-throughput asynchronous runtime with native TypeScript support.                                                                                                            |
| **HTTP Framework**      | Express 5                       | 5.x                 | Lean, unopinionated routing, native async error propagation, modular sub-routers.                                                                                               |
| **Database**            | PostgreSQL                      | 18                  | Durable ACID transactional source of truth, 3VL boolean checks, JSONB, native UUIDv7.                                                                                           |
| **Database Access**     | Node-Postgres (`pg`) / Kysely   | Latest              | Strongly-typed SQL query builder, deterministic transactions, zero implicit magic. Provisional pending formal closure of Open Decision D-12 (evaluating TypeORM vs. Kysely/pg). |
| **Queue / Asynchrony**  | Redis + BullMQ                  | Redis 7.4, BullMQ 5 | Transactional outbox polling, decoupled RFID job dispatch, retry backoff.                                                                                                       |
| **Testing Framework**   | Vitest                          | 2.x                 | Unified test runner for unit tests, mocking, and Supertest API integration suites.                                                                                              |
| **Containerization**    | Docker & Compose                | Latest              | Local multi-service orchestration (PostgreSQL, Redis, API, Worker, Next.js).                                                                                                    |

---

## 3. Domain Taxonomy & Complete 43-Entity Mapping

The platform is decomposed into **8 Core Business Domains** plus **1 Foundation / Cross-Cutting Domain**, fully encompassing all 43 logical entities established in [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) v0.3.3:

```
+------------------------------------------------------------------------------------------------------------------------+
| Domain Identifier           | Entity Count | Logical Entities Included (Entity Number & Table Name)                    |
+------------------------------------------------------------------------------------------------------------------------+
| 0. Foundation & Core Infra  | N/A          | Monorepo tooling, Docker, database runner, outbox dispatcher, test suite. |
| 1. Identity & Access (IAM)  | 9 Entities   | 1. organizations, 2. stores, 3. users, 4. organization_memberships,       |
|                             |              | 5. store_memberships, 6. roles, 7. permissions, 8. role_permissions,      |
|                             |              | 9. membership_roles.                                                      |
| 2. Master Data Taxonomy     | 8 Entities   | 10. categories, 11. subcategories, 12. materials, 13. purities,           |
|                             |              | 14. gemstones, 15. products, 16. product_skus, 17. product_gemstone_specs.|
| 3. Storage & Custody        | 3 Entities   | 32. vaults, 33. lockers, 34. compartments.                                |
| 4. Procurement & Intake     | 5 Entities   | 18. suppliers, 19. goods_receipt_notes, 20. shipments, 21. shipment_items, |
|                             |              | 22. staff_assignments.                                                    |
| 5. Quality Control (QC)     | 5 Entities   | 23. quality_checks, 24. quality_check_items, 25. weight_measurements,      |
|                             |              | 26. item_gemstones, 27. quality_decisions.                                |
| 6. Physical Inventory       | 4 Entities   | 28. inventory_items, 29. inventory_stock_balances,                         |
|                             |              | 30. inventory_movements, 31. inventory_status_history.                     |
| 7. RFID Infrastructure      | 4 Entities   | 35. rfid_tags, 36. rfid_tag_assignments, 37. rfid_jobs,                    |
|                             |              | 38. rfid_job_items.                                                        |
| 8. Governance, Outbox, Audit| 5 Entities   | 39. stock_approvals, 40. audit_events, 41. file_objects,                  |
|                             |              | 42. file_associations, 43. outbox_events.                                  |
+------------------------------------------------------------------------------------------------------------------------+
| Total Scope                 | 43 Entities  | 100% Relational Model Coverage (Milestone 0.3 Baseline v0.3.3)             |
+------------------------------------------------------------------------------------------------------------------------+
```

---

## 4. Complete Feature Inventory by Domain

Every domain is broken down into granular, independently deliverable vertical slice features. Each feature is assigned an immutable Feature ID:

### Domain 0: Platform Foundation & Infrastructure (`FOUND`)

- **`FEAT-FOUND-01`: Monorepo Architecture & Build Scaffolding**  
  _Scope:_ Monorepo workspace setup (`apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/database`), TypeScript strict configuration, ESLint/Prettier rules, and Docker Compose local orchestration (PostgreSQL 18, Redis 7).
- **`FEAT-FOUND-02`: Database Connectivity, Transaction Engine & Migration Harness**  
  _Scope:_ PostgreSQL connection pool (`pg`), native UUIDv7 primary key generator utility, `withTransaction` unit-of-work wrapper, and migration runner with forward/rollback verification.
- **`FEAT-FOUND-03`: Centralized Error Handling, Logging & RFC 7807 Standard**  
  _Scope:_ Pino structured logging middleware, correlation ID tracking (`x-request-id`), global Express 5 error handling mapping domain exceptions to RFC 7807 Problem Details JSON format.
- **`FEAT-FOUND-04`: Transactional Outbox Engine & BullMQ Worker Baseline**  
  _Scope (Unblocked Architectural Preparation):_ Outbox event contract design (TypeScript domain interfaces, Zod schemas), event publishing abstraction (`OutboxService`), consumer idempotency guards, BullMQ worker queue definitions, and dead-letter queue (DLQ) retry policies.  
  _Scope (Blocked Physical Implementation):_ Physical `outbox_events` (Entity 43) table DDL migration, database entity repositories, and transactional integration tests against live PostgreSQL remain strictly paused pending formal Milestone 0.4 gate approval.

### Domain 1: Identity & Access Management (`IAM`)

- **`FEAT-IAM-01`: Organization Root & Branch Store Scaffolding**  
  _Entities:_ `organizations` (1), `stores` (2).  
  _Scope:_ Enterprise organization master, retail showroom and vault store creation, branch code uniqueness, active state toggling, and multi-branch hierarchy.
- **`FEAT-IAM-02`: User Account Management & Authentication Integration**  
  _Entities:_ `users` (3).  
  _Scope:_ User registration, email verification, password hashing (Argon2id), JWT session issuance, refresh token rotation, and SSO authentication provider hooks.
- **`FEAT-IAM-03`: Role-Based Access Control (RBAC) & Granular Permission Matrix**  
  _Entities:_ `roles` (6), `permissions` (7), `role_permissions` (8).  
  _Scope:_ System and custom role definition, granular permission registry (`inventory:read`, `qc:approve`, `vault:transfer`, `pricing:edit`), role-permission assignment, and Express authorization guards.
- **`FEAT-IAM-04`: Organization & Store Memberships with Store-Context Switching**  
  _Entities:_ `organization_memberships` (4), `store_memberships` (5), `membership_roles` (9).  
  _Scope:_ Scoping users to organizations and specific store branches, store-context switching middleware (`x-store-id`), and multi-store custody isolation enforcement (`INV-11`).

### Domain 2: Storage Hierarchy & Vault Custody (`STORAGE`)

- **`FEAT-STOR-01`: Physical Storage Hierarchy (Vaults, Lockers, Compartments)**  
  _Entities:_ `vaults` (32), `lockers` (33), `compartments` (34).  
  _Scope:_ Modeling 3-tier storage tree (`Vault -> Locker -> Compartment`), composite store placement enforcement (`INV-05`, `INV-17`), security ratings, dual-custody access rules, and active compartment capacity management.
- **`FEAT-STOR-02`: Compartment Allocation & Store Storage Directory UI**  
  _Scope:_ Interactive Next.js store storage visualizer, compartment occupancy dashboard, and compartment selection component for intake, transfers, and audits.

### Domain 3: Master Data Taxonomy (`TAXONOMY`)

- **`FEAT-TAX-01`: Product Classification Hierarchy (Categories & Subcategories)**  
  _Entities:_ `categories` (10), `subcategories` (11).  
  _Scope:_ Tree-structured product taxonomy, category code uniqueness, display ordering, and category-level default attributes.
- **`FEAT-TAX-02`: Precious Metal Materials & Purity Registry**  
  _Entities:_ `materials` (12), `purities` (13).  
  _Scope:_ Metal definitions (Gold, Platinum, Silver), purity percentages and ratios (`NUMERIC(7, 4)` and `NUMERIC(5, 4)` per `DEC-05`), karat ratings (24K, 22K, 18K, 950Pt), and hallmark standards.
- **`FEAT-TAX-03`: Gemstone Master Registry**  
  _Entities:_ `gemstones` (14).  
  _Scope:_ Gemstone classification master registry (e.g. Natural Diamond, Lab Diamond, Ruby, Emerald, Sapphire, Pearl), classification type categorization (`PRECIOUS`, `SEMI_PRECIOUS`, `ORGANIC_PEARL`), default measurement unit assignment (e.g. `CARAT`), and stone code uniqueness per organization. (Note: design bill-of-materials 4Cs specifications are governed under `FEAT-TAX-05`, and piece-level inspection grading under `FEAT-QC-03` per LDM v0.3.3).
- **`FEAT-TAX-04`: Product Master Styles & Catalog Management**  
  _Entities:_ `products` (15).  
  _Scope:_ Base design style definition, category linking, product code generation, gender/collection classification, and design asset attachment.
- **`FEAT-TAX-05`: Commercial Product SKUs & Gemstone Layout Specifications**  
  _Entities:_ `product_skus` (16), `product_gemstone_specs` (17).  
  _Scope:_ Variant SKU generation (`sku_code` uniqueness), tracking type classification (`SERIALIZED` vs `QUANTITY_BATCH` per `INV-06`), physical dimensions (length, width, height, ring size), and stone layout specification (`stone_count`, carat weight).

### Domain 4: Procurement & Inbound Intake (`PROCUREMENT`)

- **`FEAT-PROC-01`: Supplier Master & Commercial Profile Management**  
  _Entities:_ `suppliers` (18).  
  _Scope:_ Vendor registry, tax identification, contact details, payment terms, currency preferences, and supplier performance tracking.
- **`FEAT-PROC-02`: Goods Receipt Note (GRN) Creation & Lifecycle Management**  
  _Entities:_ `goods_receipt_notes` (19).  
  _Scope:_ GRN intake recording, receiving store assignment, purchase order cross-referencing, GRN lifecycle states (`DRAFT`, `RECEIVED`, `COMPLETED`, `CANCELLED`), and receiving staff logging.
- **`FEAT-PROC-03`: Inbound Shipments & Line-Item Manifest Ingestion**  
  _Entities:_ `shipments` (20), `shipment_items` (21).  
  _Scope:_ Shipment manifest recording, supplier invoice reconciliation, line items with SKU mapping, declared piece gross weights (`declared_gross_weight_grams`), unit costs, and missing declared weight validation.
- **`FEAT-PROC-04`: Receiving Staff Assignment & Intake Custody Handoff**  
  _Entities:_ `staff_assignments` (22).  
  _Scope:_ Assigning intake packages to receiving technicians and QC inspectors, verification of GRN/Shipment context alignment (`INV-19`), and intake custody audit logging.

### Domain 5: Quality Control & Analytical Metrology (`QC`)

- **`FEAT-QC-01`: Quality Inspection Session Scaffolding & Inspector Handoff**  
  _Entities:_ `quality_checks` (23).  
  _Scope:_ QC session creation linked to received shipment, store custody match, inspector assignment, and session status tracking (`IN_PROGRESS`, `FINALIZED`, `SEALED`).
- **`FEAT-QC-02`: Analytical Balance Weight Metrology & Reading Ingestion**  
  _Entities:_ `weight_measurements` (25).  
  _Scope:_ Analytical scale reading capture ($0.0001\text{g}$ precision), tare weight deduction, measurement stage logging (`INTAKE_RECEIVING`, `POST_QC_AUDIT`), device calibration ID logging, and immutable append-only measurement storage (`INV-09`).
- **`FEAT-QC-03`: Mounted Gemstone Inspection & Carat Parcel Grading**  
  _Entities:_ `item_gemstones` (26).  
  _Scope:_ Recording mounted gemstone counts, verified carat weights, color, clarity, and cut ratings per inspection piece, with net weight calculation formula: $\text{Net} = \text{Gross} - \text{Tare} - \text{Stones}$.
- **`FEAT-QC-04`: Piece-Level QC Item Inspection & 3VL Truth Validation**  
  _Entities:_ `quality_check_items` (24).  
  _Scope:_ Piece-level verification of material, purity, hallmark, and visual structural integrity; PostgreSQL Three-Valued Logic (`3VL`) boolean checks (`hallmark_verified IS TRUE`, `visual_inspection_passed IS TRUE`); cross-parent shipment validation (`INV-15`); and pre-approval completeness enforcement (`INV-18`).
- **`FEAT-QC-05`: Intake Weight Tolerance Evaluation & Discrepancy Gate**  
  _Entities:_ `quality_checks` (23), `quality_check_items` (24).  
  _Scope:_ Transactional discrepancy evaluation comparing measured gross weight against supplier declared weight per `BIZ-Q03` parameters; fail-closed missing weight protocol; and automated transition to `PENDING` discrepancy review.
- **`FEAT-QC-06`: Quality Decision Authorization & Damage-Waiver Protocol**  
  _Entities:_ `quality_decisions` (27).  
  _Scope:_ Formal piece approval or rejection logging (`decision IN ('APPROVED', 'REJECTED')`); immutable reason codes (`WEIGHT_DISCREPANCY_EXCEEDED`, `PURITY_MISMATCH`); supervisor damage-waiver authorization via application-level RBAC (`reason_code = 'DAMAGE_WAIVER'`) strictly partitioned from weight waivers (Architectural Gap 3); and audit log sealing.

### Domain 6: Physical Inventory & Custody Ledger (`INVENTORY`)

- **`FEAT-INV-01`: Serialized Inventory Piece Birth & Lineage Integrity**  
  _Entities:_ `inventory_items` (28).  
  _Scope:_ Atomically creating serialized physical inventory pieces strictly from approved QC items (`INV-14`); immutable intake birth certificate assignment (`inventory_items.quality_check_item_id`); serial number generation; initial custody state `IN_VAULT`; initial quality state `QC_APPROVED`; and initial commercial state `UNREADY`.
- **`FEAT-INV-02`: Bulk Quantity-Batch Stock Balances & Depletion Management**  
  _Entities:_ `inventory_stock_balances` (29).  
  _Scope:_ Managing non-serialized stock balances per `(store_id, product_sku_id, compartment_id)` (under `BIZ-Q02`); distinct non-negative constraints (`quantity_on_hand >= 0`, `quantity_reserved >= 0`, `quantity_on_hand >= quantity_reserved`); and zero-balance retention logic per corporate accounting policy.
- **`FEAT-INV-03`: Unified Physical Custody Movement Ledger**  
  _Entities:_ `inventory_movements` (30).  
  _Scope:_ Immutable, append-only custody movement ledger (`INV-09`); tracking transfers across compartments (`from_compartment_id -> to_compartment_id`); custody state transitions (`INTAKE_PLACEMENT`, `VAULT_TRANSFER`, `DISPLAY_PLACEMENT`, `RETURN_TO_VAULT`); movement quantity rules (`quantity = 1` for serialized, $N \ge 1$ for batch); movement destination consistency (`INV-13`); and SKU/item coherence validation (`INV-16`).
- **`FEAT-INV-04`: Multi-Dimensional Inventory Status History & OCC Concurrency Engine**  
  _Entities:_ `inventory_status_history` (31).  
  _Scope:_ Orthogonal state tracking (`custody_state`, `quality_state`, `commercial_state`, `approval_state`); optimistic concurrency control (`version` incrementation); and mandatory `SELECT FOR UPDATE` aggregate locking on state mutations (`INV-08`).

### Domain 7: RFID Tag Infrastructure & Serialization (`RFID`)

- **`FEAT-RFID-01`: EPC Tag Master Registry & Hardware Transponder Lifecycle**  
  _Entities:_ `rfid_tags` (35).  
  _Scope:_ Tag inventory management, EPC Gen 2 encoding validation, frequency band profiling, and tag state transitions (`UNENCODED`, `ACTIVE`, `DAMAGED`, `RETIRED`).
- **`FEAT-RFID-02`: Single-Active Tag Binding & Detachment Lifecycle**  
  _Entities:_ `rfid_tag_assignments` (36).  
  _Scope:_ Binding an active RFID tag to a physical serialized inventory piece; enforcing at most one active tag per item (`INV-03`) and at most one active item per tag (`INV-04`); tag retirement/damage handling; and automatic commercial availability reversion to `UNREADY` upon tag detachment (`INV-07`).
- **`FEAT-RFID-03`: RFID Encoding, Print Jobs & Asynchronous Worker Adapter**  
  _Entities:_ `rfid_jobs` (37), `rfid_job_items` (38).  
  _Scope:_ Asynchronous RFID print and encoding job queueing; BullMQ worker processing; hardware adapter boundary isolating printer protocols; batch job status tracking (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`); retry handling; and error recovery.

### Domain 8: Governance, Stock Approval & Audit (`GOVERNANCE`)

- **`FEAT-GOV-01`: Commercial Stock Approval Workflow & Availability Gate**  
  _Entities:_ `stock_approvals` (39).  
  _Scope:_ Executive stock approval workflow; commercial state transition to `AVAILABLE_FOR_SALE` strictly guarded by prerequisite validation (`INV-01`: `QC_APPROVED` + `APPROVED` + `IN_VAULT`/`IN_DISPLAY` + active RFID tag bound); and immutable approval recording.
- **`FEAT-GOV-02`: Immutable Compliance Audit Trail Engine**  
  _Entities:_ `audit_events` (40).  
  _Scope:_ System-wide tamper-evident audit logging; capturing user actor, IP address, user agent, entity type, entity ID, previous state snapshot, new state snapshot, and timestamp for all material financial and inventory operations (`INV-09`).
- **`FEAT-GOV-03`: Document & Asset Attachment Polymorphic File Storage**  
  _Entities:_ `file_objects` (41), `file_associations` (42).  
  _Scope:_ S3-compatible object storage abstraction; secure presigned URL generation; metadata recording (MIME type, file size, SHA-256 checksum); and polymorphic entity association (GRN invoices, QC assay certificates, damage photo evidence, gemstone grading sheets).

---

## 5. Architectural Invariants Traceability Matrix

The implementation of all features must strictly enforce the 19 platform business invariants approved in [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) v0.3.3:

```
+----------+-------------------------------------------------------------+-----------------------+-----------------------------+
| Rule ID  | Invariant Description                                       | Enforcement Tier      | Primary Implementing Feature|
+----------+-------------------------------------------------------------+-----------------------+-----------------------------+
| INV-01   | Commercial Availability Prerequisite (QC + Storage + RFID) | Tier C (Service)      | FEAT-GOV-01                 |
| INV-02   | Row-Internal Weight Physics (Gross >= Net > 0)             | Tier B (Database CHECK)| FEAT-QC-04, FEAT-INV-01     |
| INV-03   | Single Active Tag per Serialized Item                       | Tier B (Unique Index) | FEAT-RFID-02                |
| INV-04   | Single Active Item per Tag Transponder                      | Tier B (Unique Index) | FEAT-RFID-02                |
| INV-05   | Composite Storage Hierarchy Store Placement                | Tier B (Database CHECK)| FEAT-STOR-01                |
| INV-06   | SKU Tracking Type Immutability (SERIALIZED vs BATCH)        | Tier C (Service)      | FEAT-TAX-05, FEAT-INV-01    |
| INV-07   | Tag Retirement Availability Drop (Revert to UNREADY)        | Tier C (Service)      | FEAT-RFID-02                |
| INV-08   | Root Aggregate OCC & Row Locking (SELECT FOR UPDATE)        | Tier C (Transaction)  | FEAT-INV-04                 |
| INV-09   | Strictly Append-Only Audit, Decision & Movement Ledgers     | Tier A (Logical/DB)   | FEAT-INV-03, FEAT-GOV-02    |
| INV-10   | Atomic Transactional Outbox Delivery (No 2PC)               | Tier C (Outbox/Redis) | FEAT-FOUND-04               |
| INV-11   | Store-Context Scoping & Multi-Store Isolation               | Tier D (Middleware)   | FEAT-IAM-04                 |
| INV-12   | Intake Discrepancy Tolerance Enforcement                    | Tier E (Metrology)    | FEAT-QC-05                  |
| INV-13   | Movement Destination Compartment Consistency                | Tier B (Database CHECK)| FEAT-INV-03                 |
| INV-14   | QC Birth Lineage Integrity (Immutable Birth Certificate)    | Tier A/C (Unique/Svc) | FEAT-INV-01                 |
| INV-15   | QC Cross-Parent Shipment Match (No Invalid Child FKs)       | Tier A/C (Svc/Trigger)| FEAT-QC-04                  |
| INV-16   | Movement SKU and Item Coherence                             | Tier A/C (Svc/Trigger)| FEAT-INV-03                 |
| INV-17   | Hierarchical Storage Integrity Across Stores                | Tier B/C (Composite FK)| FEAT-STOR-01, FEAT-INV-03   |
| INV-18   | QC Draft Nullability & Pre-Approval 3VL Completeness Gate  | Tier B/C/D (CHECK/Svc)| FEAT-QC-04                  |
| INV-19   | Contextual Parent Alignment (Staff GRN & Store Alignment)   | Tier A/C (Service)    | FEAT-PROC-04                 |
+----------+-------------------------------------------------------------+-----------------------+-----------------------------+
```

---

## 6. Governance Decision Gates & Blocker Analysis

The four open decision gates recorded in [`docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md) v1.2.2 establish clear operational boundaries between unblocked preparation work and blocked implementation work:

```
+----------+-----------------------------------+--------------------+---------------------------------------+---------------------------------------+
| Gate ID  | Decision Gate Title               | Current Status     | Directly Blocked Features / DDL       | Unblocked Work (Ready for Execution)  |
+----------+-----------------------------------+--------------------+---------------------------------------+---------------------------------------+
| BIZ-Q01  | Tenancy Model Architecture        | RECOMMENDED (OPEN) | - Physical DDL table generation       | - Zod contract definitions            |
|          | (Single-Enterprise vs SaaS)       | [ PENDING ]        | - Composite unique indexes across org | - Express 5 controller/route design   |
|          |                                   |                    | - BIZ-Q02 physical table scaffolding  | - Next.js UI component wireframes     |
|          |                                   |                    | - Store isolation middleware DDL      | - Unit test suites with mocked repos  |
+----------+-----------------------------------+--------------------+---------------------------------------+---------------------------------------+
| BIZ-Q02  | Inventory Tracking Scope          | RECOMMENDED (OPEN) | - FEAT-INV-02 DDL                     | - FEAT-INV-01 serialized item design  |
|          | (Hybrid Dual vs Serialized Only)  | [ PENDING ]        |   (`inventory_stock_balances` table)  | - Unified ledger movement contracts   |
|          |                                   |                    | - Batch ledger movement DDL triggers  | - Tracking type enumeration schemas   |
+----------+-----------------------------------+--------------------+---------------------------------------+---------------------------------------+
| BIZ-Q03  | Intake Weight Tolerance Policy    | RECOMMENDED (OPEN) | - FEAT-QC-05 operational parameters   | - FEAT-QC-01 QC session scaffolding   |
|          | (Dual-Tier Policy & Parameters)   | [ PENDING ]        | - Express 5 tolerance threshold logic | - FEAT-QC-02 analytical scale balance |
|          |                                   |                    | - Weight-waiver workflow sign-off     | - FEAT-QC-04 row-local 3VL CHECK tests|
+----------+-----------------------------------+--------------------+---------------------------------------+---------------------------------------+
| DEC-05   | Physical Numeric Precision Matrix | RECOMMENDED (OPEN) | - Physical PostgreSQL NUMERIC scales  | - Abstract metrological schemas       |
|          | & Corporate Accounting Policies   | [ PENDING ]        | - Line-total calculation formula      | - Zero-balance retention options      |
|          |                                   |                    | - Multi-currency conversion DDL       | - Quantity constraint definitions     |
+----------+-----------------------------------+--------------------+---------------------------------------+---------------------------------------+
```

---

## 7. Phase Boundaries & Multi-Release Roadmap

To maintain strict risk management and prevent scope creep, product features are partitioned across three sequential releases:

### 7.1 Phase 0: Core Asset Lifecycle MVP (Current Scope)

- **Primary Objective:** Deliver end-to-end provenance, custody, inspection, and serialized identity for high-value jewellery pieces from supplier receipt through stock approval.
- **Milestone Scope:**
  - Foundations, IAM, and Store Custody boundaries.
  - Master Catalog Taxonomy (Metals, purities, gemstones, styles, SKUs).
  - Storage Hierarchy (Vaults, lockers, compartments).
  - Procurement Intake (Suppliers, GRNs, Shipments, Lines).
  - Analytical QC Inspection (Sub-milligram weighing, gemstone grading, 3VL checks).
  - Physical Inventory Creation (Piece birth certificate, custody movement ledger).
  - RFID Hardware Infrastructure (EPC tag binding, async print jobs).
  - Stock Approval & Compliance Audit Trail.

### 7.2 Phase 1: Commercial, Pricing & Retail Operations (Deferred)

- **Primary Objective:** Point of Sale (POS) retail operations, showroom customer sales, and commercial pricing.
- **Deferred Scope:**
  - Dynamic pricing engine (Live precious metal spot rates + labour markup + retail margin).
  - Commercial retail cash rounding (5-cent truncation, charm pricing) per `DEC-05` Section 6.2.D.
  - Point of Sale (POS) checkout, invoicing, and customer payment processing.
  - Retail returns, exchanges, and customer scrap gold buyback settlement.
  - Customer CRM, loyalty rewards, and showroom sales commission tracking.

### 7.3 Phase 2: Enterprise Financials & Multi-Store Logistics (Deferred)

- **Primary Objective:** Comprehensive ERP corporate accounting, treasury, and inter-store transit logistics.
- **Deferred Scope:**
  - General Ledger (GL) double-entry bookkeeping and journal posting.
  - Multi-branch inter-store transfer orders, transit manifests, and transit loss dispute claims (Architectural Gap 2).
  - Post-birth vault audit re-assay and periodic stock count reconciliation (Architectural Gap 1).
  - Accounts Payable (AP), vendor debit notes, and automated currency hedging.
  - Enterprise data warehouse (EDW) and business intelligence analytics.

---

## 8. Sprint Implementation Cadence (Phase 0)

Execution of Phase 0 will proceed across 7 disciplined two-week sprints upon formal resolution of the physical-schema decision gates:

```
+---------------------------------------------------------------------------------------------------+
| Sprint 0: Platform Foundation & Tooling (Unblocked Preparation)                                   |
|   - FEAT-FOUND-01: Monorepo & Build Scaffolding                                                   |
|   - FEAT-FOUND-02: Database Connectivity & Transaction Engine                                      |
|   - FEAT-FOUND-03: Centralized Logging, Request Tracing & RFC 7807 Error Standard                 |
|   - FEAT-FOUND-04: Transactional Outbox Engine & BullMQ Worker (Architectural Prep)               |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| Sprint 1: Identity, Tenancy & Store Storage Hierarchy (Unblocked upon BIZ-Q01 Approval)           |
|   - FEAT-IAM-01: Organization Master & Store Branches                                             |
|   - FEAT-IAM-02: User Account Authentication & JWT Session Engine                                 |
|   - FEAT-IAM-03: RBAC Roles & Granular Permission Matrix                                          |
|   - FEAT-IAM-04: Organization/Store Memberships & Context Switching                               |
|   - FEAT-STOR-01: Vault, Locker & Compartment Hierarchy (INV-05, INV-17)                          |
|   - FEAT-STOR-02: Compartment Allocation & Store Storage Directory UI                             |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| Sprint 2: Master Data Taxonomy & Catalog (Unblocked upon DEC-05 Approval)                         |
|   - FEAT-TAX-01: Categories & Subcategories Hierarchy                                             |
|   - FEAT-TAX-02: Precious Metals & Purity Registry (DEC-05 Scales)                                |
|   - FEAT-TAX-03: Gemstone Master Registry (4Cs & Hardness)                                        |
|   - FEAT-TAX-04: Product Master Styles & Catalog Management                                       |
|   - FEAT-TAX-05: Product SKUs & Gemstone Layout Specs (INV-06)                                    |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| Sprint 3: Procurement & Inbound Receiving (Unblocked upon Sprint 1 & 2)                           |
|   - FEAT-PROC-01: Supplier Master & Commercial Profiles                                           |
|   - FEAT-PROC-02: Goods Receipt Note (GRN) Lifecycle                                              |
|   - FEAT-PROC-03: Inbound Shipments & Line Items Manifest                                        |
|   - FEAT-PROC-04: Receiving Staff Assignment & Custody Handoff (INV-19)                           |
|   - FEAT-GOV-03: Document & File Attachment Polymorphic Storage                                   |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| Sprint 4: Analytical Quality Control & Metrology (Unblocked upon BIZ-Q03 Approval)                |
|   - FEAT-QC-01: Quality Inspection Sessions                                                       |
|   - FEAT-QC-02: Analytical Balance Scale Reading Capture (INV-09)                                 |
|   - FEAT-QC-03: Mounted Gemstones & Carat Parcel Grading                                          |
|   - FEAT-QC-04: QC Item 3VL Truth Validation & Completeness Gate (INV-15, INV-18)                 |
|   - FEAT-QC-05: Intake Weight Tolerance & Discrepancy Gate (INV-12)                               |
|   - FEAT-QC-06: Quality Decision & Supervisor Damage Waiver (Gap 3)                               |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| Sprint 5: Physical Inventory, Stock Balances & Custody Ledger (Unblocked upon BIZ-Q02 Approval)   |
|   - FEAT-INV-01: Serialized Inventory Piece Birth & Lineage (INV-14)                              |
|   - FEAT-INV-02: Bulk Quantity-Batch Stock Balances (BIZ-Q02 Hybrid)                              |
|   - FEAT-INV-03: Unified Custody Movement Ledger (INV-09, INV-13, INV-16)                         |
|   - FEAT-INV-04: Multi-Dimensional State History & OCC Aggregate Locking (INV-08)                 |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| Sprint 6: RFID Infrastructure, Stock Approval & Compliance Audit (End-to-End Core MVP)            |
|   - FEAT-RFID-01: EPC Tag Master Registry & Lifecycle                                             |
|   - FEAT-RFID-02: Single-Active Tag Binding & Detachment (INV-03, INV-04, INV-07)                 |
|   - FEAT-RFID-03: Asynchronous RFID Print & Encoding Worker Adapter                               |
|   - FEAT-GOV-01: Commercial Stock Approval & Availability Gate (INV-01)                           |
|   - FEAT-GOV-02: Immutable Compliance Audit Trail Engine (INV-09)                                 |
|   - End-to-End System Integration Test & Verification Sign-Off                                    |
+---------------------------------------------------------------------------------------------------+
```

---

_End of Feature Implementation Master Plan (v1.1)._
