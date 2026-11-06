import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import {
  loginSchema,
  registerUserSchema,
  createOrganizationSchema,
  createStoreSchema,
  createRoleSchema,
  createOrganizationMembershipSchema,
  createStoreMembershipSchema,
  createVaultSchema,
  createLockerSchema,
  createCompartmentSchema,
  createCategorySchema,
  createSubcategorySchema,
  createMaterialSchema,
  createPuritySchema,
  createGemstoneSchema,
  createProductSchema,
  createProductSkuSchema,
  updateProductSkuSchema,
  createProductGemstoneSpecSchema,
  createSupplierSchema,
  updateSupplierSchema,
  createGrnSchema,
  updateGrnSchema,
  closeGrnSchema,
} from "@jewelcore/shared";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// -------------------------------------------------------------
// 1. Security Scheme (JWT Bearer Token)
// -------------------------------------------------------------
registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Provide JWT token obtained from POST /api/v1/auth/login",
});

// -------------------------------------------------------------
// 2. Core RFC 7807 Problem Details Schema
// -------------------------------------------------------------
const ProblemDocumentSchema = registry.register(
  "ProblemDocument",
  z.object({
    type: z
      .string()
      .openapi({ example: "https://jewelcore.com/errors/validation" }),
    title: z.string().openapi({ example: "Validation Error" }),
    status: z.number().int().openapi({ example: 400 }),
    detail: z.string().openapi({ example: "Request validation failed" }),
    instance: z
      .string()
      .optional()
      .openapi({ example: "/api/v1/taxonomy/materials" }),
    code: z.string().openapi({ example: "ERR_VALIDATION" }),
    requestId: z
      .string()
      .optional()
      .openapi({ example: "0192e301-7000-7000-8000-000000000001" }),
    timestamp: z.string().openapi({ example: "2026-11-06T12:00:00.000Z" }),
    invalidParams: z
      .array(
        z.object({
          name: z.string().openapi({ example: "code" }),
          reason: z.string().openapi({ example: "Field is required" }),
        }),
      )
      .optional(),
  }),
);

// -------------------------------------------------------------
// 3. Health Check Paths
// -------------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/health",
  tags: ["System Health"],
  summary: "Root health check probe",
  responses: {
    200: {
      description: "Service is online and healthy",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string().openapi({ example: "UP" }),
            timestamp: z
              .string()
              .openapi({ example: "2026-11-06T12:00:00.000Z" }),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/health",
  tags: ["System Health"],
  summary: "API v1 health and readiness probe",
  responses: {
    200: {
      description: "Service is online and healthy",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string().openapi({ example: "UP" }),
            timestamp: z
              .string()
              .openapi({ example: "2026-11-06T12:00:00.000Z" }),
            version: z.string().openapi({ example: "1.0.0" }),
          }),
        },
      },
    },
  },
});

