"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/utils";
import type { AgedInventoryItem } from "@/types/api";

interface AgedInventoryAlertProps {
  items: AgedInventoryItem[];
  isLoading?: boolean;
}

function ageTone(days: number): "danger" | "warning" | "muted" {
  if (days >= 100) return "danger";
  if (days >= 75) return "warning";
  return "muted";
}

export function AgedInventoryAlert({ items, isLoading }: AgedInventoryAlertProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            <CardTitle>Aged Inventory</CardTitle>
          </div>
          <Link
            href="/inventory"
            className="text-xs text-text-muted hover:text-accent transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-2 py-1"
          >
            View all
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
        <CardDescription>Vehicles over 60 days on lot</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ul className="space-y-3" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="animate-pulse flex items-center gap-3">
                <Skeleton variant="rectangular" width={40} height={40} />
                <div className="flex-1 space-y-1.5">
                  <Skeleton variant="text" width="70%" />
                  <Skeleton variant="text" width="40%" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">No aged vehicles — nice turnover.</p>
        ) : (
          <ul className="space-y-2" role="list">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-bg-elevated/60 transition-colors min-h-[44px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">{item.label}</p>
                  <p className="text-xs text-text-muted">{item.stockNumber}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold text-text-primary tabular-nums">
                    {formatCurrency(item.price)}
                  </span>
                  <Badge variant={ageTone(item.daysOnLot)}>
                    {item.daysOnLot}d
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
