# Architecture-Reviewer Memory

## Session: 406027985862771 (2026-06-05)

## Project: DealerOS

### Role
Continuous architecture reviewer. Read-only. Reports findings via:
1. `/workspace/architecture-review.md` (the source of truth)
2. Board entries in `/workspace/.mavis/plans/plan_1074f4cf/board.md` (or whatever plan is current)

### First-Round Review (2026-06-05 17:35 UTC)
- File: `/workspace/architecture-review.md` (360 lines)
- 3 CRITICAL, 13 MAJOR, 10 MINOR
- Schema reviewed: `packages/db/prisma/schema.prisma` (21 models, 760 lines)
- API: not yet built (apps/api/src/ is empty)
- Frontend: design system only (no domain pages)

### CRITICAL Findings (must fix before production)
- **C-1**: No `deletedAt` / soft-delete on any of 21 tables → IRS/OFAC retention violation for BHPH
- **C-2**: Tenant isolation gaps → LeadScore has no `onDelete`; Activity polymorphic FKs; VehicleMedia/Document need composite FK
- **C-3**: No `version` field on Deal/Vehicle/BhphContract/BhphPayment → money-mutation race

### Re-Review Hooks (waiting on these tasks)
- [ ] api-auth — check tenant middleware, JWT claims, MFA hooks
- [ ] api-crm — check dealerId scoping on every query, Zod validation, conversion atomicity
- [ ] api-inventory — check version-check, Decimal handling, 409 responses
- [ ] api-deals (when scheduled) — check BHPH amortization math
- [ ] api-ai (when scheduled) — check Embedding CRUD, rate limits

### How to Detect New Deliverables
Watch for board entries of form:
```
[YYYY-MM-DD HH:MM:SS] backend-dev | <task> | done
```
for tasks `api-auth`, `api-crm`, `api-inventory` (and any others). When one appears, re-read the relevant source files and append a "Re-Review of <task>" section to `/workspace/architecture-review.md`.

### Conventions
- File:line precision is mandatory
- Severity scale: CRITICAL (pre-prod blocker) / MAJOR (Phase 1) / MINOR (Phase 2)
- Cross-cutting concerns section: Multi-Tenancy, Schema Integrity, Audit Trail, Concurrency, Money, Observability, AI, Enums, Indexes
- Always cite the schema line number
- Do NOT fix — only report

### Known Constraints of Sandbox
- `mavis` CLI is **not installed** in this environment; cannot use `communicate` tool
- Fallback: write board entries and memory files
- Date: 2026-06-05 (UTC)

### Key File Paths
- Schema: `/workspace/packages/db/prisma/schema.prisma`
- API: `/workspace/apps/api/src/` (currently empty)
- Web: `/workspace/apps/web/src/` (design system only)
- Review doc: `/workspace/architecture-review.md`
- Memory: `/workspace/.mavis/memory/architecture-reviewer.md`
- Board: `/workspace/.mavis/plans/plan_1074f4cf/board.md`
