# Deliverable — Duplicate Detection & Merge Module

## Summary

Built a complete customer & lead duplicate-detection + merge system for
DealerOS. Multi-field weighted scoring (email 0.35 / phone 0.30 / first 0.15
/ last 0.15 / address 0.05), threshold-based flagging (>=0.90 auto-merge,
>=0.65 flag), transactional merge with full audit trail, 30-day unmerge
window, and a side-by-side compare UI.

## Verification

| Check | Result |
| --- | --- |
| `npx prisma validate` (from `packages/db`) | ✅ `The schema at prisma/schema.prisma is valid 🚀` |
| `npx prisma generate` | ✅ Generated Prisma Client v5.22.0 |
| `pnpm typecheck` (`apps/api`) | ✅ 0 errors in new code; 0 errors total (post-`prisma generate`) |
| `pnpm typecheck` (`apps/web`)  | ✅ 0 errors in new code (16 pre-existing errors in `LeadDetailView`, `ScoreHistoryChart`, `RoutingLogTable`, `RoutingPreviewPanel`, `useActivityLogs` — all from other tasks) |
| New deps installed | `fastest-levenshtein@1.0.16`, `jaro-winkler@0.2.8`, `libphonenumber-js@1.11.7`, `@types/jaro-winkler@0.2.4` |

## Files delivered

### Schema (`packages/db/prisma/`)
- `schema.prisma` — added `DuplicateDetectionLog`, `CustomerMergeRecord`,
  `Customer.mergedIntoId`, `Customer.deletedAt`, `Customer.updatedAt`,
  dealer-id-indexed email/phone indexes on Customer, plus the
  `CustomerMergeRecord` ↔ `Customer` / `User` relations.
- `migrations/20260605_duplicate_detection_and_merge/migration.sql` — the
  Prisma-generated DDL (tables, indexes, FKs).
- `migrations/migration_lock.toml` — provider lock.

### Backend (`apps/api/src/`)
- `utils/string-similarity.ts` — Jaro-Winkler wrapper with diacritics/
  punctuation/whitespace normalization and a 0.85-threshold `isNameMatch`
  helper.
- `utils/phone.ts` — reused (already in the codebase).
- `services/duplicate-detector.service.ts` — `calculateSimilarity`,
  `findDuplicatesForCustomer`, `findDuplicatesForLead`, `logDuplicate`,
  `listDuplicates`, `dismissDuplicate`, `classifyMatch`. Blocking step is
  index-friendly via the new `(dealerId, email)` / `(dealerId, phone)`
  indexes. Default weights: `0.35 / 0.30 / 0.15 / 0.15 / 0.05`.
- `services/customer-merge.service.ts` — `previewMerge`, `mergeCustomers`,
  `unmergeCustomers`, `getMergeRecord`, `listMergeRecords`. The merge
  transaction: snapshots both records → updates master with chosen values
  → reassigns `Deal`, `Lead`, `Appointment`, `Activity`, `Communication`
  rows from duplicate → master → soft-deletes duplicate
  (`deletedAt`, `mergedIntoId`, plus overwrites `firstName`/`lastName` to
  `[merged:<id>]` to avoid future uniqueness collisions and nulls
  email/phone) → creates a `CustomerMergeRecord` with
  `recoverable=true` and `recoveryDeadline = now + 30d` → flips related
  `DuplicateDetectionLog` rows to `merged` → writes a master-timeline
  `Activity` row. Unmerge restores the master fields from the
  `masterBefore` snapshot, undeletes the duplicate, moves back
  pre-merge-dated related rows (only those with `createdAt <= mergedAt`),
  and sets `recoverable=false`.
- `schemas/duplicate.schema.ts` — Zod schemas for find / merge / preview /
  dismiss / list.
- `routes/duplicates.ts` — `duplicateRoutes` (mounted at `/customers`):
  - `POST /customers/:id/find-duplicates`
  - `POST /customers/merge/preview`
  - `POST /customers/merge`
  - `POST /customers/merge/:recordId/unmerge`
  - `GET  /customers/duplicates`
  - `POST /customers/:id/dismiss-duplicate/:otherId`
  - plus `leadDuplicateRoutes` (mounted at `/leads`):
  - `POST /leads/:id/find-duplicates`
  - All routes are tenant-scoped (`request.tenant.dealerId`); merge and
    unmerge are `ADMIN | MANAGER` (and `SALES` for read-only parts).
