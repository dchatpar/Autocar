/**
 * WebSocket plugin — Socket.IO with Redis pub/sub adapter.
 *
 * Why Socket.IO + Redis adapter:
 *   - Built-in reconnection, room semantics, and broadcast helpers
 *     are what we need for the bell + activity feed + live KPI cards.
 *   - The Redis adapter lets us scale the Fastify process
 *     horizontally: every emit on any node is fanned out to all
 *     nodes, so a user connected to node B still receives events
 *     fired on node A.
 *
 * Room layout:
 *   - `dealer:<dealerId>`        — all users in a tenant
 *   - `user:<userId>`            — direct messages (assignments, reminders)
 *   - `role:<dealerId>:<role>`   — role-scoped broadcasts (e.g. finance)
 *
 * Authentication:
 *   - The handshake must carry a JWT in `auth.token`. We verify it
 *     with the same secret as the HTTP layer, and never accept
 *     unauthenticated connections.
 *
 * Lifecycle:
 *   - `setupWebSocket(app)` mounts the server. It is idempotent —
 *     calling twice is a no-op. Returns the Socket.IO instance so
 *     services can `emit()` without going through the Fastify app.
 *   - On `onClose`, the plugin gracefully closes the IO server and
 *     disconnects the Redis pub/sub clients.
 *
 * Graceful degradation:
 *   - If `REDIS_URL` is not set, we attach no adapter — the IO
 *     server still works for the current node, but events won't
 *     cross node boundaries. This keeps local dev (and tests)
 *     working without Redis.
 */

import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import IORedis, { type Redis } from "ioredis";
import { verifyToken } from "../utils/jwt.js";
import type { UserRole } from "@prisma/client";

export interface SocketUserContext {
  userId: string;
  dealerId: string;
  role: UserRole | string;
  email?: string | null;
  name?: string | null;
}

declare module "fastify" {
  interface FastifyInstance {
    /** The shared Socket.IO server, mounted on `/ws`. Null if disabled. */
    io: SocketIOServer | null;
  }
}

const DEFAULT_PATH = "/ws";
const DEFAULT_CORS_ORIGIN = "http://localhost:3000";

let ioInstance: SocketIOServer | null = null;
let pubClient: Redis | null = null;
let subClient: Redis | null = null;
let startedAt: number | null = null;

function buildCORSOrigin(): string | string[] {
  const raw = process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL;
  if (!raw) return DEFAULT_CORS_ORIGIN;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isRedisEnabled(): boolean {
  return Boolean(process.env.REDIS_URL);
}

function buildRedisConnectionOptions(): { url: string } | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return { url };
}

/**
 * Verify the JWT from the handshake. We use the Fastify app's
 * configured signer so secret rotation stays in one place.
 */
async function authenticateSocket(app: FastifyInstance, token: string): Promise<SocketUserContext> {
  const payload = await verifyToken<{
    userId?: string;
    dealerId?: string;
    role?: string;
    email?: string;
    name?: string;
  }>(app, token);
  if (!payload.userId || !payload.dealerId || !payload.role) {
    throw new Error("Token missing required claims");
  }
  return {
    userId: payload.userId,
    dealerId: payload.dealerId,
    role: payload.role,
    email: payload.email ?? null,
    name: payload.name ?? null,
  };
}

/**
 * Attach Socket.IO to a Fastify instance. Idempotent — second call
 * returns the existing IO server.
 */
