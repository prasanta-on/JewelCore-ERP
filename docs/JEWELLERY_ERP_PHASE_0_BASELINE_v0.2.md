# Jewellery ERP Platform — Phase 0 Product & Architecture Baseline

**Version:** 0.2  
**Status:** Draft for engineering discussion; neutral project naming applied  
**Project approach:** Greenfield implementation  
**Primary backend framework:** Express.js + TypeScript  
**Frontend:** Next.js + React + TypeScript

> This document translates the supplied `JEWELLERY_ERP_PROJECT_OVERVIEW.md` into an initial build plan. It is not proof that the described existing system implements every behavior. Business rules marked **TBD** must be confirmed before the affected feature is treated as production-ready.

> **Project naming:** The neutral project name is **Jewellery ERP Platform** and the repository slug is `jewellery-erp-platform`. This is a descriptive working name, not a statement that a commercial trademark or domain is available.

---

## 1. Product Definition

The Jewellery ERP Platform is a multi-branch jewellery operations platform intended to manage the lifecycle of high-value physical jewellery assets—from supplier procurement and goods receipt through quality control, item identification, stock placement, approval, commercial operations, and financial reporting.

The defining product capability is **traceability of each physical jewellery item and its business history**, not simply catalogue CRUD or quantity tracking.

The platform must be able to answer, subject to the approved data model:

- What physical item is this, and what identifies it?
- Which supplier, GRN, and shipment introduced it?
- What were the received and verified weight/purity/gemstone details?
- What is its current business state and physical location?
- Which store or organization owns or is responsible for it?
- Which user performed or approved each material operation, and when?
- Is the item eligible for its next business operation?

## 2. Product Goals

1. Maintain accurate, auditable jewellery-item records across the complete stock lifecycle.
2. Enforce organization/store-aware access control on the backend.
3. Preserve the consistency of inventory state, item identity, and operational history.
4. Support reviewable, controlled workflows for procurement, QC, storage, and stock approval.
5. Process slow or device-dependent operations asynchronously, without keeping HTTP requests open unnecessarily.
6. Provide a usable Next.js interface for daily operations and administration.
7. Establish automated verification and operational controls before expanding to higher-risk financial modules.

## 3. Non-Goals for the First Release

The following are part of the broader product vision but are not required in the first vertical release unless business priorities later make them mandatory:

- Full accounting/general-ledger implementation.
- Treasury operations.
- End-to-end sales, returns, exchange, and buyback settlement.
- Advanced financial and RFID analytics.
- Complex notification automation.
- Multiple independently deployed business microservices.
- Kubernetes or other orchestration infrastructure without a demonstrated operational requirement.

These are deferred, not removed from the long-term scope.

## 4. Initial User and Access Model

The overview names roles such as store administrator, store manager, accountant, inventory controller, and sales executive. The actual permission matrix must be derived and approved; role names alone do not establish access rights.

Proposed conceptual hierarchy:

```text
Platform
└── Organization / Tenant (exact meaning TBD)
    ├── Store / Branch
    │   ├── Users and memberships
    │   ├── Store-scoped roles and permissions
    │   └── Store-scoped business records
    └── Shared organization-level master data (rules TBD)
```

**Provisional design decision:** model Organization and Store as distinct concepts. Do not assume that every organization has the same data-sharing rules. All resource access must be checked against authenticated identity, active membership, selected store context where applicable, the relevant permission, and the resource's actual ownership/scope.

A global administrator must be a deliberately constrained, auditable capability—not an implicit bypass scattered through application code.

## 5. Initial Release Scope: Core Asset Lifecycle MVP

The first meaningful product release should prove one end-to-end workflow safely before expanding to all ERP modules.

### Included

1. Application foundation and configuration validation.
2. Authentication integration boundary and user/store membership model.
3. Backend-enforced RBAC and resource/store authorization.
4. Master data: categories, subcategories, products, materials, purity, and gemstones.
5. Supplier management.
6. GRN creation and lifecycle, shipment/intake records, and staff assignment where required.
7. Item-level QC records for weight, material/purity, gemstone details, status, and decisions.
8. Individually traceable inventory item/SKU model, subject to confirmation of item-vs-quantity rules.
9. RFID identity and RFID-job records, with hardware integration isolated behind an adapter.
10. Storage hierarchy (vault, locker, compartment), placement/movement, and stock approval.
11. Operational audit history for significant state-changing operations.
12. Search/filter/pagination for core operational lists.
13. API documentation, automated tests, CI checks, health/readiness behavior, structured logs, and local development instructions.

