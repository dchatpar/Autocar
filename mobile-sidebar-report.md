# Mobile Sidebar & Suspense Fallback Fixes

## Summary

Fixed two major UX issues identified in the UX battle report:

1. **Mobile Sidebar Drawer** — Added hamburger menu and slide-in drawer for mobile devices (<768px)
2. **Suspense fallback={null}** — Replaced null fallbacks with proper skeleton loading states

---

## Issue 1: Mobile Sidebar Drawer

### Changes Made

#### Created `/apps/web/src/components/layout/AppShell.tsx`

New component that wraps the layout and provides responsive behavior:
- **Desktop (≥768px)**: Renders inline `Sidebar` + `TopBar` as before
- **Mobile (<768px)**: Renders a fixed header with hamburger button that opens a slide-in drawer

Key features:
- Automatic viewport detection via `resize` event listener
- Backdrop overlay that closes drawer on click
- Smooth slide-in animation from left
- Auto-closes drawer on route change
- Same navigation items and role-based visibility as desktop sidebar
- Accessible: proper `aria-label`, `aria-hidden` on backdrop

#### Updated `/apps/web/src/app/(app)/layout.tsx`

Refactored to use `AppShell` component:
- Simplified layout logic moved to `AppShell`
- Removed duplicate `navItems` array
- Maintains SSR hydration safety with `mounted` state
- Preserves sidebar collapse state persistence

#### Updated `/apps/web/src/app/globals.css`

Added slide-in-left animation:
```css
@keyframes slide-in-left {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

.animate-slide-in-left {
  animation: slide-in-left 0.2s ease-out;
}
```

---

## Issue 2: Suspense Fallback = null

### Pages Fixed

#### `/apps/web/src/app/(app)/leads/page.tsx`

**Before:**
```tsx
<Suspense fallback={null}>
  <LeadsView />
</Suspense>
```

**After:**
```tsx
<Suspense fallback={<LeadsLoadingSkeleton />}>
  <LeadsView />
</Suspense>
```

New `LeadsLoadingSkeleton` component shows:
- Filter bar skeleton (4 filter chips)
- 4-column Kanban grid with `KanbanColumnSkeleton` for each column

#### `/apps/web/src/app/(app)/inventory/page.tsx`

**Before:**
```tsx
<Suspense fallback={null}>
  <InventoryView />
</Suspense>
```

**After:**
```tsx
<Suspense fallback={<InventoryLoadingSkeleton />}>
  <InventoryView />
</Suspense>
```

New `InventoryLoadingSkeleton` component shows:
- Search/filter bar skeleton
- View toggle skeleton
- 4x2 grid of `VehicleCardSkeleton` components

#### `/apps/web/src/app/(app)/customers/page.tsx`

**Before:**
```tsx
<Suspense fallback={null}>
  <CustomerListView />
</Suspense>
```

**After:**
```tsx
<Suspense fallback={<CustomerListLoadingSkeleton />}>
  <CustomerListView />
</Suspense>
```

New `CustomerListLoadingSkeleton` component shows:
- Search and filter bar skeleton
- Table header skeleton
- 8 table rows with avatar, name, and badge skeletons
- Pagination skeleton

### Page Not Changed

#### `/apps/web/src/app/(app)/deals/page.tsx`

This page does **not** use `Suspense` with `fallback={null}`. It shows an `EmptyState` component directly, which is appropriate for the "coming soon" state.

---

## Verification Checklist

- [x] AppShell component created with mobile drawer behavior
- [x] Desktop layout maintains existing sidebar + topbar
- [x] Mobile drawer shows hamburger button in header
- [x] Backdrop overlay closes drawer on click
- [x] Drawer closes on route navigation
- [x] All navigation items preserved with role-based visibility
- [x] Leads page has proper `LeadsLoadingSkeleton`
- [x] Inventory page has proper `InventoryLoadingSkeleton`
- [x] Customers page has proper `CustomerListLoadingSkeleton`
- [x] Deals page shows EmptyState (no change needed)
- [x] CSS animation added for slide-in-left
- [x] No `fallback={null}` remains on any page

---

## Files Modified

1. `/apps/web/src/components/layout/AppShell.tsx` — **NEW**
2. `/apps/web/src/app/(app)/layout.tsx` — Updated to use AppShell
3. `/apps/web/src/app/(app)/leads/page.tsx` — Fixed Suspense fallback
4. `/apps/web/src/app/(app)/inventory/page.tsx` — Fixed Suspense fallback
5. `/apps/web/src/app/(app)/customers/page.tsx` — Fixed Suspense fallback
6. `/apps/web/src/app/globals.css` — Added slide-in-left animation
