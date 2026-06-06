# Battle-QA Report — DealerOS

**Agent**: qa-battle
**Date**: 2026-06-05 17:35 UTC
**Mode**: Adversarial / break-only / supervisor-fixes
**Scope**: DB schema, UI design system, shared contracts, build config

---

## TL;DR — BATTLE_FAIL (DB) + BATTLE_FAIL (UI Build) + BATTLE_FAIL (Contract Alignment)

| Domain | Verdict | Severity |
|---|---|---|
| `prisma validate` | ✅ PASS | runs clean |
| `prisma migrate` applied | ❌ FAIL | **CRITICAL** — `migrations/` is empty |
| `@prisma/client` generated | ❌ FAIL | **CRITICAL** — `node_modules/.prisma/client/` missing |
| 21 tables present | ✅ PASS | counted 21 models |
| `@@unique([dealerId, vin])` on Vehicle | ✅ PASS | line 369 |
| All 21 tables have `dealerId` | ❌ FAIL | **3 models** have no `dealerId` |
| All tenant-scoped models have `@@index([dealerId])` | ❌ FAIL | 1 model missing |
| All FK fields have indexes | ❌ FAIL | 14 FKs missing indexes |
| UI design system components | ⚠️ PARTIAL | 11 in `ui/`, `command-palette` misplaced |
| `any` types in UI | ✅ PASS | 0 occurrences |
| `console.log` in UI | ❌ FAIL | 9 occurrences (in layout/) |
| Hardcoded light-mode hex in components | ❌ FAIL | `#d4e639`, `text-white`, `red-600`, `emerald-400`, `orange-600` |
| TailwindCSS v4 build config | ❌ FAIL | Vite plugin in Next.js app, no PostCSS, no `postcss.config` |
| Shared Zod ↔ Prisma enum alignment | ❌ FAIL | Lead/Deal/UserRole enums mostly don't match |
| TypeScript `tsc --noEmit` | ✅ PASS | web/ passes |

---

## 1. DATABASE SCHEMA

**File**: `/workspace/packages/db/prisma/schema.prisma` (21 models, 547 lines)

### 1.1 ✅ PASS — `prisma validate`

