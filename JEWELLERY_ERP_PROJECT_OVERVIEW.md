# Jewellery ERP Platform — Complete Backend-Oriented Project Overview

> **Neutralized greenfield reference copy:** Organization branding, organization-specific hostnames, vendor naming, and selected sample store identifiers have been generalized for the new project. The technical and business content remains a reference input and must be validated as requirements; it is not proof that an existing implementation has been inspected or verified.

> **Greenfield implementation authority:** This file preserves technology and architecture notes from the source reference for context only. The new implementation must follow the approved project baseline: **Next.js + TypeScript frontend, Express 5 + TypeScript backend, PostgreSQL, and the approved modular-monolith architecture**. In particular, do not scaffold NestJS or copy NestJS-specific structures simply because they are mentioned below.

## 0. Project Identity

- **Project:** Jewellery Enterprise Resource Planning (ERP)
  Platform
- **Environment:** UAT/staging (`erp.uat.example.com`)
- **Frontend:** Next.js
- **Backend:** TypeScript + NestJS
- **Database:** PostgreSQL
- **ORM:** TypeORM
- **Async infrastructure:** Redis + BullMQ
- **Authentication:** SSO / JWT
- **Authorization:** RBAC + policy-based permissions
- **Object storage:** S3-style storage
- **API documentation:** Swagger / OpenAPI
- **Architecture:** Modular monolith with asynchronous queue workers
- **Business:** Jewellery procurement, QC, inventory, RFID, storage,
  pricing, sales/buyback, accounting, reporting and administration
- **Observed active branch:** Jewellery ERP Platform — Platinum Division / Store
  (STORE001)
- **Other branch/store contexts:** Jewellery ERP Platform — Silver Division / Store,
  Canada Region / Store
- **Vendor shown in GitLab footer:** [Vendor name omitted in neutralized copy]
- **Observed repositories:** `Admin.Portal`, `Cluster.Portal`, `ERP`,
  `Backend.Api.Suite`, `Backend.Deployment`, `Apps`, `Portal`
- **Observed application version:** `v6.1.170-live-fix-4801.2`

---

# 1. Executive Summary

The Jewellery ERP Platform is an enterprise jewellery ERP platform. It is not
merely an e-commerce application. The backend manages the lifecycle of
high-value physical jewellery assets across procurement, receiving,
quality inspection, product classification, purity verification,
gemstone information, SKU identification, RFID tagging, stock storage,
approval, pricing, sales/buyback, accounting and reporting.

The backend is built with **TypeScript and NestJS** and uses
**PostgreSQL + TypeORM** for durable transactional business data.
**Redis + BullMQ** are used for asynchronous processing, especially
RFID-related operational jobs. Authentication is based on an SSO/JWT
session model, while authorization is implemented through roles and
granular policies/permissions. Documents and attachments use an S3-style
object-storage layer.

The most accurate architectural description is:

> **A modular NestJS monolith with PostgreSQL as the transactional
> source of truth and Redis/BullMQ-based asynchronous workers for
> operational jobs.**

It should not be described as microservices simply because it has many
NestJS modules and queue processors.

---

# 2. Business Problem

Ordinary retail inventory can often be represented as:

```text
Product → SKU → Quantity → Price → Sale
```

Jewellery inventory requires much richer traceability:

```text
Supplier
  ↓
Procurement / GRN
  ↓
Shipment / Intake
  ↓
Gross & Net Weight
  ↓
Quality Check
  ↓
Material + Purity
  ↓
Gemstone Details
  ↓
SKU
  ↓
RFID
  ↓
Storage Location
  ↓
Approval
  ↓
Sellable Inventory
  ↓
Pricing
  ↓
Sale / Buyback
  ↓
Accounting / Reporting
```

The backend therefore has to manage both **digital business records**
and the identity/state of **physical high-value assets**.

The central business question is not only "how many products exist?" but
also:

- Which physical item is this?
- Which SKU identifies it?
- Which GRN introduced it?
- Which supplier provided it?
- What are its material and purity characteristics?
- What is its measured weight?
- What gemstone information is associated with it?
- Which RFID identifies it?
- Where is it stored?
- What is its current business state?
- Who processed or approved it?
- Which branch/store owns or operates against it?

---

# 3. Complete Functional Scope

The observed platform contains:

- Dashboard
- Suppliers
- Customers
- Pricing
- Inventory
- Accounts & Billing
- Reports
- Settings
- Back Office
- Admin Area
- Categories
- Subcategories
- Products
- Materials
- Purity
- Gemstones
- Procurement / Stock Intake
- GRN
- Shipments
- Quality Checks
- RFID Tag Generation
- RFID Jobs
- Stock Management / Catalog
- Vaults
- Lockers
- Compartments
- Stock Approval
- Daily Stock Audit Ledger
- Analytics
- RFID Analytics
- Mail Triggers
- Users / Employees
- Roles
- RBAC / Permissions
- Store / Branch Setup
- Members
- Exchange
- Buyback Pricing
- Mobile Buyback Flow
- Accounting
- Treasury

---

# 4. High-Level Architecture

```text
                         ┌──────────────────────────┐
                         │       Next.js Frontend   │
                         │       ERP Web Portal     │
                         └────────────┬─────────────┘
                                      │ HTTPS / REST
                                      ▼
                         ┌──────────────────────────┐
                         │      NestJS Backend      │
                         │      TypeScript APIs     │
                         │                          │
                         │ Controllers              │
                         │ DTOs                     │
                         │ Guards                   │
                         │ Services                 │
                         │ Modules                  │
                         │ Interceptors             │
                         │ Decorators               │
                         └──────┬────────┬──────────┘
                                │        │
                ┌───────────────┘        └─────────────────┐
                ▼                                          ▼
       ┌──────────────────┐                       ┌──────────────────┐
       │    PostgreSQL    │                       │      Redis       │
       │                  │                       │                  │
       │ Transactional DB │                       │ BullMQ Backend   │
       │ Master Data      │                       │ Queue State      │
       │ Inventory        │                       └────────┬─────────┘
       │ QC / Pricing     │                                │
       │ Users / RBAC     │                                ▼
       └──────────────────┘                       ┌──────────────────┐
                                                  │ Queue Workers    │
                                                  │ / Processors     │
                                                  └────────┬─────────┘
                                                           │
                                                           ▼
                                                  RFID / Operational
                                                     Processing

       ┌────────────────────────────────────────────────────────┐
       │             S3-Style Object Storage                   │
       │ Customer/Supplier/QC/Billing/Payment Attachments     │
       └────────────────────────────────────────────────────────┘
```

---

# 5. Architectural Style: Modular Monolith

The backend is best understood as a modular monolith.

A modular monolith means the business domains are separated into NestJS
modules while the primary application remains one deployable backend
unit.

Examples of domain modules include:

- Auth
- Product
- Category
- Subcategory
- Material
- Purity
- Stones
- Inventory
- Accounting
- Treasury
- Analytics
- RFID
- RFID Analytics
- Locations
- Mail Trigger
- Health
- Bootstrap

The benefit is strong separation of business responsibilities without
the operational complexity of independently deployed microservices.

The application also has asynchronous workers/queues, so synchronous API
execution and asynchronous processing coexist.

---

# 6. Repository / Source Organization

The recorded source structure is organized roughly as:

```text
src/
├── db/
├── dtos/
├── entities/
├── modules/
│   ├── accounting/
│   ├── analytics/
│   ├── auth/
│   ├── bootstrap/
│   ├── category/
│   ├── health/
│   ├── inventory/
│   ├── locations/
│   ├── mailtrigger/
│   ├── material/
│   ├── product/
│   ├── purity/
│   ├── stones/
│   ├── treasury/
│   ├── sub-category/
│   └── rfid/
│       └── rfid-analytics/
│
├── queues/
│   ├── consumers/
│   ├── processors/
│   ├── indexes/
│   ├── queue.commands.txt
│   ├── queue.index.ts
│   └── queue.job.options.ts
│
├── shared/
│   ├── cache/
│   ├── decorators/
│   ├── enums/
│   ├── guards/
│   ├── helper/
│   ├── interceptors/
│   ├── storage/
│   └── transformers/
│
├── app.configuration.ts
├── app.constants.ts
├── app.controller.ts
├── app.module.ts
├── app.redis.module.ts
├── app.service.ts
├── app.swagger.ts
└── main.ts
```

This organization separates domain modules from shared infrastructure
and asynchronous processing.

---

# 7. Technology Responsibilities

Technology Responsibility

---

Next.js ERP frontend and user interaction
TypeScript Strong typing across backend
NestJS Backend framework and dependency injection
PostgreSQL Durable transactional data
TypeORM ORM / persistence abstraction
Redis Queue infrastructure and fast operational state
BullMQ Background job orchestration
JWT / SSO Authentication and session identity
RBAC / Policies Authorization
Swagger/OpenAPI API documentation
Multer Multipart/file handling
S3-style storage Binary documents and attachments

---

# 8. Backend Request Lifecycle

A protected synchronous request follows approximately:

```text
Next.js
  ↓
HTTPS / REST
  ↓
NestJS
  ↓
JWT Authentication
  ↓
JwtAuthGuard
  ↓
Identity Extraction
  ↓
Policy / Permission Authorization
  ↓
DTO Validation
  ↓
Controller
  ↓
Service
  ↓
TypeORM
  ↓
PostgreSQL
  ↓
Response Transformation
  ↓
HTTP Response
  ↓
Next.js
```

The controller should coordinate HTTP concerns, while business rules
belong primarily in services/domain logic.

---

# 9. TypeScript + NestJS Backend

TypeScript provides compile-time safety, typed contracts and
maintainability across a large codebase.

NestJS provides:

- modules;
- dependency injection;
- controllers;
- services;
- guards;
- decorators;
- interceptors;
- configuration;
- Swagger integration;
- framework lifecycle management.

The project uses these features to keep business modules separated from
infrastructure concerns.

---

# 10. PostgreSQL + TypeORM

PostgreSQL is the primary transactional store because the domain has
strong relationships and consistency requirements.

Important relational domains include:

- suppliers;
- customers;
- products;
- categories;
- subcategories;
- materials;
- purity;
- gemstones;
- GRNs;
- shipments;
- QC records;
- inventory;
- storage;
- users;
- roles;
- permissions;
- pricing;
- accounting;
- treasury.

TypeORM provides the application persistence abstraction through
entities, repositories/data sources and migrations.

The datasource configuration uses environment-driven PostgreSQL settings
such as host, port, username, password and database.

Database initialization is explicit. A failure to establish the database
connection is treated as an application startup failure rather than
allowing a broken application to appear healthy.

---

# 11. Database Migrations

The TypeORM setup contains migration configuration.

Migrations provide controlled schema evolution:

```text
Schema v1
   ↓
Migration 001
   ↓
Schema v2
   ↓
Migration 002
   ↓
Schema v3
```

For production systems, migrations are preferable to uncontrolled
automatic schema synchronization because schema changes should be
versioned and reviewable.

If an interviewer asks about a `synchronize` setting seen in an
environment configuration, the production behavior should be described
only from the actual deployed configuration rather than assumed from
development configuration.

---

# 12. Redis + BullMQ

Redis is used as infrastructure for asynchronous processing, and BullMQ
provides the job queue abstraction.

The queue structure contains:

```text
queues/
├── consumers/
├── processors/
├── indexes/
├── queue.commands.txt
├── queue.index.ts
└── queue.job.options.ts
```

The conceptual flow is:

```text
API
 ↓
Queue Producer
 ↓
BullMQ
 ↓
Redis
 ↓
Worker / Consumer
 ↓
Processor
 ↓
Business Operation
```

This prevents long-running operational tasks from blocking normal HTTP
requests.

---

# 13. Why Asynchronous Processing Is Important

A physical RFID printing workflow is not a good candidate for a long
synchronous HTTP request.

Bad pattern:

```text
HTTP request
 ↓
Talk to printer/local client
 ↓
Wait
 ↓
Print
 ↓
Return response
```

Better pattern:

```text
HTTP request
 ↓
Validate
 ↓
Create job
 ↓
Queue
 ↓
Return acknowledgement

Worker
 ↓
Process job
 ↓
Local client / printer
 ↓
Update job status
```

Advantages:

- shorter API response time;
- failure isolation;
- retry capability;
- job visibility;
- independent worker processing;
- better handling of intermittent operational devices.

---

# 14. S3-Style Object Storage

The storage abstraction organizes objects by business entity.

Examples observed:

```text
CUSTOMERS/ATTACHMENTS/{CUSTOMER_ID}/{FILE}
```

```text
SUPPLIERS/ATTACHMENTS/{SUPPLIER_ID}/{FILE}
```

```text
STOCK_CATALOGS/{PRODUCT_CODE}/{SKU_CODE}/QUALITY_CHECK_ATTACHMENTS/{FILE}
```

```text
PAYMENT_RECEIPTS/{FILE}
```

```text
BILLING_DOCUMENTS/{FILE}
```

The recommended architectural model is:

```text
PostgreSQL
  → metadata / relationship / object key

Object Storage
  → actual binary content
```

This keeps the relational database focused on transactional data.

---

# 15. Multi-Branch / Multi-Tenant Architecture

The active branch is:

```text
Jewellery ERP Platform — Platinum Division / Store
STORE001
```

Other visible stores/tenants include:

```text
Jewellery ERP Platform — Silver Division / Store
Canada Region / Store
```

The store configuration includes:

- store code;
- email;
- contact person;
- province;
- postal code;
- Head Office System GUID.

A store-aware request can conceptually be modeled as:

```text
User Identity
   +
Store Context
   +
Role
   +
Permission
   ↓
Authorized Business Operation
```

This is especially important for inventory and operational records.

---

# 16. SSO / JWT Authentication

Browser/session data shows an SSO-oriented authentication model with
keys such as:

```text
_sso_access_token
_sso.navigation
_sso.store
_sso.timestamp
login_time
myStores
```

The access token is JWT-based.

Authentication answers:

> Who is the caller?

Authorization answers:

> What is the caller allowed to do?

These must remain separate concerns.

---

# 17. JWT Guard

The backend contains a shared JWT guard:

```text
shared/guards/jwt-auth.guard.ts
```

The observed guard validates the token and constructs identity/session
context from payload information such as:

```text
payload.code
payload.session
```

The security flow is:

```text
Authorization: Bearer <token>
        ↓
JWT verification
        ↓
Payload
        ↓
Identity / session context
        ↓
Protected request
```

Invalid authentication should stop before business logic is executed.

---

# 18. RBAC and Policy Authorization

