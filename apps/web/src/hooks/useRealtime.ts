"use client";

/**
 * useRealtime — React hook that owns a single Socket.IO connection
 * per browser tab. Returns the live socket and a `connected` flag
 * so consumers can render a status indicator if they want.
 *
 * The hook is reference-stable per (token, url) pair: rerendering
 * the consumer doesn't reconnect. The socket auto-disconnects on
 * unmount.
 *
 * Authentication:
 *   - Pulls the auth token from `getAuthToken()` (the same key the
 *     REST client uses). The server rejects any handshake without
 *     a valid JWT.
 *   - When the token changes (e.g. login / logout), the socket
 *     reconnects automatically.
 *
 * Transports:
 *   - Tries `websocket` first, falls back to `polling`. Polling
 *     is essential for corporate proxies that block raw WS.
 *
 * SSR-safe:
 *   - The hook is `use client` and short-circuits to `null` while
 *     running on the server (no `window`).
 */

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getAuthToken } from "@/lib/api";

export interface RealtimeEvent<T = unknown> {
  event: string;
  payload: T;
  ts: number;
}

export interface UseRealtimeResult {
  socket: Socket | null;
  connected: boolean;
  /** Last error reported by Socket.IO (auth failure, network, ...). */
  error: string | null;
  /** Most recent `ts` from a server event, for "live" pulse animations. */
  lastEventAt: number | null;
}

const DEFAULT_PATH = "/ws";

/**
 * The hook.
 *
 * The token is passed in (rather than re-read on every render) so
 * a login/logout can force a reconnect by changing the prop.
 */
export function useRealtime(tokenOverride?: string | null): UseRealtimeResult {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const lastEventHandlerRef = useRef<(() => void) | null>(null);

  const token = tokenOverride ?? getAuthToken();
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3001";
  const path = process.env.NEXT_PUBLIC_WS_PATH ?? DEFAULT_PATH;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!token) {
      // No token → no socket. Clean up if we had one.
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      return undefined;
    }

    const socket: Socket = io(apiUrl, {
      path,
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      timeout: 15_000,
      withCredentials: true,
    });

    socketRef.current = socket;

    const onConnect = (): void => {
      setConnected(true);
      setError(null);
    };
    const onDisconnect = (reason: string): void => {
      setConnected(false);
      if (reason === "io server disconnect" || reason === "io client disconnect") {
        // Auth failure or intentional close — don't try to auto-reconnect.
        socket.disconnect();
      }
    };
    const onConnectError = (err: Error): void => {
      setError(err.message);
      setConnected(false);
    };

    // Generic pulse listener — every server event updates lastEventAt
    // so the dashboard can render a tiny green dot when something
    // just happened. We use `*` (onevent) for the wildcard.
    const onAny = (): void => {
      setLastEventAt(Date.now());
    };
    lastEventHandlerRef.current = onAny;
    socket.onAny(onAny);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      if (lastEventHandlerRef.current) {
        socket.offAny(lastEventHandlerRef.current);
        lastEventHandlerRef.current = null;
      }
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, [apiUrl, path, token]);

  return {
    socket: socketRef.current,
    connected,
    error,
    lastEventAt,
  };
}

/**
 * Listen to a specific Socket.IO event with a typed handler.
 * Auto-cleans up on unmount or when the socket changes.
 */
export function useRealtimeEvent<T = unknown>(
  socket: Socket | null,
  event: string,
  handler: (payload: T) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!socket) return undefined;
    const wrapped = (payload: T): void => handlerRef.current(payload);
    socket.on(event, wrapped as never);
    return () => {
      socket.off(event, wrapped as never);
    };
  }, [socket, event]);
}

export default useRealtime;
