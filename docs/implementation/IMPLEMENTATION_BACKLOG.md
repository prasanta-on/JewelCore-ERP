# Jewellery ERP Platform — Implementation Backlog & Sprint Cadence

**Document Version:** 1.1  
**Status:** Engineering Execution Baseline — Milestone 0.3.2 Deliverable  
**Date:** 2026-11-03  
**Authors:** Principal Software Architect, Senior Backend Engineer, Senior Frontend Engineer, Database Architect, QA Engineer  
**Project:** Jewellery ERP Platform (`jewellery-erp-platform`)  
**Repository:** `/home/prasanta/Documents/projects/JewelCore-ERP`

**Authoritative Baseline References:**

- [`docs/implementation/FEATURE_IMPLEMENTATION_MASTER_PLAN.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_IMPLEMENTATION_MASTER_PLAN.md) (v1.1)
- [`docs/implementation/FEATURE_DEPENDENCY_MAP.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_DEPENDENCY_MAP.md) (v1.1)
- [`docs/implementation/FEATURE_DELIVERY_STANDARD.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_DELIVERY_STANDARD.md) (v1.1)
- [`docs/implementation/FEATURE_ACCEPTANCE_CRITERIA.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_ACCEPTANCE_CRITERIA.md) (v1.1)
- [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) (v0.3.3)
- [`docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md) (v1.2.2)

---

## 1. Backlog Summary & Estimation Metrics

The Implementation Backlog contains **35 vertical slice features** covering 100% of the Phase 0 Core Asset Lifecycle MVP across Foundation and all 8 core operational domains (43 entities):

```
+---------------------------------------------------------------------------------------------------+
| Metric Category                  | Value                                                          |
+---------------------------------------------------------------------------------------------------+
| Total Feature Count              | 35 Vertical Slice Features                                     |
| Total Story Points (Fibonacci)   | 174 Story Points                                               |
| Priority Distribution            | P0 Blocker: 18 Features (101 pts) | P1 Critical: 14 Features (60 pts) | P2: 3 Features (13 pts) |
| Directly Gate-Blocked Features   | 9 Features (49 pts) blocked by BIZ-Q01/Q02/Q03/DEC-05          |
| Predecessor-Blocked Features     | 22 Features (109 pts) blocked by upstream feature completion   |
| Completed Features               | 27 Features (140 pts) verified and committed (Sprint 0, Sprint 1, Sprint 2, Sprint 3, Sprint 4 Complete; Sprint 5 in progress with FEAT-INV-01, FEAT-INV-02, and FEAT-INV-03 complete) |
| READY_FOR_DEV Features           | 1 Feature (5 pts) unblocked, immediately executable (FEAT-INV-04) |
| PREP_READY Features              | 1 Feature (5 pts) architectural preparation unblocked          |
| Target Delivery Sprints          | Sprint 0 through Sprint 6 (7 Two-Week Sprints = 14 Weeks)      |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Complete Phase 0 Master Feature Backlog

| Feature ID          | Feature Title                            | Domain      | Entities Governed                                                      | Priority | Gate Dependency                                                          | Prerequisites                           | Story Points | Status          | Target Sprint |
| ------------------- | ---------------------------------------- | ----------- | ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ | --------------------------------------- | :----------: | --------------- | :-----------: |
| **`FEAT-FOUND-01`** | Monorepo Scaffolding & Build Tools       | Foundation  | None                                                                   | **P0**   | UNBLOCKED                                                                | None                                    |    **3**     | `COMPLETED`     |   Sprint 0    |
| **`FEAT-FOUND-02`** | Database Connection & Transaction Engine | Foundation  | None                                                                   | **P0**   | UNBLOCKED                                                                | `FEAT-FOUND-01`                         |    **5**     | `COMPLETED`     |   Sprint 0    |
| **`FEAT-FOUND-03`** | Centralized Logging & RFC 7807 Errors    | Foundation  | None                                                                   | **P0**   | UNBLOCKED                                                                | `FEAT-FOUND-01`                         |    **3**     | `COMPLETED`     |   Sprint 0    |
| **`FEAT-FOUND-04`** | Transactional Outbox & BullMQ Engine     | Foundation  | `outbox_events` (43)                                                   | **P0**   | PARTIALLY UNBLOCKED (Architectural Prep Unblocked; Physical DDL Blocked) | `FEAT-FOUND-02`, `03`                   |    **5**     | `PREP_READY`    |   Sprint 0    |
| **`FEAT-IAM-01`**   | Organizations & Store Branches           | IAM         | `organizations` (1), `stores` (2)                                      | **P0**   | Resolved (`BIZ-Q01` Option A)                                            | `FEAT-FOUND-02`                         |    **5**     | `COMPLETED`     |   Sprint 1    |
| **`FEAT-IAM-02`**   | User Accounts & Authentication Engine    | IAM         | `users` (3)                                                            | **P0**   | UNBLOCKED                                                                | `FEAT-IAM-01`                           |    **5**     | `COMPLETED`     |   Sprint 1    |
| **`FEAT-IAM-03`**   | RBAC Roles & Granular Permissions        | IAM         | `roles` (6), `permissions` (7), `role_permissions` (8)                 | **P0**   | UNBLOCKED                                                                | `FEAT-IAM-02`                           |    **5**     | `COMPLETED`     |   Sprint 1    |
| **`FEAT-IAM-04`**   | Memberships & Store-Context Isolation    | IAM         | `org_memberships` (4), `store_memberships` (5), `membership_roles` (9) | **P0**   | UNBLOCKED                                                                | `FEAT-IAM-03`                           |    **5**     | `COMPLETED`     |   Sprint 1    |
| **`FEAT-STOR-01`**  | Vault, Locker & Compartment Hierarchy    | Storage     | `vaults` (32), `lockers` (33), `compartments` (34)                     | **P1**   | UNBLOCKED                                                                | `FEAT-IAM-01`                           |    **5**     | `COMPLETED`     |   Sprint 1    |
| **`FEAT-STOR-02`**  | Compartment Visualizer & Directory UI    | Storage     | `compartments` (34)                                                    | **P2**   | UNBLOCKED                                                                | `FEAT-STOR-01`                          |    **3**     | `COMPLETED`     |   Sprint 1    |
| **`FEAT-TAX-01`**   | Categories & Subcategories Tree          | Taxonomy    | `categories` (10), `subcategories` (11)                                | **P1**   | UNBLOCKED                                                                | `FEAT-IAM-01`                           |    **3**     | `COMPLETED`     |   Sprint 2    |
| **`FEAT-TAX-02`**   | Precious Metals & Purity Registry        | Taxonomy    | `materials` (12), `purities` (13)                                      | **P1**   | Resolved (`DEC-05` Approved)                                             | `FEAT-IAM-01`                           |    **5**     | `COMPLETED`     |   Sprint 2    |
| **`FEAT-TAX-03`**   | Gemstone Master Registry                 | Taxonomy    | `gemstones` (14)                                                       | **P1**   | Resolved (`DEC-05` Approved)                                             | `FEAT-IAM-01`                           |    **3**     | `COMPLETED`     |   Sprint 2    |
| **`FEAT-TAX-04`**   | Product Master Styles & Catalog          | Taxonomy    | `products` (15)                                                        | **P1**   | UNBLOCKED                                                                | `FEAT-TAX-01`, `TAX-02`                 |    **5**     | `COMPLETED`     |   Sprint 2    |
| **`FEAT-TAX-05`**   | Commercial SKUs & Gemstone Specs         | Taxonomy    | `product_skus` (16), `product_gemstone_specs` (17)                     | **P0**   | Resolved (`DEC-05` Approved)                                             | `FEAT-TAX-02`, `03`, `04`               |    **8**     | `COMPLETED`     |   Sprint 2    |
| **`FEAT-PROC-01`**  | Supplier Master & Profiles               | Procurement | `suppliers` (18)                                                       | **P1**   | UNBLOCKED                                                                | `FEAT-IAM-04`                           |    **3**     | `COMPLETED`     |   Sprint 3    |
| **`FEAT-PROC-02`**  | Goods Receipt Notes (GRN) Lifecycle      | Procurement | `goods_receipt_notes` (19)                                             | **P1**   | UNBLOCKED                                                                | `FEAT-PROC-01`                          |    **5**     | `COMPLETED`     |   Sprint 3    |
| **`FEAT-PROC-03`**  | Inbound Shipments & Line Items           | Procurement | `shipments` (20), `shipment_items` (21)                                | **P0**   | Resolved (`DEC-05` Approved)                                             | `FEAT-PROC-02`, `TAX-05`                |    **8**     | `COMPLETED`     |   Sprint 3    |
| **`FEAT-PROC-04`**  | Receiving Staff Assignment & Handoff     | Procurement | `staff_assignments` (22)                                               | **P1**   | UNBLOCKED                                                                | `FEAT-PROC-03`, `IAM-04`                |    **3**     | `COMPLETED`     |   Sprint 3    |
| **`FEAT-GOV-03`**   | Polymorphic Document & File Storage      | Governance  | `file_objects` (41), `file_associations` (42)                          | **P2**   | UNBLOCKED                                                                | `FEAT-IAM-01`                           |    **5**     | `COMPLETED`     |   Sprint 3    |
| **`FEAT-QC-01`**    | Quality Inspection Sessions              | QC          | `quality_checks` (23)                                                  | **P1**   | UNBLOCKED                                                                | `FEAT-PROC-04`                          |    **5**     | `COMPLETED`     |   Sprint 4    |
| **`FEAT-QC-02`**    | Analytical Balance Metrology             | QC          | `weight_measurements` (25)                                             | **P0**   | Resolved (`DEC-05` Approved)                                             | `FEAT-QC-01`                            |    **5**     | `COMPLETED`     |   Sprint 4    |
| **`FEAT-QC-03`**    | Gemstone Parcel Grading                  | QC          | `item_gemstones` (26)                                                  | **P1**   | Resolved (`DEC-05` Approved)                                             | `FEAT-QC-01`, `TAX-05`                  |    **5**     | `COMPLETED`     |   Sprint 4    |
| **`FEAT-QC-04`**    | QC Item 3VL Inspection & Checks          | QC          | `quality_check_items` (24)                                             | **P0**   | UNBLOCKED                                                                | `FEAT-QC-01`, `02`, `03`                |    **8**     | `COMPLETED`     |   Sprint 4    |
| **`FEAT-QC-05`**    | Intake Weight Tolerance Gate             | QC          | `quality_checks` (23), `quality_check_items` (24)                      | **P0**   | Resolved (`BIZ-Q03` Approved)                                            | `FEAT-QC-04`, `PROC-03`                 |    **5**     | `COMPLETED`     |   Sprint 4    |
| **`FEAT-QC-06`**    | Quality Decision Authorization & Waiver  | QC          | `quality_decisions` (27)                                               | **P0**   | UNBLOCKED                                                                | `FEAT-QC-05`                            |    **5**     | `COMPLETED`     |   Sprint 4    |
| **`FEAT-INV-01`**   | Serialized Piece Birth & Lineage         | Inventory   | `inventory_items` (28)                                                 | **P0**   | UNBLOCKED                                                                | `FEAT-QC-06`, `STOR-01`, `TAX-05`       |    **8**     | `COMPLETED`     |   Sprint 5    |
| **`FEAT-INV-02`**   | Bulk Stock Balances & Depletion          | Inventory   | `inventory_stock_balances` (29)                                        | **P1**   | Resolved (`BIZ-Q02` Option 3 Hybrid)                                     | `FEAT-STOR-01`, `TAX-05`                |    **5**     | `COMPLETED`     |   Sprint 5    |
| **`FEAT-INV-03`**   | Unified Custody Movement Ledger          | Inventory   | `inventory_movements` (30)                                             | **P0**   | UNBLOCKED                                                                | `FEAT-INV-01`, `FEAT-INV-02`, `STOR-01` |    **8**     | `COMPLETED`     |   Sprint 5    |
| **`FEAT-INV-04`**   | State History & OCC Concurrency          | Inventory   | `inventory_status_history` (31)                                        | **P1**   | UNBLOCKED                                                                | `FEAT-INV-03`                           |    **5**     | `READY_FOR_DEV` |   Sprint 5    |
| **`FEAT-RFID-01`**  | EPC Tag Master Registry & Lifecycle      | RFID        | `rfid_tags` (35)                                                       | **P1**   | Requires `FEAT-IAM-01`                                                   | `FEAT-IAM-01`                           |    **3**     | `BLOCKED`       |   Sprint 6    |
| **`FEAT-RFID-02`**  | Single-Active Tag Binding & Detachment   | RFID        | `rfid_tag_assignments` (36)                                            | **P0**   | Requires `FEAT-INV-01`                                                   | `FEAT-RFID-01`, `INV-01`                |    **5**     | `BLOCKED`       |   Sprint 6    |
| **`FEAT-RFID-03`**  | Async Print & Encoding Worker            | RFID        | `rfid_jobs` (37), `rfid_job_items` (38)                                | **P2**   | Requires `FEAT-FOUND-04`                                                 | `FEAT-RFID-01`, `FOUND-04`              |    **5**     | `BLOCKED`       |   Sprint 6    |
| **`FEAT-GOV-01`**   | Stock Approval & Availability Gate       | Governance  | `stock_approvals` (39)                                                 | **P0**   | Requires `FEAT-RFID-02`                                                  | `INV-01`, `RFID-02`, `STOR-01`, `QC-06` |    **5**     | `BLOCKED`       |   Sprint 6    |
| **`FEAT-GOV-02`**   | Compliance Audit Trail Engine            | Governance  | `audit_events` (40)                                                    | **P1**   | Requires `FEAT-IAM-04`                                                   | `FEAT-IAM-04`                           |    **5**     | `BLOCKED`       |   Sprint 6    |

---

## 3. Sprint Release Plan

### Sprint 0: Foundation & Core Tooling (Weeks 1–2) — 16 Story Points

- **Focus:** Build infrastructure, Docker Compose environment, database connection harness, structured logging, and transactional outbox.
- **Features Delivered:**
  - `FEAT-FOUND-01`: Monorepo Scaffolding & Build Tools (3 pts)
  - `FEAT-FOUND-02`: Database Connection & Transaction Engine (5 pts)
  - `FEAT-FOUND-03`: Centralized Logging & RFC 7807 Errors (3 pts)
  - `FEAT-FOUND-04`: Transactional Outbox & BullMQ Engine (5 pts)
- **Gate Blocker Status:** **PARTIALLY UNBLOCKED** — Core build scaffolding, error framework, DB pool harness, and outbox architectural preparation (contracts, schemas, worker engine) can proceed immediately; physical DDL migrations remain paused pending Milestone 0.4 gate approval.

### Sprint 1: Identity, Tenancy & Store Storage (Weeks 3–4) — 28 Story Points

- **Focus:** Multi-branch organization structure, user authentication, RBAC, store-context switching, and 3-tier storage hierarchy.
- **Features Delivered:**
  - `FEAT-IAM-01`: Organizations & Store Branches (5 pts) [Requires `BIZ-Q01` approval]
  - `FEAT-IAM-02`: User Accounts & Authentication Engine (5 pts)
  - `FEAT-IAM-03`: RBAC Roles & Granular Permissions (5 pts)
  - `FEAT-IAM-04`: Memberships & Store-Context Isolation (5 pts)
  - `FEAT-STOR-01`: Vault, Locker & Compartment Hierarchy (5 pts)
  - `FEAT-STOR-02`: Compartment Visualizer & Directory UI (3 pts)

### Sprint 2: Master Data Taxonomy & Catalog (Weeks 5–6) — 24 Story Points

- **Focus:** Product classification hierarchy, materials, purities, gemstones, base styles, and commercial variant SKUs.
- **Features Delivered:**
  - `FEAT-TAX-01`: Categories & Subcategories Tree (3 pts)
  - `FEAT-TAX-02`: Precious Metals & Purity Registry (5 pts) [Requires `DEC-05` approval]
  - `FEAT-TAX-03`: Gemstone Master Registry (3 pts) [Requires `DEC-05` approval]
  - `FEAT-TAX-04`: Product Master Styles & Catalog (5 pts)
  - `FEAT-TAX-05`: Commercial SKUs & Gemstone Specs (8 pts) [Requires `DEC-05` approval]

### Sprint 3: Procurement & Receiving (Weeks 7–8) — 24 Story Points

- **Focus:** Supplier management, Goods Receipt Notes, shipment manifests, receiving technician assignments, and file attachments.
- **Features Delivered:**
  - `FEAT-PROC-01`: Supplier Master & Profiles (3 pts)
  - `FEAT-PROC-02`: Goods Receipt Notes (GRN) Lifecycle (5 pts)
  - `FEAT-PROC-03`: Inbound Shipments & Line Items (8 pts) [Requires `DEC-05` approval]
  - `FEAT-PROC-04`: Receiving Staff Assignment & Handoff (3 pts)
  - `FEAT-GOV-03`: Polymorphic Document & File Storage (5 pts)

### Sprint 4: Analytical Quality Control & Metrology (Weeks 9–10) — 33 Story Points (100% COMPLETE)

- **Focus:** Analytical scale weighing, gemstone grading, 3VL boolean verification, intake tolerance evaluation, and quality decisions.
- **Features Delivered:**
  - `FEAT-QC-01`: Quality Inspection Sessions (5 pts) — COMPLETED
  - `FEAT-QC-02`: Analytical Balance Metrology (5 pts) — COMPLETED
  - `FEAT-QC-03`: Gemstone Parcel Grading (5 pts) — COMPLETED
  - `FEAT-QC-04`: QC Item 3VL Inspection & Checks (8 pts) — COMPLETED
  - `FEAT-QC-05`: Intake Weight Tolerance Gate (5 pts) — COMPLETED
  - `FEAT-QC-06`: Quality Decision Authorization & Waiver (5 pts) — COMPLETED

### Sprint 5: Physical Inventory & Custody Ledger (Weeks 11–12) — 26 Story Points

- **Focus:** Serialized inventory piece creation, bulk stock balances, append-only custody movement ledger, and OCC locking.
- **Features Delivered:**
  - `FEAT-INV-01`: Serialized Piece Birth & Lineage (8 pts) — COMPLETED
  - `FEAT-INV-02`: Bulk Stock Balances & Depletion (5 pts) — COMPLETED
  - `FEAT-INV-03`: Unified Custody Movement Ledger (8 pts) — COMPLETED
  - `FEAT-INV-04`: State History & OCC Concurrency (5 pts) — READY FOR DEV

### Sprint 6: RFID Infrastructure, Stock Approval & Audit (Weeks 13–14) — 23 Story Points

- **Focus:** RFID transponder binding, async print jobs, executive commercial stock approval, and compliance audit trail.
- **Features Delivered:**
  - `FEAT-RFID-01`: EPC Tag Master Registry & Lifecycle (3 pts)
  - `FEAT-RFID-02`: Single-Active Tag Binding & Detachment (5 pts)
  - `FEAT-RFID-03`: Async Print & Encoding Worker (5 pts)
  - `FEAT-GOV-01`: Stock Approval & Availability Gate (5 pts)
  - `FEAT-GOV-02`: Compliance Audit Trail Engine (5 pts)
  - Final End-to-End System Integration Testing & Core MVP Sign-Off.

---

_End of Implementation Backlog & Sprint Cadence (v1.1)._
