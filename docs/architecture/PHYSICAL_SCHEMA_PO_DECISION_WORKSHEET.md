# Jewellery ERP Platform — Product Owner Decision Worksheet

**Document Purpose:** Formal Stakeholder Decision Worksheet for Milestone 0.3.1 Gate Resolution  
**Document Version:** 1.0  
**Date:** 2026-10-27  
**Facilitators:** Principal Software Architect, PostgreSQL Database Architect & Business Decision Facilitator  
**Target Decision Maker:** Product Owner / Executive Stakeholder  
**Project:** Jewellery ERP Platform (`jewellery-erp-platform`)  
**Target Technical Stack:** Next.js (Web) + Express 5 & TypeScript (API/Worker) + PostgreSQL 18 + Redis/BullMQ

**Authoritative Baseline References:**

- [`docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md`](PHYSICAL_SCHEMA_DECISION_REGISTER.md) (v1.2.2, `AWAITING_PO_SIGN_OFF`)
- [`docs/architecture/LOGICAL_DATA_MODEL.md`](LOGICAL_DATA_MODEL.md) (v0.3.3, 43 entities across 8 domains, `READY_FOR_LOGICAL_ERD`)
- [`docs/architecture/DOMAIN_MODEL_REVIEW.md`](DOMAIN_MODEL_REVIEW.md) (v1.6, `READY_FOR_LOGICAL_ERD`)
- [`docs/JEWELLERY_ERP_PHASE_0_BASELINE_v0.2.md`](../JEWELLERY_ERP_PHASE_0_BASELINE_v0.2.md)
- [`docs/JEWELLERY_ERP_DOMAIN_MODEL_v0.2.md`](../JEWELLERY_ERP_DOMAIN_MODEL_v0.2.md)
- [`JEWELLERY_ERP_PROJECT_OVERVIEW.md`](../../JEWELLERY_ERP_PROJECT_OVERVIEW.md)

---

## Section A — Governance, Context & Current Gate Status

### A.1 Executive Context

Milestone 0.3 of the **Jewellery ERP Platform** successfully delivered a fully normalized, technically verified, and internally consistent 43-entity Logical Relational Data Model ([`docs/architecture/LOGICAL_DATA_MODEL.md`](LOGICAL_DATA_MODEL.md) v0.3.3).

- **Project:** Jewellery ERP Platform (`jewellery-erp-platform`)
- **Logical Model Baseline:** v0.3.3, 43 entities across 8 domains
- **Current Decision Register Version:** v1.2.2 ([`docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md`](PHYSICAL_SCHEMA_DECISION_REGISTER.md))
- **Purpose:** Formal resolution of four physical-schema decision gates (`BIZ-Q01`, `BIZ-Q02`, `BIZ-Q03`, `DEC-05`)
- **Current Status of Every Gate:** `RECOMMENDED (OPEN)`
- **Milestone 0.4 Status:** Formally blocked until the required business approvals are documented

However, physical PostgreSQL 18 DDL generation, column type allocation, database index creation, and migration authoring are **formally paused at the Milestone 0.3.1 checkpoint**. In accordance with architecture governance standards, engineering will not begin **Milestone 0.4: Physical Database Schema & Migration Specification** until the Product Owner formally resolves the four open physical-schema decision gates.

### A.2 Distinction Between Architectural Recommendations and Business Approvals

> [!IMPORTANT]
> **A Technical Recommendation Is Not A Business Approval.**  
> The architectural review team has formulated evidence-based technical recommendations for each decision gate. However, every gate is currently classified as **`RECOMMENDED (OPEN)`**. Engineering will not make unilateral business assumptions regarding commercial SaaS scope, inventory tracking scope, operational weight loss allowances, or corporate accounting rounding rules. Milestone 0.4 implementation remains blocked until this worksheet is reviewed, completed, and signed.

### A.3 Decision Gate Status Summary

```
+----------+-----------------------------------+--------------------+------------------+-----------------------------------------------+
| Gate ID  | Decision Gate Title               | Current Status     | Downstream Risk  | Decision Required from Product Owner          |
+----------+-----------------------------------+--------------------+------------------+-----------------------------------------------+
| BIZ-Q01  | Tenancy Model Architecture        | RECOMMENDED (OPEN) | HIGH (BLOCKING)  | Select Single-Enterprise Multi-Branch (Opt A) |
|          |                                   |                    |                  | or Commercial Multi-Tenant SaaS (Opt B).      |
+----------+-----------------------------------+--------------------+------------------+-----------------------------------------------+
| BIZ-Q02  | Inventory Tracking Scope          | RECOMMENDED (OPEN) | MEDIUM (BLOCKING)| Confirm Phase 0 Hybrid Tracking DDL (Opt 3)   |
|          |                                   |                    |                  | or Defer Batch DDL to Phase 1 (Opt 1).        |
+----------+-----------------------------------+--------------------+------------------+-----------------------------------------------+
| BIZ-Q03  | Intake Weight Tolerance Threshold | RECOMMENDED (OPEN) | MEDIUM (BLOCKING)| Approve Configurable Tolerance Strategy with  |
|          |                                   |                    |                  | confirmed operational threshold parameters.   |
+----------+-----------------------------------+--------------------+------------------+-----------------------------------------------+
| DEC-05   | Proposed Numeric Precision Matrix | RECOMMENDED (OPEN) | HIGH (BLOCKING)  | Sign off on PostgreSQL NUMERIC scales,        |
|          |                                   |                    |                  | quantity rules, and accounting policies.      |
+----------+-----------------------------------+--------------------+------------------+-----------------------------------------------+
```

---

## Section B — Gate BIZ-Q01: Tenancy Model Architecture

### B.1 Problem Statement