The system uses granular permissions rather than a simple `isAdmin`
check.

A policy can look like:

```text
ADMIN.PRODUCT.MASTER.CATEGORIES.CREATE
```

Other observed permission concepts include:

- create supplier profile;
- view supplier profile;
- update supplier profile;
- delete supplier profile;
- view daily retail pricing;
- delete goods receipt record;
- customer profile operations;
- customer address operations.

This allows authorization at the operation level.

---

# 19. Role Model

Observed roles include:

```text
mj.role.store.admin
mj.role.store.manager
mj.role.store.accountant
mj.role.store.inventory.controller
mj.role.store.sales.executive
```

The role detail page exposes a permission tree with module-level counts
such as:

```text
Suppliers: 37
Customers: 12
Pricing: 3
```

The model is:

```text
User
 ↓
Role
 ↓
Permission Set
 ↓
Policy
 ↓
Operation
```

This is useful for segregation of duties.

---

# 20. Declarative Authorization

Controllers can declare required policy metadata through custom
decorators.

Conceptually:

```text
Controller endpoint
      ↓
Required policy metadata
      ↓
Authorization guard
      ↓
User permissions
      ↓
Allow / Deny
```

This keeps permission logic out of individual controllers and services.

---

# 21. RBAC APIs

The Swagger API documentation exposes endpoints such as:

```text
GET /api/v1/roles/{id}
```

```text
GET /api/v1/RBAC/get.iam.role.permissions
```

```text
GET /api/v1/RBAC/get.iam.ui.navigation.tree
```

```text
GET /api/v1/RBAC/get.rbac.role.permissions
```

The navigation tree and policy tree also influence the frontend
experience.

However, hiding UI controls is not the security boundary; the backend
must enforce permissions independently.

---

# 22. Global Administrator

Back Office user management contains a `Global Administrator`
capability.

This represents a higher privilege level than normal store-specific
roles.

Conceptually:

```text
Store User
 → Store Role
 → Store Permissions

Global Administrator
 → Elevated system-wide privileges
```

---

# 23. Dashboard Backend Responsibilities

Dashboard information includes:

### Financial KPIs

- Total Sales
- Taxes
- Profit
- Invoice Due
- Total Expenses
- Total Payment Returns

### Business counts

- Suppliers
- Customers
- Users

### Storage counts

- Vaults
- Lockers
- Compartments

### Pricing

- Daily Retail Sale Price
- Buyback Purchase Price

The backend should aggregate these metrics rather than forcing the
browser to reconstruct them from raw transactional data.

---

# 24. Supplier Domain

Supplier master data includes:

- supplier name;
- alias;
- email;
- phone;
- entity type;
- contact person;
- alternate contact;
- permanent address;
- current address;
- country;
- state;
- city;
- postal code;
- attachments.

Entity types include:

```text
Individual
Corporation
Partnership
Sole Proprietor / Proprietorship
```

The supplier domain therefore combines identity, contact, address and
document management.

---

# 25. Customer Domain

Customer functionality includes:

- create customer;
- view customer;
- update customer;
- deactivate/delete customer;
- create address;
- customer code;
- email;
- phone;
- status;
- customer tags.

Observed tags include:

```text
Frequent Buyer
Loyal Customer
```

Customer permissions are separately represented in RBAC.

---

# 26. Pricing Domain

Pricing is a first-class business module.

The UI divides market rates into:

```text
Retail Sale
Buy Back
```

Metal types include:

```text
One Gold
Platinum
Silver
```

Gold purity examples:

```text
24K → 99.99%
22K → 91.60%
21K → 87.50%
18K → 75.00%
14K → 58.30%
```

Platinum includes:

```text
PLAT 95 → 95.00%
```

Pricing fields include:

- Purity;
- Percentage;
- Rate;
- Spot Price;
- Adjustment Price.

---

# 27. Conceptual Pricing Calculation

The business calculation can be thought of as:

```text
Market / Spot Rate
      ↓
Metal
      ↓
Purity Percentage
      ↓
Weight
      ↓
Adjustment
      ↓
Business Pricing Rules
      ↓
Final Value
```

The exact production formula should only be stated when verified from
the implementation.

---

# 28. Buyback Flow

The system supports mobile doorstep gold buyback.

The mobile flow asks:

```text
Do you want to proceed with these prices?
```

with:

```text
Cancel
Proceed
```

The conceptual flow is:

```text
Configured Buyback Rate
        ↓
Backend Calculation
        ↓
Mobile Buyback Application
        ↓
Customer Confirmation
        ↓
Transaction
```

---

# 29. Product Master

Product master data contains:

- categories;
- subcategories;
- products;
- materials;
- gemstones;
- purity.

Master data is separated from transactional inventory so reusable
definitions are not duplicated across every inventory record.

---

# 30. Categories

Observed categories:

```text
Silver Jewellery (SJ)
Gold Jewellery (GJ)
Diamond Jewellery (DJ)
```

---

# 31. Subcategories

Examples:

```text
Beads
Gold Bracelet
Silver Ring
Gold Ring
Earrings
Rings
Necklace
```

Relationship:

```text
Category
  ↓
Subcategory
  ↓
Product
```

---

# 32. Products

Observed product definitions include:

```text
MJPROD/C1  Diamond Necklace
MJPROD/B9  Silver Earring
MJPROD/G6  Gold Necklace
MJPROD/S2  Silver Hoop Earrings
MJPROD/B1  Gold Engagement Ring
MJPROD/A9  Lab-Grown Diamond Necklace
```

A product is a master definition; it should not be confused with a
specific physical inventory SKU.

---

# 33. Materials

Material master includes:

```text
One Gold (OG)
Platinum (PL)
Silver (SI)
```

Material is a separate domain concept from product category.

---

# 34. Purity Master

Purity is explicitly modeled and associated with material.

Gold:

```text
14K → 58.30%
18K → 75.00%
21K → 87.50%
22K → 91.60%
24K → 99.99%
```

Platinum:

```text
PLAT 95 → 95.00%
```

Purity records are active and filterable by material.

---

# 35. Gemstone Master

Observed gemstones include:

```text
Lab-Grown Diamond
Subha
Diamond-1
Dimond
Emerald
Turquoise
Ruby
Natural Pearl
```

Classification includes examples such as:

```text
Precious
Synthetic-and-graded
Semi-precious
```

---

# 36. Procurement / GRN

The procurement workflow begins with Goods Receipt Notes.

GRN records include:

- GRN number;
- supplier;
- received by;
- received date;
- status.

Examples include:

```text
MJ-IS-GRN-2607-001
MJ-IS-GRN-2607-002
MJ-IS-GRN-2607-003
MJ-IS-GRN-2607-004
```

Historical records also span June and July 2026.

---

# 37. GRN Status

Observed states include:

```text
Draft
In Progress
Closed
```

A stateful workflow is required because the permitted operations can
change based on state.

For example, a closed GRN should not behave like a draft GRN.

---

# 38. Shipment Data

Shipment cards can contain:

- invoice number;
- delivery reference number;
- shipment description/name;
- gross weight;
- quantity;
- labour charge;
- total price;
- assigned staff;
- assigned-by user.

Example descriptions include:

```text
Trishla lot
Turkish lot
```

The relationship is:

```text
Supplier
 ↓
GRN
 ↓
Shipment
 ↓
Inventory Items
```

---

# 39. Intake Form

Inventory intake requires fields such as:

- Received By;
- Intake Date;
- Delivery Reference No.;
- Measured Gross Weight (GM);
- Quantity;
- Total Price (CAD\$).

These are required at the API/business boundary as well as the frontend.

Frontend validation improves UX; backend validation is authoritative.

---

# 40. Staff Assignment

Staff can be assigned to procurement/intake workflows.

Observed employees include:

```text
Abhishek Sharma (M10001)
Sanjeleet Pradhan (M10006)
Ashutosh Dash (M10014)
```

Assignment and `Assigned By` data support operational accountability.

---

# 41. Quality Check Overview

QC is the transition between received inventory and validated inventory.

A shipment-level QC summary can contain:

- Intake count;
- Approved count;
- Rejected count;
- Pending count;
- Published count;
- Gross Weight;
- Net Weight;
- Labour Charge;
- Total Price;
- Assigned Staff.

This is operational aggregation over item-level QC records.

---

# 42. QC Item-Level Data

An item-level QC record includes:

- Item number;
- SKU;
- Product;
- QC weight;
- Status;
- Published state;
- Actions.

Observed examples:

```text
B10000C2  Gold Engagement Ring  One Gold / 24K  10gm/10gm
B10000C3  Gold Engagement Ring  One Gold / 21K  10gm/10gm
B20000C4  Silver Hoop Earrings Silver / 925    3gm/3gm
B60000C5  Gold Necklace         One Gold / 24K  10gm/10gm
```

---

# 43. QC Details

Per-item QC can capture:

### Specimen / Origin

Examples:

```text
Dubai
Turkish
Karachi
```

### Purity

Examples:

```text
24K
21K
925 / 92.50
```

### Measured Weight

Measured net/gross values are entered and validated.

### Accumulated Price

Additional costs can be manually recorded.

### Gemstone Details

Stone-related records can be associated with the item.

---

# 44. QC State Model

The observed system uses concepts such as:

```text
Draft
Pending
Approved
Rejected
Published
```

A conceptual state machine is:

```text
Draft
  ↓
Inspection / Pending
  ├───────────────┐
  ↓               ↓
Approved        Rejected
  ↓
Published
```

The actual allowed transitions must follow the implemented business
rules.

---

# 45. Weight Tracking

Jewellery weight is a critical business attribute.

The system distinguishes concepts such as:

- Gross Weight;
- Net Weight;
- Measured Gross Weight;
- Measured Net Weight;
- QC Weight.

This allows the platform to preserve the difference between
supplier/receipt values and physically measured/verified values.

---

# 46. Jewellery Traceability

The system can conceptually trace an item through:

```text
Supplier
 ↓
GRN
 ↓
Shipment
 ↓
QC
 ↓
Product
 ↓
SKU
 ↓
RFID
 ↓
Storage
 ↓
Approval
 ↓
Inventory
```

This is the central backend value of the ERP.

---

# 47. RFID Tag Generation

The RFID module has a dedicated job screen.

It supports:

- RFID job listing;
- job filtering;
- job source selection;
- GRN selection;
- shipment selection;
- local client selection;
- triggering a local print job.

The page includes a `Trigger Local Print Job` operation.

---

# 48. RFID Job Types

Observed job types include:

```text
QualityCheck.RFIDTagging
DamagedTag/Relocation.RFIDTagging
```

This shows RFID is part of both initial inventory identification and
later operational maintenance.

---

# 49. RFID Job Identity

Observed IDs resemble:

```text
#AI-TAG-STORE001-2607-009
```

The identifier carries business context such as store/date/sequence
information.

The exact generation algorithm should be explained only if verified in
the source code.

---

# 50. RFID Job Metadata

Jobs expose information such as:

- job type;
- host/device;
- SKU summary;
- processed count;
- failed count;
- cancelled count;
- executed count;
- status;
- created by;
- updated by;
- timestamps.

Example host metadata:

```text
LAPTOP-K074QR9M
```

This provides operational visibility into physical-device processing.

---

# 51. RFID Job Lifecycle

Observed statuses include:

```text
Printing
Completed
```

A broader conceptual lifecycle is:

```text
Created
 ↓
Queued
 ↓
Processing
 ↓
Printing
 ↓
Completed
```

Failure and cancellation paths should be explained according to the
actual queue configuration.

---

# 52. RFID Local Printing Architecture

The presence of a local client means the cloud/backend service should
not assume direct browser-to-printer access.

The operational model can be represented as:

```text
Next.js
 ↓
NestJS API
 ↓
BullMQ / Redis
 ↓
Worker
 ↓
Local Print Client
 ↓
RFID Printer
```

The API remains responsive while the operational process occurs
asynchronously.

---

# 53. Why RFID Is a Strong Backend Interview Topic

RFID demonstrates several backend engineering principles simultaneously:

- asynchronous processing;
- job lifecycle management;
- external/local integration;
- physical asset identity;
- failure handling;
- operational observability;
- retry considerations;
- idempotency considerations;
- store-aware job identity.

It is a better technical discussion than presenting only CRUD endpoints.

---

# 54. Stock Management / Jewellery Catalog

The stock management page represents the actual jewellery
collections/inventory catalog.

Observed tabs:

```text
Inventory InStock
QC Under Inspection
Out of Stock
```

The search supports:

```text
SKU
RFID Tag
```

Cards can display:

- RFID tag number;
- specimen/origin;
- metal;
- purity;
- product group;
- gemstone grading.

---

# 55. Gemstone Grading in Final Catalog

The final catalog can expose richer gemstone information such as:

```text
Natural Pearl
Princess Cut
Flawless Clarity
D1 Color
```

This demonstrates that the final catalog representation may contain more
complete information than an early QC state.

An observed difference between the QC screen ("no stone details found")
and final catalog gemstone information should not automatically be
labeled a bug. Possible explanations include lifecycle timing, different
API projections, later enrichment, asynchronous synchronization or UAT
data differences. The correct engineering response is to trace the API
and data source before concluding.

---

# 56. Storage Model

The dashboard exposes:

```text
Vaults
Lockers
Compartments
```

Inventory placement can be modeled as:

```text
Inventory Item
   ↓
Vault
   ↓
Locker
   ↓
Compartment
```

This maps a digital inventory record to its physical custody location.

---

# 57. Stock Approval

The stock workflow contains states such as:

```text
Approval Pending
```

This separates:

```text
Inventory processed
```

from:

```text
Inventory approved for operational availability
```

For high-value goods, controlled approval reduces the risk of unverified
stock becoming sellable immediately.

---

# 58. Daily Stock Audit Ledger

The system contains an `Inventory Daily Stock Audit Ledger`.

A current inventory record answers:

> What is the state now?

An audit ledger helps answer:

> What happened historically?

For enterprise inventory, both current state and historical
accountability are important.

---

# 59. Complete Inventory Lifecycle

```text
Supplier
 ↓
Procurement
 ↓
GRN
 ↓
Shipment
 ↓
Intake
 ↓
Quality Check
 ↓
Material / Purity / Weight / Gemstones
 ↓
SKU
 ↓
RFID Tagging
 ↓
Stock Check-In
 ↓
Storage Placement
 ↓
Approval
 ↓
Inventory In Stock
 ↓
Sale / Buyback / Relocation / Audit
```

This is the primary domain workflow to explain in interviews.

---

# 60. Damaged RFID and Relocation

