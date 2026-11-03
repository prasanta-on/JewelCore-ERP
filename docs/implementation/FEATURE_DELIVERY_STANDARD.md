# Jewellery ERP Platform — Feature Delivery Standard Operating Procedure (SOP)

**Document Version:** 1.1  
**Status:** Engineering Execution Baseline — Milestone 0.3.2 Deliverable  
**Date:** 2026-11-03  
**Authors:** Principal Software Architect, Senior Backend Engineer, Senior Frontend Engineer, Database Architect, DevOps Engineer, Security Engineer, QA Engineer  
**Project:** Jewellery ERP Platform (`jewellery-erp-platform`)  
**Repository:** `/home/prasanta/Documents/projects/JewelCore-ERP`

**Authoritative Baseline References:**

- [`docs/implementation/FEATURE_IMPLEMENTATION_MASTER_PLAN.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_IMPLEMENTATION_MASTER_PLAN.md) (v1.1)
- [`docs/implementation/FEATURE_DEPENDENCY_MAP.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_DEPENDENCY_MAP.md) (v1.1)
- [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) (v0.3.3)
- [`docs/architecture/DOMAIN_MODEL_REVIEW.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/DOMAIN_MODEL_REVIEW.md) (v1.6)
- [`docs/JEWELLERY_ERP_PHASE_0_BASELINE_v0.2.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/JEWELLERY_ERP_PHASE_0_BASELINE_v0.2.md) (v0.2)

> [!IMPORTANT]
> **Open Decision D-12 Governance Note (ORM / Database Access Layer):**  
> The Phase 0 Baseline identifies TypeORM as provisional with Open Decision D-12: _"TypeORM or alternative ORM? Retain TypeORM provisionally; verify developer experience, query needs, transaction handling, and migration workflow."_  
> The Domain Model Review (v1.6, Section 4.2) identifies major operational friction with TypeORM in jewellery manufacturing: Active Record coupling, implicit entity manager state leaks across concurrent requests, cascading mutation risks, and catastrophic schema drift if `synchronize: true` is triggered in multi-store environments. It recommends modern, lightweight, type-safe query builders such as **Kysely** or parameterized `pg` (node-postgres).  
> **Status:** The specification of Kysely / parameterized `pg` in this Delivery Standard represents an engineering recommendation based on rigorous technical evaluation. However, because D-12 remains formally an Open Decision in the project governance baseline, this selection is **provisional** until an authorized technical decision record formally closes D-12.
>
> **Technical Evaluation Matrix (TypeORM vs. Kysely / node-postgres):**
>
> | Evaluation Criterion          | TypeORM (Provisional Baseline)                                                            | Kysely / node-postgres (Recommended Execution)                                               |
> | ----------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
> | **Migration Workflow**        | CLI migrations or `synchronize: true` (high risk in multi-store DBs)                      | Deterministic, forward/rollback raw SQL migration files (`packages/database/migrations/`)    |
> | **Transaction Control**       | Implicit `EntityManager` or explicit `QueryRunner`; prone to accidental unmanaged queries | Explicit `pg.PoolClient` managed via `withTransaction` wrapper; zero implicit connections    |
> | **Query Composition**         | Object-relational QueryBuilder; awkward with CTEs and composite keys                      | Strongly typed SQL query builder; native support for CTEs, composite FKs, and Postgres JSONB |
> | **Type Safety**               | Class decorator reflection; runtime metadata discrepancies                                | Zero-runtime compile-time TypeScript type inference directly from DB schema interfaces       |
> | **Raw SQL Flexibility**       | Supported but bypasses entity lifecycle and hydration                                     | First-class citizen; parameterized SQL without ORM impedance mismatch                        |
> | **Concurrency & Row Locking** | Limited `pessimistic_write` lock helpers; risk of deadlock on multi-row mutations         | Explicit `SELECT ... FOR UPDATE` with sorted UUIDs to strictly eliminate deadlock (`40P01`)  |
> | **Developer Experience**      | High cognitive overhead from decorators, relation cascades, and caching quirks            | Lean, predictable SQL mental model; transparent query execution with zero hidden queries     |

---

