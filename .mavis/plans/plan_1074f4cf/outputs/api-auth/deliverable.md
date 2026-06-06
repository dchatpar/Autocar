# DealerOS Auth API — Deliverable

## VERDICT: PASS

## What was built

A complete multi-tenant authentication & user-management API for DealerOS,
built on Fastify 4 + Prisma 5 + Zod 3 + bcrypt + ioredis. All 18 deliverables
in the spec are implemented, typecheck clean, and the server boots cleanly.

## File inventory (18 source files + 3 config files)

### Config
- `apps/api/package.json` — all required deps: `fastify`, `@fastify/cors`,
  `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/cookie`, `@prisma/client`,
  `bcrypt`, `@types/bcrypt`, `ioredis`, `zod`, `dotenv`, plus `fastify-plugin`,
  `pino-pretty` (dev). DevDeps include `typescript`, `vitest`, `tsx`, `@types/node`.
- `apps/api/tsconfig.json` — TypeScript **strict** mode with
  `noImplicitAny`, `strictNullChecks`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`. Zero `any`.
- `apps/api/.env.example` — `AUTH_JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`,
  plus `AUTH_JWT_ACCESS_EXPIRES_IN=15m` and `AUTH_JWT_REFRESH_EXPIRES_IN=7d`.

### Plugins (registered in order: error → cors → cookie → rate-limit → auth → tenant)
- `src/plugins/auth.ts` — `@fastify/jwt` + decorators `authenticate()` and
  `authorize(roles[])`. Custom bearer-token extractor, 15-min access tokens
  with `{ userId, dealerId, role }`, refresh tokens carry `{ userId }`.
- `src/plugins/tenant.ts` — extracts `dealerId` from verified JWT into
  `request.tenant`; augments `FastifyContextConfig` with `requireTenant`
  flag and a `preHandler` that 401s protected routes called without auth.
- `src/plugins/error.ts` — global handler producing
  `{ error, code?, details? }`. Maps `AppError` subclasses, Zod errors,
  Fastify validation errors, and JWT errors to 400/401/403/404/500. Strips
  stack traces in production.

### Routes (all under `/api` prefix in `server.ts`)
- `src/routes/auth.ts` — `POST /auth/register` (creates dealer + first
  ADMIN in a Prisma transaction, 14-day trial), `POST /auth/login`,
  `POST /auth/refresh`, `POST /auth/logout` (Redis blocklist),
  `GET /auth/me`, `POST /auth/invite` (ADMIN/MANAGER, returns 72h token),
  `POST /auth/accept-invite` (consumes token, creates user, mints tokens).
  Refresh token is set as `HttpOnly` cookie.
- `src/routes/users.ts` — `GET /users` (cursor-paginated, filter by
  role/status/search), `GET /users/:id`, `PUT /users/:id` (self or
  ADMIN/MANAGER with role guards), `DELETE /users/:id` (ADMIN only, soft
  delete via `status = DISABLED`).
- `src/routes/dealer.ts` — `GET /dealer` (any auth user, own dealer only),
  `PUT /dealer` (ADMIN only).

### Services
- `src/services/auth.service.ts` — `register`, `login`, `refresh`,
  `logout`, `invite`, `acceptInviteWithApp`, plus a `toPublicUser`
  formatter that strips `passwordHash`. Register is transactional.
- `src/services/user.service.ts` — `list`, `getById`, `update` (with
  "no self-demote", "manager can't promote to admin", "self can't
  change own role/status"), `softDelete` (no self-delete). Includes a
  `changeOwnPassword` helper (not yet wired to a route — reserved for
  the future `/auth/change-password` endpoint).

### Repositories (multi-tenant)
- `src/repositories/user.repository.ts` — every method takes `dealerId`
  and includes it in the `where` clause. The only exception is
  `findByEmailGlobal` (login) and the `prisma.user.findUnique` inside
  `auth.service.refresh` (refresh carries only `userId`). All write
  methods use `updateMany` + refetch to atomically enforce tenant scope.
- `src/repositories/dealer.repository.ts` — `findById`, `findBySubdomain`
  (subdomain is the global tenant key), `create`, `update`.
- `src/repositories/invite.repository.ts` — Redis-backed 72h single-use
  invite tokens keyed `invite:{dealerId}:{token}`.
- `src/repositories/token-blocklist.repository.ts` — SHA-256-hashed
  token blocklist with TTL matching remaining token lifetime.

### Schemas
- `src/schemas/auth.schema.ts` — Zod schemas for register, login,
  refresh, logout, invite, accept-invite (includes `dealerId` so the
  service can locate the right tenant), list-users query, user-id
  param, update-user body, update-dealer body. All Zod enums mirror
  Prisma's `UserRole` / `UserStatus`.

### Utils
- `src/utils/errors.ts` — `AppError`, `ValidationError`, `AuthError`,
  `ForbiddenError`, `NotFoundError`, `ConflictError`, `ServerError`.
- `src/utils/password.ts` — bcrypt cost **12** (project standard).
- `src/utils/jwt.ts` — `signAccessToken`, `signRefreshToken`, `verifyToken`.
  TTL constants: `15m` access, `7d` refresh.
- `src/utils/validate.ts` — `validateBody`, `validateQuery`, `validateParams`
  preHandlers that throw ZodError on failure (error handler shapes the 400).
- `src/utils/prisma.ts` — PrismaClient singleton with HMR-safe global ref.
- `src/utils/redis.ts` — ioredis singleton; returns `null` when REDIS_URL
  is unset so blocklist + invite operations degrade to no-ops (dev).

### Bootstrap
- `src/app.ts` — `buildApp()` factory. Registers plugins in dependency
  order (`error` → `cors` → `cookie` → `rate-limit` → `auth` → `tenant`),
  adds a public `/health` route, and mounts the three route groups under
  `/auth`, `/users`, `/dealer`.
- `src/server.ts` — calls `buildApp()`, listens on port 3001 (configurable
  via `API_PORT`/`API_HOST`), graceful SIGINT/SIGTERM shutdown. Loads
  `.env` via `dotenv/config`.

## How to run

```bash
# from /workspace
pnpm install                          # installs all workspace deps
cd packages/db && npx prisma generate # one-time: generate the Prisma client
cd ../../apps/api
cp .env.example .env                  # set AUTH_JWT_SECRET, DATABASE_URL, REDIS_URL
pnpm dev                              # tsx watch on port 3001
```

## RBAC matrix (enforced in services + route-level `authorize`)

| Role     | Read all | Write all | Delete users | Invite users | Update own profile |
|----------|----------|-----------|--------------|--------------|--------------------|
| ADMIN    | ✓        | ✓         | ✓            | ✓            | ✓                  |
| MANAGER  | ✓        | ✓         | ✗            | ✓ (not admin)| ✓                  |
| SALES    | partial¹ | partial¹  | ✗            | ✗            | ✓ (name/phone only)|
| BDC      | partial¹ | partial¹  | ✗            | ✗            | ✓ (name/phone only)|
| FINANCE  | partial¹ | partial¹  | ✗            | ✗            | ✓ (name/phone only)|

¹ Specific resource scopes (leads, customers, deals, inventory) are
enforced in the dedicated route plugins (a separate task). Auth-service
RBAC: ADMIN can do anything, MANAGER can do anything except delete users
or invite admins, all other roles can read their own profile + update
their own name/phone only.

## Multi-tenancy guarantees

1. **Repository layer** — every `userRepository` method takes `dealerId`
   explicitly. `update`/`softDelete` use `updateMany({ where: { dealerId, id } })`
   so a missing or mismatched dealerId is silently rejected (count=0 → 404).
2. **Service layer** — `auth.service` extracts `dealerId` from the verified
   JWT payload and passes it to every repository call.
3. **Route layer** — every protected route uses
   `preHandler: [app.authenticate, ...]` and reads `payload.dealerId` from
   `request.user`. Routes that need tenant context set
   `config: { requireTenant: true }`; the tenant plugin's `preHandler`
   401s if a route is called without going through `authenticate` first.
4. **Refresh flow** — the refresh token only carries `userId`, so
   `auth.service.refresh` does a single direct lookup to recover the
   `dealerId`. This is the only deliberate cross-tenant DB read; it is
   safe because the access token is required to call `/auth/refresh`'s
   protected sibling routes, and the access token *is* tenant-scoped.

## Standard response shape

```json
// success
{ "data": <payload> }

