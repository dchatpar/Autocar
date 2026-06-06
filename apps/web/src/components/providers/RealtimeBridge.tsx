"use client";

/**
 * RealtimeBridge — root-level mount point for global realtime UI
 * (the notification bell + the toast stack). Lives at the top of
 * the React tree so it survives page navigation; the bell and
 * toast share the same `useNotifications` cache via React Query.
 *
 * It's also responsible for mounting `<NotificationToast />`,
 * which pops toasts on every new notification, regardless of
 * which page the user is on.
 *
 * Public routes (login, signup) skip the bridge because the
 * user is unauthenticated; the bell + toast are no-ops without
 * a token.
 */

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationToast } from "@/components/notifications/NotificationToast";
import { getAuthToken } from "@/lib/api";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/purchase-from-public",
];

interface RealtimeBridgeProps {
  children: ReactNode;
}

export function RealtimeBridge({ children }: RealtimeBridgeProps) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname?.startsWith(p));
  const hasToken = Boolean(getAuthToken());

  if (isPublic || !hasToken) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      {/* Fixed-position overlays — rendered once, visible everywhere. */}
      <NotificationBell />
      <NotificationToast />
    </>
  );
}

export default RealtimeBridge;