## 1. Principles of Vertical Slice Delivery

To prevent integration failures, hidden regressions, and unvalidated architecture, every feature in the Jewellery ERP Platform must be implemented, tested, and delivered as a **complete vertical slice**.

A vertical slice cuts through all architectural layers of the modular monolith:

```text
[ Next.js App Router Page ]
          v
[ React Hook Form + Zod Client Validation ]
          v
[ Express 5 REST Route + Auth Middleware ]
          v
[ Zod Request Schema Validation ]
          v
[ Application Service + Invariant Enforcement ]
          v
[ Repository / Unit of Work Transaction ]
          v
[ PostgreSQL 18 Table + 3VL Constraints ]
          v
[ Outbox Event + Audit Trail Insertion ]
```

Horizontal batch development (e.g. creating all 43 database tables first, or authoring all API endpoints before frontend integration) is **strictly prohibited**.

---

## 2. The Six Mandatory Delivery Stages

Every feature must progress sequentially through the following six stages. Transitioning to a subsequent stage is permitted only when all deliverables of the current stage are verified.

```mermaid
flowchart LR
    S1["Stage 1:<br/>Requirement Analysis"] --> S2["Stage 2:<br/>Architecture & Data Design"]
    S2 --> S3["Stage 3:<br/>Backend Implementation"]
    S3 --> S4["Stage 4:<br/>Frontend Implementation"]
    S4 --> S5["Stage 5:<br/>Testing & QA"]
    S5 --> S6["Stage 6:<br/>Completion & Review"]

    classDef stage fill:#F0FDF4,stroke:#16A34A,stroke-width:2px;
    class S1,S2,S3,S4,S5,S6 stage;
```

---

### Stage 1 — Requirement Analysis

Before writing code or database schemas, the feature engineer must author the feature requirements specification:

1. **Business Objective:** Clearly articulate why the feature exists and what jewellery operational or financial problem it resolves.
2. **User Roles & Authorization (RBAC + Contextual ABAC):** Identify all human personas (`Store Administrator`, `Store Manager`, `QC Technician`, `Inventory Controller`, `Accountant`) and the exact granular permissions (`inventory:read`, `qc:approve`, `vault:transfer`, `pricing:edit`) required to access each action. Where business operations require dynamic, attribute-driven access controls beyond static role permissions, specify the applicable ABAC rule boundaries:
   - _Organization & Store Boundaries:_ Enforce `organization_id` tenancy and `x-store-id` branch custody isolation (`INV-11`).
   - _Employee & Organizational Hierarchy:_ Enforce supervisory elevation requirements (e.g. supervisor damage waivers per Architectural Gap 3).
   - _Resource Ownership & Custody:_ Validate that users modifying receiving packages or inspection sessions are assigned technicians (`INV-19`).
   - _Deny-by-Default Architecture:_ All endpoints must reject requests lacking authenticated identities (401), missing role permissions (403), or operating outside active store assignments (403).
   - _Authorization Audit Trail:_ Every permission check and policy rejection must be logged with structured metadata (user, role, target resource, required permission, timestamp) for compliance analysis.
3. **Functional Requirements:** Enumerate positive capabilities, user inputs, outputs, state transitions, and background triggers.
4. **Non-Functional Requirements:** Define SLA limits. The following illustrative performance targets are proposed pending formal stakeholder approval: analytical scale reading ingestion $< 100\text{ms}$, inventory scan throughput $> 50\text{ items/sec}$, p99 API response time $< 250\text{ms}$.
5. **Business Invariants & Metrology:** Identify which of the 19 platform invariants (`INV-01` through `INV-19`) govern this feature, and specify exact metrological formulas (e.g., $\text{Net} = \text{Gross} - \text{Tare} - \text{Stones}$).
6. **Acceptance Criteria:** Formulate unambiguous Gherkin scenarios (`Given ... When ... Then ...`) covering happy paths, validation failures, unauthorized requests, and concurrency edge cases.
7. **Prerequisite & Gate Dependencies:** Verify that all upstream feature prerequisites and governance decision gates (`BIZ-Q01`, `BIZ-Q02`, `BIZ-Q03`, `DEC-05`) have been formally satisfied.

