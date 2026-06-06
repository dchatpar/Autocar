"use client";

import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import type { Vehicle, VehicleStatus } from "@/types/api";

interface VehicleTableProps {
  vehicles: Vehicle[];
}

type SortKey = "year" | "make" | "model" | "price" | "mileage" | "daysOnLot" | "status";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

const STATUS_VARIANT = {
  available: "success",
  pending: "warning",
  sold: "muted",
  in_service: "info",
  wholesale: "muted",
} as const;

export function VehicleTable({ vehicles }: VehicleTableProps) {
  const [sort, setSort] = useState<SortState>({ key: "daysOnLot", dir: "desc" });

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  const sorted = [...vehicles].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (typeof av === "number" && typeof bv === "number") {
      return sort.dir === "asc" ? av - bv : bv - av;
    }
    return sort.dir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  if (vehicles.length === 0) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
        <p className="text-text-muted">No vehicles match your filters.</p>
      </div>
    );
  }

  function SortableHead({ k, label, align }: { k: SortKey; label: string; align?: "right" | "left" }) {
    const active = sort.key === k;
    return (
      <TableHead align={align}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded",
            active && "text-text-primary",
          )}
          aria-label={`Sort by ${label}${active ? `, currently ${sort.dir === "asc" ? "ascending" : "descending"}` : ""}`}
        >
          {label}
          {active ? (
            sort.dir === "asc" ? (
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />
          )}
        </button>
      </TableHead>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead k="year" label="Year" />
            <SortableHead k="make" label="Make" />
            <SortableHead k="model" label="Model" />
            <TableHead>Stock #</TableHead>
            <SortableHead k="price" label="Price" align="right" />
            <SortableHead k="mileage" label="Mileage" align="right" />
            <SortableHead k="status" label="Status" />
            <SortableHead k="daysOnLot" label="On lot" align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="tabular-nums">{v.year}</TableCell>
              <TableCell>{v.make}</TableCell>
              <TableCell>{v.model}</TableCell>
              <TableCell className="text-text-muted font-mono text-xs">{v.stockNumber}</TableCell>
              <TableCell align="right" className="font-semibold text-text-primary tabular-nums">
                {formatCurrency(v.price)}
              </TableCell>
              <TableCell align="right" className="tabular-nums text-text-muted">
                {v.mileage.toLocaleString()}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[v.status as VehicleStatus] ?? "muted"}>
                  {v.status.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell align="right" className="text-text-muted tabular-nums">
                {v.daysOnLot}d
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
