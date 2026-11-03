# Transactional Outbox Engine & BullMQ Worker Architecture Specification

**Document Version:** 1.0  
**Status:** Architectural Preparation & Baseline Design (`PREP_READY`)  
**Date:** 2026-11-03  
**Authors:** Principal Software Architect, Senior Backend Engineer, Database Architect  
**Project:** Jewellery ERP Platform (`jewelcore-erp`)  
**Feature Traceability:** [`FEAT-FOUND-04`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_ACCEPTANCE_CRITERIA.md#L71-L85)  
**Parent Baselines:**

- [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md) (v0.3.3, Entity 43 `outbox_events`)
- [`docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/PHYSICAL_SCHEMA_DECISION_REGISTER.md) (v1.2.2, Item 11)
- [`docs/architecture/PHYSICAL_SCHEMA_PO_DECISION_WORKSHEET.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/PHYSICAL_SCHEMA_PO_DECISION_WORKSHEET.md) (Item 5)

---

> [!IMPORTANT]
> **Implementation Boundary Notice (`PREP_READY`):**  
> In accordance with Milestone 0.4 governance gates (`BIZ-Q01`, `BIZ-Q02`, `BIZ-Q03`, and `DEC-05`), **physical database DDL, database migrations, and SQL persistence implementations for `outbox_events` remain blocked**. This specification establishes the approved architectural contracts, interfaces, BullMQ configurations, idempotency ports, and worker processing baselines. No physical schema migrations or unapproved queries have been introduced.

---

## 1. Purpose & Scope

The JewelCore ERP platform manages high-value physical luxury inventory (serialized gold, platinum, and gemstone jewelry). A core invariant across this domain is **zero data loss and zero dual-write anomalies**. When business mutations occur—such as approving a Quality Check inspection session, commissioning an RFID tag, or transferring custody of jewelry between vaults—the system must guarantee that downstream side-effects (RFID printer jobs, notification dispatch, external compliance reporting) are reliably executed without compromising ACID database consistency.

Directly publishing events to message queues or Redis within an HTTP request introduces severe dual-write failure modes:

1. **Ghost Event:** The message broker accepts the event, but the database transaction rolls back, leaving downstream consumers acting on phantom state.
2. **Silent Drop:** The database transaction commits, but network failure or Redis downtime drops the event, permanently losing the downstream trigger.
3. **Dual-Phase Commit (2PC) Fragility:** 2PC introduces distributed locks, high latency, and single-point-of-failure vulnerabilities that violate the platform's modular monolith architecture.

This specification documents the **Atomic Transactional Outbox Pattern** (`INV-10`), using PostgreSQL 18 for durable ACID staging and Redis 7.2 / BullMQ 5 for resilient, asynchronous worker execution.

---

## 2. Architecture Overview

The Transactional Outbox Engine separates event persistence from event dispatch into two decoupled phases:

1. **Synchronous In-Transaction Staging:** Business mutations and outbox event records commit atomically inside the same local PostgreSQL transaction block.
2. **Asynchronous Polling & Dispatch:** A dedicated background relay process in [`apps/worker`](file:///home/prasanta/Documents/projects/JewelCore-ERP/apps/worker) polls pending outbox records from PostgreSQL and pushes them into BullMQ queues in Redis.
3. **Idempotent Worker Processing:** Downstream consumers process events with strict idempotency guards, tolerating network redelivery and process restarts.

### 2.1 Core Architectural Flow

```mermaid
flowchart TD
    subgraph Synchronous["Phase 1: Synchronous API Request (Express 5)"]
        A["Client HTTP Request<br/>(with x-request-id)"] --> B["Application Service"]
        B --> C["withTransaction Client"]
        C -->|1. Mutate Domain State| D[("PostgreSQL 18<br/>Domain Tables")]
        C -->|2. Insert outbox_events<br/>(status: PENDING)| E[("PostgreSQL 18<br/>outbox_events (Entity 43)")]
        C -->|3. Single Atomic COMMIT| F["ACID Transaction Boundary"]
    end

    subgraph Asynchronous["Phase 2: Asynchronous Outbox Relay (apps/worker)"]
        G["Outbox Relay Poller<br/>(Planned)"] -->|4. Poll PENDING records| E
        G -->|5. Enqueue Job with jobId: event.id| H[("Redis 7.2<br/>BullMQ Queue")]
        G -->|6. Mark status: PUBLISHED| E
    end

    subgraph Consumer["Phase 3: Resilient Consumer Execution (apps/worker)"]
        H -->|7. Dequeue Job| I["EventProcessor Engine"]
        I -->|8. Idempotency Check<br/>(IdempotencyStoragePort)| J[("Idempotency Store<br/>(Port Abstraction)")]
        I -->|9. Execute Handler| K["DomainEventHandler"]
        K -->|10. Mark Completed| J
    end
```

---

## 3. Event Envelope Specification

All domain events in JewelCore ERP adhere to a strict, versioned domain event envelope defined in [`packages/shared/src/events/eventEnvelope.ts`](file:///home/prasanta/Documents/projects/JewelCore-ERP/packages/shared/src/events/eventEnvelope.ts).

### 3.1 Envelope Attributes

| Attribute       | Type                      | Description                                                                                                                                |
| :-------------- | :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | `UUIDv7`                  | Universally unique, time-ordered identifier for the event. Used as the BullMQ `jobId` and deduplication key.                               |
| `type`          | `string`                  | Dot-separated event type string (e.g., `inventory.item.born`, `qc.session.completed`). Pattern: `^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$`. |
| `version`       | `integer`                 | Positive integer indicating the schema version of the payload (starts at `1`).                                                             |
| `occurredAt`    | `string`                  | ISO 8601 UTC timestamp generated at event creation.                                                                                        |
| `aggregateType` | `string`                  | Root aggregate class or entity name (e.g., `InventoryItem`, `QualityCheck`).                                                               |
| `aggregateId`   | `string`                  | Surrogate primary key of the aggregate root.                                                                                               |
| `orgId`         | `UUID` (optional)         | Owning organization/tenant boundary.                                                                                                       |
| `storeId`       | `UUID` (optional)         | Active branch store context (`INV-11`).                                                                                                    |
| `correlationId` | `string`                  | End-to-end tracing correlation ID originating from HTTP `x-request-id` (`req_...`).                                                        |
| `causationId`   | `string` (optional)       | Identifier of the command or antecedent event that caused this event.                                                                      |
| `payload`       | `Record<string, unknown>` | Domain payload strictly validated against domain-specific Zod schemas.                                                                     |
| `metadata`      | `EventMetadata`           | Safe execution metadata (`actorId`, `actorType`, `clientIp`, `schemaVersion`).                                                             |

### 3.2 Security & Credential Scrubbing Invariant

Domain events are immutable records that may be logged, queued, or relayed across systems. To prevent credential leakage:

- The factory [`createDomainEvent()`](file:///home/prasanta/Documents/projects/JewelCore-ERP/packages/shared/src/events/eventEnvelope.ts#L104) executes deep recursive inspection using `assertNoSecretsInPayload()`.
- Any payload key containing forbidden terms (`password`, `token`, `secret`, `apiKey`, `credential`, `authorization`, `refreshToken`, `accessToken`) is immediately rejected with a [`ValidationError`](file:///home/prasanta/Documents/projects/JewelCore-ERP/packages/shared/src/index.ts#L44).

---

## 4. Outbox Persistence Boundary (Entity 43)

The logical schema for outbox persistence is defined by Entity 43 (`outbox_events`) in [`docs/architecture/LOGICAL_DATA_MODEL.md`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/architecture/LOGICAL_DATA_MODEL.md#L1822-L1842):

```
+---------------------------------------------------------------------------------------+
| Entity 43: outbox_events                                                              |
+-------------------+---------------+---------------------------------------------------+
| Column            | Logical Type  | Constraint / Semantics                            |
+-------------------+---------------+---------------------------------------------------+
| id                | UUIDv7        | PRIMARY KEY, surrogate time-ordered identifier     |
| topic             | VARCHAR(128)  | NOT NULL, event topic (e.g. INVENTORY.ITEM_BORN)  |
| payload_json      | JSONB         | NOT NULL, serialized DomainEventEnvelope JSON     |
| status            | VARCHAR(20)   | NOT NULL, 'PENDING' | 'PUBLISHED' | 'FAILED'       |
| retry_count       | INTEGER       | NOT NULL, DEFAULT 0                               |
| last_error        | TEXT          | NULLABLE, diagnostic error message on failure     |
| created_at        | TIMESTAMPTZ   | NOT NULL, DEFAULT clock_timestamp()               |
| published_at      | TIMESTAMPTZ   | NULLABLE, timestamp of BullMQ acknowledgment      |
+-------------------+---------------+---------------------------------------------------+
```

### 4.1 Indexing Strategy (Planned for Milestone 0.4)

- **Primary Dispatch Partial Index:** `CREATE INDEX idx_outbox_events_pending ON outbox_events (created_at ASC) WHERE status = 'PENDING';`  
  Guarantees high-speed FIFO polling with zero overhead from historical published rows.
- **Surrogate Lookup Index:** `PRIMARY KEY (id)`.

---

## 5. PostgreSQL Transaction Integration Design

The integration boundary between business operations and the outbox engine is strictly enforced through the [`TransactionClient`](file:///home/prasanta/Documents/projects/JewelCore-ERP/packages/database/src/transaction.ts#L8) / [`TransactionContext`](file:///home/prasanta/Documents/projects/JewelCore-ERP/packages/shared/src/events/outboxContracts.ts#L43) interface.

### 5.1 Transactional Workflow

```typescript
await withTransaction(async (tx) => {
  // 1. Execute core business mutation
  await tx.query(
    "UPDATE inventory_items SET custody_state = $1 WHERE id = $2",
    ["IN_VAULT", itemId],
  );

  // 2. Stage outbox event in the identical transaction
  const event = createDomainEvent({
    id: generateUuidV7(),
    type: "inventory.item.placed",
    aggregateType: "InventoryItem",
    aggregateId: itemId,
    correlationId: req.requestId,
    payload: { compartmentId, storeId },
  });

  await outboxStoragePort.save(mapToOutboxRecord(event), tx);
  // Both commit atomically when callback returns; both rollback on error
});
```

---

## 6. Relay & Dispatch Design

The Outbox Relay is an asynchronous background engine responsible for reading committed `PENDING` outbox records and pushing them to BullMQ.

```mermaid
flowchart LR
    A[("PostgreSQL 18<br/>outbox_events")] -->|SELECT ... FOR UPDATE SKIP LOCKED| B["Outbox Relay Engine"]
    B -->|bullmq.add(event.type, event, { jobId: event.id })| C[("Redis 7.2<br/>BullMQ Queue")]
    C -->|ACK / Job ID confirmed| B
    B -->|UPDATE outbox_events SET status='PUBLISHED', published_at=NOW()| A
    B -.->|Dispatch Failure| D["Increment retry_count<br/>Record last_error"]
    D --> A
```

### 6.1 Concurrency & Locking Protocol (`SKIP LOCKED`)

When multiple worker instances run concurrently:

- The relay executes:
  ```sql
  SELECT * FROM outbox_events
  WHERE status = 'PENDING'
  ORDER BY created_at ASC
  LIMIT 50
  FOR UPDATE SKIP LOCKED;
  ```
- `SKIP LOCKED` ensures zero contention, zero deadlock hazards (`SQLSTATE 40P01`), and lock-free parallelism across worker replicas.

---

## 7. BullMQ Processing Architecture

The background worker application ([`apps/worker`](file:///home/prasanta/Documents/projects/JewelCore-ERP/apps/worker)) configures and hosts the BullMQ consumer engine.

### 7.1 Queue Topology

1. **`jewelcore:events:domain`:** Primary queue for domain event side-effects.
2. **`jewelcore:rfid:jobs`:** High-priority dedicated queue for batch RFID printer and encoder jobs ([`FEAT-RFID-03`](file:///home/prasanta/Documents/projects/JewelCore-ERP/docs/implementation/FEATURE_ACCEPTANCE_CRITERIA.md#L555)).
3. **`jewelcore:events:dlq`:** Dead-Letter Queue for non-retryable errors or poison messages exceeding max attempts.

### 7.2 Standard Job Options

Implemented in [`apps/worker/src/infrastructure/queueConfig.ts`](file:///home/prasanta/Documents/projects/JewelCore-ERP/apps/worker/src/infrastructure/queueConfig.ts):

- `attempts`: 3
- `backoff`: Exponential (`delay: 1000ms`, doubling on each attempt)
- `removeOnComplete`: Retains maximum 1,000 jobs or 24 hours
- `removeOnFail`: Retains maximum 5,000 jobs or 7 days for forensic diagnostics
- `jobId`: Assigned explicitly to `event.id` (UUIDv7)

---

## 8. Retry & Failure Strategy

```mermaid
flowchart TD
    A["Job Dequeued from BullMQ"] --> B["EventProcessor.process()"]
    B --> C{"Handler Execution"}
    C -->|Success| D["Mark Idempotency COMPLETED<br/>BullMQ Job Completed"]
    C -->|NonRetryableError<br/>(Schema violation, poison message)| E["Mark Idempotency FAILED<br/>Move to Dead-Letter Queue (DLQ)<br/>Emit Error Alert"]
    C -->|RetryableError / Transient Blip<br/>(DB lock, network drop)| F{"attempts < 3?"}
    F -->|Yes| G["Release Idempotency Lock<br/>BullMQ Exponential Backoff Retry"]
    G --> A
    F -->|No| H["Mark Outbox FAILED<br/>Move to Dead-Letter Queue (DLQ)<br/>Structured Log Alarm"]
```

### 8.1 Error Classification Rules

- **[`RetryableError`](file:///home/prasanta/Documents/projects/JewelCore-ERP/packages/shared/src/events/errorContracts.ts#L7):** Transient network issues, Redis timeout, database deadlock (`40P01`), rate-limiting. Handled via exponential backoff up to 3 attempts.
- **[`NonRetryableError`](file:///home/prasanta/Documents/projects/JewelCore-ERP/packages/shared/src/events/errorContracts.ts#L18):** Payload schema validation errors, state machine invariant violations, unrecoverable domain rejections. Aborts retries immediately without burning attempts and routes directly to DLQ.

---

## 9. Idempotency Strategy

BullMQ provides **at-least-once** delivery semantics. Under network partitions, redis reconnects, or process restarts, duplicate delivery is inevitable.

### 9.1 The Idempotency Port Contract

Implemented in [`packages/shared/src/events/idempotencyContracts.ts`](file:///home/prasanta/Documents/projects/JewelCore-ERP/packages/shared/src/events/idempotencyContracts.ts):

```typescript
export interface IdempotencyStoragePort {
  acquire(key: string, ttlMs?: number): Promise<IdempotencyAcquireResult>;
  complete(key: string, result?: unknown): Promise<void>;
  fail(key: string, reason: string): Promise<void>;
}
```

### 9.2 Duplicate Delivery Handling Matrix

| State in Storage Port      | Processing Action                                                  | Result / Return                                   |
| :------------------------- | :----------------------------------------------------------------- | :------------------------------------------------ |
| **New Key (None)**         | Lock acquired; proceeds to execute handler.                        | Handler runs normally.                            |
| **`COMPLETED`**            | Duplicate delivery detected. Acknowledges without running handler. | Safely skipped; log audit record.                 |
| **`ACQUIRED` (In-Flight)** | Concurrent execution in progress on another worker.                | Throws `RetryableError` to re-queue with backoff. |
| **`FAILED`**               | Previous attempt failed. Lock acquired for retry.                  | Handler re-executed up to max retry limit.        |

> [!CAUTION]
> In-memory `Set` or `Map` collections are strictly forbidden in production. Once approved under Milestone 0.4, the production port will be backed by Redis (`SET key val NX PX ttl`) or a PostgreSQL table.

---

## 10. Event Versioning & Compatibility Strategy

To ensure safe rolling deployments and schema evolution:

1. **Additive Changes (Non-breaking):** New fields must be optional with default values. Event `version` remains constant.
2. **Breaking Schema Changes:** Increment `version` (e.g. `version: 2`). Handlers must maintain dual-version readers or register version-specific adapters:
   ```typescript
   export interface VersionedEventHandler {
     readonly eventType: string;
     readonly supportedVersions: number[];
     handleV1?(event: DomainEventEnvelope<PayloadV1>): Promise<void>;
     handleV2?(event: DomainEventEnvelope<PayloadV2>): Promise<void>;
   }
   ```
3. **Payload Archival:** Payloads are immutable JSON documents; legacy events are never rewritten in the database.

---

## 11. Observability & Distributed Tracing

Every stage of event lifecycle preserves distributed trace context:

- **`correlationId`:** Propagated from Express middleware (`x-request-id`) through the event envelope into child Pino loggers in the worker.
- **Structured Fields:** All worker logs emit:
  - `requestId` / `correlationId`
  - `eventId`
  - `eventType`
  - `jobId`
  - `queue`
  - `attempt`
  - `durationMs`
- **Metric Probes (Planned):**
  - Gauge: `outbox_pending_count`
  - Histogram: `outbox_dispatch_duration_ms`
  - Counter: `worker_jobs_completed_total`, `worker_jobs_failed_total`

---

## 12. Security Considerations

1. **Zero Secret Leakage:** Event payloads are scrubbed at creation time via `assertNoSecretsInPayload()`.
2. **Tenancy Isolation:** Events carry optional `orgId` and `storeId` attributes, ensuring handlers enforce store context boundaries (`INV-11`).
3. **No Unsanitized Deserialization:** Payloads are parsed with Zod schemas; arbitrary class deserialization (e.g. `eval` or unsafe prototype pollution) is prohibited.
4. **Redis Authentication:** Redis passwords and TLS configurations are loaded exclusively through validated environment variables ([`apps/worker/src/config.ts`](file:///home/prasanta/Documents/projects/JewelCore-ERP/apps/worker/src/config.ts)); hardcoded credentials are prohibited.

---

## 13. Failure Scenarios & Resilience Matrix

| Failure Mode                      | Impact                                                                                       | Recovery Behavior                                                                                                                       |
| :-------------------------------- | :------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Database Transaction Rollback** | Business operation fails.                                                                    | Outbox row is never committed; no event is ever emitted or enqueued (zero ghost events).                                                |
| **Relay Crashes During Dispatch** | Event published to Redis, but crash happens before PostgreSQL status updated to `PUBLISHED`. | Next relay run re-reads `PENDING` event and re-enqueues. Consumer idempotency guard detects duplicate `id` and suppresses side-effect.  |
| **Redis Server Down**             | BullMQ enqueue fails.                                                                        | Outbox row remains `PENDING` in PostgreSQL. Polling relay retries after Redis reconnects.                                               |
| **Worker Process Crash Mid-Job**  | In-flight job terminated.                                                                    | BullMQ lock expires (`stalledInterval`); BullMQ re-assigns job to another worker. Idempotency lock TTL expires and allows re-execution. |
| **Poison Message (Corrupt Data)** | Handler throws fatal validation error.                                                       | Classified as `NonRetryableError`. Retries aborted; routed to DLQ; on-call engineer alerted.                                            |

---

## 14. Recovery Strategy

### 14.1 Cold Startup & Worker Restart

- On startup, [`WorkerLifecycleManager`](file:///home/prasanta/Documents/projects/JewelCore-ERP/apps/worker/src/lifecycle.ts) initializes workers and verifies Redis connectivity.
- Any stalled jobs in Redis are automatically reclaimed by BullMQ's built-in lock watchdog.

### 14.2 Graceful Shutdown

- On `SIGTERM` / `SIGINT`:
  1. BullMQ workers call `worker.close()`, refusing new jobs and allowing in-flight jobs up to 10 seconds to finish.
  2. Redis connections are cleanly disconnected (`client.quit()`).
  3. Process exits with exit code 0.

### 14.3 Disaster Recovery for Stalled Outbox Records

- A periodic scheduled audit query identifies rows stuck in `PENDING` for $> 15$ minutes:
  ```sql
  SELECT id, topic, retry_count, created_at
  FROM outbox_events
  WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '15 minutes';
  ```
  Alerts DevOps and triggers automatic relay re-queuing.

---

## 15. Decisions Requiring Stakeholder Approval

The following items are deferred pending formal architectural gates:

1. **`TECH-DEC-01` / `D-12` (Provisional ORM Decision):**  
   Whether outbox repository queries will use raw `pg` parameterized queries or an approved query builder/ORM.
2. **`DEC-05` (Physical Precision & Storage Matrix):**  
   Confirmation of JSONB column indexing and partition strategy for high-volume historical outbox records.
3. **`BIZ-Q01` / `BIZ-Q02` / `BIZ-Q03` Sign-Off:**  
   Formal sign-off of Milestone 0.4 physical database schema DDL.

---

## 16. Implementation Readiness Assessment

```
+---------------------------------------------------------------------------------------------------+
| Feature: FEAT-FOUND-04 — Transactional Outbox & BullMQ Engine                                    |
| Current Status: PREP_READY                                                                        |
+---------------------------------------------------+-----------------------------------------------+
| Component                                         | Readiness / Status                            |
+---------------------------------------------------+-----------------------------------------------+
| Domain Event Envelope & Validation                | IMPLEMENTED & VERIFIED (packages/shared)       |
| Secret Scrubbing & Redaction Guard                | IMPLEMENTED & VERIFIED (packages/shared)       |
| Outbox Interfaces & Storage Ports                 | IMPLEMENTED & VERIFIED (packages/shared)       |
| Error Categorization (Retryable vs NonRetryable)   | IMPLEMENTED & VERIFIED (packages/shared)       |
| Idempotency Storage Port & Handler Contracts      | IMPLEMENTED & VERIFIED (packages/shared)       |
| Worker Config & Zod Validation                    | IMPLEMENTED & VERIFIED (apps/worker)          |
| Redis Connection & BullMQ Queue Configuration     | IMPLEMENTED & VERIFIED (apps/worker)          |
| Idempotent EventProcessor Engine                  | IMPLEMENTED & VERIFIED (apps/worker)          |
| Worker Lifecycle & Graceful Shutdown              | IMPLEMENTED & VERIFIED (apps/worker)          |
| Physical outbox_events DDL & Migration Scripts    | BLOCKED (Awaiting Milestone 0.4 Gate Approval) |
| PostgreSQL SQL Outbox Repository                  | BLOCKED (Awaiting Milestone 0.4 Gate Approval) |
| Active Database Polling Relay Loop                | BLOCKED (Awaiting Milestone 0.4 Gate Approval) |
+---------------------------------------------------+-----------------------------------------------+
```

_End of Transactional Outbox Engine & BullMQ Worker Architecture Specification._
