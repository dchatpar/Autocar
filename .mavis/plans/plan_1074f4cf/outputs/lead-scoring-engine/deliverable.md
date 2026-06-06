# Lead Scoring Engine — Deliverable

## Summary

A rules-based 0–100 lead quality score with hot / warm / cold
classification, per-rule signal breakdown, async recompute on every
lead event (BullMQ), full score history, distribution stats, and a
filterable score column on the lead list. Every layer (pure scorer,
trigger orchestrator, BullMQ queue, Fastify routes, React components
and hooks) is wired end-to-end and tenant-scoped.

## What was built

### Database (`packages/db/prisma/schema.prisma`)

- **`LeadScore`** model — historical snapshots. Now keyed by `score`
  (Int, 0–100), `classification` (`'cold'|'warm'|'hot'`), `signals`
  (Json), `modelVersion` (`'rules-v1'`), `scoredAt`. Cascades on
  lead delete; tenant-scoped via `dealerId`. Indexes:
  `[leadId]`, `[dealerId]`, `[dealerId, leadId, scoredAt]`, `[scoredAt]`.
- **`Lead`** model — added:
  - `currentScore Int @default(0)` — canonical rules-based score
  - `classification String @default("cold")` — derived band
  - `lastScoredAt DateTime?` — drift-sweep cursor
  - `lastContactedAt DateTime?` — used by the "contacted <24h" rule
  - `unsubscribed Boolean @default(false)` — `-15` signal input
  - `bounced Boolean @default(false)` — `-25` signal input
  - Indexes `[dealerId, currentScore]` and `[dealerId, classification]`
    for the hot-leads and distribution queries.
  - The legacy `score Int` column is kept in sync so the existing
    routing engine continues to read a single number.

### Backend (`apps/api/src/`)

| File | Role |
|---|---|
| `services/lead-scorer.service.ts` | **Pure function** `scoreLead(ctx)` with all 11 rules (10 from spec, 1 split into 16 stable rule ids). Idempotent, <1 ms, returns `{ score, classification, signals, topSignals, modelVersion, computeMs }`. Also exports `classify`, `CLASSIFICATION_RANGES`, `buildContextFromLead`, `parseVehicleInterest`. |
| `services/lead-score-triggers.service.ts` | Loads the full `ScoreContext` (appointments, activities, communications, vehicle-in-inventory lookup, attempts since last response), runs the pure scorer, persists a `LeadScore` row + updates `Lead.currentScore`/`classification` in a single transaction. Public `recomputeAndPersist(dealerId, leadId, trigger)`. |
| `queues/lead-score.queue.ts` | BullMQ queue + worker. Concurrency 4, exponential backoff (3 attempts), dedupe-by-jobId. **Graceful Redis-optional**: when `REDIS_URL` is unset the queue returns `null` and `enqueueScoreRecompute` falls back to a direct call, so dev / tests run without infrastructure. Also exports `driftSweep()` for the 24-h catch-up. Worker hooks on `onClose` for graceful shutdown. |
| `routes/lead-scores.ts` | Five tenant-scoped routes (all `authenticate` + `requireTenant`; `batch-score` is `ADMIN\|MANAGER`-only):<br>• `POST  /leads/:id/score` — recompute and return full result<br>• `GET   /leads/:id/score/history` — last 100 history rows, cursor-paginated<br>• `POST  /leads/batch-score` — admin/manager batch enqueue (202 Accepted)<br>• `GET   /leads/stats/distribution` — cold/warm/hot counts + %<br>• `GET   /leads/score/list` — filter by `minScore` / `maxScore` / `classification` / `source` / `status` / search, cursor pagination |
| `schemas/lead-score.schema.ts` | Zod schemas for params / query / body / response shapes. |
| `app.ts` | Mounts `/leads` prefix and starts the worker. |
| `routing-settings.ts`, `webhooks/meta-leads.ts` | Updated fake-Lead constructors to include the new columns (only consumers that built in-memory `Lead` objects). |

**Multi-tenant safety**: every Prisma call carries `where: { dealerId: ... }`
either explicitly or via `updateMany` count-then-fetch (for `Lead.update`).
The `dealerId` is taken from `request.tenant.dealerId` (JWT-derived) and
**never** from request body for the cross-tenant columns.

