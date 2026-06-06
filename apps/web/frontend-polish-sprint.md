# Frontend Polish Sprint — DealerOS

## What was surveyed

Scanned all app pages and components under `apps/web/src/`:

| Area | File(s) | Status |
|------|---------|--------|
| Empty states | leads, inventory, customers, deals, test-drives, campaigns | ✅ All 6 pages already use `<EmptyState>` from `@/components/common/EmptyState` |
| Skeleton loaders | `ui/skeleton.tsx` | ✅ Exists with `SkeletonCard`, `SkeletonTable`, `SkeletonList`, `SkeletonForm` |
| Skeleton in views | `LeadsView`, `InventoryView`, `CustomerListView` | ✅ All three have inline `LoadingState` + `ErrorState` |
| Dashboard quick actions | `dashboard/QuickActions.tsx` | ✅ 4-button grid with inline modals for lead, vehicle, appointment, deal |
| Lead source chart | `dashboard/LeadSourceChart.tsx` | ✅ Recharts BarChart with custom tooltip |
| Activity feed | `dashboard/ActivityFeed.tsx` + `LiveActivityFeed.tsx` | ✅ Server-rendered feed + live WebSocket feed |
| Error boundary | `common/ErrorBoundary.tsx` | ✅ Class component with fallback + reset |
| 404 page | `app/not-found.tsx` | ✅ Styled page with two CTAs |
| Toast provider | `app/layout.tsx` | ✅ `<Toaster />` already wired in root layout |

**Dependencies** — `sonner@^1.7.4` and `recharts@^2.13.0` were already in `package.json`; no install step needed.

---

## Changes made

### 1. Role-based sidebar navigation
**File:** `src/components/layout/Sidebar.tsx`

- Added `useAuth` hook to read the logged-in `user.role`
- Mapped `UserRole` (`owner | admin | manager | salesperson`) to coarse role labels (`admin | manager | sales`) via `ROLE_MAP`
- Extended `NavItem` with a `roles: string[]` array and removed hard-coded badges
- Added two new nav entries: **Reports** (`/reports`, `admin | manager | accountant`) and **BHPH** placeholder — replaced generic `FileText` icons with semantic ones (`Handshake`, `BarChart3`)
- Added `visibleItems` filter: items are hidden when the user's role isn't in the allowed list
- Settings link at the bottom now renders **only for admin users**
- `aria-label="Main navigation"` on the `<nav>` element for accessibility

### 2. Error boundary wrapping app content
**File:** `src/app/(app)/layout.tsx`

- Imported `ErrorBoundary` from `@/components/common/ErrorBoundary`
- Wrapped the `<main>` content region: `<ErrorBoundary label="app-content">{children}</ErrorBoundary>`
- This catches any uncaught React render errors inside the app shell without crashing the whole page

---

## How to run

```bash
# Install (packages already in package.json; run once to sync node_modules)
cd apps/web
pnpm install

# Dev server
pnpm dev

# Type check
pnpm typecheck

# Build (production)
pnpm build
```

---

## Notes / caveats

- **Feature-flagged nav items** (e.g. BHPH) were not wired because `dealer.features` is not yet available in the auth session. Add `feature?: string` to `NavItem` and check `dealer.features?.includes(item.feature)` when that data lands.
- **Reports page** (`/reports`) and the Reports nav link were added to the sidebar but the route doesn't exist yet — creating it is a follow-up task.
- The `ErrorBoundary` added to `(app)/layout.tsx` uses the existing `common/ErrorBoundary`, not a new file.
- No new packages were installed; `sonner` and `recharts` were already declared.

---

## VERDICT: PASS