### Explicitly deferred from this release

- Posting the accounting general ledger and financial-period close.
- Treasury workflows.
- Full sales/buyback/exchange settlement.
- Automated live commodity-price ingestion.
- Advanced reporting/data warehouse.
- Real-device RFID printing until the local-client protocol, device environment, and failure/recovery contract are specified. Build a testable adapter and job lifecycle first; do not falsely mark simulated printing as real printing.

## 6. Provisional Technology Decisions

| Area           | Initial choice                                                                     | Status / rationale                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Frontend       | Next.js + React + TypeScript                                                       | Proposed; matches the supplied product context.                                                                        |
| HTTP backend   | Express 5 + TypeScript                                                             | Confirmed user preference; replaces NestJS.                                                                            |
| Runtime        | Node.js LTS                                                                        | Pin an exact supported LTS release during Phase 1; do not rely on an unspecified local runtime.                        |
| Database       | PostgreSQL                                                                         | Retain from the supplied specification; relational constraints and transactions fit inventory and financial records.   |
| ORM            | TypeORM                                                                            | Provisional; retained because it is in the source specification. Verify its fit and migration workflow before locking. |
| Validation     | Zod at external/configuration boundaries                                           | Proposed; validate every request on the server.                                                                        |
| Jobs           | Redis + BullMQ, separate worker process                                            | Retain from source specification; introduce when a concrete async workflow is built.                                   |
| API style      | REST, versioned under `/api/v1`                                                    | Proposed; publish OpenAPI contracts.                                                                                   |
| Authorization  | RBAC plus resource/store-scoped policies                                           | Required concept; full policy matrix is TBD.                                                                           |
| Object storage | S3-compatible abstraction                                                          | Retain as the target capability; choose a concrete provider for each environment later.                                |
| Tests          | Unit + integration + end-to-end                                                    | Required. Exact test libraries are finalized in Phase 1.                                                               |
| Repository     | pnpm monorepo with `apps/web`, `apps/api`, `apps/worker` and small shared packages | Proposed for full-stack coordination and shared contracts.                                                             |
| Deployment     | CI/CD with separate environments and reviewed release gates                        | Required goal; hosting provider and budget are TBD.                                                                    |

Do not install all infrastructure in one large operation. Add each dependency when its usage and acceptance criteria are defined.

## 7. Target Architecture

```text
Browser
  |
  v
Next.js Web Application
  | HTTPS / REST
  v
Express API (modular monolith)
  |-- Authentication and access-control middleware
  |-- Domain modules and application services
  |-- Persistence adapters / TypeORM
  |-- PostgreSQL (transactional source of truth)
  |-- Object-storage adapter
  |-- Queue producer
          |
          v
       Redis / BullMQ
          |
          v
    Separate Worker Process
          |
          v
    RFID / other external integrations
```

Keep the API and worker in the same repository and shared domain boundaries initially. They may be separate processes without becoming a microservices architecture.

### Proposed API module boundaries

- Identity and access: auth, users, organizations, stores, memberships, roles, permissions, policies.
- Master data: categories, subcategories, products, materials, purity, gemstones.
- Procurement: suppliers, GRNs, shipments, intake and staff assignment.
- Quality: item inspection, measurements, gemstone details, approval/rejection decisions.
- Inventory: item identity, SKU, stock state, location, movements, stock approvals and stock audit.
- RFID: tag assignment/history, job creation/status, adapter boundary and operational recovery.
- Commercial (later): pricing, sales, buyback, exchange.
- Finance (later): accounting, treasury and reconciliation.
- Cross-cutting: files, notifications, reporting, health, observability and audit.

Modules should be separated by business responsibility, not by frontend menu count. A single coherent domain may contain several routes and use cases.

## 8. Backend Structure Principles

Use feature/domain modules. A module may contain routes, controller, service/use cases, repository, schemas, policy, errors, types, and tests where those artifacts are needed.

- Routes compose middleware and endpoints.
- Controllers translate HTTP into application operations; they do not contain business workflows.
- Services/use cases enforce application and domain rules and coordinate transactions.
- Repositories encapsulate persistence queries; repositories do not decide user authorization.
- Policies evaluate identity, membership, resource scope, and permissions.
- DTOs/contracts describe external API shapes; database entities are not automatically returned as public API responses.
- Shared infrastructure must remain small and must not become a dumping ground.
- Avoid recreating NestJS's entire framework inside Express. Adopt explicit conventions that solve concrete project needs.