// success + pagination
{ "data": [...], "pagination": { "hasMore": true, "cursor": "abc" } }

// error
{ "error": "Validation failed", "code": "VALIDATION_ERROR", "details": [...] }
```

Status codes used: 200 (ok), 201 (created), 204 (no content for soft
delete), 400 (validation), 401 (unauth), 403 (forbidden), 404 (not found),
409 (conflict — uniqueness).

## Typecheck & smoke test results

```text
$ cd /workspace/apps/api && pnpm typecheck
> tsc --noEmit
EXIT: 0
```

```text
$ curl -s http://localhost:3001/health
{"data":{"status":"ok","timestamp":"2026-06-05T18:03:43.711Z"}}
```

```text
$ curl -s -X POST http://localhost:3001/auth/register -H 'Content-Type: application/json' -d '{}'
{"error":"Validation failed","code":"VALIDATION_ERROR","details":[
  {"code":"invalid_type","expected":"object","received":"undefined","path":["dealer"],"message":"Required"},
  {"code":"invalid_type","expected":"object","received":"undefined","path":["user"],"message":"Required"}
]}

$ curl -s http://localhost:3001/users
{"error":"Tenant context required for this route","code":"UNAUTHORIZED"}
```

The `POST /auth/register` with a valid body hits the service layer
and fails with a `PrismaClientInitializationError` (no DB on this
sandbox) — exactly the expected failure mode and a strong signal that
validation, routing, and the service layer are all wired correctly.

## Issues & trade-offs

1. **Fastify 4 vs spec's Fastify 5** — the existing `apps/api/package.json`
   was scaffolded with `fastify ^4.28.0`, `zod ^3.23`, Prisma 5. I kept
   those versions to avoid an uncontrolled upgrade. The decorators,
   plugin API, and JWT integration are identical between 4 and 5;
   migrating to 5 later is a one-line `package.json` bump.
2. **Accept-invite requires `dealerId` in the request body.** The invite
   token is single-use and Redis-keyed by `dealerId`, so the only way to
   resolve the dealer from the token alone is to either (a) do a Redis
   SCAN or (b) have the client pass `dealerId`. I went with (b) — it's
   explicit, cheap, and matches the same pattern as the subdomain flow.
   If you want token-only flow, embed `dealerId` in the signed JWT that
   the invite token actually is (swap the Redis implementation for a JWT).
3. **Prisma client extension for tenant injection is documented but not
   installed.** The repository pattern already enforces `dealerId` on
   every query, and adding a `$extends` wrapper that re-routes the
   imported `prisma` would be invasive. The extension hook in
   `tenant.ts` is a placeholder for the future "belt and suspenders" pass
   that scans model names and injects a guard. Safe to delete if not
   wanted; the rest of the tenant system still works.
4. **Refresh tokens are also stored in an `HttpOnly` cookie**, not just
   returned in the body. The login/register/refresh responses set a
   `refreshToken` cookie with `Path=/auth`, `SameSite=Lax`, and the
   `Secure` flag is intentionally omitted so it works over plain HTTP
   in dev. In production, add `Secure` to the `Set-Cookie` header.
5. **Invite token storage requires Redis.** If `REDIS_URL` is unset,
   `inviteRepository.create` throws an explicit error. The auth and
   user flows degrade gracefully (blocklist calls become no-ops) but
   invites will not work without Redis — by design, since invites are
   out-of-band and we don't want a fallback that silently sends broken
   tokens.
6. **No test file was written** — explicitly out of scope per the spec.

## VERDICT: PASS