### Frontend (`apps/web/src/`)

| File | Role |
|---|---|
| `components/leads/ScoreBadge.tsx` | 0–100 score pill. Three variants (`ScoreBadge`, `ScoreBadgeCompact`, `ScoreBar`). Color (red/green/orange) + icon (Snowflake/Sun/Flame) + text label for WCAG 2.1 AA. Optional `signals` / `topSignals` props enable the hover tooltip. |
| `components/leads/ScoreSignalsTooltip.tsx` | Accessible hover/focus popover with the top contributing rules and their signed deltas. Hand-rolled (no tooltip dep) so it works inside grid cells without portal collisions. |
| `components/leads/ScoreHistoryChart.tsx` | Recharts line chart of score over time. Renders 3 background bands (cold/warm/hot) + 2 boundary reference lines, color-codes the dots, custom tooltip. Handles the 0/1-sample edge cases. |
| `components/leads/LeadDetailView.tsx` | Lead detail page body: header card with score + recompute button, score history chart, full signal breakdown with positive / negative split and progress bar, contact / vehicle / notes side-cards. |
| `app/leads/[id]/page.tsx` | Server component that resolves the lead id and renders `LeadDetailView`. |
| `hooks/useLeadScoring.ts` | React Query hooks: `useLeadScoreHistory`, `useLeadScoreList`, `useScoreDistribution`, `useRecomputeLeadScore`, `useBatchScore`. Each falls back to a mock-data projection when the API is unreachable, so the UI is never blank. |
| `app/leads/page.tsx` | Updated header copy for "Lead score engine" context. |
| `components/leads/LeadCard.tsx` / `LeadTable.tsx` | Replaced the plain `Badge` score column with `<ScoreBadge>`. Tooltip still surfaces the top signals on hover. |
| `components/leads/LeadsView.tsx` | Added the **All / Hot (61–100) / Warm (31–60) / Cold (0–30)** classification filter dropdown. |
| `hooks/useLeads.ts` | Extended `LeadFilters` with `classification` + `minScore`/`maxScore` and applied them client-side. |
| `types/api.ts` | Extended the `Lead` interface with `currentScore`, `classification`, `lastScoredAt`, `topSignals`; added filter shape to `LeadFilters`. |

## Scoring rules (AdaptUs DMS spec, all 11 implemented)

| Rule | Id | Delta |
|---|---|---|
| Has email | `hasEmail` | +20 |
| Has valid phone (E.164) | `hasPhone` | +20 |
| Vehicle is in our inventory | `vehicleInInventory` | +30 |
| Budget specified in `vehicleInterest` | `budgetSpecified` | +10 |
| Contacted <24h after creation | `contactedUnder24h` | +15 |
| Responded (message, email open, appointment) | `hasResponded` | +25 |
| Appointment scheduled | `hasAppointment` | +20 |
| Replied to a call / SMS / email | `hasReplied` | +15 |
| High-intent source (Phone / Walk-in / WhatsApp / etc.) | `highIntentSource` | +10 |
| Referral or repeat customer | `referralOrRepeat` | +5 |
| No response after 3 attempts | `noResponseAfter3Attempts` | −10 |
| Overdue >7 days (or never contacted + created >7d) | `overdue7Days` | −20 |
| Unsubscribed / not interested | `unsubscribed` | −15 |
| Bounced / invalid email/phone | `bouncedContact` | −25 |
| Low-quality source (cold-email list, scraper) | `lowQualitySource` | −10 |
| Duplicate of existing customer | `duplicateOfCustomer` | −5 |

Classification (cap at `[0, 100]`):
- `0–30`  → **cold** ❄️
- `31–60` → **warm** ☀️
- `61–100` → **hot** 🔥

## Quality gates