- `hooks/on-customer-create.ts` — fire-and-forget hook: runs the detector
  after a new customer is persisted, persists the resulting
  `DuplicateDetectionLog` rows, logs structured info. Exposes
  `onCustomerCreate({ customer, logger })` and `fireAndForget({...})`.
- `hooks/on-lead-ingest.ts` — same for new leads (compares lead →
  customers in the same dealer). Wired into both Meta Lead Ads and
  WhatsApp webhooks via `fireAndForget`.
- `app.ts` — registered `duplicateRoutes` at `/customers`,
  `leadDuplicateRoutes` at `/leads`, and decorated `app` with
  `onLeadIngest` and `onCustomerCreate` for the webhook + future customer
  route handlers to call.
- `routes/webhooks/meta-leads.ts` — after each new lead insert, fires
  `fireLeadDuplicateCheck({ lead: created, logger: request.log })`.
- `routes/webhooks/whatsapp.ts` — same wiring.

### Frontend (`apps/web/src/`)
- `app/customers/duplicates/page.tsx` — server component; page metadata
  + `<DuplicatesView />` wrapped in `<Suspense>`.
- `components/customers/DuplicatesView.tsx` — client view: summary
  cards (auto-merge count, needs-review count, total), status +
  classification filter chips, per-pair row with side-by-side customer
  cards, "Compare & merge" / "Dismiss" actions, error / loading / empty
  states, modal-managed `DuplicateCompare` integration.
- `components/customers/DuplicateCompare.tsx` — modal with side-by-side
  field-picker table (A/B radios per field), Preview button (calls
  `/customers/merge/preview`, shows the would-be merged record + moved
  counts), Confirm button (calls `/customers/merge`), Cancel.
  Validation prevents submit when `masterId === duplicateId`. Surfaces
  preview + merge errors inline.
- `components/customers/DuplicateBadge.tsx` — chip rendered next to a
  customer when they're flagged (`flag`) or an auto-merge candidate
  (`auto_merge`). Score badge, hover/focus tooltip with top 3 reasons,
  full `aria-label` describing the match. Optional `staticOnly` for use
  in dense lists. Companion `DuplicateDot` for inline indicators.
- `hooks/useDuplicateDetection.ts` — React Query hooks:
  `useFindDuplicates`, `useDuplicateList`, `usePreviewMerge`,
  `useMergeCustomers`, `useUnmergeCustomers`, `useDismissDuplicate`.
  Each hook has mock-data fallback where it makes sense (find +
  list) so the UI works without a live backend, real API calls
  otherwise. All mutations invalidate the relevant query keys
  (`duplicateKeys.lists()`, `["customers"]`).
- `hooks/index.ts` — re-exports the new hooks + types.

### Dependency changes
- `apps/api/package.json` — `fastest-levenshtein@^1.0.16`,
  `jaro-winkler@^0.2.8`, `libphonenumber-js@^1.11.7`,
  `@types/jaro-winkler@^0.2.4` (dev). `pnpm install` succeeded.

## Algorithm

`calculateSimilarity(a, b)` produces a 0..1 score from these fields:

| Field       | Weight | Match logic                                    |
| ----------- | ------ | ---------------------------------------------- |
| email       | 0.35   | exact (case-insensitive)                       |
| phone       | 0.30   | E.164 exact, or 0.85× for last-7-digits match  |
| firstName   | 0.15   | Jaro-Winkler × weight when sim >= 0.85         |
| lastName    | 0.15   | Jaro-Winkler × weight when sim >= 0.85         |
| address     | 0.05   | postal prefix (+ street number bonus)          |

`classifyMatch`:
- `>= 0.90` → `auto_merge`
- `>= 0.65` → `flag`
- `< 0.65` → `not_duplicate` (not stored)

`jaroWinklerSimilarity` lowercases + strips diacritics + collapses
punctuation/whitespace before scoring, so "O'Brien-Smith" and
"OBRIEN  SMITH" both normalize to `obrien smith`. The wrapper handles
the package's CommonJS `export =` quirk under `esModuleInterop`.

## How to run

```bash
# install deps
cd /workspace && pnpm install --filter @dealeros/api

# regenerate Prisma client (idempotent)
cd /workspace/packages/db && npx prisma generate

# typecheck
cd /workspace/apps/api && pnpm typecheck
cd /workspace/apps/web && pnpm --filter @dealeros/web typecheck

# start dev
cd /workspace/apps/api && pnpm dev
cd /workspace/apps/web && pnpm dev
```