The `DamagedTag/Relocation.RFIDTagging` job type shows that RFID
identity is operationally maintainable.

Real-world inventory can require:

- replacing damaged tags;
- relocating physical items;
- re-tagging assets;
- preserving the item's identity while changing its physical
  representation.

The backend must therefore distinguish between the physical item and the
tag operation performed against it.

---

# 61. Product vs SKU vs RFID

These identifiers have different responsibilities.

### Product

Reusable master definition.

Example:

```text
MJPROD/B1 — Gold Engagement Ring
```

### SKU

Inventory-level identifier.

Example:

```text
B10000C2
```

### RFID

Physical identification/tag associated with an inventory asset.

The conceptual hierarchy is:

```text
Product Definition
      ↓
Inventory SKU
      ↓
RFID Identity
```

---

# 62. Accounts & Billing

The platform includes Accounts & Billing and related financial modules.

Observed financial concepts include:

- sales;
- taxes;
- profit;
- invoice due;
- expenses;
- payment returns;
- billing documents;
- payment receipts.

The exact accounting posting logic should only be claimed when verified
from the accounting implementation.

---

# 63. Treasury

A dedicated Treasury module exists.

Treasury should be treated as a separate financial domain from inventory
logic.

This separation allows financial operations to evolve independently of
product/inventory workflows.

---

# 64. Analytics

The backend contains an Analytics module with dashboard-summary
behavior.

The conceptual flow is:

```text
Transactional Data
 ↓
Aggregation
 ↓
Business Metrics
 ↓
Dashboard / Reports
```

Analytics logic should ideally remain separated from transactional
mutation logic.

---

# 65. RFID Analytics

A dedicated RFID Analytics module exists.

RFID analytics can use operational metrics such as:

- processed jobs;
- failed jobs;
- cancelled jobs;
- executed jobs;
- completion state;
- processing timestamps.

Keeping this domain separate avoids mixing operational RFID reporting
into every inventory query.

---

# 66. Mail Trigger Module

The backend contains a mail-trigger module.

The conceptual architecture is:

```text
Business Event
 ↓
Notification Trigger
 ↓
Mail Module
 ↓
Email Delivery
```

This keeps notification logic from being scattered through unrelated
business services.

---

# 67. Back Office

Back Office handles organizational administration.

Observed areas include:

- Users / Employees;
- Members;
- Exchange.

The user form includes:

- first name;
- last name;
- gender;
- date of birth;
- email;
- primary mobile;
- alternate mobile;
- Global Administrator capability.

---

# 68. Store / Branch Setup

Store setup includes:

- code;
- email;
- contact person;
- province;
- postal code;
- Head Office System GUID.

Observed codes include:

```text
STORE001
STORE002
STORE003
```

The branch switcher and store configuration support the multi-branch
operating model.

---

# 69. Swagger / API Documentation

Swagger/OpenAPI is integrated into the backend.

Observed decorators include:

```text
@ApiBearerAuth()
@ApiOperation(...)
```

Swagger is useful for:

- API contract visibility;
- frontend/backend coordination;
- QA testing;
- developer onboarding;
- authenticated endpoint testing;
- documentation.

---

# 70. Controllers

A category controller example exposes endpoints conceptually such as:

```text
POST /categories
POST /categories/generate-code
```

The controller receives request/response context, DTOs and identity,
then delegates to the category service.

The intended architecture is:

```text
HTTP
 ↓
Controller
 ↓
Service
 ↓
Persistence
```

not controller-heavy business logic.

---

# 71. DTOs

Observed DTO examples include:

```text
CategoryDto
GenerateCodeDto
GetCategoryListDto
```

DTOs provide a boundary for:

- request shape;
- typing;
- validation;
- API documentation;
- separation from persistence entities.

The backend must validate inputs even if the Next.js form already
performs client-side validation.

---

# 72. Guards

The shared guard layer includes JWT authentication.

Guards are suitable for cross-cutting access control because they
execute before controller business logic.

The security flow is:

```text
Request
 ↓
JWT Guard
 ↓
Policy Guard / Authorization
 ↓
Controller
```

---

# 73. Decorators

Shared/custom decorators provide reusable metadata and request-context
behavior.

Policy decorators allow authorization requirements to be declared close
to the endpoint definition.

This is preferable to hardcoding permission checks throughout service
methods.

---

# 74. Interceptors

The shared interceptor layer contains behavior such as:

```text
trim-string.interceptor.ts
```

This is a cross-cutting normalization concern.

Centralizing it avoids duplicating string-normalization logic across
controllers.

---

# 75. Transformers

The shared transformer layer can separate persistence representation
from API/application representation.

Conceptually:

```text
Database Entity
 ↓
Transformer
 ↓
API Representation
```

This avoids leaking database-specific representation decisions
throughout the application.

---

# 76. Cache Infrastructure

A shared cache layer exists.

Good cache candidates can include relatively stable master data such as:

- categories;
- materials;
- purity;
- gemstones;
- permissions/navigation where invalidation is controlled.

Highly mutable transactional state such as live inventory, financial
balances or active job state should not be cached casually because
consistency becomes the main challenge.

---

# 77. Configuration

Configuration is separated through application configuration/constants
and environment variables.

Sensitive values such as:

- database credentials;
- Redis credentials;
- storage credentials;
- service URLs;

should remain environment-driven rather than hardcoded.

---

# 78. Master Data vs Transactional Data

This distinction is fundamental.

### Master Data

- Categories
- Subcategories
- Products
- Materials
- Purity
- Gemstones
- Stores
- Roles
- Permissions

### Transactional Data

- GRNs
- Shipments
- QC records
- RFID jobs
- Inventory changes
- Pricing operations
- Sales
- Payments
- Audits

Master data defines what the system understands.

Transactional data records what actually happened.

---

# 79. State Management

The application contains multiple business states.

Examples:

### GRN

```text
Draft
In Progress
Closed
```

### QC

```text
Draft
Pending
Approved
Rejected
Published
```

### RFID

```text
Printing
Completed
```

### Stock

```text
QC Under Inspection
In Stock
Out of Stock
Approval Pending
```

These states represent business transitions, not merely presentation
labels.

---

# 80. Business-State Validation

A user can have permission to perform an action and still be unable to
perform it because the entity is in the wrong state.

For example:

```text
Authenticated
 ↓
Has QC approval permission
 ↓
Item is already rejected
 ↓
Approval is still invalid
```

Therefore:

```text
Authentication
≠ Authorization
≠ Business-state validity
```

All three must be enforced separately.

---

# 81. Transactional Integrity

Some workflows contain multiple dependent database changes.

Example concept:

```text
Approve QC
 ↓
Update QC state
 ↓
Update inventory state
 ↓
Create/associate downstream record
```

If these changes must be atomic, they should be considered for a
database transaction.

The exact transaction boundaries must follow the real implementation.

---

# 82. Concurrency

Inventory is shared state, so concurrent operations are possible.

Example:

```text
User A → Approves SKU
User B → Relocates SKU
Worker → Processes RFID job
User C → Updates inventory
```

A production backend should consider:

- state validation;
- transaction boundaries;
- unique constraints;
- concurrency control;
- duplicate operations;
- safe queue processing.

The exact locking mechanism should only be claimed when verified in
code.

---

# 83. Idempotency

RFID and other operational jobs can be retried.

A production design should consider:

- unique job IDs;
- duplicate-request detection;
- SKU/RFID uniqueness;
- state checks before processing;
- safe retries;
- avoiding duplicate physical operations.

For example, a completed RFID operation should not blindly print the
same tag again because a worker was restarted.

The exact idempotency implementation must be verified before presenting
it as an implemented feature.

---

# 84. Error Handling Model

The backend should distinguish:

### Validation Error

Request data is invalid.

### Authentication Error

Credentials/token are invalid.

### Authorization Error

Identity lacks permission.

### Not Found

Entity does not exist.

### Business-State Error

Operation is invalid in the current state.

### Infrastructure Error

Database, Redis, storage or operational dependency failed.

A production API should return appropriate HTTP semantics without
exposing internal implementation details.

---

# 85. Failure Scenarios

## PostgreSQL unavailable

```text
Application startup
 ↓
Database initialization fails
 ↓
Fail fast / terminate unhealthy instance
```

## Redis unavailable

Queue functionality becomes unavailable and should be surfaced
operationally rather than silently losing work.

## RFID printer/local client unavailable

The API should not remain blocked indefinitely. The asynchronous job
should remain observable and move to an appropriate failure/retry state
according to implementation.

## Invalid JWT

Reject before business logic.

## Missing permission

Reject after authentication but before controller business logic.

## Invalid business state

Reject even if the user is authorized.

---

# 86. Auditability

The platform records operational identities such as:

- Created By;
- Updated By;
- Received By;
- Assigned By;
- Assigned Staff.

This supports accountability around high-value inventory.

A useful audit model answers:

```text
Who?
When?
What?
Which store?
Which item?
Which operation?
```

---

# 87. Physical-to-Digital Traceability

One of the strongest architectural characteristics is the bridge between
physical jewellery and digital records.

```text
Physical Jewellery
 ↓
SKU
 ↓
RFID
 ↓
Inventory Record
 ↓
Storage Location
 ↓
Operational History
```

This is why RFID, QC, inventory and storage are closely connected
backend domains.

---

# 88. Performance Considerations

A production ERP should consider:

- database indexes;
- pagination;
- selective column retrieval;
- avoiding N+1 queries;
- efficient joins;
- database-side aggregation;
- caching stable master data;
- asynchronous long-running operations;
- object storage for binary content;
- bounded result sets.

Performance claims such as "query became 10x faster" should only be made
if measured evidence exists.

---

# 89. Pagination

Large datasets include:

- suppliers;
- customers;
- GRNs;
- inventory;
- RFID jobs;
- audit records.

These should not be returned as unlimited result sets.

Pagination reduces memory consumption and response size and improves
frontend responsiveness.

The exact pagination method should follow the implemented API.

---

# 90. Search

Stock management supports searching by SKU or RFID tag.

Operational search should ideally:

- normalize input;
- use appropriate indexes;
- return bounded results;
- support pagination;
- avoid unnecessary full scans.

The key domain insight is that users may identify physical inventory by
RFID rather than product name.

---

# 91. Data Consistency Across Modules

The system has cross-domain relationships:

```text
Product Master
 ↓
Procurement
 ↓
QC
 ↓
RFID
 ↓
Inventory Catalog
 ↓
Storage
```

The backend must preserve valid references and business state as
information moves through these modules.

This is another reason a relational database is appropriate.

---

# 92. Read vs Write Responsibilities

Transactional services should handle business mutations.

Analytics/reporting services should focus on read-heavy aggregation.

The architecture therefore separates concerns such as:

```text
Write / Transactional Services
        ↓
Business State

Analytics / Reporting
        ↓
Aggregated Read Models / Queries
```

This reduces coupling between operational workflows and dashboard
calculations.

---

# 93. End-to-End Procurement-to-Inventory Workflow

```text
1. Supplier exists
        ↓
2. Procurement begins
        ↓
3. GRN created
        ↓
4. Shipment recorded
        ↓
5. Staff assigned
        ↓
6. Physical quantity/weight measured
        ↓
7. QC records created
        ↓
8. Material/purity/specimen validated
        ↓
9. Gemstone information captured
        ↓
10. SKU identified
        ↓
11. RFID job created
        ↓
12. RFID processed/printed
        ↓
13. Stock checked in
        ↓
14. Storage location assigned
        ↓
15. Approval performed
        ↓
16. Item appears in stock catalog
        ↓
17. Pricing applied
        ↓
18. Sale / buyback / relocation / audit
```

This is the most important business sequence to understand.

---

# 94. Security Flow

```text
SSO / Login
 ↓
JWT Access Token
 ↓
Next.js
 ↓
REST Request
 ↓
JWT Guard
 ↓
Identity
 ↓
Store Context
 ↓
Role
 ↓
Policy / Permission
 ↓
Business-State Validation
 ↓
Controller
 ↓
Service
 ↓
Database
```

---

# 95. RFID Async Flow

```text
Next.js
 ↓
RFID Job Request
 ↓
JWT Authentication
 ↓
Policy Authorization
 ↓
Validate GRN / Shipment / Inventory Context
 ↓
Create Job
 ↓
BullMQ
 ↓
Redis
 ↓
Worker / Processor
 ↓
Local Print Client
 ↓
RFID Printer
 ↓
Update Job State
 ↓
Completed / Failed / Cancelled
```

---

# 96. File Storage Flow

```text
Next.js
 ↓
Upload Request
 ↓
NestJS
 ↓
Multer / File Handling
 ↓
Storage Abstraction
 ↓
S3
 ↓
Object Key
 ↓
PostgreSQL Metadata / Reference
```

---

# 97. Branch-Aware Authorization

A store-aware ERP must evaluate more than "does this user have a
permission?"

The real context can be:

```text
Identity
 +
Current Store
 +
Role
 +
Permission
 +
Business State
 ↓
Allowed Operation
```

This is particularly important for multi-branch inventory and
operational records.

---

# 98. Why PostgreSQL Instead of MongoDB

The domain contains many related entities and transactional operations:

```text
Supplier
 ↕
GRN
 ↕
Shipment
 ↕
QC
 ↕
Inventory
 ↕
Storage
```

alongside users, roles, pricing and financial records.

PostgreSQL provides relational constraints and transactional
capabilities that fit these requirements well.

This does not mean PostgreSQL is universally superior to MongoDB; it is
a domain-driven choice.

---

# 99. Why NestJS

NestJS fits the project because the backend needs:

- modular boundaries;
- dependency injection;
- guards;
- decorators;
- interceptors;
- DTOs;
- TypeScript;
- scalable organization;
- Swagger integration.

The framework's structure maps well to enterprise backend modules.

---

# 100. Why a Modular Monolith Instead of Microservices

A modular monolith can provide clear domain boundaries without
introducing distributed-system complexity.

Benefits include:

- simpler deployment;
- simpler debugging;
- direct module calls;
- easier transactions;
- less network overhead;
- centralized authorization;
- easier local development.

Asynchronous queues can still isolate long-running workloads.

Microservices would introduce additional concerns such as:

- service discovery;
- network failure;
- distributed tracing;
- inter-service authentication;
- eventual consistency;
- distributed transactions.

Those complexities should only be introduced when justified by actual
scaling/organizational requirements.

---

# 101. Why Redis + BullMQ Instead of Synchronous Processing

RFID printing and operational jobs can be slow, unreliable or dependent
on local hardware.

The queue provides:

- decoupling;
- asynchronous execution;
- failure isolation;
- job state;
- retry capability;
- worker separation.