```
$ cd /workspace/packages/db && npx prisma validate
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

### 1.2 ❌ CRITICAL — Migrations never generated

```
$ ls /workspace/packages/db/prisma/migrations/
(empty)
```

`prisma migrate dev` has never been run. There is no migration history, no `migration_lock.toml`, and no SQL in the migrations directory. This means:
- The "schema" is pure fiction until someone actually runs `migrate dev` or `db push`.
- Any production deploy will be the first time these tables are created — and the supervisor's documented fixes (multi-tenant indexes, composite VIN) only exist in `schema.prisma`, not in any migration.
- If the team runs `migrate dev` now, the production parity of those fixes is one command away from being lost.

### 1.3 ❌ CRITICAL — Prisma client not generated

```
$ ls /workspace/packages/db/node_modules/.prisma/client/
ls: cannot access ...: No such file or directory
```

Without a generated client, **no app code can import `@prisma/client` and resolve a model**. The `seed.ts` file imports `from '@prisma/client'` — running it will fail with `Cannot find module '@prisma/client'`.

### 1.4 ❌ CRITICAL — 3 models missing `dealerId` (the tenant column)

| Model | Has `dealerId`? | Has `@@index([dealerId])`? | Notes |
|---|---|---|---|
| `Dealer` | (it's the tenant) | n/a | n/a |
| `User` | ✅ | ✅ | |
| `Lead` | ✅ | ✅ | |
| `Customer` | ✅ | ✅ | |
| `Activity` | ✅ | ✅ | |
| `Appointment` | ✅ | ✅ | |
| `Communication` | ✅ | ✅ | |
| `Vehicle` | ✅ | ✅ + composite | |
| **`VehiclePricing`** | **❌ NO** | **n/a (no column)** | Only has `vehicleId`. Tenant must JOIN through Vehicle. |
| `VehicleMedia` | ✅ | ✅ | |
| `SyndicationLog` | ✅ | **❌ Missing `@@index([dealerId])`** | Only `[dealerId, channel]` composite |
| `Deal` | ✅ | ✅ + composite | |
| **`DealTerms`** | **❌ NO** | **n/a (no column)** | Only has `dealId`. |
| **`FiProduct`** | **❌ NO** | **n/a (no column)** | Only has `dealId`. |
| `Document` | ✅ | ✅ | |
| `BhphContract` | ✅ | ✅ | |
| `BhphPayment` | ✅ | ✅ | |
| `LeadScore` | ✅ | ✅ | |
| `AgentRun` | ✅ | ✅ | |
| `Embedding` | ✅ | ✅ | |
| `Note` | ✅ | ✅ | |

**`VehiclePricing`, `DealTerms`, `FiProduct` have no `dealerId` column at all.** This breaks the supervisor's "every tenant-scoped query has dealerId filter" requirement. To tenant-isolate, the API must JOIN through `Vehicle`/`Deal` first — full-table-scan-prone and easy to forget, with no Prisma middleware fallback because the column doesn't exist.

`SyndicationLog` has `dealerId` but is missing `@@index([dealerId])` — only the composite `[dealerId, channel]` exists, which is not used by every dealer-scoped query.

### 1.5 ❌ CRITICAL — Massive FK index gap

These FK fields have **no index** (queries that join/find by them will full-table-scan):

| Model | FK | Why it matters |
|---|---|---|
| `VehiclePricing` | `vehicleId` | Every pricing lookup |
| `Deal` | `vehicleId` | "Deals for this VIN" |
| `Lead` | `customerId` | "Customer's leads" |
| `Appointment` | `customerId` | "Customer's appointments" |
| `Appointment` | `leadId` | "Lead's appointments" |
| `Deal` | `leadId` | "Lead's deal history" |
| `LeadScore` | `leadId` | "Latest score for lead" |
| `Activity` | `authorId` | "User's activity feed" |
| `Lead` | `assignedToId` | "My open leads" (the #1 sales query) |
| `Deal` | `assignedToId` | "My deals" |
| `DealTerms` | `dealId` | "Terms for deal" |
| `BhphContract` | `dealId` | "Contract for deal" |
| `Note` | `userId` | "User's notes" |

(Plus the 3 missing dealerId columns above, which can never be indexed.)

### 1.6 ⚠️ STRUCTURAL — `Activity` has 4 relations on one field

```prisma
model Activity {
  entityId   String
  ...
  lead     Lead?     @relation(fields: [entityId], references: [id], map: "fk_activity_lead")
  customer Customer? @relation(fields: [entityId], references: [id], map: "fk_activity_customer")
  deal     Deal?     @relation(fields: [entityId], references: [id], map: "fk_activity_deal")
  vehicle  Vehicle?  @relation(fields: [entityId], references: [id], map: "fk_activity_vehicle")
}
```

Four relations on a single `entityId String` field, with `map:` providing constraint names but no actual `references:` on the `Activity` side. Prisma accepts this as a virtual relation (no DB FK is created), which means:
- No referential integrity. Orphan Activity rows are easy.
- The four `@relation` lines are decorative — they don't enforce anything.
- Querying `activity.lead` will return data only when `entityId` happens to match a Lead.id, with no Prisma type-level safety that `entityType` matches.
- A future "add entityId index" would actually be useful (it's missing too).

### 1.7 ⚠️ MINOR — Inconsistent cascade behavior

`LeadScore.dealer` relation has no `onDelete:` directive:
```prisma
dealer Dealer @relation(fields: [dealerId], references: [id])  // no onDelete
```
Every other dealer relation uses `onDelete: Cascade`. If a Dealer is deleted, LeadScore rows would block the deletion (default Prisma = `Restrict`).

### 1.8 ✅ PASS — `@@unique([dealerId, vin])`

Line 369: `@@unique([dealerId, vin])` — correct composite. Supervisor's prior fix is preserved.

---

## 2. UI DESIGN SYSTEM

**Files**: `/workspace/apps/web/src/components/ui/`, `/workspace/apps/web/src/components/layout/`, `apps/web/src/app/globals.css`, `apps/web/src/app/page.tsx`

### 2.1 ⚠️ PARTIAL — Component inventory mismatch with brief

Brief claims 12 components in `ui/`: button, input, card, badge, modal, select, tabs, table, avatar, dropdown, **command-palette**, skeleton.

**Actual `ui/` contents (11 files)**:
```
avatar.tsx  badge.tsx  button.tsx  card.tsx  dropdown-menu.tsx  input.tsx
modal.tsx   select.tsx  skeleton.tsx  table.tsx  tabs.tsx
```

**`command-palette.tsx` lives in `/components/layout/`, not `ui/`.** It is **NOT** re-exported from `ui/index.ts` — the design-system barrel does not surface it. Anyone who `import { CommandPalette } from "@/components/ui"` will get an import error.

This is a "where is the thing" footgun, not a build-breaker, but the brief explicitly lists command-palette as a UI component.

### 2.2 ✅ PASS — No `any` types

```
$ grep -E '\bany\b' apps/web/src   # no TS any
no matches
```

`grep -E ': any\[|<any>|as any' apps/web/src` — also 0 matches. Clean.

### 2.3 ❌ FAIL — 9 `console.log` calls in layout/

```
apps/web/src/components/layout/app-layout.tsx:51    console.log("Searching:", query)
apps/web/src/components/layout/command-palette.tsx:136  console.log("New lead")
apps/web/src/components/layout/command-palette.tsx:144  console.log("New customer")
apps/web/src/components/layout/command-palette.tsx:152  console.log("New vehicle")
apps/web/src/components/layout/command-palette.tsx:160  console.log("Schedule")
apps/web/src/components/layout/command-palette.tsx:168  console.log("Pricing")
apps/web/src/components/layout/top-bar.tsx:88            console.log("Profile")
apps/web/src/components/layout/top-bar.tsx:94            console.log("Settings")
apps/web/src/components/layout/top-bar.tsx:102           console.log("Logout")
```

No `console.log` in `ui/`. All nine are in `layout/`, but they are still shipping to production: the "Profile / Settings / Logout / New lead" actions in the topbar and command-palette will dump to the browser console when clicked.

### 2.4 ❌ FAIL — Hardcoded color literals bypassing the design tokens

`globals.css` correctly defines a full token system under `@theme`:
```
--color-bg-primary, --color-accent, --color-danger, --color-warning, --color-success, ...
```

But several components hardcode literal colors:

| File | Line | Hex / literal | Bypasses |
|---|---|---|---|
| `ui/button.tsx` | 30 | `hover:bg-[#d4e639]` | `--color-accent` |
| `ui/button.tsx` | 36 | `text-white` | design token |
| `ui/button.tsx` | 36 | `hover:bg-red-600` | `--color-danger` (no hover variant token) |
| `ui/button.tsx` | 40 | `hover:bg-emerald-400` | `--color-success` |
| `ui/modal.tsx` | 150 | `bg-danger text-white hover:bg-red-600` | `--color-danger` |
| `ui/modal.tsx` | 152 | `bg-warning text-white hover:bg-orange-600` | `--color-warning` |
| `ui/modal.tsx` | 153 | `bg-accent ... hover:bg-[#d4e639]` | `--color-accent` |

This means: the design system says "danger is `#EF4444`" but the modal's danger button uses `red-600` (`#DC2626`) on hover. The accent hover hardcodes `#d4e639` instead of computing it. Theme changes won't propagate, dark/light variants won't work, and the spec's "no hardcoded colors" rule is violated 7 times.

Note: The `text-white` literals are the Tailwind preset white — these will look fine in dark mode, but they break the token contract (an accidental switch to a light theme would mean white text on a white card).

### 2.5 ❌ CRITICAL — TailwindCSS v4 wired to Vite in a Next.js app

```jsonc
// apps/web/package.json
"devDependencies": {
  "@tailwindcss/vite": "^4.0.0",  // <-- VITE plugin
  "tailwindcss": "^4.0.0",        // <-- v4
  ...
}
```

But the app is **Next.js 15** (`next: ^15.0.0`, `next dev --turbopack`). TailwindCSS v4 in Next.js requires **`@tailwindcss/postcss`**, not `@tailwindcss/vite`. There is no `postcss.config.js` and `@tailwindcss/postcss` is **not installed** (`ls node_modules/@tailwindcss/` returns only `vite`).

Consequence: `globals.css` uses v4 syntax (`@import "tailwindcss"`) which will not be processed. The stylesheet will be served raw to the browser, the `tailwindcss` import will 404, and the design system will collapse — the only CSS that works is the hand-rolled `body { background-color: var(--color-bg-primary); }` and the keyframes.

This is build-time fatal. `next build` will succeed (CSS is not a hard error), but the deployed site is unstyled.

### 2.6 ✅ PASS — Design token `globals.css @theme` is consistent

The `globals.css @theme` block declares all 13 spec colors (`--color-bg-primary` through `--color-ai`), font families, spacing, and component classes (`badge-info`, `badge-warning`, `card-hover`, `sidebar-item`, `input-dark`, `table-row-hover`). Token names match component usage (`bg-bg-card`, `text-text-primary`, `bg-bg-elevated`, `border-border`, `text-text-muted`, `bg-accent`, `bg-danger`, `bg-success`, `text-info`, `text-warning`, `text-ai`). This is the strongest part of the UI work.

### 2.7 ✅ PASS — TypeScript compiles clean

```
$ cd /workspace/apps/web && npx tsc --noEmit
(exit 0, no errors)
```

### 2.8 ⚠️ MINOR — `Sidebar` uses `position: absolute` for the collapse toggle

```tsx
<button className="absolute -right-3 top-20 ..." />
```
`Sidebar` itself is `position: fixed` and `position: relative` is **not** set on the parent. `absolute` here will resolve against the nearest positioned ancestor, which in some layouts could be the document body. The toggle button may fly off the sidebar. Minor.

### 2.9 ⚠️ MINOR — Avatar `border-border-active` rings on stacking

`AvatarGroup` uses `ring-2 ring-bg-card` — works, but if `bg-card` matches a parent background the ring is invisible.

---

## 3. SHARED CONTRACTS (`packages/shared/src/index.ts`)

### 3.1 ❌ CRITICAL — Three enums almost entirely don't match the Prisma schema

| Enum | Prisma | Zod | Match? |
|---|---|---|---|
| **LeadStatus** | NEW, CONTACTED, APPOINTMENT, DEMO, DEAL, LOST | NEW, CONTACTED, **QUALIFIED**, **PROPOSAL**, **NEGOTIATION**, **CLOSED_WON**, **CLOSED_LOST** | 2/7 |
| **DealStatus** | **WORKING**, **PENDING_FINANCE**, **APPROVED**, DELIVERED, **UNWOUND** | **PENDING**, APPROVED, **FUNDED**, **COMPLETED**, **CANCELLED** | 1/5 |
| **UserRole** | ADMIN, MANAGER, **SALES**, **BDC**, FINANCE | ADMIN, MANAGER, **SALES_REP**, FINANCE, **SERVICE** | 3/5 |
| **CommunicationChannel** | SMS, EMAIL, WHATSAPP, VOICE | **EMAIL, CALL, SMS, NOTE** (and named `CommunicationType` not `Channel`) | 1/4 |
| **CommunicationDirection** | INBOUND, OUTBOUND | (absent in shared) | 0/2 |

The first API call that filters by `Lead.stage` will fail runtime validation, because the Zod schema will reject any of the 4 Prisma values the API actually returns (APPOINTMENT, DEMO, DEAL, LOST), and the Zod will accept values the database never produces (QUALIFIED, PROPOSAL, NEGOTIATION, CLOSED_WON, CLOSED_LOST).

This is the #1 contract risk in the codebase.

### 3.2 ❌ CRITICAL — `DealSchema` and `CustomerSchema` describe fields that don't exist in Prisma

Zod `DealSchema` requires: `dealNumber`, `tradeInValue`, `apr`, `financedThrough`, `signedAt`. Prisma `Deal` has none of these — Prisma has `dealType`, `deliveredAt`, and the financial data lives in `DealTerms`.

Zod `CreateCustomerSchema` references `status`, `priority`, `source`, `tags`, `assignedToId`, `lastContactedAt` — Prisma `Customer` has `tags` ✅ but no `status`, no `priority`, no `source`, no `assignedToId`, no `lastContactedAt`. Three of those would 500 in the API on insert.

### 3.3 ⚠️ MINOR — `package.json` for `shared` doesn't list `dist` in `.npmignore`

Not a code issue, but if anyone publishes the workspace package, source TS will leak.

### 3.4 ⚠️ MINOR — `shared/src/index.ts` has no zod-derived type re-export of `@prisma/client` enums

The shared types should `import { LeadStatus } from '@prisma/client'` and wrap in zod, or use `z.enum(Object.values(LeadStatus) as [LeadStatus, ...LeadStatus[]])`. As-is, the two enums drifted.

---

## 4. API LAYER

`apps/api/src/` is **empty** (only `.gitkeep` or similar — no source files). Cannot evaluate. The `package.json` declares `fastify`, `zod`, `@prisma/client`, `@fastify/jwt`, etc., but no routes exist. Tenant isolation middleware **does not exist**, so when API code is written, every handler will be one wrong query away from cross-tenant data leak.

---

## 5. UX RESEARCH REPORT

`/workspace/ux-research-report.md` **does not exist**. Cannot evaluate. The `ux-researcher` agent is listed as "Unknown" in `agent-performance.md` and the report slot is empty. This is a blocking dependency for the design system if it was meant to drive the choice of token values.

---

## 6. ADDITIONAL FINDINGS

### 6.1 `apps/web/src/app/globals.css` is the only CSS, but `app/layout.tsx` imports it as `./globals.css`

Correct. ✅

### 6.2 `clsx` + `tailwind-merge` correctly imported and used via `cn()` in `lib/utils.ts`

✅ The `cn()` helper is used in all 11 UI components and the layout. No reinvention of className joining.

### 6.3 Mock data is hard-coded into the dashboard

`page.tsx` ships 4 fake stats and 4 fake leads as a static array inside a "use client" component. This is fine for a design demo, but it leaks into the deployable bundle. The dashboard has no real data binding, no `react-query` (`@tanstack/react-query@5.59` is in deps but unused), and no `framer-motion` use.

### 6.4 No tests

No `.test.ts` / `.spec.ts` files anywhere under `apps/` or `packages/`. Vitest is configured in both `web` and `api` `package.json` but no tests exist. The brief's expected quality gates ("`npx prisma validate`", "no `any` types", "Zod schemas match Prisma schema fields exactly") cannot be enforced by CI without tests.

---

## BATTLE VERDICT BY DOMAIN

```
DB:        BATTLE_FAIL  (3 models missing dealerId, 14 FKs without index,
                         0 migrations, 0 generated client, broken Activity relations)
UI:        BATTLE_FAIL  (Tailwind v4 wired to Vite plugin in Next.js → no styles,
                         7 hardcoded color literals, 9 console.log in shipping code,
                         command-palette misplaced in layout/)
CONTRACTS: BATTLE_FAIL  (Lead/Deal/UserRole/Channel enums mostly disjoint,
                         4 Customer fields don't exist in Prisma, 5 Deal fields don't exist)
BUILD:     BATTLE_FAIL  (next build will succeed but produce unstyled app)
```

## BATTLE VERDICT (combined)

## Verdict: BATTLE_FAIL

---

## RECOMMENDED FIX ORDER (for the supervisor)

1. **Build config first** — install `@tailwindcss/postcss`, add `postcss.config.js`, remove `@tailwindcss/vite`. Without this nothing visual is testable.
2. **Reconcile enums** — pick one source of truth (Prisma) and regenerate the Zod schemas from `Object.values(LeadStatus)` etc. Don't hand-write enums in two places.
3. **Add missing `dealerId` columns** to `VehiclePricing`, `DealTerms`, `FiProduct` (and the corresponding relation on `Dealer`).
4. **Add the missing 14 FK indexes**, plus `@@index([dealerId])` on `SyndicationLog`.
5. **Fix the `Activity` polymorphic model** — either drop the 4 cosmetic relations and use a single `entityId String` with no relation, or split into 4 typed FKs (`leadId`, `customerId`, `dealId`, `vehicleId`).
6. **Run `prisma migrate dev --name init`** — generate the first real migration. This is the only way the supervisor's previous fixes become durable.
7. **Run `prisma generate`** — unblock `@prisma/client` import. Required for `seed.ts` to run.
8. **Remove `console.log`** from layout/ files (or gate them behind `process.env.NODE_ENV !== 'production'`).
9. **Replace hardcoded `#d4e639`, `text-white`, `red-600`, `emerald-400`, `orange-600`** with token classes (e.g. `hover:bg-accent-hover` after defining that variant in `@theme`).
10. **Move `command-palette.tsx` to `components/ui/`** and re-export from `ui/index.ts` (or document that it lives in `layout/` deliberately and update the brief).

---

## STATE SNAPSHOT FOR NEXT WATCH CYCLE

- Last re-check: 2026-06-05 17:35 UTC
- Watching: `/workspace/packages/db/prisma/**`, `/workspace/apps/web/src/**`, `/workspace/apps/api/src/**`, `/workspace/packages/shared/src/**`
- `apps/api/src/` still empty — next tasks: `api-auth`, `api-crm`, `api-inventory`
- ux-research report still missing
- `command-palette` still in `layout/`, not `ui/`
- Tailwind v4 PostCSS still missing
