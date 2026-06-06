"use client";

/**
 * useNotifications — bell panel data + live updates.
 *
 * Responsibilities:
 *   - Load the user's notification inbox on mount (paginated).
 *   - Subscribe to the `notification` event over Socket.IO and
 *     prepend new entries in real time.
 *   - Keep `unreadCount` in sync with the server.
 *   - Expose actions: markRead, markAllRead, remove, refresh.
 *
 * Design:
 *   - We use `useInfiniteQuery` to support cursor pagination, but
 *     collapse the result into a single `items` array for ergonomic
 *     consumption by `<NotificationList />`.
 *   - The unread count is a separate lightweight query so the bell
 *     badge can render without dragging in the full inbox payload.
 *
 * Toast hook:
 *   - The hook also exposes a `latestNotification` value that the
 *     `<NotificationToast />` component subscribes to for the
 *     "just-arrived" popover. Consumers can render their own
 *     toast UI on top of this hook.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, getAuthToken } from "@/lib/api";
import { useRealtime, useRealtimeEvent } from "./useRealtime";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type NotificationType =
  | "LEAD_ASSIGNED"
  | "LEAD_CREATED"
  | "LEAD_STATUS_CHANGED"
  | "CUSTOMER_CREATED"
  | "DEAL_STAGE_CHANGED"
  | "DEAL_DELIVERED"
  | "VEHICLE_SOLD"
  | "VEHICLE_PRICE_CHANGED"
  | "TEST_DRIVE_SCHEDULED"
  | "TEST_DRIVE_COMPLETED"
  | "APPOINTMENT_REMINDER"
  | "SYSTEM";

export type NotificationEntity =
  | "LEAD"
  | "CUSTOMER"
  | "DEAL"
  | "VEHICLE"
  | "APPOINTMENT"
  | "TEST_DRIVE"
  | "USER"
  | "SYSTEM";

export interface Notification {
  id: string;
  dealerId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: NotificationEntity | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface InboxPage {
  data: Notification[];
  pagination: { hasMore: boolean; cursor: string | null };
}

const NOTIFICATION_QUERY_KEY = ["notifications", "inbox"] as const;
const UNREAD_QUERY_KEY = ["notifications", "unread-count"] as const;
const PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/* API helpers                                                        */
/* ------------------------------------------------------------------ */

async function fetchInboxPage(
  cursor: string | undefined,
  unreadOnly: boolean,
): Promise<InboxPage> {
  return api.get<InboxPage>("/notifications", {
    query: {
      cursor: cursor ?? null,
      limit: PAGE_SIZE,
      unreadOnly: unreadOnly ? "true" : undefined,
    },
  });
}

async function fetchUnreadCount(): Promise<{ count: number }> {
  return api.get<{ count: number }>("/notifications/unread-count");
}

/* ------------------------------------------------------------------ */
/* Hook                                                               */
/* ------------------------------------------------------------------ */

export interface UseNotificationsOptions {
  /** Show only unread (default false). */
  unreadOnly?: boolean;
  /** Whether to also subscribe to live events (default true). */
  live?: boolean;
}

export interface UseNotificationsResult {
  items: Notification[];
  unreadCount: number;
  total: number;
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /**
   * Most recent notification that arrived over the WebSocket. Use
   * this to drive a toast component.
   */
  latestNotification: Notification | null;
  /** True when the WebSocket is currently connected. */
  connected: boolean;
}

