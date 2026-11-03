# Jewellery ERP Platform — Phase 0.2 Domain Model & Workflow Proposal

**Version:** 0.2  
**Status:** Proposed design for review; neutral project naming applied  
**Backend direction:** Express 5 + TypeScript  
**Database direction:** PostgreSQL  
**Purpose:** Define the core business concepts and state transitions before creating database entities or API endpoints.

> This document is a design proposal based on the supplied neutralized project overview. It is not a claim about the behavior of an existing implementation. Items marked **DECISION REQUIRED** must be resolved before the related database schema or production workflow is finalized.

> **Project naming:** The neutral project name is **Jewellery ERP Platform** and the repository slug is `jewellery-erp-platform`. This is a descriptive working name, not a statement that a commercial trademark or domain is available.

---

## 1. Domain Modeling Principles

1. Model business concepts and lifecycle rules, not just frontend screens.
2. Separate product definitions, physical inventory items, RFID tags, and technical RFID jobs.
3. Treat PostgreSQL as the durable source of truth for business records.
4. Make organization/store scope explicit on relevant records and enforce it in backend authorization and data access.
5. Preserve a history of material business state changes; do not rely only on a mutable `status` field.
6. Use explicit state transitions. A generic update endpoint must not allow arbitrary status changes.
7. Use database constraints as well as service-level checks for uniqueness and referential integrity.
8. Design operations involving multiple related writes to be atomic when required by the business rule.
9. Distinguish confirmed requirements from assumptions and open questions.
10. Avoid designing accounting, sales, buyback, or pricing formulas in detail until their business rules are specified.

## 2. Proposed Core Contexts

### 2.1 Organization and access control

Responsible for organizations, stores, user membership, roles, permissions, and policy checks.

Candidate records:

- `Organization`
- `Store`
- `User`
- `OrganizationMembership`
- `StoreMembership` or a single membership model with explicit scopes
- `Role`
- `Permission`
- `RolePermission`
- `MembershipRole` / role assignment

**Design rule:** Identity does not automatically grant access to a store. Requests must resolve the authenticated user, active membership, selected store when relevant, required permission, and resource scope.

**DECISION REQUIRED:** Determine whether the production target is one organization with multiple branches, multiple tenant organizations, or both. The proposed model supports both conceptually, but actual data-sharing and administration rules must be defined before schema implementation.

### 2.2 Master data

Responsible for definitions reused by procurement and inventory.

Candidate records:

- `Category`
- `Subcategory`
- `Product`
- `Material`
- `Purity`
- `Gemstone`
- Product-to-gemstone/material associations as required by confirmed business rules

A `Product` is a reusable product definition. It is not a receipt, physical stock piece, RFID tag, or stock movement.

Master records may be shared at organization level or scoped to a store. That scope must be explicit; do not infer it from the frontend.

### 2.3 Supplier and procurement

Candidate records:

- `Supplier`
- `GoodsReceiptNote` (GRN)
- `Shipment`
- `IntakeRecord` or receipt line/item
- `StaffAssignment` where assignment history is operationally required
- Document metadata linked to a supplier, GRN, shipment, or item

Conceptual relationships:

```text
Organization / Store
    └── GRN
         ├── Supplier
         ├── Shipment(s)
         │    └── Intake / received item records
         └── Receiving and assignment history
```

The exact cardinalities must be confirmed. In particular, determine whether a GRN can contain multiple shipments, whether shipments can contain multiple received items, and whether one physical item can be split across receipt records.

### 2.4 Quality control

Candidate records:

- `QualityCheck`
- `QualityCheckItem` or item-level inspection record
- `WeightMeasurement`
- `ItemGemstone`
- `QualityDecision` / decision history

QC should preserve received/declared values and measured/verified values as distinct facts where required. A value should not be overwritten merely because a later measurement was made.

Potential data captured per inspected item includes gross weight, net weight, material, purity, specimen/origin, gemstone properties, measured-at/by metadata, inspection outcome, and notes/attachments.

**DECISION REQUIRED:** Define which fields are mandatory for each product/material type, accepted units and precision, whether a QC item may be reinspected, and how rejected items can be corrected and resubmitted.

### 2.5 Physical inventory and identity

Candidate records:

- `InventoryItem` — proposed record representing one individually traceable physical jewellery piece
- `ItemIdentifier` or explicit item-code field for the item's business identifier
- `InventoryMovement`
- `InventoryStatusHistory`
- `StockApproval`
- `InventoryAuditEvent`

**Provisional MVP assumption:** each physical jewellery piece being tracked through QC, RFID, storage, and approval has an individual durable `InventoryItem` identity. This makes asset traceability explicit.

**DECISION REQUIRED — CRITICAL:** Confirm whether the business uses a unique item/SKU for each physical piece or whether a SKU can represent multiple quantity-based units. If a SKU is a product/stock-keeping code shared by multiple pieces, model the product/SKU separately from the serialized physical inventory item. Do not create final uniqueness constraints until this is decided.

