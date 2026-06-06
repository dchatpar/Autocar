"use client";

import { VehicleCard } from "./VehicleCard";
import type { Vehicle } from "@/types/api";

interface VehicleGridProps {
  vehicles: Vehicle[];
}

export function VehicleGrid({ vehicles }: VehicleGridProps) {
  if (vehicles.length === 0) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
        <p className="text-text-muted">No vehicles match your filters.</p>
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      role="list"
      aria-label="Vehicle inventory grid"
    >
      {vehicles.map((v) => (
        <div key={v.id} role="listitem">
          <VehicleCard vehicle={v} />
        </div>
      ))}
    </div>
  );
}