export function useNotifications(
  options: UseNotificationsOptions = {},
): UseNotificationsResult {
  const { unreadOnly = false, live = true } = options;
  const queryClient = useQueryClient();
  const token = getAuthToken();
  const { socket, connected } = useRealtime(token);

  // ---- Inbox query (cursor-paginated, infinite) ----------------------

  const inbox = useInfiniteQuery<
    InboxPage,
    Error,
    // Default `TData` is `InfiniteData<TQueryFnData>` — we let it
    // infer so `inbox.data.pages` is typed correctly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    readonly unknown[],
    string | undefined
  >({
    queryKey: [...NOTIFICATION_QUERY_KEY, { unreadOnly }],
    queryFn: ({ pageParam }) => fetchInboxPage(pageParam, unreadOnly),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.pagination.cursor ?? undefined,
    enabled: Boolean(token),
    staleTime: 30_000,
  });

  const items: Notification[] = useMemo(() => {
    if (!inbox.data) return [];
    const out: Notification[] = [];
    for (const page of inbox.data.pages) {
      for (const n of page.data) {
        out.push(n);
      }
    }
    return out;
  }, [inbox.data]);

  const hasMore = Boolean(inbox.hasNextPage);

  // ---- Unread count (lightweight) -----------------------------------

  const unreadQuery = useQuery<{ count: number }, Error>({
    queryKey: UNREAD_QUERY_KEY,
    queryFn: fetchUnreadCount,
    enabled: Boolean(token),
    staleTime: 10_000,
  });

  // ---- Live subscription --------------------------------------------

  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);

  useRealtimeEvent<Notification>(socket, "notification", (payload) => {
    setLatestNotification(payload);
    // Optimistic prepend to the inbox (only if we're not in unreadOnly
    // mode, or the new notif is unread).
    queryClient.setQueryData(
      [...NOTIFICATION_QUERY_KEY, { unreadOnly }],
      (prev: { pages: InboxPage[]; pageParams: unknown[] } | undefined) => {
        if (!prev) {
          return {
            pages: [{ data: [payload], pagination: { hasMore: false, cursor: null } }],
            pageParams: [undefined],
          };
        }
        const firstPage = prev.pages[0];
        if (!firstPage) return prev;
        // De-dupe (server may re-deliver on reconnect).
        if (firstPage.data.some((n) => n.id === payload.id)) return prev;
        // Only prepend to the first page so the order is preserved.
        const pages = [
          { ...firstPage, data: [payload, ...firstPage.data] },
          ...prev.pages.slice(1),
        ];
        return { ...prev, pages };
      },
    );
    if (!payload.isRead) {
      queryClient.setQueryData<{ count: number } | undefined>(UNREAD_QUERY_KEY, (prev) => ({
        count: (prev?.count ?? 0) + 1,
      }));
    }
  });

  // ---- Actions -------------------------------------------------------

  const markRead = useMutation<Notification, Error, string>({
    mutationFn: async (id) => api.post<Notification>(`/notifications/${id}/read`),
    onSuccess: (updated) => {
      // Update inbox items.
      queryClient.setQueryData(
        [...NOTIFICATION_QUERY_KEY, { unreadOnly }],
        (prev: { pages: InboxPage[]; pageParams: unknown[] } | undefined) => {
          if (!prev) return prev;
          const pages = prev.pages.map((p) => ({
            ...p,
            data: p.data.map((n) => (n.id === updated.id ? updated : n)),
          }));
          return { ...prev, pages };
        },
      );
      // Decrement unread count if this row was unread.
      if (!updated.isRead) {
        queryClient.setQueryData<{ count: number } | undefined>(UNREAD_QUERY_KEY, (prev) => ({
          count: Math.max(0, (prev?.count ?? 0) - 1),
        }));
      }
    },
  });

  const markAllRead = useMutation<{ count: number }, Error, void>({
    mutationFn: async () => api.post<{ count: number }>("/notifications/read-all"),
    onSuccess: (result) => {
      queryClient.setQueryData(
        [...NOTIFICATION_QUERY_KEY, { unreadOnly }],
        (prev: { pages: InboxPage[]; pageParams: unknown[] } | undefined) => {
          if (!prev) return prev;
          const pages = prev.pages.map((p) => ({
            ...p,
            data: p.data.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: new Date().toISOString() })),
          }));
          return { ...prev, pages };
        },
      );
      queryClient.setQueryData<{ count: number } | undefined>(UNREAD_QUERY_KEY, () => ({
        count: 0,
      }));
      void result; // result.count is informational
    },
  });

  const remove = useMutation<{ id: string }, Error, string>({
    mutationFn: async (id) => {
      await api.del<void>(`/notifications/${id}`);
      return { id };
    },
    onSuccess: ({ id }) => {
      queryClient.setQueryData(
        [...NOTIFICATION_QUERY_KEY, { unreadOnly }],
        (prev: { pages: InboxPage[]; pageParams: unknown[] } | undefined) => {
          if (!prev) return prev;
          const pages = prev.pages.map((p) => ({
            ...p,
            data: p.data.filter((n) => n.id !== id),
          }));
          return { ...prev, pages };
        },
      );
    },
  });

  const loadMore = useCallback((): void => {
    if (inbox.hasNextPage && !inbox.isFetchingNextPage) {
      void inbox.fetchNextPage();
    }
  }, [inbox]);

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([
      inbox.refetch(),
      unreadQuery.refetch(),
    ]);
  }, [inbox, unreadQuery]);

  // Keep `unreadCount` synced with the inbox length when the server
  // sent back a different value (e.g. after a re-login). This is a
  // belt-and-braces fallback for when the live socket isn't open yet.
  useEffect(() => {
    const localUnread = items.filter((n) => !n.isRead).length;
    const serverUnread = unreadQuery.data?.count ?? 0;
    if (localUnread > 0 && serverUnread === 0) {
      queryClient.setQueryData<{ count: number } | undefined>(UNREAD_QUERY_KEY, () => ({
        count: localUnread,
      }));
    }
  }, [items, unreadQuery.data, queryClient]);

  return {
    items,
    unreadCount: unreadQuery.data?.count ?? 0,
    total: items.length,
    isLoading: inbox.isLoading,
    isError: inbox.isError,
    hasMore,
    loadMore,
    refresh,
    markRead: async (id) => {
      await markRead.mutateAsync(id);
    },
    markAllRead: async () => {
      await markAllRead.mutateAsync();
    },
    remove: async (id) => {
      await remove.mutateAsync(id);
    },
    latestNotification,
    connected,
  };
}

export default useNotifications;