An inventory item must not be considered sellable merely because its record exists. Eligibility should derive from the allowed business state and required QC, identification, storage, and approval conditions.

### 2.6 RFID identity and job execution

Keep these separate:

- Physical inventory item identity.
- RFID tag identity and assignment history.
- RFID job request and processing state.
- Device/local-client outcome.

Candidate records:

- `RFIDTag`
- `RFIDTagAssignment` (history of assignment, replacement, and retirement)
- `RFIDJob`
- `RFIDJobItem` when jobs process multiple inventory items
- Job attempt/failure metadata where operationally useful

A damaged tag should be replaceable without creating a new identity for the physical jewellery piece. A completed queue job is not proof that an inventory item is approved for sale. An accepted API request is not proof that a printer physically printed a tag.

**DECISION REQUIRED:** Define tag uniqueness rules, whether tags can be reused after retirement, the relationship between job and item cardinalities, the local print-client contract, and the operator recovery process for ambiguous print outcomes.

### 2.7 Storage and stock approval

Candidate records:

- `Vault`
- `Locker`
- `Compartment`
- `InventoryLocationAssignment` or current location on the item plus append-only movement history
- `InventoryMovement`
- `StockApproval`

Proposed location hierarchy:

```text
Store
  └── Vault
       └── Locker
            └── Compartment
```

Every location must belong to the appropriate store scope. A movement should record item, source location, destination location, actor, timestamp, reason/reference, and outcome as required by the policy.

**DECISION REQUIRED:** Determine whether an item can be in a temporary unassigned location, whether a compartment has capacity constraints, and which roles may move, approve, or release stock.

### 2.8 Audit and document metadata

Candidate records:

- `AuditEvent`
- `FileObject`
- `FileAssociation` if one object may be linked to multiple business records

Audit entries for material operations should answer: who performed the operation, when it happened, under which organization/store context, what resource was affected, what operation was attempted, the outcome, and an appropriate reason/reference.

Audit events must not capture access tokens, passwords, secrets, or unnecessary sensitive content. Uploaded binary data should live in object storage; PostgreSQL stores the metadata and business relationship.

**DECISION REQUIRED:** Define retention, access, tamper-resistance, and privacy requirements for audit events and uploaded documents.

---

## 3. Proposed Relationship Overview

This is a conceptual model, not a finalized ERD or TypeORM schema.

```text
Organization ──< Store
Organization ──< User Membership >── User
Membership ──< Role Assignment >── Role ──< RolePermission >── Permission

Category ──< Subcategory ──< Product
Product ──> Material / Purity / Gemstone associations (rules TBD)

Supplier ──< GRN ──< Shipment ──< Received Item / Intake Record
                                      │
                                      v
                              QC Item / Measurements
                                      │
                                      v
                               Inventory Item
                                 │      │
                                 │      └──< RFID Assignment History >── RFID Tag
                                 │
                                 ├──< Inventory Movement >── Store Location
                                 ├──< Stock Approval History
                                 └──< Audit Events

RFID Job ──< RFID Job Items (if a job contains multiple items)
File Object ──< File Associations (as required)
```

Do not infer that every arrow should become a direct foreign key. Some associations may be represented through domain records or immutable history records after the detailed schema review.

---

## 4. Proposed State Models

These states are starting proposals based on the source overview; allowed transitions and actor permissions still need business approval.

### 4.1 GRN

```text
Draft ──> In Progress ──> Closed
```

Questions to resolve:

- Can a closed GRN be reopened, amended, or reversed?
- Can closure occur while shipments or QC items remain incomplete?
- How are corrections represented without erasing history?

### 4.2 Quality control

```text
Draft ──> Pending ──> Approved
                  └─> Rejected

Rejected ──> Reinspection / resubmission (policy TBD)
Approved ──> Published or inventory handoff (exact semantics TBD)
```

Do not assume that `Approved` and `Published` mean the same thing. Define the business meaning and permitted transitions for each.

### 4.3 Inventory

Avoid one oversized status enum if several independent dimensions exist. The domain may need to distinguish:

- **Quality state:** pending, approved, rejected, etc.
- **Availability state:** unavailable, available, reserved, sold, etc. (commercial states require later definition).
- **Approval state:** pending, approved, rejected, or not required.
- **Custody/location state:** in a defined storage location, in transit, or unassigned, as applicable.

A state combination must be validated against explicit business rules. It must not be possible to mark an item available while required QC or stock approval is incomplete.

### 4.4 RFID job

```text
Created -> Queued -> Processing -> Completed
                             ├──> Failed / Retryable
                             └──> Cancelled (only where safe and supported)
```

Distinguish terminal failure from retryable failure and from an unknown physical outcome. The job state model must not pretend that a timeout proves the printer did not print.

---

## 5. Initial API Use Cases (Not Final Routes)

Define APIs around operations and permissions rather than exposing arbitrary entity updates.