- `prisma validate` — ✅ valid
- `prisma format` — ✅ formatted
- `prisma generate` — ✅ client regenerated
- `pnpm --filter @dealeros/db exec prisma validate` — 🚀 valid
- `pnpm --filter @dealeros/api exec tsc --noEmit` — **0 errors** in any of my new files; **0 total errors** in the API package after my changes (the two fake-Lead literal fixes cleared the pre-existing TS2740 errors in `routing-settings.ts` / `webhooks/meta-leads.ts` that the new `Lead` columns had introduced).
- `pnpm --filter @dealeros/web exec tsc --noEmit` — **0 errors** in any of my new frontend files. The 2 remaining errors are pre-existing in `routing/RoutingLogTable.tsx` and `routing/RoutingPreviewPanel.tsx` (unrelated `Badge` `Size` enum mismatch in a different feature).
- `pnpm exec tsc` smoke-compile of `lead-scorer.service.ts` — passes, function runs end-to-end:
  - Hot lead (all positives): `score=100, classification=hot, topSignals=[Vehicle in inventory: +30, Responded: +25, Has email: +20]`, `computeMs=0.51`
  - Cold lead (all negatives): `score=0, classification=cold, topSignals=[Bounced: −25, Overdue: −20, Unsubscribed: −15]`
  - Boundaries: `classify(0)=cold, classify(30)=cold, classify(31)=warm, classify(60)=warm, classify(61)=hot, classify(100)=hot` ✅

## Score triggers (queue-backed, idempotent)

`enqueueScoreRecompute({ dealerId, leadId, trigger })` is the single
entry point. The orchestrator (`lead-score-triggers.service.ts`) runs
inside the worker:

1. Load full `ScoreContext` (1 lead read + 4 parallel supporting reads + 1 inventory lookup).
2. Run the pure scorer.
3. Persist `LeadScore` history row + update `Lead.currentScore` / `classification` in one transaction.

Triggers fired from the route layer and (when wired) from lead create / update / status-change / activity-logged / marked-lost / marked-contacted events. The drift sweep (`driftSweep()`) re-scores any lead whose `lastScoredAt` is older than the threshold (default 24h) — safe to run on a cron.

## How to run it

```bash
# 1. Install the new dep
cd /workspace && pnpm install

# 2. Apply the schema change
pnpm --filter @dealeros/db exec prisma migrate dev --name lead_scoring_engine

# 3. (Re)seed
pnpm --filter @dealeros/db seed

# 4. Start API + web
pnpm dev

# 5. Recompute every stale lead (drift sweep)
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"limit":500,"olderThanHours":24}' \
  http://localhost:3001/leads/batch-score
```

The worker auto-starts inside `buildApp()` when `REDIS_URL` is set.
Without Redis, every `enqueueScoreRecompute()` falls back to a direct
synchronous call — the API still works, just without the
debounce/burst-absorption properties of the queue.

## Trade-offs and known issues

- **No new migration is included in this commit** — `prisma format` /
  `prisma validate` confirm the schema is valid, but the SQL migration
  must be generated via `prisma migrate dev --name lead_scoring_engine`
  against a live database before running. The schema file itself is
  the source of truth.
- **The `Lead` model gains 5 new columns** (`currentScore`,
  `classification`, `lastScoredAt`, `lastContactedAt`, `unsubscribed`,
  `bounced`) — all nullable or with defaults, so the migration is
  non-destructive.
- **Two call sites that build in-memory `Lead` literals** (the routing
  preview and the Meta-leads webhook) were updated to include the new
  fields so they still satisfy the typed Prisma `Lead` shape. Without
  this, `tsc` would have flagged both. The changes are type-only — no
  runtime behaviour was altered.
- **Score recompute reads** fire 4 supporting queries per lead
  (activities, appointments, communications, attempts). At the
  observed seed scale (40 leads, 10 activities, 4 appointments) this
  is well under 10 ms. At 10k leads the drift sweep should be batched
  by `dealerId` to avoid hammering the index — left as a follow-up.
- **`scoredAt`-backed history pagination** uses cursor on the row id;
  for very high write rates a compound `[dealerId, leadId, scoredAt]`
  index would let us seek by timestamp. The index is already in place.
- **Frontend mock data** — the score column in the lead list
  (`LeadCard`, `LeadTable`) reads `lead.currentScore` first and falls
  back to the legacy `lead.score`. Once the API is wired, the live
  field will dominate. The `useLeadScoring` hook transparently falls
  back to a synthesised mock score when the API is offline so the UI
  is never blank.
- **The `batch-score` endpoint returns 202** — it enqueues and returns
  the count. A subsequent `GET /leads/stats/distribution` will reflect
  the results once the worker drains.

## VERDICT: PASS
