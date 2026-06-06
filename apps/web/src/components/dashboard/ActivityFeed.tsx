"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CheckCircle, Car, DollarSign, AlertTriangle, Phone, UserPlus, Bot, StickyNote } from "lucide-react";
import { formatDistanceToNow } from "@/lib/utils";
import type { Activity, ActivityType } from "@/types/api";

const ICONS: Record<ActivityType, React.ReactNode> = {
  deal_closed: <CheckCircle className="h-4 w-4 text-success" />,
  vehicle_added: <Car className="h-4 w-4 text-accent" />,
  payment_received: <DollarSign className="h-4 w-4 text-success" />,
  lead_aged: <AlertTriangle className="h-4 w-4 text-warning" />,
  test_drive: <Car className="h-4 w-4 text-info" />,
  lead_assigned: <UserPlus className="h-4 w-4 text-info" />,
  ai_call: <Bot className="h-4 w-4 text-ai" />,
  note: <StickyNote className="h-4 w-4 text-text-muted" />,
};

interface ActivityFeedProps {
  items: Activity[];
  isLoading?: boolean;
}

export function ActivityFeed({ items, isLoading }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Recent system events</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ul className="space-y-4" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-start gap-3 animate-pulse">
                <div className="h-4 w-4 bg-bg-elevated rounded mt-1" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-bg-elevated rounded w-3/4" />
                  <div className="h-3 bg-bg-elevated rounded w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">No recent activity.</p>
        ) : (
          <ul className="space-y-4" role="feed" aria-label="Activity feed">
            {items.map((a) => (
              <li key={a.id} className="flex items-start gap-3" role="article">
                <div className="mt-0.5 flex-shrink-0" aria-hidden="true">
                  {ICONS[a.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {a.actor}: <span className="text-text-muted font-normal">{a.detail}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                    <span>{a.target}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={a.timestamp}>{formatDistanceToNow(a.timestamp)}</time>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