The logical data model establishes `organizations` as the root corporate entity and `stores` as branch locations. Business stakeholders must formally decide whether the platform is built as an internal enterprise system for a single corporate group or as a commercial multi-tenant SaaS application serving multiple independent jewellery companies.

### B.2 Architectural Comparison of Options

```
+--------------------------------+----------------------------------------------------+----------------------------------------------------+
| Dimension                      | Option A: Single-Enterprise Multi-Branch           | Option B: Commercial Multi-Tenant SaaS             |
+--------------------------------+----------------------------------------------------+----------------------------------------------------+
| 1. Organization Ownership      | Exactly 1 primary corporate Organization. Stores   | N independent client Organizations. Stores are     |
|                                | represent retail showrooms, vault hubs, divisions. | strictly private branch locations within each Org. |
+--------------------------------+----------------------------------------------------+----------------------------------------------------+
| 2. Master Catalog Sharing      | Products, SKUs, Materials, and Purities are shared | Every Catalog entry is strictly owned by one Org;  |
|                                | enterprise-wide across all stores and divisions.   | zero cross-tenant catalog sharing.                 |
+--------------------------------+----------------------------------------------------+----------------------------------------------------+
| 3. Foreign Key Architecture    | Standard surrogate UUIDv7 foreign keys directly    | Requires composite foreign keys `(organization_id, |
|                                | linking child entities to immediate parent PK.     | id)` across child tables or RLS enforcement.       |
+--------------------------------+----------------------------------------------------+----------------------------------------------------+
| 4. Natural Key Uniqueness      | Global uniqueness on `sku_code`, `serial_number`,  | Natural keys MUST be scoped by tenant:             |
|                                | and `rfid_tags.epc_code`.                          | `UNIQUE (organization_id, sku_code)`.             |
+--------------------------------+----------------------------------------------------+----------------------------------------------------+
| 5. Security & Isolation        | Store-level RBAC custody boundary. Cross-branch    | Absolute corporate data partitioning. Cross-tenant |
|                                | transfers permitted under shared balance sheet.    | visibility is a catastrophic security defect.      |
+--------------------------------+----------------------------------------------------+----------------------------------------------------+
| 6. Database Enforcement        | Application middleware and store-context queries.  | Mandatory PostgreSQL Row-Level Security (RLS) +    |
|                                | Database RLS optional.                             | tenant connection pooling session variables.       |
+--------------------------------+----------------------------------------------------+----------------------------------------------------+
| 7. Future SaaS Transition      | Provides clean structural foundation, but future   | Native SaaS from Day 1. Substantially higher       |
|                                | SaaS conversion requires separate major project.   | Phase 0 DDL, index, and query testing overhead.    |
+--------------------------------+----------------------------------------------------+----------------------------------------------------+
```

### B.3 Existing Architectural Recommendation

- **Recommendation:** **Option A (Single-Enterprise Multi-Branch Architecture with Provisioned Tenant Isolation Hooks)**.
- **Architectural Rationale:** All project baseline documents (`PROJECT_OVERVIEW.md` Section 15, `BASELINE_v0.2.md`) describe a single corporate brand operating regional divisions (`Platinum Division`, `Silver Division`, `Canada Region`) sharing a `Head Office System GUID`. The Phase 0/1 roadmap contains no commercial SaaS subscription billing, tenant self-registration, or multi-tenant metering.
- **Future SaaS Transition Realism:** Retaining `organization_id` on top-level root entities (`organizations`, `stores`, `users`, `products`, `categories`, `materials`, `purities`, `suppliers`, `goods_receipt_notes`, `inventory_items`) establishes a clean boundary. However, **this does not guarantee a trivial SaaS transition**. Converting to commercial SaaS in a future phase would require a separate architectural initiative to evaluate: child entity tenant denormalization, tenant-scoped unique constraints, cross-tenant referential integrity, authorization context propagation, and database RLS policies.

### B.4 Product Owner Decision Form — Gate BIZ-Q01

```
[ ] OPTION A: Single-Enterprise Multi-Branch Architecture (Recommended)
    - Deploy as an enterprise management system for one corporate jewellery entity.
    - Stores represent branches, showrooms, and vault hubs under a shared catalog.
    - Retain organization_id on root entities; omit tenant denormalization on child tables.

[ ] OPTION B: Commercial Multi-Tenant SaaS Architecture
    - Deploy as a multi-tenant platform serving independent jewellery companies.
    - Mandate organization_id denormalization across 15+ child tables in Phase 0.
    - Require composite unique indexes (organization_id, sku_code/serial_number) and RLS.

Decision Status:         [ PENDING ]
Product Owner Rationale: _________________________________________________________________
Constraints/Exceptions:  _________________________________________________________________
Authorized Sign-Off:     _________________________________________________________________
Decision Date:           _________________________________________________________________
```

---

## Section C — Gate DEC-05: Physical Numeric Precision & Accounting Rules

### C.1 Context & Floating-Point Prohibition

In luxury jewellery manufacturing and retail, binary floating-point types (`REAL`, `DOUBLE PRECISION`, `FLOAT`) are strictly prohibited (`DOC-01` Rule 12). All physical measurements, purities, currency rates, and financial totals must use PostgreSQL arbitrary-precision `NUMERIC(precision, scale)`.

Numeric specifications are classified into:

1. _Authoritative Baseline Requirements:_ Enforced by existing project documentation.
2. _Architectural Proposals:_ Proposed `NUMERIC(p, s)` scales awaiting stakeholder confirmation.
3. _Unresolved Accounting Policies:_ Rounding and retention rules requiring business sign-off.
4. _Formally Deferred Rules:_ Commercial retail/POS rounding deferred to Phase 1.

### C.2 Compact Decision Table across 15 Documented Numeric Categories