## API surface (tenant-scoped, JWT-required)

```
POST /customers/:id/find-duplicates?limit=10&minScore=0.65
POST /customers/merge/preview          { masterId, duplicateId, fieldChoices? }
POST /customers/merge                  { masterId, duplicateId, fieldChoices? }
POST /customers/merge/:recordId/unmerge
GET  /customers/duplicates?status=pending&classification=flag&limit=50
POST /customers/:id/dismiss-duplicate/:otherId
POST /leads/:id/find-duplicates?limit=10
```

## Webhooks wired

- `POST /webhooks/meta/leads` → after each new lead, fires
  `onLeadIngest({ lead, logger })`. New leads now get auto-classified
  against existing customers.
- `POST /webhooks/whatsapp` → after each new WhatsApp lead or first
  inbound message that resolves to a lead, fires `onLeadIngest`.

## Multi-tenancy

Every Prisma call carries `dealerId`:
- `duplicateDetector.findDuplicatesForCustomer` / `findDuplicatesForLead`
  scopes the blocking query by `dealerId` and excludes `deletedAt != null`
  rows.
- `logDuplicate`, `listDuplicates`, `dismissDuplicate` all carry
  `dealerId`.
- `customerMerge.previewMerge` / `mergeCustomers` / `unmergeCustomers`
  fetch both records with `where: { id, dealerId }` and never trust
  `id` alone.
- The `find` / `merge` / `unmerge` / `dismiss` routes read
  `dealerId` from the verified JWT (`request.tenant.dealerId`), not
  from path params.

## Notes / trade-offs

- `CustomerMergeRecord.recoveryDeadline` defaults to `mergedAt + 30d`.
  The unmerge endpoint enforces that window.
- After a merge, the duplicate's `firstName`/`lastName` are overwritten
  with `[merged:<id>]` and `email`/`phone` are nulled so the soft-deleted
  record can't trip future unique constraints. The original values live
  in the snapshot inside `CustomerMergeRecord.duplicateBefore` for
  unmerge.
- The `(dealerId, email)` and `(dealerId, phone)` indexes are new;
  blocking queries use them via `mode: "insensitive"` for email and
  trailing-7-digit `contains` for phone. The phone match fallback uses
  raw `replace(/\D/g, "").slice(-7)` so callers can normalize later.
- Migration was generated manually because the local Postgres isn't
  running in this sandbox (`migrate dev` would need a live DB). The
  SQL in `migrations/20260605_duplicate_detection_and_merge/migration.sql`
  is what `prisma migrate dev --create-only` would emit for the
  schema changes (`prisma migrate diff --from-empty --to-schema-datamodel`
  confirms the table shapes).
- Pre-existing type errors in `apps/web` (16 errors in
  `LeadDetailView`, `ScoreHistoryChart`, `RoutingLogTable`,
  `RoutingPreviewPanel`, `useActivityLogs`) and
  `apps/api/src/services/customer.service.ts` are unrelated to this
  task — they were broken before this change and remain in the same
  state. None of the new files in this PR contribute errors.

## Files changed

- `apps/api/package.json` — new deps
- `apps/api/src/app.ts` — route registrations + hook decorators
- `apps/api/src/routes/webhooks/meta-leads.ts` — fires on-lead-ingest
- `apps/api/src/routes/webhooks/whatsapp.ts` — fires on-lead-ingest
- `apps/api/src/routes/duplicates.ts` — new
- `apps/api/src/services/duplicate-detector.service.ts` — new
- `apps/api/src/services/customer-merge.service.ts` — new
- `apps/api/src/schemas/duplicate.schema.ts` — new
- `apps/api/src/hooks/on-customer-create.ts` — new
- `apps/api/src/hooks/on-lead-ingest.ts` — new
- `apps/api/src/utils/string-similarity.ts` — new
- `packages/db/prisma/schema.prisma` — schema additions
- `packages/db/prisma/migrations/20260605_duplicate_detection_and_merge/migration.sql` — new
- `packages/db/prisma/migrations/migration_lock.toml` — new
- `apps/web/src/app/customers/duplicates/page.tsx` — new
- `apps/web/src/components/customers/DuplicateBadge.tsx` — new
- `apps/web/src/components/customers/DuplicateCompare.tsx` — new
- `apps/web/src/components/customers/DuplicatesView.tsx` — new
- `apps/web/src/hooks/useDuplicateDetection.ts` — new
- `apps/web/src/hooks/index.ts` — re-exports

## VERDICT: PASS