---

### Stage 2 — Architecture and Data Design

Define the structural and persistence blueprint for the feature:

1. **Domain Entity Alignment:** Map the feature directly to the approved 43 entities in [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) v0.3.3. Do not invent undeclared entities or alter normalized relationships.
2. **Physical Column Specifications:** Specify exact PostgreSQL 18 column types (native `uuid` PKs generated via UUIDv7, `NUMERIC(p, s)` scales per approved precision matrix, immutable `created_at`, mutable `updated_at`, integer `version` for OCC).
3. **Declarative Constraints & 3VL Safeguards:** Formulate PostgreSQL row-local `CHECK` constraints enforcing physical ranges and SQL Three-Valued Logic (`3VL`). Status-dependent boolean checks must use explicit SQL truth predicates (`IS TRUE` / `IS FALSE`), never raw equality comparisons against `TRUE`.
4. **Indexing Strategy:** Design B-Tree indexes matching high-frequency query patterns (`store_id`, `product_sku_id`, `status`). Define partial unique indexes where conditional uniqueness is required (e.g., `UNIQUE(inventory_item_id) WHERE status = 'ACTIVE'`).
5. **Transaction Boundaries & Locking Protocols:** Define the database transaction boundary (`withTransaction`). Where mutable shared aggregates are modified (such as `inventory_items` state transitions), specify explicit row-level locking:
   ```sql
   SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE;
   ```
   Multi-item locking operations must sort UUIDs in ascending order to prevent PostgreSQL deadlocks (`40P01`).
6. **Audit & Outbox Contracts:** Design the exact JSON payloads for `audit_events` (capturing previous vs new state snapshots) and `outbox_events` (capturing domain event type and metadata for asynchronous dispatch).

---

### Stage 3 — Backend Implementation

Implement the backend service slice in `apps/api`:

```text
apps/api/src/modules/<domain>/
  ├── <feature>.routes.ts       # Express 5 Router with path & verb definitions
  ├── <feature>.controller.ts   # HTTP Controller (Zod parsing, service call, RFC 7807)
  ├── <feature>.service.ts      # Pure business logic & invariant enforcement
  ├── <feature>.repository.ts   # Database queries & SQL transaction runner
  ├── <feature>.schemas.ts      # Zod validation schemas (Params, Query, Body, Response)
  └── <feature>.types.ts        # TypeScript domain interfaces & DTOs
```

#### Detailed Layer Responsibilities:

1. **Routes (`*.routes.ts`):**
   - Mount under `/api/v1/<domain>/...`.
   - Apply global and feature middleware: `authenticateJwt`, `requireStoreContext`, `requirePermission('<perm>')`, `validateRequest(schemas)`.
2. **Schemas (`*.schemas.ts`):**
   - Define strict Zod schemas for `params`, `query`, and `body`.
   - Strip unknown attributes (`z.object({...}).strict()`).
   - Reusable validation primitives (UUIDv7 validator, decimal string validator, positive quantity validator).
3. **Controller (`*.controller.ts`):**
   - Pure HTTP translation: extract typed inputs from `req.validatedData`.
   - Invoke application service.
   - Return semantic HTTP status codes (`200 OK`, `201 Created`, `204 No Content`).
   - Delegate all unexpected errors to the centralized Express 5 error handler.
4. **Application Service (`*.service.ts`):**
   - Contains 100% of the operational business logic.
   - Enforces domain invariants (`INV-01` through `INV-19`).
   - Manages unit-of-work transactions via `withTransaction`.
   - Emits audit events and inserts transactional outbox records atomically within the same database transaction.
5. **Repository (`*.repository.ts`):**
   - Manages raw SQL execution using strongly typed query builders (`Kysely` or parameterized `pg`).
   - Accepts transaction clients (`tx`) to participate in active outer transactions.
   - Converts relational row results to strongly typed domain entities.
