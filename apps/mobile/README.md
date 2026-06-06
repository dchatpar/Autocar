# DealerOS Mobile

Field companion to the DealerOS web CRM — built with React Native + Expo SDK 52.

## Features (Phase 1)

- **Auth** — JWT login (web tokens reused), encrypted MMKV storage
- **Dashboard** — at-a-glance KPIs (leads today, hot leads, inventory, pending deals)
- **Lead inbox** — paginated, filterable by status & score, with offline cache
- **Lead detail** — contact card with tappable phone/email
- **Inventory grid** — 2-up grid with status badges
- **VIN scanner** — `expo-camera` capture + manual entry, NHTSA VPIC lookup
- **Driver's license scanner** — `expo-camera` capture, AWS Textract parse
- **Settings** — account info, sign-out

## Stack

- **Expo SDK 52** + **React Native 0.76** + **React 18.3**
- **expo-router 4** — file-based routing with Stack + Tabs
- **expo-camera** — VIN/DL capture (with manual fallback)
- **react-native-mmkv** — encrypted at-rest storage for auth tokens
- **@tanstack/react-query** — server state, infinite queries
- **zustand** — auth store
- **react-native-reanimated** — gesture/layout animations

## Project layout

```
apps/mobile/
  app/
    _layout.tsx                ← root: auth gate, query client
    (auth)/login.tsx           ← email + password
    (app)/
      _layout.tsx              ← bottom tab navigator
      index.tsx                ← dashboard
      leads/
        index.tsx              ← inbox
        [id].tsx               ← detail
      inventory/
        index.tsx              ← grid
        add.tsx                ← VIN scanner → form
      customers/
        add.tsx                ← DL scanner → form
      settings.tsx
  components/                  ← KPICard, LeadCard, VehicleCard,
                                VINScannerView, DLScannerView
  hooks/                       ← useAuth, useLeads, useInventory
  lib/                         ← api client, storage wrapper
  constants/                   ← theme tokens
```

## Running

```bash
# Install (uses pnpm workspaces)
pnpm install

# Start the dev server (Metro)
pnpm --filter @dealeros/mobile start

# iOS / Android (requires simulator or device)
pnpm --filter @dealeros/mobile ios
pnpm --filter @dealeros/mobile android

# Type-check
pnpm --filter @dealeros/mobile typecheck
```

## Build (EAS)

```bash
# Internal development build
pnpm --filter @dealeros/mobile build:development

# Preview (TestFlight / internal Play Store)
pnpm --filter @dealeros/mobile build:preview

# Production
pnpm --filter @dealeros/mobile build:production
```

The `eas.json` profiles configure bundle identifiers, distribution
channels, and build numbers. Production builds use the bundle id
`com.dealeros.app`; development uses `com.dealeros.app.dev`.

## Configuration

- `app.json` → `extra.apiBaseUrl` — API base URL embedded in the bundle
- `app.json` → `extra.encryptionKey` — MMKV AES key (set via EAS env)
- `.env.example` documents the EXPO_PUBLIC_* env vars

## Multi-tenant

The app never sees `dealerId` directly — it flows from the JWT. The
`api.ts` client attaches the bearer token to every request and the
backend enforces tenant isolation on every read/write.

## Offline-first

Lead and vehicle list pages cache results to MMKV via React Query
callbacks. The lead detail page reads the cache synchronously so the
screen renders instantly on a warm tap. When the network is
unavailable, the user sees the last-known data with a soft warning
when the refresh fails.
