"use client";

/**
 * NotificationList — scrollable, virtualized-friendly list of
 * notification rows. Used by:
 *   - `<NotificationBell />` (in the popover)
 *   - The full `/notifications` page (todo)
 *
 * Each row shows:
 *   - A type icon (lead, deal, vehicle, ...)
 *   - Title (one line) + body (two lines, ellipsized)
 *   - "X minutes ago" timestamp
 *   - An unread dot on the left when isRead=false
 *   - Per-row actions: Mark read, Delete
 *
 * Performance:
 *   - We keep the list dumb — pagination / virtualization belongs
 *     to the consumer. This keeps the bell snappy with a hard cap
 *     of 10 items.
 */

import {
  Bell,
  Car,
  Check,
  CheckCheck,
  ClipboardCheck,
  FileText,
  Handshake,
  Tag,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { Notification, NotificationType } from "@/hooks/useNotifications";
import { cn, formatDistanceToNow } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

interface NotificationListProps {
  items: Notification[];
  isLoading?: boolean;
  /** When true, shows the row footer with action buttons. */
  showActions?: boolean;
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
  className?: string;
}

const ICONS: Record<NotificationType, { icon: React.ReactNode; tone: string }> = {
  LEAD_ASSIGNED: { icon: <UserPlus className="h-4 w-4" />, tone: "text-info" },
  LEAD_CREATED: { icon: <Users className="h-4 w-4" />, tone: "text-info" },
  LEAD_STATUS_CHANGED: { icon: <Tag className="h-4 w-4" />, tone: "text-accent" },
  CUSTOMER_CREATED: { icon: <Users className="h-4 w-4" />, tone: "text-info" },
  DEAL_STAGE_CHANGED: { icon: <Handshake className="h-4 w-4" />, tone: "text-accent" },
  DEAL_DELIVERED: { icon: <CheckCheck className="h-4 w-4" />, tone: "text-success" },
  VEHICLE_SOLD: { icon: <Car className="h-4 w-4" />, tone: "text-success" },
  VEHICLE_PRICE_CHANGED: { icon: <Tag className="h-4 w-4" />, tone: "text-warning" },
  TEST_DRIVE_SCHEDULED: { icon: <Car className="h-4 w-4" />, tone: "text-accent" },
  TEST_DRIVE_COMPLETED: { icon: <ClipboardCheck className="h-4 w-4" />, tone: "text-success" },
  APPOINTMENT_REMINDER: { icon: <Bell className="h-4 w-4" />, tone: "text-warning" },
  SYSTEM: { icon: <FileText className="h-4 w-4" />, tone: "text-text-muted" },
};

export function NotificationList({
  items,
  isLoading,
  showActions = true,
  onMarkRead,
  onDelete,
  emptyMessage = "No notifications yet.",
  className,
}: NotificationListProps) {
  if (isLoading && items.length === 0) {
    return (
      <ul className={cn("divide-y divide-border", className)} aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="p-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn("p-8 text-center text-text-muted text-sm", className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul
      className={cn("divide-y divide-border overflow-y-auto", className)}
      role="feed"
      aria-label="Notifications"
    >
      {items.map((n) => (
        <NotificationRow
          key={n.id}
          notification={n}
          showActions={showActions}
          onMarkRead={onMarkRead}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Single row                                                         */
/* ------------------------------------------------------------------ */

interface NotificationRowProps {
  notification: Notification;
  showActions: boolean;
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function NotificationRow({
  notification,
  showActions,
  onMarkRead,
  onDelete,
}: NotificationRowProps) {
  const visual = ICONS[notification.type] ?? ICONS.SYSTEM;
  const timeAgo = formatDistanceToNow(notification.createdAt);

  return (
    <li
      role="article"
      aria-label={notification.title}
      className={cn(
        "px-3 py-3 hover:bg-bg-elevated/60 transition-colors",
        !notification.isRead && "bg-accent/[0.04]",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Unread dot */}
        <span
          className={cn(
            "mt-1.5 w-2 h-2 rounded-full flex-shrink-0",
            notification.isRead ? "bg-transparent" : "bg-accent",
          )}
          aria-hidden="true"
        />
        {/* Type icon */}
        <div
          className={cn(
            "flex-shrink-0 p-2 rounded-lg bg-bg-elevated",
            visual.tone,
          )}
          aria-hidden="true"
        >
          {visual.icon}
        </div>
        {/* Body */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {notification.title}
          </p>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
            {notification.body}
          </p>
          <p className="text-[11px] text-text-muted mt-1" title={notification.createdAt}>
            {timeAgo}
          </p>
        </div>
      </div>

      {showActions && (
        <div className="mt-2 flex items-center gap-2 pl-7">
          {!notification.isRead && onMarkRead && (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-accent"
            >
              <Check className="h-3 w-3" />
              <span>Mark read</span>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(notification.id)}
              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-danger"
            >
              <Trash2 className="h-3 w-3" />
              <span>Delete</span>
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export default NotificationList;