The API therefore stays focused on request/response responsibilities.

---

# 102. Why Object Storage Instead of Database Blobs

Documents and images are better handled by object storage because:

- binary data can become large;
- object storage is designed for files;
- relational tables remain focused on business data;
- database backups stay more manageable;
- object-level access policies can be used;
- storage can scale independently.

The database retains references and metadata.

---

# 103. Why Fine-Grained RBAC

A simple role check such as:

```text
if user.role === 'admin'
```

becomes difficult to maintain as the ERP grows.

Fine-grained permissions allow:

```text
Store Manager
 → Supplier view/update
 → Inventory approval
 → Limited financial access

Accountant
 → Financial permissions
 → Restricted inventory mutation

Inventory Controller
 → Procurement/QC/storage permissions
```

This supports least privilege and segregation of duties.

---

# 104. Least Privilege

A user should receive only the permissions required for their job.

For example:

```text
Sales Executive
≠
Inventory Controller
≠
Accountant
```

The role model supports this separation.

---

# 105. API Security Principle

Frontend controls are not security controls.

If Next.js hides:

```text
Delete Supplier
```

an attacker can still manually call the API.

Therefore the backend must enforce:

```text
JWT
 ↓
Policy
 ↓
Permission
 ↓
Business Rule
```

independently of UI visibility.

---

# 106. Operational Observability

RFID jobs expose operational metadata such as:

- state;
- created/updated timestamps;
- creator/updater;
- host/device;
- processed count;
- failed count;
- cancelled count;
- executed count.

This is valuable because failures can happen at the boundary between
software and physical hardware.

---

# 107. Business vs Technical State

A technical job can be:

```text
Completed
```

while a business item may still have a different state.

Similarly, a QC record existing in the database does not automatically
mean the inventory is sellable.

The backend must preserve the distinction between:

```text
Technical processing state
```

and:

```text
Business lifecycle state
```

---

# 108. QC vs Final Catalog Data Observation

The observed QC screen can show:

```text
No stone details found
```

while the final stock catalog can expose gemstone grading.

This should be investigated rather than guessed.

Possible causes include:

- different lifecycle stages;
- different API projections;
- later gemstone enrichment;
- asynchronous synchronization;
- different source tables/read models;
- stale UAT data.

The correct debugging sequence is:

```text
Frontend screen
 ↓
Network/API request
 ↓
NestJS endpoint
 ↓
Service
 ↓
Database query
 ↓
Source-of-truth analysis
```

---

# 109. Project Complexity

The backend complexity comes from the combination of:

1.  High-value physical inventory.
2.  Multi-branch operations.
3.  Fine-grained authorization.
4.  Financial data.
5.  Procurement workflows.
6.  Quality control.
7.  RFID integration.
8.  Asynchronous workers.
9.  Physical storage mapping.
10. Product/material/purity/gemstone master data.
11. Auditability.
12. File/document management.
13. Pricing and buyback.
14. Reporting and analytics.
15. User/store administration.

The combination makes the system an enterprise ERP backend rather than a
CRUD application.

---

# 110. Strongest Technical Stories for Interviews

## Story A --- RFID asynchronous processing

```text
API → Job → Redis/BullMQ → Worker → Local Client → Printer → Job State
```

Explain why the operation should not block HTTP.

## Story B --- Fine-grained RBAC

```text
JWT → Identity → Role → Policy → Permission → Controller
```

Explain least privilege and backend-enforced authorization.

## Story C --- Inventory traceability

```text
Supplier → GRN → QC → SKU → RFID → Storage → Approval → Inventory
```

Explain why physical jewellery requires stronger traceability than
ordinary retail.

## Story D --- Multi-branch context

```text
User → Store → Role → Permission → Store-aware operation
```

Explain why branch context is part of the request/business model.

## Story E --- Domain-specific data model

```text
Product → Material → Purity → Weight → Gemstone → SKU → RFID
```

Explain why the system separates master data from transactional
inventory.

---

# 111. 60-Second Interview Explanation

> The Jewellery ERP Platform is an enterprise jewellery ERP platform where I
> worked on the backend using TypeScript and NestJS. The system manages
> the complete jewellery inventory lifecycle, starting from supplier
> procurement and GRN processing, through quality checks for weight,
> purity, materials and gemstones, then SKU and RFID identification,
> secure storage and stock approval, and finally pricing, sales/buyback,
> accounting and reporting.
>
> The backend is a modular NestJS monolith using PostgreSQL with TypeORM
> for transactional data. Authentication uses SSO/JWT and authorization
> uses fine-grained RBAC and policy-based permissions. Redis and BullMQ
> handle asynchronous workloads such as RFID processing and local print
> jobs, while S3-style object storage handles documents and attachments.
>
> The interesting backend problem is physical asset traceability: a
> jewellery item is not just a product and quantity. The system connects
> its supplier/GRN history, QC data, measured weight, material, purity,
> gemstone information, SKU, RFID and physical storage location while
> enforcing branch context and permissions.

---

# 112. Three-Minute Interview Explanation

> The Jewellery ERP Platform is an enterprise jewellery ERP platform rather than a
> simple e-commerce application. The objective is to manage high-value
> jewellery inventory across multiple stores with operational
> traceability.
>
> The backend is built using TypeScript and NestJS. PostgreSQL is the
> transactional database and TypeORM provides the persistence layer. The
> frontend is Next.js and communicates with the backend through REST
> APIs.
>
> The business workflow begins with suppliers and procurement. A GRN is
> created for incoming goods, shipment information is recorded, staff
> can be assigned, and physical values such as quantity and gross weight
> are captured. The inventory then moves through a quality-check
> workflow where specimen/origin, material, purity, measured weight,
> pricing-related information and gemstone data are handled.
>
> After the appropriate QC process, inventory can be identified using
> SKU and RFID. RFID processing uses BullMQ with Redis so that
> physical/local printing operations do not block the API request. The
> backend creates a job, a worker processes it, and the job exposes
> operational state and counts such as processed, failed, cancelled and
> executed.
>
> The system then supports stock check-in, physical storage using
> vaults, lockers and compartments, and approval workflows. The final
> stock catalog can be searched using SKU or RFID and can expose
> material, purity, specimen and gemstone information.
>
> Security uses SSO/JWT authentication and policy-based authorization.
> Roles such as store admin, manager, accountant, inventory controller
> and sales executive have granular permissions. Controller endpoints
> can declare required policies, and backend guards enforce them.
>
> Architecturally, the project is a modular NestJS monolith. Separate
> modules handle product master data, inventory, accounting, treasury,
> analytics, RFID, RFID analytics and other domains. Shared guards,
> decorators, interceptors, transformers, cache and storage abstractions
> handle cross-cutting concerns.
>
> The main engineering challenge is connecting digital transactional
> systems with physical high-value assets while preserving identity,
> state, authorization, branch context and operational traceability.

---

# 113. Ten-Minute Deep-Dive Structure

When the interviewer gives more time, follow this order:

1.  Business problem
2.  Architecture
3.  Multi-branch model
4.  Authentication
5.  Authorization
6.  Product/master data
7.  Procurement/GRN
8.  QC
9.  Product vs SKU vs RFID
10. Inventory
11. RFID architecture
12. Redis + BullMQ
13. Stock catalog
14. Storage
15. Approval
16. Pricing
17. Buyback
18. Accounting
19. Object storage
20. Analytics
21. Database consistency
22. Performance
23. Failure handling
24. Technical challenge
25. Trade-offs

