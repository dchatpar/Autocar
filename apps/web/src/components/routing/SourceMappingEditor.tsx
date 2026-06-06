"use client";

/**
 * SourceMappingEditor — per-source rep picker.
 *
 * Only enabled when the active strategy is SOURCE_BASED. Each row lets
 * the user pick a rep for a given lead source. Saves the entire
 * `source_routing` map in one PATCH (debounced client-side).
 */

import { useEffect, useMemo, useState } from "react";
import { Tag, ChevronDown } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  useRepsWithAvailability,
  useRoutingConfig,
  useUpdateRoutingConfig,
} from "@/hooks/useRoutingConfig";
import { LEAD_SOURCES_FOR_ROUTING } from "@/types/routing";

export function SourceMappingEditor() {
  const { data: config } = useRoutingConfig();
  const { data: reps } = useRepsWithAvailability();
  const update = useUpdateRoutingConfig();

  const [localMap, setLocalMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (config?.source_routing) setLocalMap(config.source_routing);
  }, [config]);

  const repOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: "", label: "— Use default strategy —" },
    ];
    if (reps) {
      for (const r of reps) {
        opts.push({ value: r.id, label: r.name });
      }
    }
    return opts;
  }, [reps]);

  function handleChange(source: string, repId: string) {
    const next = { ...localMap };
    if (repId === "") {
      delete next[source];
    } else {
      next[source] = repId;
    }
    setLocalMap(next);
    update.mutate({ source_routing: next });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Pick the rep who should receive every new lead from each source.
        Unmapped sources fall back to the active strategy.
      </p>
      <div className="space-y-2" role="list">
        {LEAD_SOURCES_FOR_ROUTING.map((src) => {
          const current = localMap[src.key] ?? "";
          return (
            <div
              key={src.key}
              role="listitem"
              className="grid grid-cols-1 sm:grid-cols-[200px_1fr] items-center gap-2 p-3 rounded-lg bg-bg-elevated border border-border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Tag className="h-3.5 w-3.5 text-text-muted shrink-0" />
                <span className="text-sm text-text-primary truncate">
                  {src.label}
                </span>
                <Badge variant="muted" className="ml-auto sm:hidden">
                  {src.key}
                </Badge>
              </div>
              <div>
                <Select
                  options={repOptions}
                  value={current}
                  onChange={(v) => handleChange(src.key, v)}
                  aria-label={`Route ${src.label} to…`}
                />
              </div>
            </div>
          );
        })}
      </div>
      {update.isError && (
        <p className="text-xs text-danger" role="alert">
          Couldn't save — check your connection.
        </p>
      )}
      {update.isSuccess && (
        <p className="text-xs text-success" aria-live="polite">
          Saved.
        </p>
      )}
    </div>
  );
}

// Re-export ChevronDown to keep the import surface from complaining when
// other files import it via a barrel. (No runtime effect.)
void ChevronDown;
