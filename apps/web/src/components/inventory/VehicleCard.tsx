"use client";

import { Car, Clock, Fuel, Gauge, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import type { Vehicle, VehicleStatus } from "@/types/api";

interface VehicleCardProps {
  vehicle: Vehicle;
}

const STATUS_VARIANT = {
  available: "success",
  pending: "warning",
  sold: "muted",
  in_service: "info",
  wholesale: "muted",
} as const;

const STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Available",
  pending: "Pending",
  sold: "Sold",
  in_service: "In service",
  wholesale: "Wholesale",
};

function ageTone(days: number): "danger" | "warning" | "muted" {
  if (days >= 90) return "danger";
  if (days >= 60) return "warning";
  return "muted";
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  return (
    <article
      className="group bg-bg-card border border-border rounded-xl overflow-hidden hover:border-border-active transition-colors focus-within:ring-2 focus-within:ring-accent"
      aria-label={`${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}, stock ${vehicle.stockNumber}`}
    >
      {/* Photo placeholder */}
      <div
        className="relative h-40 bg-bg-elevated flex items-center justify-center"
        role="img"
        aria-label={`Photo of ${vehicle.year} ${vehicle.make} ${vehicle.model}`}
      >
        <Car className="h-12 w-12 text-text-muted" aria-hidden="true" />
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <Badge variant={STATUS_VARIANT[vehicle.status]}>{STATUS_LABEL[vehicle.status]}</Badge>
        </div>
        {vehicle.daysOnLot > 30 && (
          <div className="absolute top-2 right-2">
            <Badge variant={ageTone(vehicle.daysOnLot)}>
              {vehicle.daysOnLot}d on lot
            </Badge>
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-text-primary leading-tight">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h3>
          <span className="text-base font-bold text-accent tabular-nums flex-shrink-0">
            {formatCurrency(vehicle.price)}
          </span>
        </div>
        <p className="text-xs text-text-muted mb-3">{vehicle.trim}</p>

        <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-text-muted min-w-0">
            <Hash className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <dt className="sr-only">Stock number</dt>
            <dd className="truncate">{vehicle.stockNumber}</dd>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted min-w-0">
            <Gauge className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <dt className="sr-only">Mileage</dt>
            <dd className="truncate">{vehicle.mileage.toLocaleString()} mi</dd>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted min-w-0">
            <Fuel className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <dt className="sr-only">Fuel type</dt>
            <dd className="truncate">{vehicle.fuelType}</dd>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted min-w-0">
            <Clock className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <dt className="sr-only">Days on lot</dt>
            <dd className="truncate">{vehicle.daysOnLot}d on lot</dd>
          </div>
        </dl>

        <p className="text-[10px] text-text-muted mt-2 truncate font-mono">VIN {vehicle.vin}</p>
      </div>
    </article>
  );
}