This sequence moves from business context to implementation and finally
engineering decisions.

---

# 114. Interview Questions: Architecture

Be prepared for:

- Why NestJS?
- Why PostgreSQL?
- Why TypeORM?
- Why modular monolith?
- Why not microservices?
- How are modules separated?
- Where does business logic live?
- How does a request travel through the backend?
- How are cross-cutting concerns handled?
- How would you scale the application?

---

# 115. Interview Questions: Database

- Why PostgreSQL instead of MongoDB?
- How are product and SKU represented differently?
- What entities are relational?
- What would you index?
- How would you prevent N+1 queries?
- Where would you use transactions?
- How do migrations work?
- How would you handle concurrent inventory updates?
- How would you preserve audit history?

---

# 116. Interview Questions: Authentication / Authorization

- How does JWT authentication work?
- How does SSO fit into the architecture?
- Where is the JWT validated?
- What is authentication vs authorization?
- Why not use a simple `isAdmin` flag?
- How are role permissions represented?
- How does policy-based authorization work?
- How does store context affect authorization?
- How do you handle a global administrator?

---

# 117. Interview Questions: Redis / BullMQ

- Why Redis?
- Why BullMQ?
- Why process RFID asynchronously?
- What happens when a worker crashes?
- How do retries work?
- How do you avoid duplicate processing?
- What happens if Redis is unavailable?
- How do you monitor failed jobs?
- How would you scale workers?

---

# 118. Interview Questions: RFID

- Why is RFID needed?
- How is RFID connected to SKU?
- What happens when a tag is damaged?
- How does relocation work?
- How does the local print client communicate with the backend?
- What happens when the printer is offline?
- How do you make printing idempotent?
- How do you track job state?
- How do you recover a failed job?

---

# 119. Interview Questions: Inventory

- What is the inventory lifecycle?
- Why is QC separate from inventory?
- Why are gross and net weight different?
- How is physical storage represented?
- What is the difference between product and SKU?
- What happens before an item becomes sellable?
- How do approvals work?
- How would you prevent two employees from changing the same item
  simultaneously?

---

# 120. Interview Questions: Pricing

- How is purity represented?
- Why is purity master data separate?
- How is buyback pricing calculated?
- Where should pricing logic live?
- Why should pricing not be trusted from the frontend?
- How would you handle market-rate changes?
- How would you audit pricing changes?

---

# 121. Interview Questions: Production Engineering

- What happens when PostgreSQL is unavailable?
- What happens when Redis is unavailable?
- How do you handle file-storage failures?
- How do you log errors?
- How do you monitor background jobs?
- How would you design health checks?
- How would you scale the API?
- How would you scale queue workers?
- How would you handle a sudden increase in inventory operations?

---

# 122. What Not to Claim

The available evidence does **not** establish that the project uses:

- Kubernetes;
- Kafka;
- Elasticsearch;
- MongoDB;
- GraphQL;
- CQRS;
- event sourcing;
- distributed transactions;
- ECS/EKS;
- Prometheus/Grafana;
- specific performance numbers;
- specific retry counts;
- specific database indexes;
- exact test coverage;
- exact throughput/latency metrics.

Do not add these to the project story unless the actual implementation
confirms them.

Most importantly, do not describe the project as microservices merely
because there are many modules.

---

# 123. Vendor / Ecosystem Context

The recorded GitLab environment identifies [Vendor name omitted in neutralized copy] and
repositories including:

```text
Admin.Portal
Cluster.Portal
ERP
Backend.Api.Suite
Backend.Deployment
Apps
Portal
```

This indicates the ERP exists within a broader application ecosystem.

---

# 124. Environment / Deployment Context

The observed application is a UAT/staging environment.

The footer shows:

```text
v6.1.170-live-fix-4801.2
2025 © All Rights Reserved
```

This indicates a deployed, versioned enterprise application rather than
a local-only development project.

---

# 125. Final System Diagram

```text
                         JEWELLERY ERP PLATFORM
                                  │
               ┌──────────────────┼──────────────────┐
               │                  │                  │
          MASTER DATA         SECURITY          OPERATIONS
               │                  │                  │
       ┌───────┼────────┐   ┌─────┼─────┐   ┌───────┼──────────┐
       │       │        │   │     │     │   │       │          │
    Product Material Purity JWT  RBAC  Store GRN     QC       RFID
       │       │        │         │          │       │          │
       └───────┼────────┘         │          └───────┼──────────┘
               │                  │                  │
               └──────────────────┼──────────────────┘
                                  │
                           INVENTORY ENGINE
                                  │
                  ┌───────────────┼────────────────┐
                  │               │                │
              PostgreSQL       Redis/BullMQ       S3
                  │               │                │
             Transactional     Async Jobs       Documents
                State           Workers
                  │               │
                  └───────┬───────┘
                          │
                    BUSINESS DATA
                          │
          ┌───────────────┼────────────────┐
          │               │                │
       Pricing        Accounting       Analytics
          │               │                │
          └───────────────┼────────────────┘
                          │
                    Next.js Frontend
```

---

# 126. Final Professional Project Definition

> **The Jewellery ERP Platform is a multi-branch enterprise jewellery ERP platform
> whose TypeScript/NestJS backend orchestrates supplier procurement, GRN
> intake, quality control, jewellery master data, weight/purity/gemstone
> verification, SKU and RFID-based physical asset identification,
> inventory/storage/approval workflows, pricing, buyback, accounting and
> analytics. PostgreSQL with TypeORM provides transactional persistence,
> Redis/BullMQ handles asynchronous operational jobs, SSO/JWT and
> policy-based RBAC secure the platform, and S3-style object storage
> manages operational documents and attachments.**

---

# 127. Core Engineering Story to Memorize

The project should not be presented as:

```text
“I built CRUD APIs for a jewellery website.”
```

The technically accurate story is:

```text
Business Workflow
        +
Physical Asset Traceability
        +
Transactional Database
        +
Fine-Grained Security
        +
Asynchronous Processing
        +
Multi-Branch Operations
        +
Operational Auditability
```

The backend connects all of these concerns into a single enterprise
workflow.

---

# 128. Personal Contribution Boundary

When explaining this project in an interview, distinguish carefully
between:

### System-wide functionality

What the overall platform contains.

### Personally implemented functionality

What you actually designed, coded, debugged, optimized or maintained.

Do not convert:

> "The system has X."

into:

> "I personally designed X."

unless your actual contribution supports that statement.

This distinction makes the project explanation defensible under deep
technical questioning.

---

# 129. Interview Answer Formula

For almost any project technical question, answer in this order:

```text
1. Business requirement
2. Technical problem
3. Design decision
4. Implementation
5. Data flow
6. Failure handling
7. Trade-off
```

Example:

```text
Business:
RFID labels must be generated for physical inventory.

Problem:
Printing/local hardware is slow and unreliable.

Decision:
Move processing outside the HTTP lifecycle.

Implementation:
BullMQ + Redis + worker/processor.

Flow:
API → Job → Queue → Worker → Local Client → Printer.

Failure:
Track job state and operational counts.

Trade-off:
Eventually processed rather than synchronously completed, but much better responsiveness and failure isolation.
```

This is the level of reasoning expected from a professional backend
engineer.