```
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| #   | Category / Attribute             | Entity Scope & Attributes   | Unit of Measure       | Proposed PostgreSQL | Precision & Scale | Operational Range   | Rounding Strategy /     | PO Decision     |
|     |                                  |                             |                       | Data Type / Rule    | Rationale         |                     | Rule Scope              | Status          |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 1.  | Precious Metal Gross Weight      | QC, Items, Movements        | Grams (GM)            | NUMERIC(10, 4)      | 4 decimals = 0.1mg| 0.0001g to          | Exact Balance Capture;  | [ PENDING ]     |
|     | (`gross_weight_grams`)           | (quality_check_items, etc.) |                       |                     | analytical balance| 999,999.9999g       | No round on raw capture.|                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 2.  | Precious Metal Net Weight        | QC, Inventory Items         | Grams (GM)            | NUMERIC(10, 4)      | Pure alloy weight | 0.0001g to          | Exact Derived:          | [ PENDING ]     |
|     | (`net_weight_grams`)             | (quality_check_items, etc.) |                       |                     | after stone deduct| 999,999.9999g       | Net = Gross - Tare -    |                 |
|     |                                  |                             |                       |                     |                   |                     | Stones (Exact subtract).|                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 3.  | Gemstone Carat Weight            | Gemstones, QC Specs         | Carats (CT)           | NUMERIC(8, 4)       | 1 carat = 0.200g. | 0.0001 ct to        | Exact Metrology Capture;| [ PENDING ]     |
|     | (`carat_weight`, `stone_weight`) | (item_gemstones, etc.)      |                       |                     | 4 decimals micro-c| 9,999.9999 ct       | Point scale (0.01 pt).  |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 4.  | Metal Purity Percentage          | Master Data (purities)      | Percentage (%)        | NUMERIC(7, 4)       | Allows 100.0000%  | 0.0000% to          | Exact Assay Fineness;   | [ PENDING ]     |
|     | (`purity_percentage`)            | (purities.purity_percentage)|                       |                     | without overflow  | 100.0000%           | Canonical alloy source. |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 5.  | Metal Purity Ratio               | Master Data (purities)      | Dimensionless Ratio   | NUMERIC(5, 4)       | Decimal fineness  | 0.0000 to           | Derived:                | [ PENDING ]     |
|     | (`purity_ratio`)                 | (purities.purity_ratio)     | (Millièmes / 1000)    |                     | (0.9160, 0.9999)  | 1.0000              | purity_pct / 100.       |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 6.  | Raw Laboratory Measurements and  | Metrology Audit Log         | Generic Scale Unit    | NUMERIC(12, 4)      | Large containers  | 0.0001 to           | Immutable raw scale     | [ PENDING ]     |
|     | Tare Weight                      | (weight_measurements)       | (GRAM, CT, TROY_OZ)   |                     | & micro-weights   | 99,999,999.9999     | observation. Zero round.|                 |
|     | (`measured_weight`, `tare_weight`)|                             |                       |                     |                   |                     |                         |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 7.  | Unit Labour / Making Rate        | Procurement Costing         | Currency per gram     | NUMERIC(12, 4)      | High precision for| $0.0001 to          | Rate-multiplication     | [ PENDING ]     |
|     | (`unit_cost_labour`)             | (shipment_items)            | or per piece (CAD/USD)|                     | making rate calc  | $99,999,999.9999    | rounding policy         |                 |
|     |                                  |                             |                       |                     |                   |                     | unresolved; requires    |                 |
|     |                                  |                             |                       |                     |                   |                     | costing/accounting      |                 |
|     |                                  |                             |                       |                     |                   |                     | approval.               |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 8.  | Metal Spot Purchase Rate         | Procurement Valuation       | Currency per gram     | NUMERIC(14, 4)      | International gold| $0.0001 to          | Market feed snapshot;   | [ PENDING ]     |
|     | (`unit_cost_metal`)              | (shipment_items)            | (CAD/USD per gram)    |                     | spot tick feeds   | $999,999,999.9999   | 4 decimal standard.     |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 9.  | Procurement Settlement Total     | Procurement Financials      | Major Currency Units  | NUMERIC(14, 2)      | Standard currency | $0.01 to            | Proposal: Banker's      | [ PENDING ]     |
|     | (`line_total`)                   | (shipment_items)            | (CAD/USD Cents)       |                     | settlement scale  | $999,999,999,999.99 | Rounding (Half-Even).   |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 10. | Inventory Movement Quantity      | Movement Ledger             | Discrete Units Moved  | INTEGER             | Piece (1) or      | 1 to                | Exact integer counting; | [ PENDING ]     |
|     | (`quantity`)                     | (inventory_movements)       |                       |                     | batch count (>=1) | 2,147,483,647       | CHECK (quantity > 0);   |                 |
|     |                                  |                             |                       |                     |                   |                     | serialized movement     |                 |
|     |                                  |                             |                       |                     |                   |                     | quantity is 1.          |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 11. | Stock Balance Quantities:        | Batch Stock Balances        | Discrete Bulk Pieces  | INTEGER             | Depleted stock = 0| 0 to                | Exact declared columns: | [ PENDING ]     |
|     | `quantity_on_hand` and           | (inventory_stock_balances)  |                       |                     | on hand           | 2,147,483,647       | CHECK (quantity_on_hand |                 |
|     | `quantity_reserved`              |                             |                       |                     |                   |                     |  >= 0);                 |                 |
|     |                                  |                             |                       |                     |                   |                     | CHECK (quantity_reserved|                 |
|     |                                  |                             |                       |                     |                   |                     |  >= 0);                 |                 |
|     |                                  |                             |                       |                     |                   |                     | CHECK (quantity_on_hand |                 |
|     |                                  |                             |                       |                     |                   |                     |  >= quantity_reserved). |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 12. | Intrinsic Serialized Item Count  | Serialized Asset Tracking   | Individual Piece      | N/A (Intrinsically  | 1 row = 1 piece;  | Exactly 1           | Exact physical identity;| [ PENDING ]     |
|     | (Single piece per row)           | (inventory_items)           |                       | 1 piece per row)    | no quantity column| per row             | derived via COUNT(*);   |                 |
|     |                                  |                             |                       |                     | declared in model |                     | no quantity column      |                 |
|     |                                  |                             |                       |                     |                   |                     | exists.                 |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+-----------------+
| 13. | Mounted Gemstone and Component   | Gemstone Specs & Pieces     | Discrete Stone Count  | INTEGER             | Solitaire (1) to  | 1 to                | CHECK (stone_count > 0);| [ PENDING ]     |
|     | Counts (`stone_count`)           | (item_gemstones, etc.)      |                       |                     | pavé parcel (N)   | 2,147,483,647       | Mandatory NOT NULL.     |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+---------------------+
| 14. | Physical Item Dimensions         | Catalog Variant Specs       | Millimeters (MM)      | NUMERIC(6, 2)       | 2 decimals = 10µm | 0.01 mm to          | Proposal: Half-Up       | [ PENDING ]     |
|     | (`length`, `width`, `height`)    | (product_skus)              |                       |                     | caliper precision | 9,999.99 mm         | to 0.01 mm.             |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+---------------------+
| 15. | Ring Size / Gauge                | Catalog Variant Specs       | Standard Metric Scale | NUMERIC(4, 2)       | Metric & standard | 0.00 to             | Quarter-size increments | [ PENDING ]     |
|     | (`ring_size`)                    | (product_skus)              | (e.g. US/India scale) |                     | quarter sizes     | 99.99               | (0.25).                 |                 |
+-----+----------------------------------+-----------------------------+-----------------------+---------------------+-------------------+---------------------+-------------------------+---------------------+
```

