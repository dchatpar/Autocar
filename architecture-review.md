# DealerOS Architecture Review

## Status
- Last reviewed: 2026-06-05 17:35 UTC
- Schema reviewed: yes (`/workspace/packages/db/prisma/schema.prisma`, 21 models, 760 lines)
- API reviewed: no — `apps/api/src/` is empty; awaiting api-auth, api-crm, api-inventory deliveries
- Frontend reviewed: no — only design system primitives present under `apps/web/src/components/ui`; no domain pages yet

> **Note on request brief**: The brief asked for `dealerId UUID NOT NULL` on every table. The delivered schema uses **`String` (cuid)**, not Postgres `UUID`. This is documented as **MAJOR C-2** below. All multi-tenancy findings in this document are scored against the spirit of the requirement (dealer isolation) rather than the literal type.

---

## Summary

| Domain | Status | Critical | Major | Minor |
|---|---|---|---|---|
| Multi-tenancy | PARTIAL | 1 | 2 | 1 |
| Soft delete | **FAIL** | 1 | 0 | 0 |
| Audit fields | PARTIAL | 0 | 2 | 1 |
| Optimistic locking | **FAIL** | 1 | 0 | 1 |
| JSON typing | PARTIAL | 0 | 3 | 1 |
| Enums | PARTIAL | 0 | 2 | 1 |
| Indexes | PARTIAL | 0 | 2 | 3 |
| Relation integrity | PARTIAL | 0 | 2 | 2 |
| **Total** |  | **3** | **13** | **10** |

The schema is a **solid first draft** for a multi-tenant CRM/inventory platform. Domain modeling is coherent, enums are used in most places, and the Dealer aggregate root is the canonical tenancy anchor. However, there are **three CRITICAL gaps** that must be resolved before production data is loaded: no soft delete, no optimistic concurrency control on money/contract tables, and an inconsistent tenancy-anchor pattern on a few tables.

---

## Findings by Severity

### CRITICAL (must fix before production)

#### C-1 — No soft delete pattern on any table
- **Where**: schema.prisma — entire file
- **Issue**: `grep -c "deletedAt\|archived"` returns `0`. None of the 21 models have `deletedAt`, `archivedAt`, or an `isArchived` flag. Hard deletes are blocked by FK `onDelete: Cascade` (e.g. Lead→Customer, Deal→Customer), so the **only way to remove a record is to remove the whole customer and orphan or cascade-delete every dependent row**. This is unacceptable for a CRM/dealership system where:
  - Customers have a regulatory right to be "forgotten" but sales history (deals, payments) must be retained for **7+ years** (US IRS, OFAC, state DMV).
  - Leads must be suppressible (TCPA, DNC lists) but not deleted from history.
  - BHPH contracts and payment ledgers are **financial records** — must never be hard-deleted.