// -------------------------------------------------------------
// 4. Authentication Endpoints
// -------------------------------------------------------------
const LoginInputSchema = registry.register("LoginInput", loginSchema);
const RegisterInputSchema = registry.register(
  "RegisterInput",
  registerUserSchema,
);

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/login",
  tags: ["Authentication"],
  summary: "Authenticate user credentials and receive JWT access token",
  request: {
    body: {
      content: {
        "application/json": {
          schema: LoginInputSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Authentication successful",
      content: {
        "application/json": {
          schema: z.object({
            accessToken: z
              .string()
              .openapi({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }),
            user: z.object({
              id: z.string().uuid(),
              email: z.string().email(),
              firstName: z.string(),
              lastName: z.string(),
            }),
          }),
        },
      },
    },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    401: {
      description: "Invalid credentials",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/register",
  tags: ["Authentication"],
  summary: "Register new user account under an organization",
  request: {
    body: {
      content: {
        "application/json": {
          schema: RegisterInputSchema,
        },
      },
    },
  },
  responses: {
    201: { description: "User registered successfully" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Email already registered",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/auth/me",
  tags: ["Authentication"],
  summary: "Retrieve authenticated user profile and memberships",
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: "User profile" },
    401: {
      description: "Unauthorized",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

// -------------------------------------------------------------
// 5. IAM Domain Endpoints
// -------------------------------------------------------------
const CreateOrgSchema = registry.register(
  "CreateOrganizationInput",
  createOrganizationSchema,
);
const CreateStoreSchema = registry.register(
  "CreateStoreInput",
  createStoreSchema,
);
const CreateRoleSchema = registry.register("CreateRoleInput", createRoleSchema);
const CreateOrgMembershipSchema = registry.register(
  "CreateOrganizationMembershipInput",
  createOrganizationMembershipSchema,
);
const CreateStoreMembershipSchema = registry.register(
  "CreateStoreMembershipInput",
  createStoreMembershipSchema,
);

registry.registerPath({
  method: "post",
  path: "/api/v1/iam/organizations",
  tags: ["IAM - Tenancy & Stores"],
  summary: "Create new enterprise organization (BIZ-Q01 Option A)",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateOrgSchema } } },
  },
  responses: {
    201: { description: "Organization created" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate organization code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/iam/stores",
  tags: ["IAM - Tenancy & Stores"],
  summary: "Create new store branch under organization",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateStoreSchema } } },
  },
  responses: {
    201: { description: "Store branch created" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate store code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/iam/roles",
  tags: ["IAM - RBAC"],
  summary: "Create custom RBAC role with permissions",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateRoleSchema } } },
  },
  responses: {
    201: { description: "Role created" },
    409: {
      description: "Duplicate role code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/iam/memberships/organization",
  tags: ["IAM - Memberships"],
  summary: "Assign user to organization membership",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: CreateOrgMembershipSchema } },
    },
  },
  responses: { 201: { description: "Organization membership granted" } },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/iam/memberships/store",
  tags: ["IAM - Memberships"],
  summary: "Assign user to store branch with optional default flag (INV-11)",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: CreateStoreMembershipSchema } },
    },
  },
  responses: {
    201: { description: "Store branch membership granted" },
    409: {
      description: "Duplicate or conflicting default store",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

// -------------------------------------------------------------
// 6. Storage Hierarchy Endpoints (INV-05, INV-17)
// -------------------------------------------------------------
const CreateVaultSchema = registry.register(
  "CreateVaultInput",
  createVaultSchema,
);
const CreateLockerSchema = registry.register(
  "CreateLockerInput",
  createLockerSchema,
);
const CreateCompartmentSchema = registry.register(
  "CreateCompartmentInput",
  createCompartmentSchema,
);

registry.registerPath({
  method: "post",
  path: "/api/v1/storage/vaults",
  tags: ["Storage Hierarchy (INV-05)"],
  summary: "Create high-security vault within store branch",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateVaultSchema } } },
  },
  responses: {
    201: { description: "Vault created" },
    403: {
      description: "Insufficient permissions",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate vault code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/storage/lockers",
  tags: ["Storage Hierarchy (INV-05)"],
  summary:
    "Create locker inside vault (composite store foreign key validation)",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateLockerSchema } } },
  },
  responses: {
    201: { description: "Locker created" },
    422: {
      description: "Store mismatch (INV-05)",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/storage/compartments",
  tags: ["Storage Hierarchy (INV-05)"],
  summary: "Create physical compartment within locker",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: CreateCompartmentSchema } },
    },
  },
  responses: {
    201: { description: "Compartment created" },
    422: {
      description: "Store mismatch (INV-05)",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/storage/directory",
  tags: ["Storage Hierarchy (INV-05)"],
  summary:
    "Get complete visual directory tree and real-time occupancy for active store",
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: "Hierarchical storage directory with occupancy metrics",
    },
    403: {
      description: "Forbidden without store context",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

// -------------------------------------------------------------
// 7. Master Data Taxonomy Endpoints (FEAT-TAX-01..03)
// -------------------------------------------------------------
const CreateCategorySchema = registry.register(
  "CreateCategoryInput",
  createCategorySchema,
);
const CreateSubcategorySchema = registry.register(
  "CreateSubcategoryInput",
  createSubcategorySchema,
);
const CreateMaterialSchema = registry.register(
  "CreateMaterialInput",
  createMaterialSchema,
);
const CreatePuritySchema = registry.register(
  "CreatePurityInput",
  createPuritySchema,
);
const CreateGemstoneSchema = registry.register(
  "CreateGemstoneInput",
  createGemstoneSchema,
);
const CreateProductSchema = registry.register(
  "CreateProductInput",
  createProductSchema,
);

registry.registerPath({
  method: "get",
  path: "/api/v1/taxonomy/tree",
  tags: ["Taxonomy & Master Data"],
  summary: "Retrieve complete recursive category and subcategory hierarchy",
  security: [{ BearerAuth: [] }],
  responses: { 200: { description: "Full taxonomy tree" } },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/taxonomy/categories",
  tags: ["Taxonomy & Master Data"],
  summary: "Create root product category (Entity 10)",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateCategorySchema } } },
  },
  responses: {
    201: { description: "Category created" },
    409: {
      description: "Duplicate category code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/taxonomy/subcategories",
  tags: ["Taxonomy & Master Data"],
  summary: "Create subcategory under parent category (Entity 11)",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: CreateSubcategorySchema } },
    },
  },
  responses: {
    201: { description: "Subcategory created" },
    409: {
      description: "Duplicate subcategory code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/taxonomy/materials",
  tags: ["Taxonomy & Master Data"],
  summary: "Register precious metal material (Entity 12)",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateMaterialSchema } } },
  },
  responses: {
    201: { description: "Material registered" },
    403: {
      description: "Missing taxonomy:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate material code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/taxonomy/materials/{materialId}/purities",
  tags: ["Taxonomy & Master Data"],
  summary: "Register metal alloy purity standard (Entity 13 - DEC-05 Scales)",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "materialId",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  request: {
    body: { content: { "application/json": { schema: CreatePuritySchema } } },
  },
  responses: {
    201: {
      description:
        "Purity registered with exact NUMERIC(7,4) and NUMERIC(5,4) scales",
    },
    400: {
      description: "Purity percentage > 100% or invalid",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate purity code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/taxonomy/gemstones",
  tags: ["Taxonomy & Master Data"],
  summary: "Register gemstone classification master (Entity 14)",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateGemstoneSchema } } },
  },
  responses: {
    201: { description: "Gemstone classification registered" },
    400: {
      description: "Invalid gemstone type enumeration",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    403: {
      description: "Missing taxonomy:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate gemstone code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/taxonomy/gemstones",
  tags: ["Taxonomy & Master Data"],
  summary:
    "List gemstones with optional filters by gemstoneType and active status",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "gemstoneType",
      in: "query",
      required: false,
      schema: {
        type: "string",
        enum: ["PRECIOUS", "SEMI_PRECIOUS", "ORGANIC_PEARL"],
      },
    },
    {
      name: "isActive",
      in: "query",
      required: false,
      schema: { type: "boolean" },
    },
  ],
  responses: {
    200: { description: "List of gemstones" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/taxonomy/products",
  tags: ["Taxonomy & Master Data"],
  summary: "Create product master design style (Entity 15)",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateProductSchema } } },
  },
  responses: {
    201: { description: "Product style created" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    403: {
      description: "Missing taxonomy:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate product code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    422: {
      description: "Referenced category, material, or purity not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/taxonomy/products",
  tags: ["Taxonomy & Master Data"],
  summary:
    "List product styles with optional categoryId and materialId filters",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "categoryId",
      in: "query",
      required: false,
      schema: { type: "string", format: "uuid" },
    },
    {
      name: "materialId",
      in: "query",
      required: false,
      schema: { type: "string", format: "uuid" },
    },
    {
      name: "isActive",
      in: "query",
      required: false,
      schema: { type: "boolean" },
    },
  ],
  responses: {
    200: { description: "List of product styles" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/taxonomy/products/{id}",
  tags: ["Taxonomy & Master Data"],
  summary: "Retrieve product master design style by primary key ID",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  responses: {
    200: { description: "Product style details" },
    404: {
      description: "Product not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

// -------------------------------------------------------------
// 8. Commercial SKUs & Gemstone Specs Endpoints (FEAT-TAX-05)
// -------------------------------------------------------------
const CreateSkuSchema = registry.register(
  "CreateProductSkuInput",
  createProductSkuSchema,
);
const UpdateSkuSchema = registry.register(
  "UpdateProductSkuInput",
  updateProductSkuSchema,
);
const CreateGemstoneSpecSchema = registry.register(
  "CreateProductGemstoneSpecInput",
  createProductGemstoneSpecSchema,
);

registry.registerPath({
  method: "post",
  path: "/api/v1/taxonomy/skus",
  tags: ["Taxonomy & Master Data"],
  summary: "Create commercial SKU variant linked to product style (Entity 16)",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateSkuSchema } } },
  },
  responses: {
    201: { description: "Commercial SKU created" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    403: {
      description: "Missing taxonomy:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate SKU code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    422: {
      description: "Unprocessable entity (invalid weights or foreign key)",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/taxonomy/skus",
  tags: ["Taxonomy & Master Data"],
  summary: "List commercial SKUs with optional productId and active filters",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "productId",
      in: "query",
      required: false,
      schema: { type: "string", format: "uuid" },
    },
    {
      name: "isActive",
      in: "query",
      required: false,
      schema: { type: "boolean" },
    },
  ],
  responses: {
    200: { description: "List of commercial SKUs" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/taxonomy/skus/{id}",
  tags: ["Taxonomy & Master Data"],
  summary:
    "Retrieve commercial SKU by primary key ID (optionally including gemstone specs)",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
    {
      name: "includeSpecs",
      in: "query",
      required: false,
      schema: { type: "boolean" },
    },
  ],
  responses: {
    200: { description: "Commercial SKU details" },
    404: {
      description: "SKU not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/taxonomy/skus/{id}",
  tags: ["Taxonomy & Master Data"],
  summary: "Update commercial SKU (enforces INV-06 tracking type immutability)",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  request: {
    body: { content: { "application/json": { schema: UpdateSkuSchema } } },
  },
  responses: {
    200: { description: "SKU updated successfully" },
    403: {
      description: "Missing taxonomy:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    404: {
      description: "SKU not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    422: {
      description: "Tracking type is immutable (INV-06) or invalid weights",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/taxonomy/skus/{skuId}/gemstone-specs",
  tags: ["Taxonomy & Master Data"],
  summary: "Add gemstone specification to SKU (Entity 17)",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "skuId",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  request: {
    body: {
      content: { "application/json": { schema: CreateGemstoneSpecSchema } },
    },
  },
  responses: {
    201: { description: "Gemstone specification registered" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    403: {
      description: "Missing taxonomy:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate gemstone spec shape",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    422: {
      description: "SKU or gemstone not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

// -------------------------------------------------------------
// 9. Inbound Procurement & Supplier Management (FEAT-PROC-01)
// -------------------------------------------------------------
const CreateSupplierSchema = registry.register(
  "CreateSupplierInput",
  createSupplierSchema,
);
const UpdateSupplierSchema = registry.register(
  "UpdateSupplierInput",
  updateSupplierSchema,
);

registry.registerPath({
  method: "post",
  path: "/api/v1/procurement/suppliers",
  tags: ["Procurement & Inbound Intake"],
  summary: "Register new vendor or artisan karigar profile (Entity 18)",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateSupplierSchema } } },
  },
  responses: {
    201: { description: "Supplier registered successfully" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    403: {
      description: "Missing procurement:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate supplier code",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/procurement/suppliers",
  tags: ["Procurement & Inbound Intake"],
  summary: "List registered suppliers with optional active filter",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "isActive",
      in: "query",
      required: false,
      schema: { type: "boolean" },
    },
  ],
  responses: {
    200: { description: "List of suppliers" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/procurement/suppliers/{id}",
  tags: ["Procurement & Inbound Intake"],
  summary: "Retrieve supplier profile by primary key ID",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  responses: {
    200: { description: "Supplier profile details" },
    404: {
      description: "Supplier not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/procurement/suppliers/{id}",
  tags: ["Procurement & Inbound Intake"],
  summary: "Update supplier vendor details and commercial terms",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  request: {
    body: { content: { "application/json": { schema: UpdateSupplierSchema } } },
  },
  responses: {
    200: { description: "Supplier updated successfully" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    403: {
      description: "Missing procurement:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    404: {
      description: "Supplier not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

// -------------------------------------------------------------
// 10. Goods Receipt Notes (GRN) Endpoints (FEAT-PROC-02)
// -------------------------------------------------------------
const CreateGrnSchema = registry.register("CreateGrnInput", createGrnSchema);
const UpdateGrnSchema = registry.register("UpdateGrnInput", updateGrnSchema);
const CloseGrnSchema = registry.register("CloseGrnInput", closeGrnSchema);

registry.registerPath({
  method: "post",
  path: "/api/v1/procurement/grns",
  tags: ["Procurement & Inbound Intake"],
  summary: "Create Goods Receipt Note (GRN) in DRAFT status (Entity 19)",
  security: [{ BearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateGrnSchema } } },
  },
  responses: {
    201: { description: "GRN created successfully in DRAFT state" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    403: {
      description: "Missing procurement:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    409: {
      description: "Duplicate GRN number",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    422: {
      description: "Store or supplier not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/procurement/grns",
  tags: ["Procurement & Inbound Intake"],
  summary:
    "List Goods Receipt Notes with optional store, supplier, and status filters",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "storeId",
      in: "query",
      required: false,
      schema: { type: "string", format: "uuid" },
    },
    {
      name: "supplierId",
      in: "query",
      required: false,
      schema: { type: "string", format: "uuid" },
    },
    {
      name: "status",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["DRAFT", "RECEIVED", "CLOSED"] },
    },
  ],
  responses: {
    200: { description: "List of Goods Receipt Notes" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/procurement/grns/{id}",
  tags: ["Procurement & Inbound Intake"],
  summary: "Retrieve Goods Receipt Note by primary key ID",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  responses: {
    200: { description: "GRN details" },
    404: {
      description: "GRN not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/procurement/grns/{id}",
  tags: ["Procurement & Inbound Intake"],
  summary:
    "Update Goods Receipt Note (enforces immutable lock on CLOSED status)",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  request: {
    body: { content: { "application/json": { schema: UpdateGrnSchema } } },
  },
  responses: {
    200: { description: "GRN updated successfully" },
    400: {
      description: "Validation error",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    403: {
      description: "Missing procurement:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    404: {
      description: "GRN not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    422: {
      description: "Closed GRN is immutable",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/procurement/grns/{id}/close",
  tags: ["Procurement & Inbound Intake"],
  summary:
    "Transition Goods Receipt Note to CLOSED status with manager authorization lock",
  security: [{ BearerAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    },
  ],
  request: {
    body: { content: { "application/json": { schema: CloseGrnSchema } } },
  },
  responses: {
    200: { description: "GRN closed and locked successfully" },
    403: {
      description: "Missing procurement:write permission",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    404: {
      description: "GRN not found",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
    422: {
      description: "GRN is already closed",
      content: {
        "application/problem+json": { schema: ProblemDocumentSchema },
      },
    },
  },
});

/**
 * Generates the complete OpenAPI 3.0 Document Specification.
 */
export function getOpenApiDocumentation(): Record<string, any> {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "JewelCore ERP API",
      version: "1.0.0",
      description:
        "Enterprise Luxury Jewellery Manufacturing, Procurement, Physical Storage & Inventory Custody Platform API.",
      contact: {
        name: "JewelCore Engineering Team",
        url: "https://jewelcore.com",
      },
    },
    servers: [
      {
        url: "/",
        description: "Active Environment Server",
      },
    ],
  });
}