### C.3 Outstanding Accounting & Business Policy Decision Form

#### Policy 1: Financial Line-Extension Rounding Strategy

- **Status in Authoritative Register:** Non-binding architectural proposal. The proposed Banker's Rounding (Half-Even) to two decimal places on `line_total` is an architectural best-practice proposal; it is **not an approved corporate accounting policy** and remains awaiting formal corporate accounting approval.
- **Calculation Formula & Input Basis Unresolved:** The authoritative decision register does not establish a procurement line-total calculation formula. The approved procurement line-total calculation and its input basis (incorporating units, metal weight, labour/making rates, and piece counts without assuming interchangeable units) must be confirmed through the appropriate costing/accounting decision before implementation.
- **Decision Required:** Formal corporate accounting confirmation of the line-extension rounding strategy for procurement settlement totals.
- **Product Owner / Corporate Accounting Decision Form:**
  ```
  Approved Rounding Policy: [ ] Banker's Rounding (Half-Even) to 2 decimal places (Proposed)
                            [ ] Alternative Rounding Policy: __________________________
  Accounting Rationale:     ___________________________________________________________
  Status: [ PENDING ] | Approver: ___________________________ | Date: ___________________
  ```

#### Policy 2: Zero-Balance Stock Record Retention vs. Archival or Pruning

- **Status in Authoritative Register:** Unresolved business decision. Whether depleted bulk stock balance records (`quantity_on_hand = 0` and `quantity_reserved = 0`) are retained indefinitely in `inventory_stock_balances` to preserve historical SKU-compartment pairings or pruned/archived via a scheduled job remains an open business decision for Milestone 0.4. Neither indefinite retention nor a specific archival period is established as a recommendation.
- **Decision Required:** Formal determination on zero-balance stock retention versus scheduled archival or pruning.
- **Product Owner Decision Form:**
  ```
  Approved Policy: [ ] Retain zero-balance records indefinitely in inventory_stock_balances
                   [ ] Archive / prune zero-balance records via scheduled batch job
                   [ ] Custom Policy: __________________________________________________
  Business Rationale: ___________________________________________________________________
  Status: [ PENDING ] | Approver: ___________________________ | Date: ___________________
  ```

#### Policy 3: Multi-Currency Conversion Precision & Rounding

- **Status in Authoritative Register:** Unresolved business and treasury policy. Foreign vendor procurement contracts manifested in foreign currencies (e.g. USD) convert to CAD functional currency. The authoritative register leaves the precision, scale, and rounding rules for exchange rate storage and line conversion unresolved pending enterprise treasury policy. No specific numeric type, scale, or rounding algorithm is established in the project baseline.
- **Decision Required:** Formal corporate treasury/accounting determination of exchange rate storage precision, scale, and conversion rounding strategy.
- **Product Owner / Corporate Treasury Decision Form:**
  ```
  Approved FX Rate Precision & Scale: __________________________________________________
  Approved FX Conversion Rounding Policy: ______________________________________________
  Treasury / Business Rationale: _______________________________________________________
  Status: [ PENDING ] | Approver: ___________________________ | Date: ___________________
  ```

#### Policy 4: Tax and Customs-Duty Calculation and Rounding

- **Status in Authoritative Register:** Unresolved fiscal and accounting policy. Procurement sales taxes (GST/HST) and customs duties on imported shipments are subject to applicable statutory fiscal rules. The authoritative register leaves the calculation algorithm and rounding strategy open for confirmation; no specific rounding rule is established as a baseline standard.
- **Decision Required:** Formal confirmation from corporate accounting and tax compliance of the tax/duty calculation algorithm and rounding rules.
- **Product Owner / Corporate Accounting Decision Form:**
  ```
  Approved Tax & Customs-Duty Rounding Policy: __________________________________________
  Fiscal / Accounting Rationale: _______________________________________________________
  Status: [ PENDING ] | Approver: ___________________________ | Date: ___________________
  ```