## 9. Core Domain Concepts to Model

Initial candidate entities (not a finalized schema):

- Organization, Store, User, Membership, Role, Permission, RolePermission.
- Supplier, Customer.
- Category, Subcategory, Product, Material, Purity, Gemstone.
- GoodsReceiptNote (GRN), Shipment, IntakeRecord, StaffAssignment.
- QualityCheck, QualityCheckItem, WeightMeasurement, ItemGemstone.
- InventoryItem / SKU, RFIDTagAssignment, RFIDJob.
- Vault, Locker, Compartment, InventoryMovement, StockApproval.
- AuditEvent / business audit record.
- FileObject metadata and association.

Before schema implementation, confirm whether a SKU means one serialized physical piece or may represent a quantity/batch. Do not finalize uniqueness rules until this distinction is resolved.

## 10. Required Business Invariants (Rules to Define and Test)

1. A resource must belong to a well-defined organization/store scope or be explicitly shared.
2. A user cannot access another store's resources simply by changing an identifier in a request.
3. Authorization does not override business-state validity.
4. Invalid QC transitions must be rejected.
5. Inventory must not become available for sale before all required QC, identification, placement, and approval requirements are satisfied.
6. Item identity and RFID tag identity must be separate so a damaged tag can be replaced without losing physical-item history.
7. SKU and RFID uniqueness rules must be enforced at the database boundary where applicable.
8. Coupled database changes must be atomic when the business operation requires all-or-nothing behavior.
9. Concurrent operations must not both perform an incompatible state transition successfully.
10. Every material inventory state change must have the required actor, time, store, reason, and related operation recorded.
11. Queue retries must not silently duplicate business state changes or assume physical printing succeeded when the outcome is ambiguous.
12. Monetary values and weights must use explicit units, precision, and rounding policies; avoid binary floating-point as the authoritative representation.
13. Customer/supplier documents must be access-controlled and must not be publicly retrievable by guessing object keys.
14. Tests must verify rejected and failure cases, not only happy paths.

These are target invariants, subject to refinement by approved business rules.

## 11. Transaction and Queue Design Principle

PostgreSQL is the source of truth for durable business state. Redis/BullMQ is job infrastructure; it is not the authoritative inventory database.

When a business transaction must both commit database state and request asynchronous work, explicitly handle the database/queue dual-write failure. Evaluate a transactional outbox or another reliable handoff pattern rather than assuming a PostgreSQL transaction can atomically commit Redis state.

For RFID, separate:

- Business item state.
- RFID tag assignment state/history.
- Technical job state.
- External device outcome.

The system must handle retries, duplicate requests, worker crashes, offline devices, and uncertain physical outcomes with an explicit recovery process.

## 12. Security Baseline

- Validate all untrusted input on the server.
- Apply authentication and authorization to every protected operation.
- Enforce object/store scope in the data-access path, not only in the UI.
- Use least-privilege role assignments and auditable global administration.
- Keep secrets out of source control, logs, error responses, and documentation.
- Apply sensible request-size, upload-size, rate, timeout, and pagination bounds.
- Restrict CORS to known web origins per environment.
- Use safe cookie/session settings if cookies are selected; define CSRF protections when applicable.
- Design access-token/session expiry, renewal, logout, revocation, and SSO behavior deliberately.
- Keep uploaded-file authorization separate from knowledge of a storage key.
- Use reviewed migrations; never use automatic production schema synchronization as a substitute for versioned migrations.
- Record security-sensitive state changes in an audit trail without logging credentials or token material.

## 13. First Vertical Slice

After the platform foundation and minimum authorization model are in place, implement one traceable item end to end:

1. Create/choose a supplier and product/master-data values.
2. Create a GRN and shipment/intake record.
3. Create item-level QC records and record approve/reject outcomes.
4. Create or confirm the individual inventory identity/SKU.
5. Create an RFID tag assignment and a tracked RFID job (using a fake/test adapter until real hardware contracts are confirmed).
6. Place the item in a vault/locker/compartment.
7. Require the correct stock approval.
8. Search the item by SKU/RFID and show its current state and audit timeline.
9. Prove that an unauthorized user/store cannot access or mutate it.
10. Prove that duplicate and conflicting operations do not create inconsistent state.

This slice validates the domain model before we build many disconnected screens.

## 14. Phase 1 — Engineering Foundation Exit Criteria

Phase 1 is complete only when all applicable criteria are verified:

- Monorepo installs reproducibly from the committed lockfile.
- Runtime and package-manager versions are pinned/documented.
- Web, API, and worker entry-point decisions are documented; only necessary apps are scaffolded.
- Express application bootstrap is separated from server startup to make tests possible.
- Configuration is schema-validated and safe failure behavior is tested.
- Centralized error mapping and request validation conventions exist.
- PostgreSQL connectivity and TypeORM migration workflow are demonstrated in a local/test environment.
- Redis/BullMQ are not introduced as unused ceremony; if included in the foundation, their startup/shutdown and health behavior are verified.
- Structured logging does not expose secrets or sensitive payloads.
- Lint, type-check, unit tests, integration tests, and build commands work.
- CI runs the applicable checks on proposed changes.
- Environment examples contain placeholders only; no real credentials are committed.
- README explains local setup, validation commands, migration commands, and test execution.
- No business feature is marked complete without acceptance criteria and verification evidence.

## 15. Proposed Development Workflow with Antigravity

For each bounded task:

1. Read the relevant requirements and current code.
2. Identify assumptions, affected modules, risks and acceptance criteria.
3. Produce a small implementation plan.
4. Review/approve the plan before broad changes.
5. Implement only the agreed scope.
6. Run relevant tests and quality checks.
7. Inspect the actual diff for unrelated changes and regressions.
8. Update documentation and status records.
9. Report verified results, failed checks and remaining uncertainty.

Never allow the agent to claim a check passed unless it was actually run and passed. Do not request implementation of the whole ERP in one prompt.

## 16. Open Decisions Before Finalizing the Schema

| ID   | Decision                                             | Initial recommendation                                                                                                           | Status |
| ---- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D-01 | One organization or true multi-tenant platform?      | Model Organization and Store separately; confirm isolation requirements.                                                         | Open   |
| D-02 | Is each jewellery piece individually serialized?     | Assume item-level tracking for high-value items, but confirm batch/quantity cases.                                               | Open   |
| D-03 | Identity provider and SSO protocol?                  | Integrate through a documented OIDC/OAuth2-compatible boundary if supported by the actual provider; confirm provider first.      | Open   |
| D-04 | Session strategy?                                    | Prefer secure server-managed session or carefully designed token/session lifecycle; decide based on SSO and deployment topology. | Open   |
| D-05 | Who may approve QC and stock?                        | Define least-privilege permissions and any segregation-of-duties requirements.                                                   | Open   |
| D-06 | Exact QC/GRN/stock state transitions?                | Define explicit state machines and allowed commands before implementing them.                                                    | Open   |
| D-07 | RFID local client protocol and recovery?             | Build adapter plus simulated integration first; confirm physical protocol before real printing.                                  | Open   |
| D-08 | Pricing formulas, units, currency, tax and rounding? | Obtain approved business formulas and examples; do not infer formula from UI labels.                                             | Open   |
| D-09 | Accounting scope and source of truth?                | Defer implementation until posting, reconciliation, periods, and reporting requirements are defined.                             | Open   |
| D-10 | Object-storage provider and deployment target?       | Use an adapter and environment-based configuration; choose provider after cost/ops constraints are known.                        | Open   |
| D-11 | Hosting, backups, RPO/RTO, and budget?               | Define before production deployment design is finalized.                                                                         | Open   |
| D-12 | TypeORM or alternative ORM?                          | Retain TypeORM provisionally; verify developer experience, query needs, transaction handling, and migration workflow.            | Open   |

## 17. Immediate Next Milestones

1. Review this baseline and resolve the high-impact open decisions.
2. Produce the domain glossary, role/permission matrix, and GRN/QC/inventory state-machine definitions.
3. Finalize architecture decision records and the Phase 1 task breakdown.
4. Only then scaffold the repository and implement the engineering foundation.

## 18. Definition of “Production-Ready” for This Project

Production readiness is not a folder structure, framework choice, or successful local start. It requires evidence that:

- Approved workflows are correct, including rejected/invalid transitions.
- Data integrity and concurrency requirements are enforced.
- Access control and organization/store isolation are tested at the API and data boundaries.
- Relevant tests, type checks, linting, and builds pass.
- Database migrations and rollback/recovery procedures are reviewed.
- External integrations fail visibly and recover safely.
- Secrets, logs, files, and operational access are handled securely.
- Deployment, health monitoring, backups, restoration, and release/rollback procedures are verified for the chosen hosting environment.
- Remaining risks and known limitations are documented and accepted.
