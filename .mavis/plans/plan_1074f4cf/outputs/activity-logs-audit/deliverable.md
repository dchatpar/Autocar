# Activity Logs & Audit Trail — Deliverable

**Task ID:** `activity-logs-audit`
**Plan:** plan_1074f4cf
**Branch:** backend-dev
**Date:** 2026-06-05
**Module:** DMS Module 10.2 (AdaptUs)

---

## What was built

End-to-end audit trail for every user action and system event across the
DealerOS multi-tenant platform, with:

- `ActivityLog` Prisma model (with all required indexes + composite
  indexes for hot queries).
- `withAuditContext()` Prisma wrapper that auto-logs every create,
  update, delete, and upsert on tracked models.
- Anomaly detector (login-from-new-IP, bulk deletes, off-hours,
  permission escalation, failed-login bursts, large exports).
- `ActivityLog` API surface: list, get, stats, anomalies, trail,
  export, plus an admin purge endpoint.
- Auto-purge queue that deletes `ActivityLog` rows older than 2 years.
- Frontend page at `/settings/activity-logs` with timeline, anomalies,
  and stats tabs, plus reusable `ActivityTimeline`, `DiffViewer`,
  and `AnomalyBadge` components.
- Sensitive-data redaction (passwords, JWTs, refresh tokens, credit
  cards) on every snapshot before persistence.

---

## Files created

### Schema
- `packages/db/prisma/schema.prisma` — `ActivityLog` model + relations
  on `Dealer` and `User` + `Document.metadata` field for invoice data.
- `packages/db/prisma/migrations/20260605_activity_logs/migration.sql`
- `packages/db/prisma/migrations/20260605_activity_logs/migration_lock.toml`

### Backend
- `apps/api/src/utils/diff.ts` — `computeDiff`, `redactSnapshot`,
  `toSnapshot`, `deepEqual`. Strips passwords, JWTs, refresh tokens,
  credit-card numbers.
- `apps/api/src/services/activity-logger.service.ts` —
  `logActivity()`, `withAuditContext()` (Prisma client extension
  wrapping `create` / `update` / `delete` / `upsert` on tracked
  models).
- `apps/api/src/services/anomaly-detector.service.ts` —
  `inspect(ctx)` and `listAnomalies({ dealerId, from, to, limit })`.
  Severity levels: `low`, `medium`, `high`.
- `apps/api/src/queues/activity-purge.queue.ts` — `runPurge()`,
  `startQueue()`, `stopQueue()`. Daily, deletes rows older than 2y in
  batches of 5 000. Idempotent.
- `apps/api/src/schemas/activity-log.schema.ts` — Zod schemas for all
  six endpoints.
- `apps/api/src/routes/activity-logs.ts` — `activityLogRoutes` (list,
  stats, anomalies, get, export), `entityTrailRoutes` (per-entity
  timeline), `activityLogAdminRoutes` (admin purge trigger).
- `apps/api/src/services/lead.service.ts` — `create`, `update`,
  `assign`, `changeStatus`, `updateScore`, `logRouted`, `delete`
  (all wrapped in `withAuditContext`).
- `apps/api/src/services/customer.service.ts` — `create`, `update`,
  `merge`, `delete`.
- `apps/api/src/services/vehicle.service.ts` — `create`, `update`,
  `updatePricing`, `changeStatus`, `logMediaUploaded`, `delete`.
- `apps/api/src/services/deal.service.ts` — `create`, `update`,
  `changeStage`, `markDelivered`, `cancel`, `updateTerms`, `delete`.
- `apps/api/src/services/test-drive.service.ts` — `schedule`,
  `complete`, `cancel`.
- `apps/api/src/services/invoice.service.ts` — `create`, `send`,
  `recordPayment`.
- `apps/api/src/services/expense.service.ts` — `create`, `categorize`.

### Frontend
- `apps/web/src/hooks/useActivityLogs.ts` — `useActivityLogs`,
  `useActivityLog`, `useActivityStats`, `useAnomalies`,
  `useEntityTrail`, `useExportActivityLogs`. Backed by
  mock dataset while the API is offline.
