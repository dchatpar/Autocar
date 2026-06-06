# Backend-Dev Memory

## Session: 406020624949332 (2026-06-05)

---

## Project: DealerOS Monorepo Scaffolding

### Key Decisions Made

1. **pnpm as package manager** — Enforced via `packageManager` field in root package.json with version 9.15.0. Monorepo workspaces work best with pnpm's strict dependency hoisting.

2. **Turborepo flat structure** — Used `apps/*` and `packages/*` pattern (not `apps/*/src`). Simpler, more explicit, aligns with standard monorepo conventions.

3. **Multi-tenant architecture** — All Prisma queries must filter by `dealerId`. This is enforced at the repository layer, not scattered in route handlers.

4. **pgvector extension** — Enabled in Docker Compose init and Prisma schema for semantic search capabilities on vehicles/customers.

5. **Docker healthchecks** — All services have proper healthcheck commands. API/Web services depend on postgres/redis being healthy before starting.

6. **Docker build context** — API and Web use separate Dockerfile.dev files. Production would use multi-stage builds.

### Problems Encountered

1. **Initial submission rejected** — The verifier failed because the deliverable.md didn't have a "ready" marker. Lesson: always include explicit status indicator in deliverable.

2. **Docker Compose service ordering** — MinIO needs a separate setup container to create buckets since MinIO container by itself doesn't auto-create them.

### Patterns Established

- **API routes structure**: Routes → Services → Repositories → Prisma
- **Shared package exports**: Zod schemas + TypeScript types co-located, imported by both apps
- **Environment variables**: All secrets in `.env`, never hardcoded
- **TypeScript strict mode**: No `any`, proper null handling, explicit types throughout
- **Prisma schema conventions**: 
  - `@@unique([dealerId, vin])` for vehicles
  - `@@index([dealerId, status])` for filtered queries
  - Enums for constrained string fields (LeadStage, UserRole, etc.)

### Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TailwindCSS v4, Zustand, TanStack Query |
| Backend | Fastify 4, Prisma 5, Zod |
| Database | PostgreSQL 16 + pgvector |
| Cache | Redis 7 |
| Storage | MinIO (S3 emulation) |
| GraphQL | Hasura (optional, for real-time) |
| IaC | Terraform (stub for AWS EKS/RDS/S3/ElastiCache) |
| CI/CD | GitHub Actions (lint → typecheck → test → build → docker) |
| Package Manager | pnpm 9 |

### Files Created (23 total)

- Root: package.json, turbo.json, tsconfig.json, .env.example, docker-compose.yml, SETUP.md
- apps/api: package.json, tsconfig.json
- apps/web: package.json, tsconfig.json
- packages/db: package.json, prisma/schema.prisma
- packages/shared: package.json, tsconfig.json, src/index.ts
- infra/terraform: main.tf
- .github/workflows: ci.yml
- Deliverable: .mavis/plans/plan_1074f4cf/outputs/project-scaffold/deliverable.md

---

*Last updated: 2026-06-05 17:35 UTC*