#### Commercial Retail and POS Rounding (Formally Deferred)

- **Governance Status:** **Formally Deferred to Phase 1 (Retail POS & Store Operations)**.
- **Scope Boundary:** Consumer cash rounding (e.g. 5-cent Swedish rounding for cash transactions in Canada), retail promotional markdowns, and loyalty point conversions are explicitly excluded from Phase 0 / Milestone 0.4 procurement and wholesale inventory DDL.

---

## Section D — Gate BIZ-Q02: Inventory Tracking Scope

### D.1 Problem Statement

High-value jewellery pieces (diamond rings, gold bangles) require serial-level identity, RFID tags, and individual scale history. However, operations also handle non-serialized items (clasps, earring backings, loose pearls, silver findings, branded boxes) where serialized piece tracking is commercially unviable.

### D.2 Architectural Options

```
+---------------------------------------------------+---------------------------------------------------+----------------------------------------------------+
| Option 1: Serialized Only in Phase 0              | Option 2: Quantity-Batch Only                     | Option 3: Hybrid Dual Tracking in Phase 0 (Rec)    |
+---------------------------------------------------+---------------------------------------------------+----------------------------------------------------+
| Scaffold only `inventory_items` in Milestone 0.4. | Scaffold only `inventory_stock_balances`.         | Scaffold BOTH `inventory_items` and                |
| Defer bulk balance tables to Phase 1.             | UNVIABLE for luxury jewellery: high-value         | `inventory_stock_balances` in Phase 0 DDL.         |
| Reduces approved 43-entity schema to 42 entities. | pieces require individual piece identity, RFID    | Preserves approved 43-entity baseline intact.      |
| Creates migration churn when findings introduced. | tags, analytical scale history, and certificates. | Eliminates Phase 1 DDL migration debt.             |
|                                                   | Unsuitable for proposed domain per review.        |                                                    |
+---------------------------------------------------+---------------------------------------------------+----------------------------------------------------+
```

### D.3 Practical Schema & Operational Implications of Option 3

1. **`inventory_items`:** One row represents one serialized physical piece (intrinsic physical piece identity; no quantity column exists on `inventory_items`). Piece counts are evaluated via SQL `COUNT(*)`. Governed by a 4-dimensional state model (`quality_state`, `approval_state`, `custody_state`, `commercial_state`) and bound to `rfid_tags`.
2. **`inventory_stock_balances`:** Explicit bulk stock balance records per `(store_id, product_sku_id, compartment_id)` tracking exact declared attributes `inventory_stock_balances.quantity_on_hand` (non-negative integer, `CHECK (quantity_on_hand >= 0)`) and `inventory_stock_balances.quantity_reserved` (non-negative integer, `CHECK (quantity_reserved >= 0)`). The proposed invariant `CHECK (quantity_on_hand >= quantity_reserved)` guarantees that available stock (`quantity_available = quantity_on_hand - quantity_reserved`) never becomes negative.
3. **`inventory_movements`:** Unified ledger tracking both models. The declared attribute `inventory_movements.quantity` is a strictly positive integer (`CHECK (quantity > 0)`). For serialized piece transfers (`inventory_item_id IS NOT NULL`), `quantity` is strictly 1. For bulk findings and packaging movements (`inventory_item_id IS NULL`), `quantity >= 1`.
4. **SKU Tracking Type:** Enforced via `product_skus.tracking_type IN ('SERIALIZED', 'QUANTITY_BATCH')`, ensuring catalog definitions strictly dictate downstream inventory behavior and ledger routing.
5. **Physical Piece Identity and Serialized Tracking:** Luxury high-value pieces maintain individual end-to-end lifecycle identity, RFID tag association, individual scale history, birth certificate immutability, and store custody tracking.
6. **Batch Stock Reconciliation:** Periodic cycle counts, bulk shrinkage and loss adjustments, and reconciliation against physical bin counts without individual piece identity, cross-referenced against historical ledger movements.
7. **Phase 0 Schema Completeness:** Scaffolding Entity 29 (`inventory_stock_balances`) in Milestone 0.4 ensures the approved 43-entity baseline is preserved in full DDL without migration churn or schema alterations when bulk inventory tracking is enabled in application services.

### D.4 Product Owner Decision Form — Gate BIZ-Q02

```
[ ] OPTION 3: Hybrid Dual Tracking Architecture in Phase 0 DDL (Recommended)
    - Scaffold both serialized (inventory_items) and batch (inventory_stock_balances) tables.
    - Preserve the 43-entity logical model baseline intact.
    - Support immediate serial tracking while enabling findings/packaging stock balances.

[ ] OPTION 1: Serialized Pieces Only in Phase 0 DDL
    - Defer inventory_stock_balances DDL generation to Phase 1.
    - Acknowledge schema scope reduction from 43 to 42 entities and future migration churn.

Decision Status:         [ PENDING ]
Product Owner Rationale: _________________________________________________________________
Constraints/Exceptions:  _________________________________________________________________
Authorized Sign-Off:     _________________________________________________________________
Decision Date:           _________________________________________________________________
```

---

## Section E — Gate BIZ-Q03: Intake Weight Tolerance

### E.1 Context, Architectural Recommendation & Enforcement Boundaries

During intake, manifested supplier weights (`shipment_items.declared_gross_weight_grams`) are compared against laboratory balance readings (`quality_check_items.gross_weight_grams`). Analytical balances have sub-milligram readability, but minor physical discrepancies occur due to atmospheric moisture, scale calibration variance, and residue.