- **Exact recommendation**: add a shared, reusable mixin pattern (Prisma doesn't have mixins, so a documented convention + a Prisma client extension) for:
  ```prisma
  deletedAt       DateTime?
  deletedById     String?
  deleteReason    String?   // e.g. "GDPR_REQUEST", "DUPLICATE", "USER_REQUEST"
  ```
  Required on at minimum: `Customer`, `Lead`, `Deal`, `BhphContract`, `BhphPayment`, `Vehicle`, `Note`, `Document`, `Communication`. Add a partial index for "live" rows: `@@index([dealerId, deletedAt])` filtered to `WHERE deletedAt IS NULL` (use raw SQL in a migration since Prisma doesn't support partial indexes natively).
- **Why CRITICAL**: legal/regulatory exposure (US tax retention, TCPA, GDPR Art. 17) is unavoidable without it; one accidental delete destroys the audit chain.

#### C-2 — Tenant isolation gaps on three child tables
- **Where**:
  - `LeadScore` line 670-685 — relation to Dealer is **NOT** declared with `onDelete: Cascade`; in fact the only onDelete clause is missing entirely (defaults to `NoAction` in PG, which blocks the parent delete). This means a LeadScore's dealerId can become a dangling reference after a Dealer is removed, and — more importantly — there is **no `@@index([dealerId, leadId])` to enforce scoping in the application layer's hot path**.
  - `VehicleMedia` line 416-434 and `Document` line 589-606 have `dealerId` but the `dealerId` column is **not** part of any `@unique` constraint and the relation to the parent (`Vehicle`, `Deal`) goes through `vehicleId`/`dealId`, **which are not unique on `dealerId`**. A misbehaving writer (or a multi-tenant bug) can attach a `VehicleMedia` row whose `vehicleId` belongs to dealer A and `dealerId` says dealer B, with no DB-level enforcement.
  - `Activity` line 193-217 has the same shape: `entityId` is a polymorphic pointer that joins to four tables via `map: "fk_activity_*"`. **There is no CHECK constraint or trigger to ensure `entityId.dealerId == activity.dealerId`**. This is a classic multi-tenant data-leak vector.
- **Exact recommendation**:
  1. For `LeadScore`: add `onDelete: Cascade` on the dealer relation and a composite index `@@index([dealerId, leadId, scoredAt])`.
  2. For polymorphic `Activity`: **replace the four `map:`-faked FKs with a typed polymorphic child table per entity** (e.g. `LeadActivity`, `CustomerActivity`, `DealActivity`, `VehicleActivity`) — this is the only way to get referential integrity in Postgres. Prisma supports this cleanly; the cost is one extra table per entity.
     - If a polymorphic table is non-negotiable, add a **CHECK constraint via raw SQL in a migration** that validates `entityId` exists in the right table for the `entityType`.
  3. For `VehicleMedia` and `Document`: add a composite FK constraint via raw SQL: `FOREIGN KEY (dealerId, vehicleId) REFERENCES vehicles(dealerId, id) ON DELETE CASCADE`. Same for `Document(dealerId, dealId)`.
- **Why CRITICAL**: tenant data bleed is a P0 security incident. A single bad query can surface another dealer's leads, vehicles, or BHPH payment histories.

#### C-3 — No optimistic concurrency control on money-mutation tables
- **Where**: `Deal` (line 480-507), `Vehicle` (line 337-373), `BhphContract` (line 614-634), `BhphPayment` (line 642-662)
- **Issue**: No `version Int @default(0)` (or `@updatedAt` lock token) field. In a deal-jack scenario, two sales managers editing the same deal's `DealTerms.financedAmount` or a finance manager posting a BHPH payment while the contract terms are being amended will silently overwrite each other. This is the #1 cause of "mystery" accounting discrepancies in dealership DMS systems.
- **Exact recommendation**: add to Deal, Vehicle, BhphContract, BhphPayment, and DealTerms:
  ```prisma
  version Int @default(0)
  ```
  And in the API layer (once written), every `update` must:
  ```ts
  prisma.deal.update({ where: { id, version }, data: { ..., version: { increment: 1 } } })
  ```
  Prisma will throw `P2025` on version mismatch — surface as `409 Conflict` to the UI.
- **Why CRITICAL**: financial integrity. The BHPH domain literally is a ledger; without optimistic locking it is a race-condition waiting room.

---

### MAJOR (fix in Phase 1 polish)

#### M-1 — Inconsistent audit fields across models
- **Where**: all 21 models
- **Issue**:
  - All models have `createdAt` ✅
  - Many have `updatedAt @updatedAt` (Dealer, Lead, Vehicle, Note, DealTerms) but **the following are missing `updatedAt`**: `User`, `Customer`, `Activity`, `Appointment`, `Communication`, `VehicleMedia`, `SyndicationLog`, `FiProduct`, `Document`, `BhphContract`, `BhphPayment`, `LeadScore`, `AgentRun`, `Embedding`.
  - **No model has `createdById` or `updatedById`**. The closest proxy is `Activity.authorId` (line 200) and `Communication.aiGenerated` (line 297), but there's no way to ask "who created Deal X?".
- **Exact recommendation**:
  1. Add `updatedAt DateTime @updatedAt` to every model missing it.
  2. Add a `createdById String?` and `updatedById String?` pair to all mutable business entities (skip on `Embedding`, `LeadScore`, `AgentRun` which are system-generated). Both should FK → `User.id` with `onDelete: SetNull` (don't lose the record if the user is later removed).
  3. Add `@@index([createdById])` to support audit queries ("show me everything user X touched this week").
- **Why MAJOR not CRITICAL**: dealership compliance auditors require this; one missing `updatedAt` on a derived table is recoverable from logs.

#### M-2 — JSON fields are not typed or documented
- **Where** (all `Json` columns):
  - `Dealer.settings` (line 29) — type unknown
  - `User.permissions` (line 74) — comment says `[]` (array) but no element schema
  - `Lead.vehicleInterest` (line 117) — `[]` array, no element shape
  - `Lead.sourceMeta` (line 118) — `{}` object, no documented keys
  - `Customer.address` (line 157) — could be a flat object or a multi-line object; ambiguous
  - `Activity.metadata` (line 199) — completely undocumented
  - `Embedding` (line 731) — `Unsupported("vector(1536)")` correctly typed but no `Embedding` model link to which entity it represents
  - `LeadScore.signals` (line 674) — `{}` signals dict, no key schema
  - `AgentRun.input`/`output` (line 700-701) — `{}` polymorphic blobs
  - `Note` (line 752) — `content` is `String`; if we ever want threaded notes, we'll be refactoring
- **Exact recommendation**: introduce a sibling file `packages/db/src/json-schemas.ts` (or `zod-schemas.ts`) that exports a Zod schema per JSON column, and use Zod to validate at the API boundary. Example:
  ```ts
  // packages/db/src/json-schemas.ts
  export const CustomerAddressSchema = z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    province: z.string().length(2),
    postalCode: z.string(),
    country: z.string().default('US'),
  }).strict();
  ```
  Document the JSON shape **inline in schema.prisma** as Prisma doesn't allow cross-file doc-comments, e.g.:
  ```prisma
  /// JSON shape: { line1: string, line2?: string, city: string, province: string(2), postalCode: string, country?: string }
  address       Json?
  ```
  For `Embedding`: at minimum add `entityType`/`entityId` to a typed model — these already exist, but the relation back to Lead/Customer/Vehicle is missing. Consider replacing Embedding with typed tables `LeadEmbedding`, `CustomerEmbedding` etc.

#### M-3 — String status fields should be enums
- **Where**:
  - `Document.type` (line 591) — `String?` (should be `DocumentType` enum: `BILL_OF_SALE`, `TITLE`, `LIEN_RELEASE`, `ODOMETER_DISCLOSURE`, `GAP_CERTIFICATE`, `WARRANTY`, `OTHER`)
  - `SyndicationLog.status` (line 453) — `String?` (should be `SyndicationStatus`: `PENDING`, `SUCCESS`, `FAILED`, `RATE_LIMITED`)
  - `BhphContract.status` (line 626) — `String @default("active")` (should be `BhphContractStatus`: `ACTIVE`, `PAID_OFF`, `DEFAULTED`, `REPOSSESSED`, `CANCELLED`, `RESTRUCTURED`)
  - `BhphPayment.status` (line 654) — `String @default("pending")` (should be `BhphPaymentStatus`: `SCHEDULED`, `PENDING`, `PAID`, `LATE`, `MISSED`, `PARTIAL`)
  - `BhphPayment.method` (line 653) — `String?` (should be `PaymentMethod`: `CASH`, `CHECK`, `MONEY_ORDER`, `CARD`, `ACH`, `OTHER`)
  - `AgentRun.status` (line 705) — `String @default("success")` (should be `AgentRunStatus`: `RUNNING`, `SUCCESS`, `FAILED`, `TIMEOUT`, `CANCELLED`)
  - `Lead.source` (line 107) — `String?` (should be `LeadSource` enum — you have 4 syndication channels already as `SyndicationChannel`, this is a near-miss)
- **Exact recommendation**: convert all to enums. Strings lose: (1) DB-level validation, (2) introspection, (3) autocomplete in IDE, (4) GraphQL/TRPC type generation, (5) the ability to `ALTER TYPE ... ADD VALUE` cleanly during deployment.

#### M-4 — Tenant identifier type deviates from spec
- **Where**: all 21 models
- **Issue**: Brief asked for `dealerId UUID NOT NULL`. Schema uses `String` (cuid). `cuid` is not a UUID — it is 25 chars, URL-safe, time-sortable, but not RFC-4122 compliant. This means downstream systems that consume the ID (webhooks to AutoTrader/CarGurus, email links, URL shorteners) cannot rely on UUID parsing.
- **Exact recommendation**: pick one and document it. If `cuid` is the chosen ID strategy (fine choice — Prisma's default), update the brief and the architecture doc; if `uuid` is preferred, switch to `@default(uuid())` on all `id` and `dealerId` columns, **including the relation columns**. Note this is a one-time data migration; do it before any production data lands.

#### M-5 — Money columns should not be `Float`
- **Where**: `VehiclePricing.cost/askingPrice/...` (line 396-403), `DealTerms.*` (line 533-547), `BhphContract.principal/paymentAmount/...` (line 618-625), `BhphPayment.amountDue/amountPaid/...` (line 647-652), `FiProduct.cost/sellingPrice/deductible` (line 565-569), `AgentRun.costUsd` (line 703)
- **Issue**: `Float` is IEEE-754 double precision. `0.1 + 0.2 !== 0.3` in floating point. For money, this is a **rounding-error bomb** that will explode in BHPH amortization calculations. `0.1 USD × 72 months` drifts by ~$0.0000001 per payment, accumulating to ~$0.0001 per contract — small individually, fatal at audit time.
- **Exact recommendation**: use `Decimal` (Prisma maps to `numeric(p, s)` in PG) and pick a precision. Recommended: `Decimal @db.Decimal(12, 2)` for any USD amount, `Decimal @db.Decimal(18, 8)` for any rate/percentage. Example:
  ```prisma
  cost         Decimal  @db.Decimal(12, 2)
  rate         Decimal  @db.Decimal(8, 4)  // 0.0525 for 5.25%
  paymentAmount Decimal @db.Decimal(12, 2)
  ```
  Add a Prisma `Decimal` library on the client side (Prisma returns `Prisma.Decimal` instances).

#### M-6 — `BhphContract.principal` etc. are not nullable but should be `Decimal`
- See M-5. Plus: `BhphContract` line 618-625 has no `createdAt`/`updatedAt` audit fields. See M-1.

#### M-7 — `VehicleMedia.uploadedAt` vs `createdAt` inconsistency
- **Where**: `VehicleMedia` line 425
- **Issue**: Uses `uploadedAt` instead of `createdAt`. Other tables use `createdAt`. Pick one. Also missing `updatedAt`.

#### M-8 — `Activity` polymorphic FK with `map:` is a referential-integrity hole
- **Where**: `Activity` line 207-211
- **Issue**: Four relations to `Lead`, `Customer`, `Deal`, `Vehicle` all use `fields: [entityId]` with `map: "fk_activity_*"`. This creates **four foreign keys that all point to the same `entityId` column**, only one of which is meaningful at a time. PG will let you insert an Activity with `entityType=LEAD, entityId=valid_deal_id` and there is no validation that the id exists in the right table.
- **Exact recommendation**: see C-2 fix — split into typed activity tables.

#### M-9 — `Dealer` model has no audit / soft-delete / actor tracking
- **Where**: `Dealer` line 21-51
- **Issue**: `Dealer` is the tenant anchor. It has no `deletedAt`, no `createdById`, no `suspendedAt`/`suspendedReason` field. Account suspension is going to be a requirement (non-payment, abuse, fraud) and there's no column for it. Add `status DealerStatus` with at least `ACTIVE`, `SUSPENDED`, `CHURNED`, `DELETED`.

#### M-10 — `User` has no `updatedAt`, no `passwordHash` (relies on auth provider, OK), no `mfaEnabled`
- **Where**: `User` line 66-88
- **Issue**: No `updatedAt` (M-1). The `permissions` JSON is supposed to be the override layer above `role`, but there's no enforcement story (is `permissions` additive? replacing? what schema? — see M-2). Recommend: rename `permissions` to `permissionOverrides` and document the merge semantics.

#### M-11 — `Note` is overly minimal
- **Where**: `Note` line 747-760
- **Issue**: Notes are cross-entity (`Lead`, `Customer`, `Deal`, `Vehicle`, etc.) but `Note` has **no `entityType`/`entityId` polymorphic pointer**. As written, a note is just freeform text attached to a user, with no link to what it's about. Either this is a gap (notes should be on the entity they describe) or the API is doing the joining in memory.
- **Exact recommendation**: add `entityType EntityType`, `entityId String`, and the same four FK relations as `Activity` — or, better, refactor to a shared `Comment` model that both `Note` and `Activity` can use.

#### M-12 — Missing composite indexes for known hot query patterns
- **Where**: multiple
- **Issue**: For a CRM, the four hottest queries are:
  1. "Show me all OPEN leads for dealer X, sorted by score, assigned to Y" → needs `@@index([dealerId, status, score])` and `@@index([dealerId, assignedToId, status])`. Current schema has `@@index([dealerId, status])` (line 132) but no score-sort or assignee filter.
  2. "Show me all vehicles in dealer X's inventory, AVAILABLE, sorted by acquiredAt desc" → needs `@@index([dealerId, status, acquiredAt(sort: Desc)])`. Current has `@@index([dealerId, status])` (line 371) only.
  3. "Show me all overdue BHPH payments for dealer X" → needs `@@index([dealerId, status, dueDate])` on `BhphPayment`. Current has `@@index([contractId])` and `@@index([dealerId])` (line 660-661) — neither matches the hot query.
  4. "Show me all communications for lead Y, ordered by sentAt desc" → needs `@@index([leadId, sentAt(sort: Desc)])`. Current has `@@index([leadId])` (line 308) only.
  5. "Syndication dashboard: latest log per (vehicle, channel)" → needs `@@index([vehicleId, channel, createdAt(sort: Desc)])`. Current has `@@index([dealerId, channel])` (line 464) which is not the same.
- **Exact recommendation**: add the composite indexes above. Prisma syntax: `@@index([dealerId, status, acquiredAt(sort: Desc)])`.

#### M-13 — `Embedding` model is orphaned from the entities it represents
- **Where**: `Embedding` line 725-740
- **Issue**: `entityType` + `entityId` are plain strings with no relation back. There's no FK constraint to Lead/Customer/Vehicle. As written, an embedding can refer to a deleted entity with no way to clean up. Also: `@@unique([dealerId, entityType, entityId])` is good — keep that — but cascade-delete on entity removal requires a trigger.

---

### MINOR (fix in Phase 2)

#### m-1 — `Appointment.durationMin` is `Int` but should default to a typed constant
- **Where**: `Appointment` line 246
- **Issue**: No enum or check constraint for typical values (15, 30, 60, 90). Minor — not worth a CRIT.

#### m-2 — `Lead.vehicleInterest` and `Lead.sourceMeta` are not in `Customer`
- **Where**: `Lead` line 117-118 vs `Customer` line 151-166
- **Issue**: When a Lead converts to a Customer, the vehicle-interest and source meta data is lost (no migration path documented in `seed.ts` or schema). This is data lineage — should be carried forward.
- **Exact recommendation**: when implementing the Lead→Customer conversion API, copy `vehicleInterest` and `sourceMeta` to the new Customer row, or denormalize into a `LeadConversion` log table.

#### m-3 — `Vehicle` has no `msrp`, `invoicePrice`, or `certified` flag
- **Where**: `Vehicle` line 337-373
- **Issue**: For new/CPO vehicles, MSRP/invoice/certified metadata is needed for sales tax calculation and compliance disclosure. Minor because `VehiclePricing` could carry it; the schema doesn't preclude it but doesn't model it.

#### m-4 — `Communication.subject` and `body` are unbounded `String`
- **Where**: `Communication` line 295-296
- **Issue**: `String` in Prisma maps to `text` in PG (unlimited). Email subjects and bodies can be large; no issue functionally, but add `@@index` on a hashed `subjectHash` or `messageId` for dedup.

#### m-5 — Missing `Email`/`SMS` provider metadata
- **Where**: `Communication` line 286-310
- **Issue**: No `provider` (Twilio? SendGrid? Postmark?), no `providerMessageId` (separate from `externalId`), no `threadId` for grouping. When debugging "why didn't this customer's SMS go through" you'll need these.

#### m-6 — `Document` model has no `version` or `supersedes` field
- **Where**: `Document` line 589-606
- **Issue**: When a deal is unwound and re-papered, you'll want document history. `signedAt` + `supersededById` is the minimum.

#### m-7 — `Deal.unwoundAt` / `Deal.unwoundReason` missing
- **Where**: `Deal` line 480-507
- **Issue**: `DealStatus.UNWOUND` exists in the enum but there's no `unwoundAt` timestamp or `unwoundReason` text. Once unwound, the deal is unaccounted for in audit trails.

#### m-8 — `LeadScore` is a write-once table; no `supersedes` link
- **Where**: `LeadScore` line 670-685
- **Issue**: If scoring reruns, you'll get a fresh `LeadScore` row per run but no way to say "this score supersedes that one". Add `previousScoreId` or `supersededAt`.

#### m-9 — `AgentRun` lacks a `traceId` / correlation ID
- **Where**: `AgentRun` line 693-714
- **Issue**: For multi-step agent workflows, you need to correlate sub-runs to a parent. Add `parentRunId` and `traceId String` with `@@index([traceId])`.

#### m-10 — No `IdempotencyKey` pattern documented
- **Where**: schema-wide
- **Issue**: For BHPH payment posting and document signing, duplicate requests will create duplicate records. Need an `Idempotency-Key` table or `requestId` column on `BhphPayment` / `Document` / `Communication`.

---

## Cross-Cutting Concerns

### Multi-Tenancy
- **Status: PARTIAL → FAIL** (per the brief's strict "every table has dealerId UUID NOT NULL with index")
- **DealerId coverage**: 19 of 21 models have `dealerId`. Exceptions:
  - `VehiclePricing` (line 394-409) — only has `vehicleId`, which is acceptable if you always join through Vehicle, but **there is no DB-level guarantee that `vehicleId` belongs to the right tenant**. Add `dealerId` denormalized, or a composite FK.
  - `DealTerms` (line 531-551) — only has `dealId`. Same problem.
  - `FiProduct` (line 559-573) — only has `dealId`. Same problem.
  - `User` (line 66-88) — has `dealerId` ✅ but no `@@index([dealerId, role])` for "list all admins of dealer X" queries.
- **Index coverage**: 18 of 19 dealerId-bearing tables have `@@index([dealerId])`. Missing: `User` has the index ✅, `Note` ✅, `LeadScore` ✅ — actually all present. ✅
- **On-delete behavior**: mix of `Cascade` and `SetNull`. Consistent enough — `Cascade` for owned data (Customer's leads), `SetNull` for assignee references. ✅
- **Issues**:
  - Three tables (`VehiclePricing`, `DealTerms`, `FiProduct`) inherit dealerId transitively. No composite FK enforces it.
  - `Activity` polymorphic FKs have no tenant integrity (see C-2).
  - `LeadScore` line 681 has no `onDelete` clause on the dealer relation (defaults to `NoAction` in PG — see C-2).

### Schema Integrity
- **Status: PARTIAL**
- **FK declaration**: 18 of 21 models have explicit FKs. `Embedding`, `AgentRun`, `LeadScore` are denormalized references — acceptable for an append-only analytics table.
- **Unique constraints**: present on critical uniqueness pairs (`User.dealerId+email`, `Vehicle.dealerId+vin`, `Embedding.dealerId+entityType+entityId`, `DealTerms.dealId`, `BhphContract.dealId`). ✅
- **Missing unique constraints**:
  - `Lead.leadScores` — no constraint that one Lead has one "current" score (see m-8).
  - `Customer.email` and `Customer.phone` — should have `@@index` (at minimum) on each. Current schema has no `@@index([dealerId, email])` for "find customer by email within a tenant".
  - `Vehicle.stockNumber` — not unique, not even indexed. Dealers rely on stock numbers.
- **Cascading deletes**: cascading works for `Customer → Lead → Activity` chain. But missing cascading on `Lead → LeadScore` (LeadScore has `onDelete: Cascade` ✅, but the `dealer` relation is `NoAction` — see C-2).

### Audit Trail
- **Status: FAIL**
- See C-1 (no soft delete) and M-1 (no `createdById`/`updatedById`).

### Concurrency
- **Status: FAIL**
- See C-3 (no optimistic locking).

### Money / Financial Integrity
- **Status: PARTIAL → FAIL** (per M-5)
- `Float` everywhere. See M-5 and M-6.

### Observability
- **Status: PARTIAL**
- `AgentRun` is good. `Activity` is good. But no `requestId` / `traceId` for cross-service correlation. No structured logging convention documented.

### AI / Embedding
- **Status: PARTIAL**
- `Embedding` model is well-typed (`Unsupported("vector(1536)")`) but orphaned from entities (M-13). LeadScore is good. AgentRun is good.

### Enums vs Strings
- **Status: PARTIAL**
- 11 enums defined. 6 string status fields still exist (M-3).

### Indexes
- **Status: PARTIAL**
- 27 indexes defined. Hot query patterns missing (M-12).

---

## Recommendations (Architectural)

### Phase 0 (before any data lands)
1. **Decide on ID strategy**: cuid (current) vs uuid. Document the choice.
2. **Convert `Float` → `Decimal` for all money/rate fields** (M-5). One-shot migration; do it now.
3. **Add soft-delete columns to all business entities** (C-1). Convention: `deletedAt`, `deletedById`, `deleteReason`.
4. **Add `version Int @default(0)` to Deal, Vehicle, BhphContract, BhphPayment, DealTerms** (C-3). API must increment on every update.
5. **Replace polymorphic `Activity` with typed activity tables** (C-2, M-8).
6. **Add composite FK constraints via raw SQL** for `VehicleMedia`, `Document`, `VehiclePricing`, `DealTerms`, `FiProduct` (C-2).

### Phase 1 polish
7. **Convert remaining string statuses to enums** (M-3). Six conversions.
8. **Add `updatedAt` to every model; add `createdById`/`updatedById` to mutable business entities** (M-1).
9. **Introduce Zod schemas for every JSON column** (M-2). Validate at API boundary.
10. **Add the missing composite indexes for hot query patterns** (M-12).
11. **Add `Dealer.status`, `Dealer.suspendedAt`, `Dealer.suspendedReason`** (M-9).
12. **Add `Deal.unwoundAt` / `Deal.unwoundReason`** (m-7).
13. **Add `Note.entityType` / `Note.entityId`** (M-11).
14. **Add `LeadScore.previousScoreId` or `supersededAt`** (m-8).
15. **Add `AgentRun.traceId` / `parentRunId`** (m-9).

### Phase 2
16. **Add `IdempotencyKey` table or `requestId` columns** (m-10).
17. **Add `Document.version` / `supersededById`** (m-6).
18. **Add `Vehicle.msrp` / `invoicePrice` / `certified`** (m-3).
19. **Add `Communication.provider` / `providerMessageId` / `threadId`** (m-5).
20. **Add `Communication.subjectHash` for dedup** (m-4).
21. **Lead→Customer conversion: copy `vehicleInterest` and `sourceMeta`** (m-2).
22. **Embed API service convention for raw SQL in migrations** — needed for partial indexes, composite FKs, vector operations, CHECK constraints.

---

## Re-Review Plan

As the following tasks complete, re-review and append to this document:

- [ ] **api-auth** — review for: tenant context middleware, JWT claims (does it carry `dealerId`?), `req.user.dealerId` enforcement on every protected route, role-based authorization on mutations, refresh-token rotation, password reset flow, MFA hooks (M-10).
- [ ] **api-crm** — review for: Lead/Customer/Activity endpoints enforce `where: { dealerId: ctx.dealerId }` on every query, Lead→Customer conversion atomicity, polymorphic Activity writes (C-2 mitigation at API layer), pagination (`cursor` not `offset` for large tables), input validation with Zod (M-2).
- [ ] **api-inventory** — review for: Vehicle CRUD tenant scoping, media upload pipeline, syndication job dispatch, version-check on price updates (C-3 mitigation at API layer), Decimal handling in serializers, optimistic concurrency responses (409).
- [ ] **api-deals** (when scheduled) — review for: deal-jack prevention (C-3), terms math in Decimal, BHPH amortization correctness, document signing flow, unwind path.
- [ ] **api-ai** (when scheduled) — review for: AgentRun writeback, Embedding CRUD and vector search with pgvector, rate limits per dealer, prompt-injection guardrails.

---

## Cross-Reference to Brief

| Brief requirement | Status | Where addressed |
|---|---|---|
| `dealerId UUID NOT NULL` on every table | PARTIAL | C-2 (missing on 3 child tables), M-4 (cuid, not UUID) |
| Soft delete pattern | **FAIL** | C-1 |
| Audit fields | PARTIAL | M-1 |
| Optimistic locking | **FAIL** | C-3 |
| JSON fields typed and documented | PARTIAL | M-2 |
| Enums (not strings) | PARTIAL | M-3 |
| Composite indexes for common query patterns | PARTIAL | M-12 |

---

## Open Questions for Parent

1. Is `cuid` the chosen ID strategy, or should we migrate to `uuid`?
2. Is per-request tenant-scoping enforced at the API layer via middleware, or do we rely on Prisma client extensions?
3. What's the BHPH money-precision policy — store as cents (Int) or as Decimal? (Decimal recommended; cents is also defensible.)
4. Is `Note` a polymorphic concept (M-11), or is it a deprecated model that should be removed in favor of `Activity.body`-as-note?
5. Should we keep `Embedding` polymorphic (current) or split per-entity (recommended)?

---

*End of review. Will re-evaluate as API and frontend tasks land.*
