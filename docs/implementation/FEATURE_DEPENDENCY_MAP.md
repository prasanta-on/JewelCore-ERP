# Jewellery ERP Platform — Feature Dependency Map & Critical Path Analysis

**Document Version:** 1.1  
**Status:** Engineering Execution Baseline — Milestone 0.3.2 Deliverable  
**Date:** 2026-11-03  
**Authors:** Principal Software Architect, Senior Backend Engineer, Senior Frontend Engineer, Database Architect, QA Engineer  
**Project:** Jewellery ERP Platform (`jewellery-erp-platform`)  
**Repository:** `/home/prasanta/Documents/projects/JewelCore-ERP`

**Authoritative Baseline References:**

- [`docs/implementation/FEATURE_IMPLEMENTATION_MASTER_PLAN.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_IMPLEMENTATION_MASTER_PLAN.md) (v1.1)
- [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) (v0.3.3)
- [`docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md) (v1.2.2)
- [`docs/architecture/PHYSICAL_SCHEMA_PO_DECISION_WORKSHEET.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/PHYSICAL_SCHEMA_PO_DECISION_WORKSHEET.md) (v1.0)

---

## 1. Domain-Level Architecture Dependency Model

To eliminate integration risk and guarantee architectural integrity, cross-domain dependencies in the Jewellery ERP Platform strictly follow a forward-flowing, non-circular hierarchy. Lower-level operational domains (IAM, Storage, Taxonomy) provide the foundational entities required by transactional domains (Procurement, Quality Control, Inventory, RFID, Governance).

```mermaid
flowchart TD
    subgraph FOUNDATION["Domain 0: Platform Foundation"]
        D0["Platform Foundation & Outbox Engine<br/>(FEAT-FOUND-01 .. 04)"]
    end

    subgraph IAM_DOM["Domain 1: Identity & Access Management"]
        D1["IAM & Tenancy Context<br/>(FEAT-IAM-01 .. 04)"]
    end

    subgraph STRUCTURAL["Structural Master Data"]
        D2["Domain 2: Storage Hierarchy<br/>(FEAT-STOR-01 .. 02)"]
        D3["Domain 3: Master Data Taxonomy<br/>(FEAT-TAX-01 .. 05)"]
    end

    subgraph INTAKE_QC["Procurement & Inspection"]
        D4["Domain 4: Procurement & Intake<br/>(FEAT-PROC-01 .. 04)"]
        D5["Domain 5: Quality Control & Metrology<br/>(FEAT-QC-01 .. 06)"]
    end

    subgraph INVENTORY_TAG["Physical Inventory & Hardware"]
        D6["Domain 6: Physical Inventory Ledger<br/>(FEAT-INV-01 .. 04)"]
        D7["Domain 7: RFID Tag Infrastructure<br/>(FEAT-RFID-01 .. 03)"]
    end

    subgraph GOV["Domain 8: Governance & Availability"]
        D8["Stock Approval & Audit Engine<br/>(FEAT-GOV-01 .. 03)"]
    end

    %% Foundational wiring
    D0 --> D1
    D1 --> D2
    D1 --> D3

    %% Procurement depends on IAM, Storage and Taxonomy
    D1 --> D4
    D3 --> D4

    %% QC depends on Procurement and Taxonomy
    D4 --> D5
    D3 --> D5

    %% Physical Inventory depends on Approved QC, Storage Hierarchy, and Taxonomy
    D5 --> D6
    D2 --> D6
    D3 --> D6

    %% RFID Tagging depends on Physical Inventory
    D6 --> D7

    %% Governance & Stock Approval requires QC approval, Storage placement, Inventory item, and Active RFID tag (INV-01)
    D6 --> D8
    D7 --> D8
    D2 --> D8
    D5 --> D8

    classDef foundation fill:#F3F4F6,stroke:#4B5563,stroke-width:2px;
    classDef iam fill:#EFF6FF,stroke:#3B82F6,stroke-width:2px;
    classDef structural fill:#FEF3C7,stroke:#D97706,stroke-width:2px;
    classDef operational fill:#ECFDF5,stroke:#10B981,stroke-width:2px;
    classDef governance fill:#FDF2F8,stroke:#DB2777,stroke-width:2px;

    class D0 foundation;
    class D1 iam;
    class D2,D3 structural;
    class D4,D5 operational;
    class D6,D7 operational;
    class D8 governance;
```

---

## 2. Detailed Vertical Feature Dependency Map

The diagram below maps every specific feature in Phase 0, illustrating exact prerequisite edges, governance gate overlays, and the critical path to operational delivery.

```mermaid
flowchart TD
    %% Foundation
    F_01["FEAT-FOUND-01<br/>Monorepo Scaffolding"] --> F_02["FEAT-FOUND-02<br/>DB & Transaction Harness"]
    F_01 --> F_03["FEAT-FOUND-03<br/>Centralized Logging & RFC 7807"]
    F_02 --> F_04["FEAT-FOUND-04<br/>Transactional Outbox Engine"]
    F_03 --> F_04

    %% Decision Gates Blockers
    GATE_Q01{{"Gate BIZ-Q01:<br/>Tenancy Model"}}
    GATE_Q02{{"Gate BIZ-Q02:<br/>Inventory Tracking"}}
    GATE_Q03{{"Gate BIZ-Q03:<br/>Intake Tolerance"}}
    GATE_DEC05{{"Gate DEC-05:<br/>Numeric Precision"}}

    %% IAM
    F_02 --> IAM_01["FEAT-IAM-01<br/>Organizations & Stores"]
    GATE_Q01 -.->|"Blocks DDL Scaffolding"| IAM_01
    IAM_01 --> IAM_02["FEAT-IAM-02<br/>User Accounts & Auth"]
    IAM_02 --> IAM_03["FEAT-IAM-03<br/>RBAC & Permissions"]
    IAM_03 --> IAM_04["FEAT-IAM-04<br/>Memberships & Context Switching"]

    %% Storage
    IAM_01 --> STOR_01["FEAT-STOR-01<br/>Vault, Locker & Compartment Hierarchy"]
    STOR_01 --> STOR_02["FEAT-STOR-02<br/>Compartment Visualizer UI"]

    %% Taxonomy
    IAM_01 --> TAX_01["FEAT-TAX-01<br/>Categories & Subcategories"]
    IAM_01 --> TAX_02["FEAT-TAX-02<br/>Precious Metals & Purity Registry"]
    GATE_DEC05 -.->|"Blocks Scale Precision"| TAX_02
    IAM_01 --> TAX_03["FEAT-TAX-03<br/>Gemstone Master Registry"]
    GATE_DEC05 -.->|"Blocks Carat Precision"| TAX_03
    TAX_01 --> TAX_04["FEAT-TAX-04<br/>Product Master Styles"]
    TAX_02 --> TAX_05["FEAT-TAX-05<br/>Commercial SKUs & Stone Layout"]
    TAX_03 --> TAX_05
    TAX_04 --> TAX_05

    %% Procurement
    IAM_04 --> PROC_01["FEAT-PROC-01<br/>Supplier Master Registry"]
    PROC_01 --> PROC_02["FEAT-PROC-02<br/>Goods Receipt Notes (GRN)"]
    PROC_02 --> PROC_03["FEAT-PROC-03<br/>Inbound Shipments & Line Items"]
    TAX_05 --> PROC_03
    GATE_DEC05 -.->|"Blocks Line Financials"| PROC_03
    PROC_03 --> PROC_04["FEAT-PROC-04<br/>Receiving Staff Assignment"]
    IAM_04 --> PROC_04

    %% QC
    PROC_04 --> QC_01["FEAT-QC-01<br/>Quality Inspection Sessions"]
    QC_01 --> QC_02["FEAT-QC-02<br/>Analytical Balance Metrology"]
    GATE_DEC05 -.->|"Blocks Scale Precision"| QC_02
    QC_01 --> QC_03["FEAT-QC-03<br/>Gemstone Parcel Grading"]
    TAX_05 --> QC_03
    QC_01 --> QC_04["FEAT-QC-04<br/>QC Item 3VL Truth Validation"]
    QC_02 --> QC_04
    QC_03 --> QC_04
    QC_04 --> QC_05["FEAT-QC-05<br/>Intake Weight Tolerance Gate"]
    PROC_03 --> QC_05
    GATE_Q03 -.->|"Blocks Policy Thresholds"| QC_05
    QC_05 --> QC_06["FEAT-QC-06<br/>Quality Decision Authorization"]

    %% Physical Inventory
    QC_06 --> INV_01["FEAT-INV-01<br/>Serialized Piece Birth & Lineage"]
    STOR_01 --> INV_01
    TAX_05 --> INV_01
    INV_01 --> INV_03["FEAT-INV-03<br/>Unified Custody Movement Ledger"]
    STOR_01 --> INV_03
    INV_03 --> INV_04["FEAT-INV-04<br/>State History & OCC Concurrency"]

    %% Batch Inventory
    GATE_Q01 -.->|"Mandatory Dependency"| GATE_Q02
    GATE_Q02 -.->|"Blocks Batch DDL"| INV_02["FEAT-INV-02<br/>Bulk Stock Balances"]
    STOR_01 --> INV_02
    TAX_05 --> INV_02
    INV_02 --> INV_03

    %% RFID
    IAM_01 --> RFID_01["FEAT-RFID-01<br/>EPC Tag Master Registry"]
    RFID_01 --> RFID_02["FEAT-RFID-02<br/>Single-Active Tag Binding"]
    INV_01 --> RFID_02
    RFID_01 --> RFID_03["FEAT-RFID-03<br/>Async Print & Encoding Worker"]
    F_04 --> RFID_03

    %% Governance & Outbox
    INV_01 --> GOV_01["FEAT-GOV-01<br/>Commercial Stock Approval Gate"]
    RFID_02 --> GOV_01
    STOR_01 --> GOV_01
    QC_06 --> GOV_01
    IAM_04 --> GOV_02["FEAT-GOV-02<br/>Compliance Audit Trail Engine"]
    IAM_01 --> GOV_03["FEAT-GOV-03<br/>Polymorphic File Storage"]

    classDef blocker fill:#FEE2E2,stroke:#EF4444,stroke-width:2px;
    classDef gate fill:#EDE9FE,stroke:#8B5CF6,stroke-width:2px;
    classDef feature fill:#F0FDF4,stroke:#16A34A,stroke-width:1px;

    class GATE_Q01,GATE_Q02,GATE_Q03,GATE_DEC05 gate;
    class F_01,F_02,F_03,F_04,IAM_01,IAM_02,IAM_03,IAM_04,STOR_01,STOR_02,TAX_01,TAX_02,TAX_03,TAX_04,TAX_05,PROC_01,PROC_02,PROC_03,PROC_04,QC_01,QC_02,QC_03,QC_04,QC_05,QC_06,INV_01,INV_02,INV_03,INV_04,RFID_01,RFID_02,RFID_03,GOV_01,GOV_02,GOV_03 feature;
```

---

## 3. Exhaustive Feature Dependency Matrix

The table below details every feature in Phase 0, listing its exact prerequisites, domain dependencies, governance gate blockers, and downstream dependents:

| Feature ID          | Feature Name                     | Immediate Hard Prerequisites            | Upstream Domain Dependencies | Governance Decision Gate Dependency                                                                                         | Downstream Dependents                         |
| ------------------- | -------------------------------- | --------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **`FEAT-FOUND-01`** | Monorepo Scaffolding             | None (Initial setup)                    | None                         | **UNBLOCKED**                                                                                                               | `FEAT-FOUND-02`, `FEAT-FOUND-03`              |
| **`FEAT-FOUND-02`** | Database & Transaction Harness   | `FEAT-FOUND-01`                         | Foundation                   | **UNBLOCKED** (Design/Harness)                                                                                              | `FEAT-FOUND-04`, `FEAT-IAM-01`                |
| **`FEAT-FOUND-03`** | Centralized Logging & RFC 7807   | `FEAT-FOUND-01`                         | Foundation                   | **UNBLOCKED**                                                                                                               | All API Controllers                           |
| **`FEAT-FOUND-04`** | Transactional Outbox Engine      | `FEAT-FOUND-02`, `FEAT-FOUND-03`        | Foundation                   | **PARTIALLY UNBLOCKED** — Architectural preparation unblocked; physical `outbox_events` DDL requires Milestone 0.4 approval | `FEAT-RFID-03`, `FEAT-GOV-02`                 |
| **`FEAT-IAM-01`**   | Organizations & Stores           | `FEAT-FOUND-02`                         | Foundation                   | **Blocked DDL by `BIZ-Q01`**                                                                                                | `FEAT-IAM-02`, `FEAT-STOR-01`, `FEAT-TAX-01`  |
| **`FEAT-IAM-02`**   | User Accounts & Authentication   | `FEAT-IAM-01`                           | Foundation, IAM              | Requires `FEAT-IAM-01`                                                                                                      | `FEAT-IAM-03`                                 |
| **`FEAT-IAM-03`**   | RBAC Roles & Permissions         | `FEAT-IAM-02`                           | IAM                          | Requires `FEAT-IAM-02`                                                                                                      | `FEAT-IAM-04`                                 |
| **`FEAT-IAM-04`**   | Memberships & Store Context      | `FEAT-IAM-03`                           | IAM                          | Requires `FEAT-IAM-03`                                                                                                      | `FEAT-PROC-01`, `FEAT-PROC-04`, `FEAT-GOV-02` |
| **`FEAT-STOR-01`**  | Storage Tree Hierarchy           | `FEAT-IAM-01`                           | IAM                          | Requires `FEAT-IAM-01`                                                                                                      | `FEAT-STOR-02`, `FEAT-INV-01`, `FEAT-INV-03`  |
| **`FEAT-STOR-02`**  | Compartment Visualizer UI        | `FEAT-STOR-01`                          | Storage                      | Requires `FEAT-STOR-01`                                                                                                     | Operational Warehouse Screens                 |
| **`FEAT-TAX-01`**   | Categories & Subcategories       | `FEAT-IAM-01`                           | IAM                          | Requires `FEAT-IAM-01`                                                                                                      | `FEAT-TAX-04`                                 |
| **`FEAT-TAX-02`**   | Precious Metals & Purities       | `FEAT-IAM-01`                           | IAM                          | **Blocked scales by `DEC-05`**                                                                                              | `FEAT-TAX-05`, `FEAT-QC-04`                   |
| **`FEAT-TAX-03`**   | Gemstones Master Registry        | `FEAT-IAM-01`                           | IAM                          | **Blocked carats by `DEC-05`**                                                                                              | `FEAT-TAX-05`, `FEAT-QC-03`                   |
| **`FEAT-TAX-04`**   | Product Master Styles            | `FEAT-TAX-01`                           | Taxonomy                     | Requires `FEAT-TAX-01`                                                                                                      | `FEAT-TAX-05`                                 |
| **`FEAT-TAX-05`**   | Commercial SKUs & Gemstone Specs | `FEAT-TAX-02`, `03`, `04`               | Taxonomy                     | **Blocked scales by `DEC-05`**                                                                                              | `FEAT-PROC-03`, `FEAT-INV-01`, `FEAT-INV-02`  |
| **`FEAT-PROC-01`**  | Supplier Master Registry         | `FEAT-IAM-04`                           | IAM                          | Requires `FEAT-IAM-04`                                                                                                      | `FEAT-PROC-02`                                |
| **`FEAT-PROC-02`**  | Goods Receipt Notes (GRN)        | `FEAT-PROC-01`                          | Procurement                  | Requires `FEAT-PROC-01`                                                                                                     | `FEAT-PROC-03`                                |
| **`FEAT-PROC-03`**  | Inbound Shipments & Line Items   | `FEAT-PROC-02`, `TAX-05`                | Procurement, Taxonomy        | **Blocked totals by `DEC-05`**                                                                                              | `FEAT-PROC-04`, `FEAT-QC-05`                  |
| **`FEAT-PROC-04`**  | Receiving Staff Assignment       | `FEAT-PROC-03`, `IAM-04`                | Procurement, IAM             | Requires `FEAT-PROC-03`                                                                                                     | `FEAT-QC-01`                                  |
| **`FEAT-QC-01`**    | QC Inspection Sessions           | `FEAT-PROC-04`                          | Procurement                  | Requires `FEAT-PROC-04`                                                                                                     | `FEAT-QC-02`, `03`, `04`                      |
| **`FEAT-QC-02`**    | Analytical Balance Metrology     | `FEAT-QC-01`                            | QC                           | **Blocked weights by `DEC-05`**                                                                                             | `FEAT-QC-04`                                  |
| **`FEAT-QC-03`**    | Gemstone Parcel Grading          | `FEAT-QC-01`, `TAX-05`                  | QC, Taxonomy                 | **Blocked carats by `DEC-05`**                                                                                              | `FEAT-QC-04`                                  |
| **`FEAT-QC-04`**    | QC Item 3VL Truth Validation     | `FEAT-QC-01`, `02`, `03`                | QC                           | Requires `FEAT-QC-02`, `03`                                                                                                 | `FEAT-QC-05`                                  |
| **`FEAT-QC-05`**    | Intake Weight Tolerance Gate     | `FEAT-QC-04`, `PROC-03`                 | QC, Procurement              | **Blocked policy by `BIZ-Q03`**                                                                                             | `FEAT-QC-06`                                  |
| **`FEAT-QC-06`**    | Quality Decision Authorization   | `FEAT-QC-05`                            | QC                           | Requires `FEAT-QC-05`                                                                                                       | `FEAT-INV-01`, `FEAT-GOV-01`                  |
| **`FEAT-INV-01`**   | Serialized Piece Birth & Lineage | `FEAT-QC-06`, `STOR-01`, `TAX-05`       | QC, Storage, Taxonomy        | Requires `FEAT-QC-06`                                                                                                       | `FEAT-INV-03`, `FEAT-RFID-02`, `FEAT-GOV-01`  |
| **`FEAT-INV-02`**   | Bulk Stock Balances              | `FEAT-STOR-01`, `TAX-05`                | Storage, Taxonomy            | **Blocked by `BIZ-Q02` & `BIZ-Q01`**                                                                                        | `FEAT-INV-03`                                 |
| **`FEAT-INV-03`**   | Custody Movement Ledger          | `FEAT-INV-01`, `FEAT-INV-02`, `STOR-01` | Inventory, Storage           | Requires `FEAT-INV-01`, `FEAT-INV-02`                                                                                       | `FEAT-INV-04`                                 |
| **`FEAT-INV-04`**   | State History & OCC Concurrency  | `FEAT-INV-03`                           | Inventory                    | Requires `FEAT-INV-03`                                                                                                      | State mutation endpoints                      |
| **`FEAT-RFID-01`**  | EPC Tag Master Registry          | `FEAT-IAM-01`                           | IAM                          | Requires `FEAT-IAM-01`                                                                                                      | `FEAT-RFID-02`, `FEAT-RFID-03`                |
| **`FEAT-RFID-02`**  | Single-Active Tag Binding        | `FEAT-RFID-01`, `INV-01`                | RFID, Inventory              | Requires `FEAT-INV-01`                                                                                                      | `FEAT-GOV-01`                                 |
| **`FEAT-RFID-03`**  | Async Print & Encoding Worker    | `FEAT-RFID-01`, `FOUND-04`              | RFID, Foundation             | Requires `FEAT-FOUND-04`                                                                                                    | Warehouse RFID Hardware                       |
| **`FEAT-GOV-01`**   | Stock Approval & Availability    | `INV-01`, `RFID-02`, `STOR-01`, `QC-06` | Inventory, RFID, Storage, QC | Requires `FEAT-RFID-02`                                                                                                     | Commercial Availability                       |
| **`FEAT-GOV-02`**   | Compliance Audit Trail Engine    | `FEAT-IAM-04`                           | IAM, Governance              | Requires `FEAT-IAM-04`                                                                                                      | Enterprise Audit System                       |
| **`FEAT-GOV-03`**   | Polymorphic File Storage         | `FEAT-IAM-01`                           | Foundation, IAM              | Requires `FEAT-IAM-01`                                                                                                      | `FEAT-PROC-03`, `FEAT-QC-06`                  |

---

## 4. Longest Dependency Chain Analysis (Unweighted Topological Path)

The **Longest Dependency Chain** represents the longest topological sequence of dependent features from monorepo foundation to commercial stock approval in a showroom vault. Because work duration estimates (story points) are provisional and calendar durations have not been computed via a formal Critical Path Method (CPM) calculation, this analysis measures the unweighted structural path through the Directed Acyclic Graph (DAG): **18 feature nodes = 17 dependency edges**.

### 4.1 Tied Longest Dependency Paths

The graph contains two equally long topological chains of 18 feature nodes, differing only in the parallel QC inspection branch traversed prior to piece-level 3VL truth validation:

- **Path A (Analytical Balance Metrology Spine):**  
  `FEAT-FOUND-01` $\to$ `FEAT-FOUND-02` $\to$ `FEAT-IAM-01` $\to$ `FEAT-IAM-02` $\to$ `FEAT-IAM-03` $\to$ `FEAT-IAM-04` $\to$ `FEAT-PROC-01` $\to$ `FEAT-PROC-02` $\to$ `FEAT-PROC-03` $\to$ `FEAT-PROC-04` $\to$ `FEAT-QC-01` $\to$ **`FEAT-QC-02`** $\to$ `FEAT-QC-04` $\to$ `FEAT-QC-05` $\to$ `FEAT-QC-06` $\to$ `FEAT-INV-01` $\to$ `FEAT-RFID-02` $\to$ `FEAT-GOV-01`
- **Path B (Gemstone Parcel Grading Spine):**  
  `FEAT-FOUND-01` $\to$ `FEAT-FOUND-02` $\to$ `FEAT-IAM-01` $\to$ `FEAT-IAM-02` $\to$ `FEAT-IAM-03` $\to$ `FEAT-IAM-04` $\to$ `FEAT-PROC-01` $\to$ `FEAT-PROC-02` $\to$ `FEAT-PROC-03` $\to$ `FEAT-PROC-04` $\to$ `FEAT-QC-01` $\to$ **`FEAT-QC-03`** $\to$ `FEAT-QC-04` $\to$ `FEAT-QC-05` $\to$ `FEAT-QC-06` $\to$ `FEAT-INV-01` $\to$ `FEAT-RFID-02` $\to$ `FEAT-GOV-01`

The diagram below renders **Path A** as a representative longest path.

```text
================================================================================================================
REPRESENTATIVE LONGEST DEPENDENCY CHAIN (PATH A: METROLOGY SPINE)
================================================================================================================
[Step 1]  FEAT-FOUND-01 (Monorepo Scaffolding & Build Tools)
   |
   v
[Step 2]  FEAT-FOUND-02 (Database Connection & Transaction Engine)
   |
   v
[Step 3]  FEAT-IAM-01 (Organizations & Branch Stores)             <-- Unblocked upon Gate BIZ-Q01 Approval
   |
   v
[Step 4]  FEAT-IAM-02 (User Accounts & Authentication Engine)
   |
   v
[Step 5]  FEAT-IAM-03 (RBAC Roles & Granular Permission Matrix)
   |
   v
[Step 6]  FEAT-IAM-04 (User Memberships & Store-Context Isolation)
   |
   v
[Step 7]  FEAT-PROC-01 (Supplier Master & Commercial Profile)
   |
   v
[Step 8]  FEAT-PROC-02 (Goods Receipt Note Lifecycle)
   |
   v
[Step 9]  FEAT-PROC-03 (Inbound Shipments & Line Item Manifests)  <-- Unblocked upon Gate DEC-05 Approval
   |
   v
[Step 10] FEAT-PROC-04 (Receiving Staff Assignment & Custody Log)
   |
   v
[Step 11] FEAT-QC-01 (Quality Inspection Session Scaffolding)
   |
   v
[Step 12] FEAT-QC-02 (Analytical Balance Metrology)               <-- Tied with Path B: FEAT-QC-03
   |
   v
[Step 13] FEAT-QC-04 (QC Item 3VL Inspection & Analytical Metrology)
   |
   v
[Step 14] FEAT-QC-05 (Intake Weight Tolerance Gate)               <-- Unblocked upon Gate BIZ-Q03 Approval
   |
   v
[Step 15] FEAT-QC-06 (Quality Decision Authorization & Sign-Off)
   |
   v
[Step 16] FEAT-INV-01 (Serialized Piece Birth & Lineage Creation)  (Enforces INV-14)
   |
   v
[Step 17] FEAT-RFID-02 (Single-Active Tag Binding to Serialized Item) (Enforces INV-03, INV-04)
   |
   v
[Step 18] FEAT-GOV-01 (Commercial Stock Approval: AVAILABLE_FOR_SALE) (Enforces INV-01)
================================================================================================================
Total Longest Chain Length: 18 Feature Nodes = 17 Dependency Edges
Critical Path & Convergence Rules:
  1. QC-04 Prerequisite Synchronization: FEAT-QC-04 has three immediate hard prerequisites (FEAT-QC-01,
     FEAT-QC-02, and FEAT-QC-03). Development of QC-04 cannot proceed until BOTH QC-02 and QC-03 have
     completed, regardless of which single chain is traced.
  2. RFID-02 Multi-Branch Convergence: FEAT-RFID-02 has two immediate hard prerequisites: FEAT-INV-01
     and FEAT-RFID-01. Although FEAT-RFID-01 lies on a shorter branch (FEAT-IAM-01 -> FEAT-RFID-01, length 2),
     RFID-02 cannot execute until BOTH the 16-node inventory birth spine and RFID-01 have completed.
  3. Parallel Structural Branches: Parallel master data branches (FEAT-STOR-01, FEAT-TAX-01..05) converge into
     transactional nodes (PROC-03, QC-03, INV-01, INV-02) with shorter path lengths, preserving strict DAG flow.
Dependency Integrity: ZERO Circular Loops | 100% Deterministic Forward Flow (Validated DAG)
================================================================================================================
```

---

## 5. Blocked vs. Unblocked Work Analysis

In strict adherence to the project governance protocol, physical implementation must be clearly segmented based on active decision gate blockers:

### 5.1 Unblocked Work (Ready for Specification & Engineering Prep)

The following work streams do **not** depend on unresolved business policies and may be actively authored:

1. **Foundation Engineering:**
   - Monorepo structure, pnpm workspace, Docker Compose environment (PostgreSQL 18, Redis 7).
   - Express 5 base router, Pino structured logging, correlation ID middleware (`x-request-id`).
   - Standardized RFC 7807 problem details error handling framework.
   - Vitest test runner configuration and Supertest integration test fixtures.
2. **Abstract Contracts & Zod Validation Schemas:**
   - Defining TypeScript domain interfaces mirroring the 43 entities in [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) v0.3.3.
   - Authoring strict Zod request/response validation schemas for IAM, Catalog, Storage, and Procurement routes.
3. **Frontend UI Wireframing & App Router Layouts:**
   - Next.js 15 App Router shell, navigation sidebar, theme provider, and store-context switcher UI.
   - Reusable UI component library (Data tables, status badges, forms, modal dialogs, loading skeletons).
4. **Mock Repositories & In-Memory Service Logic:**
   - Unit testing business rules (e.g. Net Weight calculation: $\text{Net} = \text{Gross} - \text{Tare} - \text{Stones}$) with in-memory fixtures.

### 5.2 Blocked Work (Strictly Paused Under Milestone 0.3.1 Governance)

The following implementation work streams **require formal stakeholder sign-off** before executable code is produced:

1. **Blocked by `BIZ-Q01` (Tenancy Model):**
   - Authoring physical PostgreSQL DDL migration scripts (composite keys vs surrogate keys).
   - Creating table schemas with or without `organization_id` denormalization.
   - Enforcing database-level Row-Level Security (RLS) policies.
2. **Blocked by `BIZ-Q02` (Inventory Tracking Scope):**
   - Authoring DDL for `inventory_stock_balances` (Entity 29).
   - Scaffolding non-serialized quantity movement database triggers.
3. **Blocked by `BIZ-Q03` (Intake Weight Tolerance):**
   - Implementing operational tolerance comparison parameters in `QcService`.
   - Configuring the weight discrepancy exception and waiver workflow.
4. **Blocked by `DEC-05` (Numeric Precision Matrix & Accounting):**
   - Defining exact PostgreSQL column scales: `NUMERIC(10, 4)` vs alternative scales.
   - Implementing financial line-total rounding logic in procurement.
   - Finalizing zero-balance stock retention purge jobs.

---

_End of Feature Dependency Map & Critical Path Analysis (v1.1)._