- **Architectural Recommendation:** Configurable tolerance policy enforced through the documented transactional application gate and row-local database constraints (`Option B` in the authoritative decision register).
- **Status of Actual Business Parameters:** Pending Product Owner approval. The actual operational thresholds (absolute tolerance, relative percentage tolerance, category differentiation, maximum cap, missing-weight protocol, and weight-waiver workflow) require explicit stakeholder sign-off.
- **Status of Example Values:** Example thresholds cited in technical documents (including $\pm 0.02\,\text{g}$ absolute tolerance and $0.1\%$ relative tolerance) remain **non-binding architectural proposals**, not approved business rules or regulatory standards.
- **Row-Local Database Constraints:** Enforce 3VL-compliant weight physics within `quality_check_items` (`chk_qc_items_weight_physics`) and pre-approval completeness (`chk_qc_items_approval_prerequisites`). (Cross-table row-local `CHECK` constraints are mathematically and syntactically prohibited in PostgreSQL).
- **Application Transaction Gate:** Express 5 `QcService` transactionally joins `shipment_items` and `quality_check_items` to evaluate discrepancy delta $\Delta = |\text{gross} - \text{declared}|$.
- **Approval Blocking:** If variance exceeds approved tolerance policy, the transition to `status = 'APPROVED'` is blocked; no `inventory_items` row can be created.
- **Fail-Closed Missing Weight:** If `declared_gross_weight_grams IS NULL`, automated tolerance check cannot pass; automated approval is strictly blocked (fail-closed) until manifest amendment or an authorized administrative exception is recorded.
- **Separation of Waivers:** `reason_code = 'DAMAGE_WAIVER'` is strictly reserved for physical damage (Gap 3). It cannot be used for weight variances. Authorizing a weight-tolerance waiver is an open business decision requiring distinct approval.
- **Concurrency & Immutability:** Milestone 0.4 must enforce row locking (`SELECT ... FOR SHARE / FOR UPDATE`) during QC approval AND post-approval declared-weight immutability on `shipment_items`.

### E.2 Decision Form for the Six Operational Tolerance Questions

#### Question 1: Absolute Tolerance Threshold in Grams

- **Proposal:** $\pm 0.02\,\text{g}$ absolute tolerance default for precious metal pieces.
- **Choices Documented:** $\pm 0.01\,\text{g}$ (strict bullion standard), $\pm 0.02\,\text{g}$ (recommended balance), $\pm 0.05\,\text{g}$ (commercial casting tolerance).
- **Product Owner Decision:**
  ```
  Approved Absolute Threshold: [  ] ±0.01g   [  ] ±0.02g (Proposal)   [  ] ±0.05g   [  ] Other: _____ g
  Status: [ PENDING ] | Approver: ______________ | Date: _________________
  ```

#### Question 2: Relative Tolerance, Including Its Reference Base

- **Proposal:** $0.1\%$ relative tolerance calculated strictly against `shipment_items.declared_gross_weight_grams`.
- **Choices Documented:** $0.05\%$ (high-value bullion), $0.1\%$ (standard fine jewellery), $0.2\%$ (filigree / hollowware).
- **Product Owner Decision:**
  ```
  Approved Relative Threshold: [  ] 0.05%   [  ] 0.1% (Proposal)   [  ] 0.2%   [  ] None (Absolute only)
  Reference Base: Strictly declared_gross_weight_grams on shipment_items.
  Status: [ PENDING ] | Approver: ______________ | Date: _________________
  ```

#### Question 3: Differentiation by Asset Category, Material, or Measurement Stage

- **Proposal:** Uniform baseline for Phase 0 intake, with configurable parameters by product category in Phase 1.
- **Choices Documented:**
  - _Option 3A:_ Uniform tolerance across all asset categories in Phase 0 (Recommended for simplicity).
  - _Option 3B:_ Tiered thresholds (e.g. Bullion $\pm 0.01\,\text{g}$; Plain Gold $\pm 0.02\,\text{g}$; Studded Jewellery $\pm 0.05\,\text{g}$).
- **Product Owner Decision:**
  ```
  [ ] Approved Option 3A: Uniform tolerance across all items in Phase 0.
  [ ] Approved Option 3B: Tiered category thresholds (Specify): __________________________________
  Status: [ PENDING ] | Approver: ______________ | Date: _________________
  ```

#### Question 4: Maximum Allowable Tolerance Cap

- **Problem:** On heavy items (e.g. a 500g gold chain), a $0.1\%$ relative tolerance permits a $0.50\,\text{g}$ discrepancy, which represents substantial financial variance.
- **Proposal:** Apply a hard cap of $0.10\,\text{g}$ maximum variance regardless of piece weight.
- **Product Owner Decision:**
  ```
  [ ] Approved: Maximum variance cap of 0.10g (or relative %, whichever is smaller).
  [ ] Approved Alternative Cap: _____ g maximum allowable variance.
  [ ] No Cap: Rely strictly on percentage tolerance.
  Status: [ PENDING ] | Approver: ______________ | Date: _________________
  ```

#### Question 5: Protocol for Missing Supplier-Declared Weight

- **Architectural Position:** Missing declared shipment weight cannot silently pass validation.
- **Proposal:** **Strict Fail-Closed**. Automated approval is blocked; piece remains in existing non-approved `status = 'PENDING'` until supplier manifest is amended or an authorized administrative exception is recorded.
- **Product Owner Decision:**
  ```
  [ ] Approved: Strict Fail-Closed (Automated approval blocked if declared weight is NULL).
  [ ] Alternative Exception Protocol: ____________________________________
  Status: [ PENDING ] | Approver: ______________ | Date: _________________
  ```

#### Question 6: Out-of-Tolerance Approval, Rejection, Investigation, and Weight-Waiver Workflow