Examples:

- Create and inspect a GRN.
- Add a shipment/intake record to a GRN.
- Record measured QC values.
- Submit an item for QC review.
- Approve or reject a QC item with a reason where required.
- Create or resolve the physical inventory identity.
- Request an RFID job and retrieve its status.
- Assign an item to a storage location.
- Request and record stock approval.
- Search items by the approved item/SKU/RFID identifiers.
- Inspect an item's traceability history.

The exact HTTP paths, request schemas, response shapes, pagination model, and idempotency requirements should be specified after the use cases and permission matrix are approved.

---

## 6. Transaction and Asynchronous Processing Rules

1. PostgreSQL owns durable business state; Redis/BullMQ owns queue mechanics.
2. Do not assume a PostgreSQL transaction can atomically commit a Redis job.
3. For critical database changes that must trigger asynchronous processing, evaluate a transactional outbox or another recoverable handoff.
4. Use database transactions for business operations that require all-or-nothing changes across related records.
5. Protect incompatible concurrent state transitions through appropriate constraints, locking, optimistic version checks, or another justified strategy.
6. Queue consumers must be idempotent for database effects where feasible.
7. Physical side effects such as printing require separate handling for ambiguous outcomes; database idempotency alone cannot guarantee exactly-once physical execution.
8. Do not hold a database transaction open while waiting for a slow printer or other external device.
9. Record failures in a way operators can investigate and recover without silently corrupting the business state.

---

## 7. Critical Invariants to Turn Into Tests

- A caller cannot access another organization/store's resources just by changing an ID.
- A user without the required permission cannot perform a protected operation, even if they know the endpoint.
- An authorized user still cannot perform an invalid business-state transition.
- A GRN cannot be closed if the approved closure rules' prerequisites are unsatisfied.
- Required QC approval precedes stock availability.
- Tag replacement preserves the physical item's identity and historical tag assignment.
- A tag cannot be simultaneously assigned to incompatible active items if the uniqueness policy forbids it.
- An item cannot occupy two incompatible physical locations at the same time.
- A concurrent pair of incompatible state transitions cannot both succeed.
- Replayed queue jobs cannot duplicate protected business state changes.
- A failed operation cannot leave half of a required atomic database workflow committed.
- Every material inventory movement has sufficient actor, time, scope, and reason/reference metadata.
- List APIs have bounded pagination and server-side filtering.
- Documents cannot be retrieved by guessing an object key.

These are proposed target guarantees. Test details depend on the approved business rules.

---

## 8. Decisions to Resolve Before Finalizing the ERD

Priority 0 — blocks core data design:

1. **Physical item versus SKU:** Is each physical piece serialized, or does SKU represent a group of interchangeable units?
2. **Organization and store ownership:** Is the target one organization with branches, multi-tenant SaaS, or both? Which data is organization-shared versus store-scoped?
3. **GRN/shipment cardinality:** Can one GRN contain multiple shipments and multiple items? Can an item/line be partially received?
4. **QC rules:** Required fields, tolerances, reinspection, reject/rework flow, and approval/publishing semantics.
5. **Inventory availability:** Exact prerequisites for becoming sellable, and the relationship among QC, RFID, storage, and stock approval.
6. **RFID semantics:** Tag identity/reuse/replacement rules and local printer/client protocol.

Priority 1 — must be resolved before the related module is implemented:

7. Weight units, precision, conversion, and accepted measurement tolerances.
8. Currency model, monetary precision, pricing formulas, rounding, tax jurisdiction, and rate history.
9. SSO provider and session/token lifecycle.
10. Store membership and global administrator permissions.
11. File retention, access, and attachment lifecycle.
12. Audit retention and tamper-resistance requirements.
13. Data import/migration needs and any external system integration contracts.

Do not silently replace these unresolved decisions with assumptions in source code.

---

## 9. Recommended Next Deliverable

After reviewing this conceptual domain model, create a **Core ERD and Data Dictionary v0.1** containing:

- Entities and fields.
- Primary and foreign keys.
- Relationship cardinalities.
- Scope/ownership columns.
- Unique and check constraints.
- Decimal precision and units decisions.
- Soft delete versus archival policy.
- Audit history relationships.
- Migration sequencing.
- A traceability query that follows one physical item from GRN through QC, RFID, storage, and approval.

The ERD must not be finalized until the Priority 0 decisions above are documented.

## 10. Definition of Done for Phase 0.2

Phase 0.2 is complete when:

- Core business concepts are named consistently.
- Product, physical item/SKU, RFID tag, RFID job, and inventory state are not conflated.
- Proposed GRN, QC, inventory, and RFID state models are reviewed.
- Organization/store scope and access boundaries are documented.
- Priority 0 business decisions are resolved or explicitly accepted as provisional assumptions.
- The model is sufficiently stable to create a reviewable ERD without guessing about critical cardinalities or uniqueness rules.

No application code or database migrations should be generated merely to satisfy this phase.