6. **Centralized Error Handling (RFC 7807):**
   - Throw specialized `DomainError` instances (`NotFoundError`, `ValidationError`, `ConflictError`, `InvariantViolationError`, `UnauthorizedError`, `ForbiddenError`).
   - Global error middleware formats responses according to RFC 7807 Problem Details:
     ```json
     {
       "type": "https://api.jewellery-erp.com/errors/invariant-violation",
       "title": "Business Invariant Violation",
       "status": 422,
       "detail": "Cannot mark piece AVAILABLE_FOR_SALE without active RFID tag (INV-01)",
       "instance": "/api/v1/inventory/items/018f3a5b-7c2a-7b3e-891d-234e56789abc/approve",
       "code": "ERR_INV_01_TAG_REQUIRED",
       "timestamp": "2026-11-03T12:00:00.000Z",
       "requestId": "req_018f3a5b_xyz"
     }
     ```

---

### Stage 4 — Frontend Implementation

Implement the user interface slice in `apps/web`:

```text
apps/web/src/app/(dashboard)/<domain>/<feature>/
  ├── page.tsx                  # Server component / Main route page
  ├── layout.tsx                # Sub-navigation / Domain shell
  ├── loading.tsx               # Next.js streaming loading skeleton
  ├── error.tsx                 # Error boundary with recovery action
  ├── _components/
  │   ├── <feature>-form.tsx    # React Hook Form + Zod mutation form
  │   ├── <feature>-table.tsx   # TanStack Table data visualization
  │   └── <feature>-dialog.tsx  # Confirmation modal dialogs
  └── _hooks/
      ├── use-<feature>-query.ts    # TanStack Query data fetcher
      └── use-<feature>-mutation.ts # TanStack Mutation with cache invalidation
```

#### Detailed Frontend Standards:

1. **Next.js 15 App Router:**
   - Server-side data pre-fetching where SEO or initial render latency is critical.
   - Client components (`"use client"`) isolated to interactive elements (forms, filters, modals).
2. **Form Management & Client Validation:**
   - Use `react-hook-form` with `@hookform/resolvers/zod`.
   - Import identical Zod validation schemas shared with the backend in `packages/shared`.
   - Display inline field errors with clear guidance; prevent double submissions via disabled submit buttons.
3. **Four UI States (Mandatory on Every View):**
   - _State 1: Data / Idle:_ Full data presented in responsive tables or structured cards.
   - _State 2: Loading:_ Skeleton loaders mimicking the layout of the loaded table/form (never use a single generic spinning wheel).
   - _State 3: Error:_ User-friendly error card showing the problem detail, correlation request ID, and a "Retry" button.
   - _State 4: Empty:_ Informative empty state explaining why no records exist and providing a direct call-to-action button (e.g. "Create New GRN").
4. **Accessibility (WCAG 2.1 AA Compliance):**
   - Full keyboard accessibility (Tab, Enter, Escape).
   - ARIA attributes on modals (`aria-modal`, `aria-labelledby`) and alerts (`role="alert"`).
   - Minimum 4.5:1 color contrast ratio across all text and interactive badges.

---

### Stage 5 — Testing & Quality Assurance

Quality assurance is an automated, continuous gate. Features without passing automated test suites will be rejected at Stage 6 review.

#### Testing Pyramid Requirements:

```text
          / \
         /   \       End-to-End Cypress / Playwright Tests (Critical Path Workflows)
        /     \
       /-------\     Supertest API Integration Tests (Auth, RBAC, Validation, HTTP Statuses)
      /         \
     /-----------\   PostgreSQL Database Integration Tests (Transactions, Locks, 3VL Constraints)
    /             \
   /---------------\ Vitest Unit Tests (Pure Domain Services, Metrology, Net Weight Calculations)
```

1. **Unit Tests (Vitest):**
   - Target: Pure services, calculations, metrological balance formulas, state machine transitions.
   - Coverage threshold: Minimum **85% statement coverage** on domain services (proposed engineering target pending stakeholder approval).
   - Mock all external I/O, repositories, and BullMQ queues.
2. **API Integration Tests (Supertest + Vitest):**
   - Execute against the full Express router and middleware pipeline.
   - Test every endpoint across four standard test personas:
     - _Unauthenticated:_ Expect `401 Unauthorized`.
     - _Unauthorized Role:_ Expect `403 Forbidden`.
     - _Wrong Store Context:_ Expect `403 Forbidden` (cross-store isolation).
     - _Authorized Persona:_ Expect `200/201` with valid RFC 7807 response payloads.
