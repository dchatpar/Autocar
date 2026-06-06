"use client";

/**
 * NotificationToast — auto-shown when a new notification arrives
 * over the WebSocket.
 *
 * Renders a stack of up to 3 toasts in the top-right corner. Each
 * toast auto-dismisses after 6 seconds, with a progress bar to
 * make the timeout visible.
 *
 * Click the toast body to navigate to the related entity (we
 * route by entityType, with a sensible default).
 *
 * Implementation:
 *   - We listen to `useNotifications` for `latestNotification`. The
 *     hook is shared, so any bell or list in the tree is in sync.
 *   - Toasts are kept in a local ref+state to survive re-renders
 *     and allow dedupe when the same notification arrives twice
 *     (e.g. server reconnect).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle2, AlertCircle, Info, Bell } from "lucide-react";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const MAX_TOASTS = 3;
const TOAST_DURATION_MS = 6_000;

interface VisibleToast {
  id: string;
  notification: Notification;
  startedAt: number;
}

const TONE_STYLES: Record<
  Notification["type"],
  { icon: React.ReactNode; accent: string; bg: string }
> = {
  LEAD_ASSIGNED: {
    icon: <Info className="h-4 w-4" />,
    accent: "text-info",
    bg: "border-info/30",
  },
  LEAD_CREATED: {
    icon: <Info className="h-4 w-4" />,
    accent: "text-info",
    bg: "border-info/30",
  },
  LEAD_STATUS_CHANGED: {
    icon: <Info className="h-4 w-4" />,
    accent: "text-accent",
    bg: "border-accent/30",
  },
  CUSTOMER_CREATED: {
    icon: <Info className="h-4 w-4" />,
    accent: "text-info",
    bg: "border-info/30",
  },
  DEAL_STAGE_CHANGED: {
    icon: <Info className="h-4 w-4" />,
    accent: "text-accent",
    bg: "border-accent/30",
  },
  DEAL_DELIVERED: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    accent: "text-success",
    bg: "border-success/30",
  },
  VEHICLE_SOLD: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    accent: "text-success",
    bg: "border-success/30",
  },
  VEHICLE_PRICE_CHANGED: {
    icon: <AlertCircle className="h-4 w-4" />,
    accent: "text-warning",
    bg: "border-warning/30",
  },
  TEST_DRIVE_SCHEDULED: {
    icon: <Info className="h-4 w-4" />,
    accent: "text-accent",
    bg: "border-accent/30",
  },
  TEST_DRIVE_COMPLETED: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    accent: "text-success",
    bg: "border-success/30",
  },
  APPOINTMENT_REMINDER: {
    icon: <Bell className="h-4 w-4" />,
    accent: "text-warning",
    bg: "border-warning/30",
  },
  SYSTEM: {
    icon: <Info className="h-4 w-4" />,
    accent: "text-text-muted",
    bg: "border-border",
  },
};

function hrefFor(n: Notification): string | null {
  if (!n.entityId) return null;
  switch (n.entityType) {
    case "LEAD":
      return `/leads/${n.entityId}`;
    case "CUSTOMER":
      return `/customers/${n.entityId}`;
    case "DEAL":
      return `/deals/${n.entityId}`;
    case "VEHICLE":
      return `/inventory/${n.entityId}`;
    case "APPOINTMENT":
    case "TEST_DRIVE":
      return `/test-drives/${n.entityId}`;
    case "USER":
    case "SYSTEM":
    default:
      return null;
  }
}

export function NotificationToast() {
  const { latestNotification, markRead } = useNotifications();
  const [visible, setVisible] = useState<VisibleToast[]>([]);
  const router = useRouter();
  // Track which notification IDs we've already toasted to avoid
  // duplicates on socket reconnect.
  const seenRef = useRef<Set<string>>(new Set());
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!latestNotification) return;
    if (seenRef.current.has(latestNotification.id)) return;
    seenRef.current.add(latestNotification.id);

    const toast: VisibleToast = {
      id: latestNotification.id,
      notification: latestNotification,
      startedAt: Date.now(),
    };
    setVisible((prev) => [toast, ...prev].slice(0, MAX_TOASTS));

    // Schedule auto-dismiss.
    const handle = setTimeout(() => {
      dismiss(latestNotification.id);
    }, TOAST_DURATION_MS);
    timerRefs.current.set(latestNotification.id, handle);
  }, [latestNotification]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      for (const t of timerRefs.current.values()) clearTimeout(t);
      timerRefs.current.clear();
    };
  }, []);

  function dismiss(id: string): void {
    setVisible((prev) => prev.filter((t) => t.id !== id));
    const t = timerRefs.current.get(id);
    if (t) {
      clearTimeout(t);
      timerRefs.current.delete(id);
    }
  }

  function onToastClick(n: Notification): void {
    const href = hrefFor(n);
    // Mark as read as a side effect of acknowledging.
    if (!n.isRead) {
      void markRead(n.id);
    }
    dismiss(n.id);
    if (href) router.push(href);
  }

  if (visible.length === 0) return null;

  return (
    <div
      className="fixed top-20 right-6 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {visible.map((t) => {
        const tone = TONE_STYLES[t.notification.type] ?? TONE_STYLES.SYSTEM;
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto bg-bg-card border rounded-xl shadow-2xl shadow-black/40 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden",
              tone.bg,
            )}
            data-testid="notification-toast"
          >
            <button
              type="button"
              onClick={() => onToastClick(t.notification)}
              className="w-full text-left p-3 hover:bg-bg-elevated/40 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={cn("flex-shrink-0 mt-0.5", tone.accent)} aria-hidden="true">
                  {tone.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {t.notification.title}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                    {t.notification.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(t.id);
                  }}
                  className="flex-shrink-0 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </button>
            {/* Progress bar — shows time remaining before auto-dismiss. */}
            <div className="h-0.5 w-full bg-bg-elevated overflow-hidden">
              <div
                className={cn("h-full animate-toast-progress", tone.accent.replace("text-", "bg-"))}
                style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default NotificationToast;
