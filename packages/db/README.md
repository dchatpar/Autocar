# DealerOS Database — `packages/db`

PostgreSQL 16 schema with Prisma ORM. Multi-tenant CRM, inventory, deals, F&I, BHPH, and AI analytics.

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy env file
cp ../../.env.example ../../.env
# Edit DATABASE_URL in .env

# Generate Prisma Client
pnpm generate

# Run migrations (creates all tables)
pnpm migrate

# Seed dev data
pnpm seed

# Open Prisma Studio (GUI)
pnpm studio
```

## Schema Overview

### Auth & Tenants

| Table | Description |
|---|---|
| `dealers` | Tenant root — each dealer is an isolated data partition |
| `users` | Staff members with role-based permissions |

### CRM

| Table | Description |
|---|---|
| `leads` | Sales pipeline with status, score (0–100), assignment |
| `customers` | Buyer records with credit tier, address, tags |
| `activities` | Timeline of all interactions (call, email, SMS, note, appointment, AI action) |
| `appointments` | Scheduled events tied to leads/customers |
| `communications` | Logged messages across SMS, Email, WhatsApp, Voice |
| `notes` | Freeform user notes |

### Inventory

| Table | Description |
|---|---|
| `vehicles` | Inventory units. `@@unique([dealerId, vin])` — VIN unique per dealer, not global |
| `vehicle_pricing` | Cost, asking price, internet price, market value, floor plan |
| `vehicle_media` | Photos, videos, 360° spins per vehicle |
| `syndication_logs` | Sync history with AutoTrader, CarGurus, Kijiji, Facebook |

### Deals & F&I

| Table | Description |
|---|---|
| `deals` | Transactions tying customer + vehicle + terms |
| `deal_terms` | Financial structure: price, down, trade, financed amount, rate, payment |
| `fi_products` | Optional products: warranty, GAP, credit insurance, tire & wheel, rust |
| `documents` | Signed/unsigned files (bill of sale, contracts, credit apps) |

### BHPH (Buy-Here-Pay-Here)

| Table | Description |
|---|---|
| `bhph_contracts` | In-house financing contract (principal, rate, term, payment schedule) |
| `bhph_payments` | Individual payment records per contract |

### AI & Analytics

| Table | Description |
|---|---|
| `lead_scores` | AI-scored lead quality with signals |
| `agent_runs` | Telemetry for AI agent executions (tokens, cost, duration) |
| `embeddings` | Vector embeddings for semantic search (pgvector `vector(1536)`) |

## Multi-Tenancy & RLS Strategy

### Phase 1 — Application-Level Filtering (MVP)

Every Prisma query must include a `where: { dealerId: context.dealerId }` clause. The API extracts `dealerId` from the JWT payload once per request and passes it through the service/repo layers.

```typescript
// Example: Get leads for current tenant
const leads = await prisma.lead.findMany({
  where: { dealerId: context.dealerId },
  include: { assignedTo: true },
});
```

**Middleware pattern** (recommended for service layer):

```typescript
// services/lead.service.ts
export class LeadService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly dealerId: string,  // injected from auth context
  ) {}

  async findAll() {
    return this.prisma.lead.findMany({
      where: { dealerId: this.dealerId },  // ← always required
    });
  }
}
```

### Phase 2 — PostgreSQL RLS (Production)

For production deployments, enable Row-Level Security policies at the PostgreSQL level:

```sql
-- Enable RLS on all tenant tables
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policy: rows only visible to their dealer
CREATE POLICY dealer_isolation ON leads
  USING (dealer_id = current_setting('app.current_dealer_id')::uuid);
```

Set tenant context per request:

```typescript
// In Fastify request hook
await prisma.$executeRaw`SET app.current_dealer_id = ${dealerId}`;
```

**Note:** Phase 1 implements application-level filtering. Phase 2 RLS policies are documented here for future implementation and require `ALTER TABLE` migrations on existing tables.

## Prisma Workflow

```bash
# Create a new migration
pnpm migrate:dev --name add_lead_source_column

# Deploy migrations to production
pnpm migrate:deploy

# Reset database (dev only!)
pnpm migrate:reset

# Generate client after schema change
pnpm generate

# Open GUI studio
pnpm studio
```

## Seed Data

`pnpm seed` loads realistic dev data:
- 2 dealers: Northgate Auto Group (PRO plan), Valley Motors Ltd. (GROWTH plan)
- 5 users per dealer (Admin, Manager, Sales, BDC, Finance)
- 20 leads per dealer with varied sources and scores
- 10 customers per dealer with addresses and credit tiers
- 15 vehicles per dealer with pricing, media, syndication logs
- 3 deals per dealer with terms, F&I products, and BHPH contracts
- Activities, appointments, communications, lead scores, agent runs

**Default dev password:** `dev-password-123`

## Environment Variables

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dealeros"
```

## Notes

- `embeddings.vector` uses `Unsupported("vector(1536)")` for Prisma Client generation. The `vector` extension must be enabled in PostgreSQL: `CREATE EXTENSION IF NOT EXISTS vector;`
- For production vector operations, consider `@prisma/adapter-pgvector` or raw SQL queries via `$queryRaw`.
- `dealers.subdomain` is unique — used as the tenant lookup key in the auth middleware.
- All timestamps are stored as UTC. API responses return ISO 8601 strings.