export async function setupWebSocket(app: FastifyInstance): Promise<SocketIOServer | null> {
  if (ioInstance) return ioInstance;

  const path = process.env.WS_PATH ?? DEFAULT_PATH;

  // Untyped on purpose — Socket.IO v4 has a 4-generic type
  // (ListenEvents, EmitEvents, ServerSideEvents, SocketData) that's
  // noisy for our use case. We treat the server as `any` here and
  // cast at the call sites.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const io: SocketIOServer = new (SocketIOServer as any)(app.server, {
    path,
    cors: {
      origin: buildCORSOrigin(),
      credentials: true,
    },
    // Tighten the upgrade/handshake so a misbehaving client can't
    // hold open a huge number of long-poll connections.
    pingInterval: Number(process.env.WS_PING_INTERVAL ?? 25_000),
    pingTimeout: Number(process.env.WS_PING_TIMEOUT ?? 20_000),
    maxHttpBufferSize: 64 * 1024, // 64KB — notifications are tiny
    transports: ["websocket", "polling"],
  });

  // Redis adapter for horizontal scale. Optional — falls back to
  // single-node mode if Redis is missing.
  if (isRedisEnabled()) {
    try {
      const connOpts = buildRedisConnectionOptions();
      if (connOpts) {
        pubClient = new IORedis(connOpts.url, {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
        });
        subClient = pubClient.duplicate();
        io.adapter(createAdapter(pubClient, subClient));
        app.log.info(
          { component: "websocket", path },
          "Socket.IO Redis adapter attached",
        );
      }
    } catch (err) {
      app.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Failed to attach Redis adapter — falling back to single-node mode",
      );
      pubClient = null;
      subClient = null;
    }
  } else {
    app.log.info(
      { component: "websocket", path },
      "Socket.IO running without Redis adapter (REDIS_URL not set)",
    );
  }

  // Auth middleware — every connection must present a valid JWT.
  io.use(async (socket, next) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handshake = (socket as any).handshake as {
        auth?: { token?: string };
        query?: { token?: string };
      };
      const token = handshake.auth?.token ?? handshake.query?.token;
      if (!token || typeof token !== "string") {
        next(new Error("No token"));
        return;
      }
      const ctx = await authenticateSocket(app, token);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (socket as any).data as Record<string, unknown>;
      data.userId = ctx.userId;
      data.dealerId = ctx.dealerId;
      data.role = ctx.role;
      data.email = ctx.email ?? null;
      data.name = ctx.name ?? null;
      next();
    } catch (err) {
      app.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "WebSocket auth rejected",
      );
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (socket as any).data as {
      userId: string;
      dealerId: string;
      role: string;
    };
    const { dealerId, userId, role } = data;
    const dealerRoom = `dealer:${dealerId}`;
    const userRoom = `user:${userId}`;
    const roleRoom = `role:${dealerId}:${role}`;

    void socket.join([dealerRoom, userRoom, roleRoom]);

    app.log.info(
      {
        component: "websocket",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socketId: (socket as any).id,
        userId,
        dealerId,
        role,
      },
      "WebSocket connected",
    );

    // Broadcast online presence to other users in the same dealer.
    socket.to(dealerRoom).emit("presence:user_online", {
      userId,
      role,
      ts: Date.now(),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on("presence:ping", (cb?: any) => {
      if (typeof cb === "function") {
        cb({ ts: Date.now() });
      } else {
        socket.emit("presence:pong", { ts: Date.now() });
      }
    });

    // Clients can request a resync of unread count after a refresh.
    socket.on("notifications:resync", () => {
      socket.emit("notifications:resync:ack", { ts: Date.now() });
    });

    socket.on("disconnect", (reason: string) => {
      app.log.info(
        {
          component: "websocket",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          socketId: (socket as any).id,
          userId,
          dealerId,
          reason,
        },
        "WebSocket disconnected",
      );
      socket.to(dealerRoom).emit("presence:user_offline", {
        userId,
        ts: Date.now(),
      });
    });
  });

  ioInstance = io;
  startedAt = Date.now();

  app.decorate("io", io);

  // Clean up on app close so tests / hot reload don't leak listeners.
  app.addHook("onClose", async (): Promise<void> => {
    try {
      await io.close();
    } catch (err) {
      app.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Error closing Socket.IO server",
      );
    }
    if (pubClient) {
      try {
        await pubClient.quit();
      } catch {
        // ignore — best-effort
      }
      pubClient = null;
    }
    if (subClient) {
      try {
        await subClient.quit();
      } catch {
        // ignore — best-effort
      }
      subClient = null;
    }
    ioInstance = null;
    startedAt = null;
  });

  return io;
}

/**
 * Returns the shared IO server. Throws if setupWebSocket() hasn't
 * been called — services should call this from request handlers
 * only after the plugin has registered.
 */
export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error(
      "Socket.IO server has not been initialized — call setupWebSocket(app) first",
    );
  }
  return ioInstance;
}

/**
 * Non-throwing accessor. Returns null if the IO server hasn't been
 * set up — services can use this to skip realtime emits when the
 * plugin is disabled (e.g. unit tests).
 */
export function tryGetIO(): SocketIOServer | null {
  return ioInstance;
}

/**
 * Best-effort status — used by /health and tests.
 */
export function getWebSocketStatus(): {
  enabled: boolean;
  redisAdapter: boolean;
  startedAt: number | null;
  connectedSockets: number;
} {
  return {
    enabled: ioInstance !== null,
    redisAdapter: pubClient !== null && subClient !== null,
    startedAt,
    connectedSockets: ioInstance ? ioInstance.sockets.sockets.size : 0,
  };
}

/**
 * Fastify plugin wrapper so we can `app.register(websocketPlugin)`.
 */
export default async function websocketPlugin(app: FastifyInstance): Promise<void> {
  await setupWebSocket(app);
}
