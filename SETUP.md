# DealerOS Local Development Setup

This guide explains how to set up the DealerOS monorepo for local development.

## Prerequisites

- **Node.js 22 LTS** or higher
- **pnpm 9** or higher (`npm install -g pnpm`)
- **Docker Desktop** or Docker Engine + Docker Compose
- **Git**

## Quick Start (Docker Compose)

The fastest way to get everything running:

```bash
# 1. Clone and enter the repo
git clone https://github.com/your-org/dealeros.git
cd dealeros

# 2. Copy environment file
cp .env.example .env

# 3. Start all services
docker-compose up -d

# 4. Install dependencies
pnpm install

# 5. Generate Prisma client
pnpm turbo db:generate

# 6. Run migrations
pnpm turbo db:migrate
```

Services will be available at:
- **Web App**: http://localhost:3000
- **API Server**: http://localhost:3001
- **Hasura Console**: http://localhost:8080
- **MinIO Console**: http://localhost:9001

## Manual Development Setup

If you prefer to run services locally (without Docker):

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Database Setup

**Option A: Docker (Recommended)**
```bash
docker run -d \
  --name dealeros-postgres \
  -e POSTGRES_USER=dealeros \
  -e POSTGRES_PASSWORD=dealeros_dev_password \
  -e POSTGRES_DB=dealeros \
  -p 5432:5432 \
  postgres:16-alpine
```

**Option B: Local PostgreSQL 16**
Create a database named `dealeros` with a user `dealeros` and password `dealeros_dev_password`.

### 3. Redis Setup

**Option A: Docker**
```bash
docker run -d \
  --name dealeros-redis \
  -p 6379:6379 \
  redis:7-alpine
```

**Option B: Local Redis**
Install Redis 7 and start it on the default port.

### 4. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your settings
```

### 5. Database Operations

```bash
# Generate Prisma client
pnpm turbo db:generate --filter=@dealeros/db

# Run migrations
pnpm turbo db:migrate --filter=@dealeros/db

# Open Prisma Studio (optional)
pnpm turbo db:studio --filter=@dealeros/db
```

### 6. Start Development Servers

```bash
# Start all apps in watch mode
pnpm dev

# Or start individual apps:
pnpm turbo dev --filter=@dealeros/api   # API on port 3001
pnpm turbo dev --filter=@dealeros/web   # Web on port 3000
```

## Project Structure

```
dealeros/
├── apps/
│   ├── api/           # Fastify backend API
│   └── web/           # Next.js 15 frontend
├── packages/
│   ├── db/            # Prisma schema & client
│   └── shared/        # Shared TypeScript types & Zod schemas
├── infra/
│   └── terraform/     # AWS infrastructure (stub)
├── docker-compose.yml # Local dev services
├── turbo.json         # Turborepo config
├── package.json       # Root workspace
└── .env.example       # Environment template
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps for production |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all packages |
| `pnpm clean` | Remove build artifacts |

## Docker Services

### PostgreSQL 16
- **Port**: 5432
- **Database**: dealeros
- **User**: dealeros
- **Extensions**: pgvector enabled

### Redis 7
- **Port**: 6379
- **Persistence**: Enabled

### MinIO (S3 Emulation)
- **API Port**: 9000
- **Console Port**: 9001
- **Default credentials**: dealeros_minio / dealeros_minio_password
- **Bucket**: dealeros-media (auto-created)

### Hasura Console
- **Port**: 8080
- **Admin Secret**: hasura_dev_secret
- **Metadata**: Persisted to volume

## Troubleshooting

### Port Already in Use
```bash
# Find what's using port 3000
lsof -i :3000
# Kill the process
kill -9 <PID>
```

### Prisma Client Not Found
```bash
pnpm turbo db:generate --filter=@dealeros/db
```

### Docker Volume Issues
```bash
# Remove all volumes and start fresh
docker-compose down -v
docker-compose up -d
```

### Node Modules Issues
```bash
# Clean install
pnpm clean
pnpm install
```

## Next Steps

- Review the API documentation at `/docs` once the API is running
- Check the shared types in `packages/shared/src/index.ts`
- Review the Prisma schema in `packages/db/prisma/schema.prisma`
- Set up your IDE with the root `tsconfig.json` for best experience

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and test locally
3. Run `pnpm lint && pnpm test`
4. Submit a pull request

## Support

For issues or questions, open a GitHub issue or contact the team.