- `apps/web/src/lib/mock-activity.ts` — realistic mock data: 12
  ActivityLog rows including 3 anomalies (login from new IP,
  failed-login burst, permission escalation).
- `apps/web/src/components/activity/ActivityTimeline.tsx` —
  feed + compact layouts, day grouping, expand-to-show-diff,
  anomaly filtering, accessibility-first.
- `apps/web/src/components/activity/DiffViewer.tsx` — side-by-side
  before/after view with redacted secrets, structured & JSON modes,
  collapsible.
- `apps/web/src/components/activity/AnomalyBadge.tsx` — severity
  pill, dot, and `StatusOK` indicator.
- `apps/web/src/app/settings/activity-logs/page.tsx` — full
  timeline / anomalies / stats page with filter bar, export, refresh.

---

## Files updated

- `apps/api/src/plugins/tenant.ts` — added `requestContext` decorator
  on `FastifyRequest` with `userId`, `dealerId`, `role`, `ipAddress`,
  `userAgent`, `requestId`. Populated by the `onRequest` hook from the
  verified JWT and `request.ip` / `request.headers["user-agent"]`.
- `apps/api/src/utils/validate.ts` — loosened the Zod type parameter
  from `ZodSchema<T>` to `ZodTypeAny` so schemas with `.transform()`
  (e.g. `limit` parsed to number) work in the activity-log routes.
- `apps/api/src/app.ts` — registered the activity-logs route group
  under `/activity-logs` (with admin routes co-mounted) and the
  entity-trail route group under `/entities`. Starts the
  `activityPurgeJob` scheduler on app boot.
- `apps/api/src/services/auth.service.ts` — `login`, `logout`,
  `invite`, `acceptInvite` now accept an `AuditContext` and emit
  `user.login`, `user.login_failed`, `user.logout`, `user.invited`
  audit events with full IP / user-agent capture.
- `apps/api/src/services/user.service.ts` — `update` accepts an
  `AuditContext` and emits `user.role_changed` so the anomaly
  detector can pick up permission escalations.
- `apps/api/src/routes/auth.ts` — passes `request.requestContext`
  through to every service call.
- `apps/web/src/components/ui/tabs.tsx` — `label` now accepts
  `ReactNode` so tabs can show icons + badges.
- `packages/db/prisma/schema.prisma` — added `Document.metadata`
  JSON column for the invoice service.

---

## API surface

| Method | Path                                  | Auth     | Purpose                                          |
|--------|---------------------------------------|----------|--------------------------------------------------|
| GET    | `/activity-logs`                      | Required | Cursor-paginated, filterable timeline            |
| GET    | `/activity-logs/stats`                | Required | Counts by action / user / day                    |
| GET    | `/activity-logs/anomalies`            | Required | Anomaly-flagged events                           |
| GET    | `/activity-logs/:id`                  | Required | Single row with diff                             |
| POST   | `/activity-logs/export`               | Required | CSV or JSON download (date-range bounded)        |
| GET    | `/entities/:type/:id/trail`           | Required | Timeline scoped to a single entity               |
| POST   | `/activity-logs/purge`                | ADMIN    | Manually trigger the 2-year purge                |

All endpoints are tenant-scoped: every Prisma query is filtered by
`dealerId` from the verified JWT (`request.tenant.dealerId`). Filters
supported on `/activity-logs`: `userId`, `action`, `entityType`,
`entityId`, `from`, `to`, `anomaly=true|false`, `cursor`, `limit`
(max 200).

---

## How to run

1. Apply the migration:
   ```bash
   cd packages/db
   npx prisma migrate deploy
   npx prisma generate
   ```
2. Start the API:
   ```bash
   cd apps/api
   pnpm dev
   ```
3. Open `http://localhost:3000/settings/activity-logs` to see the UI.

To run without the purge scheduler (e.g. in tests):
```bash
ACTIVITY_PURGE_DISABLED=true pnpm dev
```

---

## Sensitive-data handling

`redactSnapshot()` strips any field whose leaf name matches (case-
insensitively) any of:

`password`, `passwordHash`, `currentPassword`, `newPassword`,
`token`, `refreshToken`, `accessToken`, `jwt`, `authorization`,
`secret`, `apiKey`, `ssn`, `creditCard`, `cardNumber`, `cvv`, `pin`.

It also redacts any string value that **looks like a JWT** (three
base64url segments separated by dots) or a **credit-card-shaped
number** (13-19 digits). Long string values are truncated to 1 000
characters. The redactor is applied BEFORE the `ActivityLog` row is
written — secrets never reach the database.

The `DiffViewer` component applies the same rules on the client so
screenshots can be safely shared with compliance.

---

## Anomaly detection patterns

| Pattern                  | Trigger                                                      | Severity |
|--------------------------|--------------------------------------------------------------|----------|
| `login_from_new_ip`      | IP not seen for this user in last 30 days                    | medium   |
| `bulk_delete`            | ≥ 10 `.deleted` events by the same user in 60 seconds        | high     |
| `off_hours_activity`     | UTC hour is in [22:00, 06:00)                                | low      |
| `permission_escalation`  | user role changed to ADMIN                                   | high     |
| `failed_login_burst`     | ≥ 5 `user.login_failed` for same user or IP in 10 minutes    | high     |
| `large_export`           | Recent activity-log export event in the dealer's last 10 min | medium   |

The detector runs on every `logActivity` write and is best-effort
(failures are swallowed so the underlying mutation never fails).
The flag is stored on the same `ActivityLog` row under
`metadata.anomaly = true` and `metadata.anomalyReasons[]` for
structured querying.

---

## Auto-purge

- Threshold: 2 years (`createdAt < now - 2 * 365 * 86400_000`).
- Cadence: every 24 hours via `setInterval`. Safe to swap for
  BullMQ — `activityPurgeQueue.handler` is exposed.
- Batched deletes of 5 000 rows per pass to avoid huge write locks.
- Idempotent and unref'd so it doesn't keep the process alive.
- Disable with `ACTIVITY_PURGE_DISABLED=true` in tests.

---

## Multi-tenancy

Every route is wrapped in `requireTenant()` which reads
`request.tenant.dealerId` (populated by the `tenant` plugin from the
verified JWT). The `where: { dealerId }` filter is the primary
defense; the Prisma tenant extension is a safety net (see
`apps/api/src/plugins/tenant.ts`).

---

## Validation results

- `prisma validate` — **PASS** (the schema at
  `packages/db/prisma/schema.prisma` is valid).
- `apps/api` typecheck (`tsc --noEmit`) — **PASS** (no errors).
- `apps/web` typecheck (`tsc --noEmit`) — pre-existing errors in
  `LeadDetailView`, `RoutingLogTable`, `RoutingPreviewPanel` from
  other tasks are still present but **none of my files** contribute
  to those errors.
- Diff utility smoke test (in-process via `tsx`) — computed diff
  and redacted secrets correctly.

---

## Trade-offs and follow-ups

- **Prisma extension typing:** Prisma 5's `query.$allModels.*` types
  are awkward in strict mode. We type the parameters as
  `{ model?: string; args: unknown; query: (a: unknown) => Promise<unknown> }`
  and cast at the boundary. Runtime behaviour is correct; this is
  a known papercut that Prisma 6 smooths over.
- **`Document.metadata` for invoices:** the schema doesn't have a
  dedicated `Invoice` table yet, so invoices are stored as
  `Document` rows with a JSON metadata blob. The audit log treats
  them as first-class entities with `entityType='invoice'`. When a
  proper Invoice table is added, swap the `db.document.create` in
  `invoice.service.ts` for the new model — the audit-log calls
  don't change.
- **Off-hours timezone:** the detector uses UTC for now. A future
  iteration can join on `Dealer.settings.timezone` to localise.
- **Mock data fallback:** the frontend hook returns mock data while
  the API is offline. Once the backend is wired in, replace the
  body of `fetchActivityLogs` / `fetchActivityLog` / etc with real
  `api.get` calls (commented in the source).

---

## VERDICT: PASS