- **Architectural Position:** When an item fails tolerance, it remains in non-approved `status = 'PENDING'`, OR transitions to `status = 'REJECTED'` with `reason_code = 'WEIGHT_DISCREPANCY_EXCEEDED'` in `quality_decisions`. `DAMAGE_WAIVER` is strictly forbidden for weight discrepancies.
- **Decision Required:** Does the business authorize a dedicated weight-tolerance override workflow?
- **Product Owner Decision:**
  ```
  [ ] Authorize dedicated weight override: Recorded in quality_decisions under
      decision = 'APPROVED', reason_code = 'WEIGHT_TOLERANCE_WAIVER' with mandatory notes.
  [ ] Strict No-Waiver Policy: Out-of-tolerance items MUST be marked REJECTED and returned
      or renegotiated with supplier via vendor debit note; zero manual override permitted.
  Status: [ PENDING ] | Approver: ______________ | Date: _________________
  ```

---

## Section F — Decision Summary & Sign-Off Register

### F.1 Consolidated Gate Resolution Table

```
+----------+-----------------------------------+--------------------+------------------------+---------------------------------------+------------------+---------------+---------------------+
| Gate ID  | Decision Required                 | Recommended Option | Product Owner Decision | Unresolved Dependencies               | Approver         | Approval Date | Final Status        |
+----------+-----------------------------------+--------------------+------------------------+---------------------------------------+------------------+---------------+---------------------+
| BIZ-Q01  | Tenancy Model Architecture        | Option A (Single-  | [ PENDING ]            | None (Self-contained architectural    | ________________ | _____________ | [ PENDING ]         |
|          | (Single-Enterprise vs SaaS)       | Enterprise Branch) |                        | decision)                             |                  |               |                     |
+----------+-----------------------------------+--------------------+------------------------+---------------------------------------+------------------+---------------+---------------------+
| BIZ-Q02  | Inventory Tracking Scope          | Option 3 (Hybrid   | [ PENDING ]            | Requires BIZ-Q01 tenancy alignment    | ________________ | _____________ | [ PENDING ]         |
|          | (Serialized vs Batch vs Hybrid)   | Dual-Tracking DDL) |                        |                                       |                  |               |                     |
+----------+-----------------------------------+--------------------+------------------------+---------------------------------------+------------------+---------------+---------------------+
| BIZ-Q03  | Intake Weight Tolerance Policy    | Configurable Policy| [ PENDING ]            | Requires PO sign-off on 6 operational | ________________ | _____________ | [ PENDING ]         |
|          | (Questions 1 through 6)           | (Dual-Tier Gate)   |                        | parameters and weight-waiver workflow |                  |               |                     |
+----------+-----------------------------------+--------------------+------------------------+---------------------------------------+------------------+---------------+---------------------+
| DEC-05   | Physical Numeric Precision Matrix | Proposed 15-Row    | [ PENDING ]            | Requires Corporate Accounting sign-off| ________________ | _____________ | [ PENDING ]         |
|          | & Accounting Policies (1 to 4)    | Precision Matrix   |                        | on rounding and multi-currency rules  |                  |               |                     |
+----------+-----------------------------------+--------------------+------------------------+---------------------------------------+------------------+---------------+---------------------+
```

### F.2 Decision Gate Dependency Model & Implementation Sequencing

In accordance with [`docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md`](PHYSICAL_SCHEMA_DECISION_REGISTER.md) v1.2.2 Section 9, stakeholder decision workflows and physical schema implementation adhere to the following reconciled dependency structure:

1. **Mandatory Technical Prerequisites:**
   - `BIZ-Q01` is the **only intra-gate mandatory technical prerequisite**, directly blocking `BIZ-Q02`. Scaffolding `inventory_stock_balances` and quantity movement triggers in Phase 0 DDL requires confirming whether the platform is Single-Enterprise Multi-Branch (Option A) or Commercial Multi-Tenant SaaS (Option B). The approved logical model ([`docs/architecture/LOGICAL_DATA_MODEL.md`](LOGICAL_DATA_MODEL.md) Entity 29) assigns surrogate UUIDv7 `id` as the primary key and defines bulk stock balances across the three documented inventory dimensions `(store_id, product_sku_id, compartment_id)`. The example tuple represents these operational inventory dimensions and candidate business key, not an approved composite primary key. Physical uniqueness indexing and tenant-scoping strategies—whether candidate uniqueness is scoped directly to `(store_id, product_sku_id, compartment_id)` under Option A or extended to tenant-scoped uniqueness `(organization_id, store_id, product_sku_id, compartment_id)` with composite foreign keys under Option B—cannot be authored until `BIZ-Q01` is confirmed.
2. **Independent Stakeholder Governance Tracks:**
   - `DEC-05` (Physical Numeric Precision Matrix & Corporate Accounting Policies) and `BIZ-Q03` (Intake Weight Tolerance Policy) are **mutually independent stakeholder decisions**. Neither gate depends on the other, nor does `DEC-05` depend on `BIZ-Q01`. Corporate Accounting/Finance can review and approve `DEC-05` in parallel with Executive review of `BIZ-Q01` and QC review of `BIZ-Q03`.
3. **Mandatory Milestone 0.4 Approval Gates:**
   - All four gates (`BIZ-Q01`, `BIZ-Q02`, `BIZ-Q03`, and `DEC-05`) are **mandatory blocking gates** for Milestone 0.4. Physical DDL, database migrations, and repository-level schema authoring remain strictly paused until all four gates receive formal written sign-off and the approved values are recorded in the authoritative decision register.
