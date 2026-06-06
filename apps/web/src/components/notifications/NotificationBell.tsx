"use client";

/**
 * NotificationBell — top-bar bell with an unread badge.
 *
 * Behaviour:
 *   - Mounts a popover with the most recent notifications.
 *   - Badge shows the unread count (clamped to "99+").
 *   - Clicking the bell opens the popover; first open also marks
 *     the row as visually read (so the badge updates).
 *   - Includes quick actions: "Mark all read" and a per-item
 *     "Mark read" / "Delete".
 *
 * The component is self-contained: it owns its open/close state and
 * uses its own copy of `useNotifications` so multiple bells in the
 * same tree (unlikely, but possible) wouldn't share an unread-count
 * stale closure.
 */

import { useState, useRef, useEffect } from "react";
import { Bell, Check, X } from "lucide-react";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/utils";
import { NotificationList } from "./NotificationList";

interface NotificationBellProps {
  className?: string;
  /** Optional size variant. Default: "md" (24px button). */
  size?: "sm" | "md";
}

export function NotificationBell({ className, size = "md" }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const { items, unreadCount, markRead, markAllRead, remove, connected, isLoading } =
    useNotifications();

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const badge = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex items-center justify-center rounded-lg hover:bg-bg-elevated transition-colors text-text-muted hover:text-text-primary",
          size === "sm" ? "h-8 w-8" : "h-10 w-10",
        )}
      >
        <Bell className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
        {badge && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full text-[10px] font-semibold leading-none",
              "bg-danger text-white",
            )}
            aria-label={`${unreadCount} unread notifications`}
          >
            {badge}
          </span>
        )}
        {/* Tiny live indicator — green dot when WS is connected and there's been activity. */}
        {connected && (
          <span
            className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-success"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Notifications"
          className={cn(
            "absolute right-0 mt-2 w-[380px] max-w-[calc(100vw-24px)] z-50",
            "bg-bg-card border border-border rounded-xl shadow-2xl shadow-black/40",
            "flex flex-col max-h-[560px] overflow-hidden",
          )}
        >
          <NotificationBellHeader
            unreadCount={unreadCount}
            onMarkAllRead={() => {
              void markAllRead();
            }}
            onClose={() => setOpen(false)}
          />
          <NotificationList
            items={items.slice(0, 10)}
            isLoading={isLoading}
            onMarkRead={(id) => {
              void markRead(id);
            }}
            onDelete={(id) => {
              void remove(id);
            }}
            emptyMessage="No notifications yet — you're all caught up."
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                     */
/* ------------------------------------------------------------------ */

interface NotificationBellHeaderProps {
  unreadCount: number;
  onMarkAllRead: () => void;
  onClose: () => void;
}

function NotificationBellHeader({
  unreadCount,
  onMarkAllRead,
  onClose,
}: NotificationBellHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-border">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-text-primary">Notifications</h3>
        {unreadCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded-full">
            {unreadCount} new
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllRead}
            className="h-8 px-2 text-xs"
          >
            <Check className="h-3 w-3" />
            <span>Mark all read</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Re-exports                                                         */
/* ------------------------------------------------------------------ */

export { NotificationBellHeader };
export type { Notification };