3. **Database Integration Tests (Real PostgreSQL 18):**
   - Execute against a local PostgreSQL testcontainer or test database.
   - Run tests inside isolated transactions (`BEGIN ... ROLLBACK`).
   - Explicitly verify table constraints:
     - Negative gross/net weight insertion fails.
     - `net_weight_grams > gross_weight_grams` fails.
     - Non-null net weight with NULL gross weight fails (3VL test).
     - Duplicate active RFID tag assignments fail unique partial index.
     - `inventory_items` birth creation fails if QC item is not `APPROVED`.
4. **Concurrency & Deadlock Tests:**
   - Execute parallel asynchronous requests mutating the same `inventory_items` aggregate.
   - Verify that OCC version increments prevent lost updates (`409 Conflict`).
   - Verify that row-level locks (`SELECT FOR UPDATE`) preserve sequential state integrity without database deadlocks.

---

### Stage 6 — Feature Completion & Review

A feature is marked `DONE` and merged into the platform baseline only after passing the formal **Definition of Done (DoD)**:

```markdown
### Definition of Done (DoD) Checklist

- [ ] 1. Acceptance Criteria Verified: 100% of Gherkin scenarios pass automated verification.
- [ ] 2. Security Audit Passed: - Zod validation rejects malformed/injected input. - Authentication & RBAC permissions enforced. - Multi-store isolation verified (cannot read/write another store's records). - Zero hardcoded secrets or credentials.
- [ ] 3. Database Integrity Verified: - PostgreSQL table constraints and indexes verified. - All state mutations execute within atomic transactions. - 3VL boolean predicates verified (no SQL NULL bypass).
- [ ] 4. Outbox & Audit Trail Verified: - State mutation atomically commits an audit_events record. - Outbox events dispatched reliably to BullMQ without 2PC.
- [ ] 5. Frontend Standards Verified: - Next.js App Router route functional and responsive. - All 4 UI states (Idle, Loading, Error, Empty) implemented. - WCAG 2.1 AA accessibility checks pass.
- [ ] 6. Automated Test Suites Passing: - Unit test coverage >= 85% (proposed engineering target). - Supertest API integration suite green. - Real PostgreSQL constraint tests green.
- [ ] 7. Documentation & Limitations Recorded: - API OpenAPI/Swagger annotations updated. - Known operational limitations recorded in implementation register.
```

---

## 3. Production Engineering Code Standards

To guarantee long-term maintainability across the engineering team, all code must adhere to these strict engineering standards:

### 3.1 TypeScript Strict Mode Rules

- `noImplicitAny: true`, `strictNullChecks: true`, `strict: true`.
- Usage of the `any` keyword is **strictly banned**. Use `unknown` with Zod type guards where dynamic input is handled.
- Export strongly typed DTOs derived directly from Zod schemas:
  ```typescript
  export type CreateGoodsReceiptNoteInput = z.infer<
    typeof CreateGoodsReceiptNoteSchema
  >;
  ```

### 3.2 Explicit Transaction Management Protocol

Database mutations that span multiple tables or require invariant verification must use the explicit `withTransaction` pattern:

```typescript
export async function withTransaction<T>(
  pool: pg.Pool,
  callback: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
```

### 3.3 Atomic Outbox Dispatch Pattern

Under invariant `INV-10`, external background jobs (e.g. RFID printing, external webhook dispatch) must never be called synchronously inside an HTTP request or database transaction. Instead, an outbox row is inserted inside the same database transaction:

```typescript
// Inside active transaction
await inventoryRepo.insertInventoryItem(tx, newItem);
await auditRepo.insertAuditEvent(tx, auditEvent);
await outboxRepo.insertOutboxEvent(tx, {
  eventType: "INVENTORY_PIECE_CREATED",
  payload: { inventoryItemId: newItem.id, serialNumber: newItem.serialNumber },
  status: "PENDING",
});
```