4. **Deterministic Implementation Ranking (DDL Authoring Sequence):**
   - When formal approvals are secured, Milestone 0.4 DDL authoring will proceed in the deterministic sequence established in Section 9.2:
     - **Rank 1 (`BIZ-Q01`):** Structural tenancy architecture and primary/foreign key strategies across all 43 tables.
     - **Rank 2 (`DEC-05`):** Column data types, `NUMERIC(p, s)` scales, and check constraints across all tables.
     - **Rank 3 (`BIZ-Q02`):** Scaffolding `inventory_stock_balances` and quantity ledger triggers.
     - **Rank 4 (`BIZ-Q03`):** Table-local 3VL QC check constraints (`chk_qc_items_weight_physics`, `chk_qc_items_approval_prerequisites`) and application discrepancy parameters.

### F.3 Formal Stakeholder Execution Block

```
+-----------------------------------------------------------------------------------------------------------------------+
| MILESTONE 0.3.1 FORMAL EXECUTIVE SIGN-OFF                                                                             |
+-----------------------------------------------------------------------------------------------------------------------+
| 1. Product Owner / Executive Business Authority:                                                                      |
|    Name:      _________________________________________________________________                                       |
|    Title:     _________________________________________________________________                                       |
|    Signature: _________________________________________________________________  Date: _____________________________  |
|                                                                                                                       |
| 2. Corporate Accounting & Finance Authority (for DEC-05 Financial Policies):                                          |
|    Name:      _________________________________________________________________                                       |
|    Title:     _________________________________________________________________                                       |
|    Signature: _________________________________________________________________  Date: _____________________________  |
|                                                                                                                       |
| 3. Principal Software Architect & Database Architect Review:                                                          |
|    Name:      Principal Architect & DB Architect                                                                      |
|    Signature: _________________________________________________________________  Date: _____________________________  |
+-----------------------------------------------------------------------------------------------------------------------+
```

---

## Section G — Milestone 0.4 Entry Checklist

Milestone 0.4 physical database design, table DDL, and database migration specification authoring (with ORM selection remaining provisional pending technical validation per `TECH-DEC-01` / `D-12`) will commence immediately when all items on the following entry checklist are completed:

```
[ ] 1.  BIZ-Q01 Documented Decision: Formal selection of Option A (Single-Enterprise) or Option B (Commercial SaaS) signed off in Section B.
[ ] 2.  BIZ-Q02 Documented Decision: Formal selection of Option 3 (Hybrid Dual Tracking) or Option 1 (Serialized Only) signed off in Section D.
[ ] 3.  BIZ-Q03 Approved Tolerance Parameters: Formal sign-off on the six operational intake weight tolerance questions in Section E.
[ ] 4.  DEC-05 Approved Precision Scales: Formal sign-off on the 15-row physical numeric precision matrix in Section C.
[ ] 5.  DEC-05 Approved Accounting Policies: Formal sign-off from Corporate Accounting / Treasury on all four unresolved policies:
        a) Financial line-extension rounding strategy (Section C.3 Policy 1).
        b) Zero-balance stock record retention versus archival/pruning (Section C.3 Policy 2).
        c) Multi-currency conversion precision and rounding (Section C.3 Policy 3).
        d) Tax and customs-duty calculation and rounding (Section C.3 Policy 4).
[ ] 6.  Authoritative Register Updated: Approved decisions, timestamps, and approver identities formally recorded in docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md.
```

> [!CAUTION]
> **Completing this worksheet does not itself constitute authorization to begin Milestone 0.4 implementation.**  
> Formal sign-off must be recorded in Section F and updated in the authoritative decision register before executable DDL or migration scripts are written.

---

## Section H — Architectural Invariants to Preserve

To ensure absolute design integrity across the transition from logical modeling to physical implementation, engineering and business stakeholders affirm that the following seven architectural invariants remain strictly preserved:

1. **Normalized 43-Entity Scope:** The approved logical relational data model ([`docs/architecture/LOGICAL_DATA_MODEL.md`](LOGICAL_DATA_MODEL.md) v0.3.3) comprising 43 entities across 8 domains remains unchanged. No entities, tables, or relations shall be added or deleted without a formal logical model revision.
2. **Three Documented Architectural Gaps Carried Forward:** The three disclosed design gaps remain open and preserved:
   - _Gap 1:_ Post-birth QC reassessment and periodic vault audits (intake birth certificate `inventory_items.quality_check_item_id` remains immutable).
   - _Gap 2:_ Inter-store transfer orders, multi-item transit manifests, and transit loss disputes (transfers modeled via book-end ledger movements).
   - _Gap 3:_ Supervisor damage-waiver schema representation (`reason_code = 'DAMAGE_WAIVER'` in `quality_decisions`; application-level RBAC enforcement).
3. **`INV-15` Same-Shipment Validation:** Cross-parent shipment validation (`quality_checks.shipment_id == shipment_items.shipment_id`) remains enforced via Express 5 transactional application logic and an optional PostgreSQL database trigger. Normalized boundaries are retained; no invalid foreign keys referencing undeclared columns shall be introduced.
4. **PostgreSQL Three-Valued Logic (3VL) Safeguards:** All boolean check constraints enforcing status-dependent outcomes must continue to use explicit SQL truth predicates (`IS TRUE` / `IS FALSE`), preventing CHECK constraints from accepting `UNKNOWN` (NULL) outcomes.
5. **Atomic Transactional Outbox Dispatch:** Rows in `outbox_events` must be inserted within the identical database transaction that commits the core business mutation, guaranteeing atomicity without distributed two-phase commit (2PC).
6. **Zero Distributed Two-Phase Commit:** The platform retains its modular monolith architecture backed by a single PostgreSQL database; no microservices or distributed 2PC protocols shall be introduced.
7. **No Premature Implementation:** No physical DDL, database migration scripts, entity code, or Express application handlers shall be authored until the Product Owner executes the sign-off protocol. (ORM selection remains provisional pending technical validation per `TECH-DEC-01` / `D-12`).

---

_End of Product Owner Decision Worksheet (v1.0)._
