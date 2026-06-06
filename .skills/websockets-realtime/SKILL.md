# WebSocket Real-Time Notifications Skill

Build real-time features for DealerOS — live activity feeds, notifications, presence.

## When to use this skill

When building features that need:
- Live activity feed (new leads appearing without refresh)
- Real-time notifications (bell badge updates)
- Multi-user collaboration (someone else editing a lead)
- Live dashboard KPIs (auto-update)
- Online/offline presence indicators
- Typing indicators in chat
- WebSocket scale-out with Redis pub/sub

## Socket.IO + Fastify Setup

```typescript
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import type { FastifyInstance } from 'fastify';

export function setupWebSocket(fastify: FastifyInstance) {
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    },
    path: '/ws'
  });

  // Redis adapter for horizontal scale
  const pubClient = new IORedis(process.env.REDIS_URL!);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
      const payload = verifyJwt(token);
      socket.data.userId = payload.userId;
      socket.data.dealerId = payload.dealerId;
      socket.data.role = payload.role;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { dealerId, userId, role } = socket.data;
    
    // Auto-join dealer's room
    socket.join(`dealer:${dealerId}`);
    // Join user-specific room for personal notifications
    socket.join(`user:${userId}`);
    
    // Join role-based room
    socket.join(`role:${dealerId}:${role}`);

    socket.on('disconnect', () => {
      logger.info('User disconnected', { userId, socketId: socket.id });
    });

    // Ping for presence
    socket.on('presence:ping', () => {
      socket.emit('presence:pong', { ts: Date.now() });
    });
  });

  return io;
}
```

## Emitting Events from API

```typescript
// In any service, after creating a lead:
async function notifyLeadCreated(lead: Lead, dealerId: string, actor: User) {
  const io = getIO(); // singleton
  
  // Notify all users in dealer's room
  io.to(`dealer:${dealerId}`).emit('lead:created', {
    leadId: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    source: lead.source,
    score: lead.currentScore,
    createdAt: lead.createdAt,
    createdBy: { id: actor.id, name: actor.name }
  });

  // Notify assigned user specifically
  if (lead.assignedToId) {
    io.to(`user:${lead.assignedToId}`).emit('notification', {
      type: 'lead_assigned',
      title: 'New lead assigned to you',
      body: `${lead.firstName} ${lead.lastName} from ${lead.source}`,
      leadId: lead.id,
      timestamp: Date.now()
    });
  }
}
```

## Notification Model

```prisma
model Notification {
  id          String   @id @default(cuid())
  dealerId    String
  userId      String   // recipient
  type        String   // lead_assigned | deal_delivered | appointment_reminder | etc
  title       String
  body        String
  entityType  String?  // lead | deal | customer | vehicle | etc
  entityId    String?
  metadata    Json?
  isRead      Boolean  @default(false)
  readAt      DateTime?
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@index([createdAt])
  @@map("notifications")
}
```

## API Routes

- GET    /notifications (current user's notifications, paginated)
- POST   /notifications/:id/read (mark single as read)
- POST   /notifications/read-all (mark all as read)
- DELETE /notifications/:id
- GET    /notifications/unread-count

## Frontend — React Hook

```typescript
// hooks/useRealtime.ts
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useRealtime() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    const s = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
      path: '/ws',
      auth: { token },
      transports: ['websocket', 'polling']
    });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    setSocket(s);
    return () => s.disconnect();
  }, []);

  return { socket, connected };
}

// hooks/useNotifications.ts
export function useNotifications() {
  const { socket } = useRealtime();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!socket) return;
    const handler = (n: Notification) => {
      setNotifications(prev => [n, ...prev].slice(0, 50));
      // Show toast
      toast.info(n.title, { description: n.body });
    };
    socket.on('notification', handler);
    return () => { socket.off('notification', handler); };
  }, [socket]);

  return notifications;
}
```

## Frontend — Notification Bell

```tsx
// components/notifications/NotificationBell.tsx
export function NotificationBell() {
  const notifications = useNotifications();
  const unread = notifications.filter(n => !n.isRead).length;
  
  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 bg-danger text-white">
              {unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <NotificationList notifications={notifications} />
      </PopoverContent>
    </Popover>
  );
}
```

## Frontend — Live Activity Feed

```tsx
// components/dashboard/LiveActivityFeed.tsx
export function LiveActivityFeed() {
  const { socket } = useRealtime();
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    if (!socket) return;
    socket.on('lead:created', (lead) => {
      setActivities(prev => [{ type: 'lead_created', data: lead, ts: Date.now() }, ...prev].slice(0, 50));
    });
    socket.on('deal:stage_changed', (deal) => {
      setActivities(prev => [{ type: 'deal_stage', data: deal, ts: Date.now() }, ...prev].slice(0, 50));
    });
    return () => { socket.off('lead:created'); socket.off('deal:stage_changed'); };
  }, [socket]);

  return <ActivityList activities={activities} />;
}
```

## Real-Time KPI Dashboard

```typescript
// Broadcast updated KPIs every 30 seconds
setInterval(async () => {
  const stats = await computeStats(dealerId);
  io.to(`dealer:${dealerId}`).emit('stats:update', stats);
}, 30_000);
```

## Authentication

Always use JWT in handshake auth — never trust unauthenticated sockets.

## Performance

- Use Redis adapter for horizontal scale (multiple Fastify instances)
- Throttle high-frequency events (e.g. typing indicators)
- Don't broadcast large payloads — reference by ID and let client fetch
- Use rooms (dealer:abc) to scope events to one tenant

## Events Catalog

| Event | Direction | Payload |
|---|---|---|
| `lead:created` | server → client | full lead object |
| `lead:updated` | server → client | diff |
| `lead:assigned` | server → assigned user | lead id |
| `deal:stage_changed` | server → client | deal id, from, to |
| `deal:delivered` | server → client | deal id |
| `customer:created` | server → client | customer |
| `vehicle:sold` | server → client | vehicle id |
| `vehicle:price_changed` | server → client | vehicle id, old, new |
| `notification` | server → user | notification object |
| `stats:update` | server → client | KPIs |
| `presence:user_online` | server → others | user id |
| `presence:user_offline` | server → others | user id |

## Reference

- https://socket.io/docs/v4/
- https://socket.io/docs/v4/redis-adapter/