A dedicated background outbox worker polls `outbox_events` and enqueues jobs into BullMQ with at-least-once delivery guarantees. Consumers must implement idempotency checks on event IDs.

---

## 4. Feature-to-Authorization Coverage Matrix (RBAC & Contextual ABAC)

To ensure consistent, secure authorization across the modular monolith, access control combines Role-Based Access Control (**RBAC**) with Contextual Attribute-Based Access Control (**ABAC**). Where a feature operates on tenant-scoped, store-isolated, custody-bound, or supervisory-restricted resources, the applicable attributes are explicitly evaluated. Generic 403 checks do not constitute ABAC coverage; each policy evaluates domain-specific contextual boundaries.

| Feature ID          | Feature Title              | Required RBAC Permission            | Org / Store Boundary (ABAC)                        | Resource Custody / Ownership (ABAC)              | Employee Assignment / Hierarchy (ABAC) | Positive Authorization Case                                             | Negative Authorization Case                                                          |
| ------------------- | -------------------------- | ----------------------------------- | -------------------------------------------------- | ------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **`FEAT-FOUND-01`** | Monorepo Scaffolding       | None (Build Infra)                  | N/A (Dev environment)                              | N/A                                              | N/A                                    | Developer executes `pnpm build` in local/CI environment                 | Build failure on TypeScript strict violation                                         |
| **`FEAT-FOUND-02`** | Database & Transactions    | None (Engine)                       | DB connection pool scope                           | Connection transaction client (`tx`)             | N/A                                    | Application service executes within `withTransaction` wrapper           | Connection failure triggers automated transaction rollback                           |
| **`FEAT-FOUND-03`** | Centralized Logging        | None (Middleware)                   | Global API gateway                                 | Request correlation ID (`x-request-id`)          | N/A                                    | Incoming request logs structured JSON with correlation ID               | Unhandled exception mapped to RFC 7807 Problem Details                               |
| **`FEAT-FOUND-04`** | Transactional Outbox       | `system:worker`                     | Process-level worker identity                      | Event record idempotency key (`id`)              | N/A                                    | Polling worker dispatches pending outbox event to BullMQ queue          | Duplicate event ID rejected by consumer idempotency guard                            |
| **`FEAT-IAM-01`**   | Organizations & Stores     | `iam:org:write`, `iam:store:write`  | Root `organization_id` boundary                    | Owning tenant root entity                        | Executive / Org Administrator          | Authorized executive provisions new showroom store branch               | Operational store associate denied store creation (403)                              |
| **`FEAT-IAM-02`**   | User Accounts & Auth       | `iam:user:read`, `iam:user:write`   | Organization user registry                         | User account ownership (`user_id = self`)        | HR Manager / User Admin                | User updates own credentials; Admin provisions staff user               | Non-admin user denied modifying another employee account (403)                       |
| **`FEAT-IAM-03`**   | RBAC Roles & Permissions   | `iam:role:manage`                   | Organization role catalog                          | Global permission definition                     | System Security Administrator          | Security Admin assigns granular permission matrix to role               | Non-security staff denied role or permission editing (403)                           |
| **`FEAT-IAM-04`**   | Store-Context Memberships  | `iam:membership:manage`             | Store membership boundary (`x-store-id`, `INV-11`) | Explicit user-to-store assignment                | Branch Manager / Store Supervisor      | Operator switches context to assigned store (`STORE001`)                | Access denied when supplying unassigned `x-store-id` (403 `ERR_STORE_ACCESS_DENIED`) |
| **`FEAT-STOR-01`**  | Storage Hierarchy          | `storage:write`                     | Active branch store (`store_id`)                   | Vault $\to$ Locker $\to$ Compartment tree        | Store Manager                          | Store Manager provisions lockers inside store vault                     | Non-manager denied (403); mismatched store ID rejected (422 `INV-05`)                |
| **`FEAT-STOR-02`**  | Storage Directory UI       | `storage:read`                      | Active branch store (`x-store-id`)                 | Compartment occupancy allocation                 | Assigned Store Personnel               | Store staff views real-time occupancy of local compartments             | Staff denied accessing storage visualizer of unassigned store (403)                  |
| **`FEAT-TAX-01`**   | Categories Tree            | `taxonomy:write`                    | Organization catalog scope                         | Category / Subcategory hierarchy                 | Merchandising Lead                     | Merchandiser defines recursive product category tree                    | Branch retail staff denied category modifications (403)                              |
| **`FEAT-TAX-02`**   | Precious Metals & Purity   | `taxonomy:write`                    | Organization catalog scope                         | Material / Purity standards table                | Metallurgical / Compliance Lead        | Compliance Lead registers 18K purity standards and scales               | Unauthorized user denied modifying precious metal purities (403)                     |
| **`FEAT-TAX-03`**   | Gemstone Master Registry   | `taxonomy:write`                    | Organization catalog scope                         | Gemstone classification master (`gemstones`)     | Gemological Specialist                 | Specialist registers diamond classification master record               | Sales associate denied modifying gemstone master registry (403)                      |
| **`FEAT-TAX-04`**   | Product Master Styles      | `taxonomy:write`                    | Organization catalog scope                         | Base design model (`products`)                   | Design / Catalog Manager               | Catalog Manager registers new bridal ring design style                  | QC inspector denied modifying product design catalog (403)                           |
| **`FEAT-TAX-05`**   | SKUs & Gemstone Specs      | `taxonomy:write`                    | Organization catalog scope                         | Commercial variant SKU (`product_skus`)          | Commercial Product Manager             | Product Manager configures SKU with immutable tracking type             | Unauthorized user denied mutating commercial SKU attributes (403)                    |
| **`FEAT-PROC-01`**  | Supplier Master            | `procurement:write`                 | Organization vendor directory                      | Vendor legal entity (`suppliers`)                | Purchasing Agent                       | Purchasing Agent registers audited bullion and stone vendor             | Showroom floor staff denied vendor profile modifications (403)                       |
| **`FEAT-PROC-02`**  | GRN Lifecycle              | `procurement:write`                 | Receiving store branch (`store_id`)                | Goods Receipt Note intake document               | Receiving Officer                      | Receiving Officer drafts GRN at active inbound branch                   | User at another branch denied GRN creation or editing locked GRN (403/422)           |
| **`FEAT-PROC-03`**  | Inbound Shipments          | `procurement:write`                 | Receiving store branch                             | Inbound shipment & line item manifest            | Receiving Officer                      | Receiving Officer records declared gross weights per parcel             | Non-procurement personnel denied submitting shipment manifest (403)                  |
| **`FEAT-PROC-04`**  | Receiving Staff Assign     | `procurement:assign`                | Receiving branch store (`INV-19`)                  | Custody handoff package assignment               | Receiving Supervisor $\to$ Technician  | Supervisor assigns receiving technician with matching store             | Assigning staff member not belonging to receiving branch denied (403)                |
| **`FEAT-QC-01`**    | QC Inspection Sessions     | `qc:create`                         | Store custody of received shipment                 | QC inspection session entity                     | Assigned QC Inspector                  | Assigned inspector initiates QC session at receiving branch             | Cross-store session attempt rejected (403 `INV-11`); unreceived shipment (422)       |
| **`FEAT-QC-02`**    | Analytical Balance         | `qc:measure`                        | Inspection station store context                   | Immutable balance reading (`INV-09`)             | Metrology Technician                   | Technician ingests $0.0001\text{g}$ analytical reading                  | Unprivileged user denied capturing scale readings (403)                              |
| **`FEAT-QC-03`**    | Gemstone Parcel Grading    | `qc:measure`                        | Active inspection session context                  | Mounted gemstone parcel grading                  | Certified Gemologist / Inspector       | Gemologist records stone count and carat weight deduction               | User lacking measurement permission denied gemstone entry (403)                      |
| **`FEAT-QC-04`**    | QC Item 3VL Checks         | `qc:inspect`                        | Active session store boundary                      | Item inspection checklist (`INV-18`)             | Assigned QC Inspector                  | Inspector records hallmark and visual verification flags                | Non-inspector denied modifying piece-level inspection results (403)                  |
| **`FEAT-QC-05`**    | Intake Tolerance Gate      | `qc:inspect`, `qc:tolerance:admin`  | Active inspection store scope                      | Discrepancy evaluation record (`INV-12`)         | System Gate / QC Supervisor            | Within-tolerance pieces automatically cleared for approval              | Non-supervisor denied manually bypassing out-of-tolerance discrepancy (403)          |
| **`FEAT-QC-06`**    | Quality Decisions & Waiver | `qc:approve`, `qc:waiver`           | Active store branch scope                          | Formal piece approval / waiver record            | Store Manager Supervisor (`Gap 3`)     | Store Manager grants damage waiver with justification notes             | Standard inspector denied damage waiver without supervisor privilege (403)           |
| **`FEAT-INV-01`**   | Serialized Piece Birth     | `inventory:create`                  | Birth vault in active store branch                 | Approved QC item birth certificate (`INV-14`)    | Vault Custodian                        | Vault Custodian births physical item into vault custody                 | Unauthorized user denied (403); unapproved QC item birth rejected (422)              |
| **`FEAT-INV-02`**   | Bulk Stock Balances        | `inventory:write`                   | Branch store boundary (`BIZ-Q02`)                  | Non-serialized stock balance aggregate           | Inventory Controller                   | Controller updates non-negative finding batch stock balance             | Staff at another store branch denied modifying stock balances (403)                  |
| **`FEAT-INV-03`**   | Custody Movement Ledger    | `inventory:transfer`                | Dual-store custody boundary (`INV-13`)             | Movement custody transfer record (`INV-09`)      | Dual-custody vault officers            | Custodian records vault-to-display compartment transfer                 | Cross-store transfer attempted by unassigned operator rejected (403 `INV-11`)        |
| **`FEAT-INV-04`**   | State History & OCC        | `inventory:state:update`            | Active branch store scope                          | Root aggregate lock holder (`INV-08`)            | Inventory Supervisor                   | Supervisor updates piece state under OCC version increment              | Concurrent write with stale version rejected with 409 Conflict                       |
| **`FEAT-RFID-01`**  | EPC Tag Master Registry    | `rfid:write`                        | Organization hardware catalog                      | Hardware transponder master record               | RFID Operations Specialist             | Specialist registers unencoded UHF EPC Gen 2 transponder                | Unauthorized personnel denied transponder registration (403)                         |
| **`FEAT-RFID-02`**  | Single-Active Tag Binding  | `rfid:write`                        | Active store inventory scope                       | 1:1 active tag-to-item link (`INV-03`, `INV-04`) | Tagging Specialist                     | Specialist binds active tag to physical piece in showroom vault         | Binding already-active tag or binding to second item rejected (409)                  |
| **`FEAT-RFID-03`**  | Async Print/Encode         | `rfid:encode`                       | Warehouse encoding print station                   | Batch print job & BullMQ worker queue            | Hardware Encoding Operator             | Operator enqueues batch encoding job with outbox event                  | User without encoding permission denied job submission (403)                         |
| **`FEAT-GOV-01`**   | Commercial Stock Approval  | `governance:approve`                | Showroom vault store boundary                      | Quad-prerequisite gate asset (`INV-01`)          | Store Director / Corporate Executive   | Executive approves piece: `QC_APPROVED` + `APPROVED` + `IN_VAULT` + Tag | Approving piece lacking active RFID tag rejected (422 `ERR_INV_01_TAG_REQUIRED`)     |
| **`FEAT-GOV-02`**   | Compliance Audit Trail     | `audit:read`                        | Organization audit repository                      | Tamper-evident audit event stream (`INV-09`)     | Compliance Officer / Internal Auditor  | Auditor inspects immutable chronological mutation event stream          | Operational user denied access to compliance audit logs (403)                        |
| **`FEAT-GOV-03`**   | Polymorphic File Storage   | `documents:write`, `documents:read` | Store / Organization scope                         | Polymorphic document association                 | Document Uploader / Reviewer           | User uploads supplier invoice and associates with GRN                   | Non-allowed MIME type rejected (400); unauthorized upload denied (403)               |

---

_End of Feature Delivery Standard Operating Procedure (v1.1)._
