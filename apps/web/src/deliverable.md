# DealerOS UI Components — Deliverable

## Summary

Created three missing UI components for DealerOS, all using CSS design tokens (dark mode first).

## Files Created

### 1. `/workspace/apps/web/src/components/ui/Skeleton.tsx`
Skeleton loading components for consistent loading states:
- `Skeleton` — base skeleton primitive using `bg-bg-elevated` and `animate-pulse`
- `LeadCardSkeleton` — matches LeadCard layout (avatar, name, badges)
- `VehicleCardSkeleton` — matches VehicleCard layout (image placeholder, title, price)
- `TableRowSkeleton` — configurable table row skeleton (`cols` prop)
- `StatCardSkeleton` — matches KPI card layout (icon, label, value)
- `KanbanColumnSkeleton` — column header + 3 lead cards

All components use `aria-hidden="true"` for accessibility and CSS token `bg-bg-elevated`.

### 2. `/workspace/apps/web/src/components/ui/ErrorBoundary.tsx`
React ErrorBoundary class component:
- Class-based component for compatibility with older React patterns
- `getDerivedStateFromError` for state update
- `componentDidCatch` for logging (calls optional `onError` prop)
- Default fallback UI with danger icon, error message, retry and dashboard buttons
- Supports custom `fallback` prop for custom error UIs
- Uses CSS tokens: `bg-danger/10`, `text-danger`, `text-text-primary`, `text-text-muted`

### 3. `/workspace/apps/web/src/components/providers/ToastProvider.tsx`
Inline toast notification system:
- Context-based (`ToastContext`) with `useToast()` hook
- Methods: `toast()`, `success()`, `error()`, `info()`, `warning()`
- Auto-dismiss after 5 seconds, manual dismiss with X button
- Stack limited to 3 toasts (oldest removed when exceeded)
- Type-specific left border styling using CSS tokens
- `animate-slide-in-right` animation for toast entrance
- Fixed positioning at `bottom-4 right-4 z-[100]`

## Files Modified

### `/workspace/apps/web/src/app/globals.css`
Added `slide-in-right` keyframe animation:
```css
@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.animate-slide-in-right {
  animation: slide-in-right 0.2s ease-out;
}
```

### `/workspace/apps/web/src/app/layout.tsx`
Replaced `<Toaster />` import with `<ToastProvider />`:
```tsx
import { ToastProvider } from "@/components/providers/ToastProvider"
...
<ToastProvider />
```

## How to Run

```bash
cd /workspace/apps/web
pnpm dev
```

## Usage Examples

### Skeleton
```tsx
// Basic skeleton
<Skeleton className="h-4 w-32" />

// Lead card loading state
<LeadCardSkeleton />

// Table loading
<Table>
  <TableBody>
    {isLoading && Array.from({ length: 5 }).map((_, i) => (
      <TableRowSkeleton key={i} cols={6} />
    ))}
  </TableBody>
</Table>
```

### Error Boundary
```tsx
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>

// With custom fallback
<ErrorBoundary fallback={<CustomErrorUI />}>
  <MyComponent />
</ErrorBoundary>
```

### Toast Notifications
```tsx
// In any client component
import { useToast } from '@/components/providers/ToastProvider'

function MyComponent() {
  const { success, error, info } = useToast()

  return (
    <button onClick={() => success('Lead saved!')}>
      Save Lead
    </button>
  )
}
```

## CSS Tokens Used

| Token | Value | Usage |
|-------|-------|-------|
| `bg-bg-elevated` | `#1A1D24` | Skeleton background |
| `bg-bg-card` | `#111318` | Card backgrounds |
| `border-border` | `#1E2229` | Borders |
| `text-text-primary` | `#E2E8F0` | Primary text |
| `text-text-muted` | `#6B7280` | Muted text |
| `bg-danger/10` | `rgba(239,68,68,0.1)` | Error background |
| `text-danger` | `#EF4444` | Error/danger text |
| `border-l-success` | `#22D3A0` | Success toast border |
| `border-l-info` | `#3B82F6` | Info toast border |
| `border-l-warning` | `#F97316` | Warning toast border |

## Notes

- All components are client components (`'use client'`)
- ToastProvider uses an inline approach (no sonner dependency required)
- ErrorBoundary is class-based for React error boundary compatibility
- Skeleton components are decorative (`aria-hidden`) for screen reader support

## VERDICT: PASS
