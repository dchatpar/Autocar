"use client";

import { useMemo, useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  closestCenter,
  useDroppable,
} from "@dnd-kit/core";
import { LeadCard } from "./LeadCard";
import { Badge } from "@/components/ui/badge";
import type { Lead, LeadStatus } from "@/types/api";

const COLUMNS: Array<{ id: LeadStatus; label: string; tone: "info" | "warning" | "accent" | "success" | "danger" | "muted" }> = [
  { id: "new", label: "New leads", tone: "info" },
  { id: "contacted", label: "Contacted", tone: "muted" },
  { id: "test_drive", label: "Test drive", tone: "warning" },
  { id: "negotiating", label: "Negotiating", tone: "accent" },
  { id: "closed_won", label: "Closed won", tone: "success" },
  { id: "lost", label: "Lost", tone: "danger" },
];

interface LeadKanbanProps {
  leads: Lead[];
  onMove: (id: string, toStatus: LeadStatus) => void;
  isFetching?: boolean;
}

interface ColumnProps {
  status: LeadStatus;
  label: string;
  tone: "info" | "warning" | "accent" | "success" | "danger" | "muted";
  count: number;
  children: React.ReactNode;
}

function Column({ status, label, tone, count, children }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      data-status={status}
      className={`flex flex-col bg-bg-card border rounded-xl min-h-[500px] transition-colors ${
        isOver ? "border-accent bg-accent/5" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={tone}>{label}</Badge>
        </div>
        <span className="text-xs text-text-muted tabular-nums" aria-label={`${count} leads`}>
          {count}
        </span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        {children}
        {count === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-text-muted border border-dashed border-border rounded-lg">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}

export function LeadKanban({ leads, onMove, isFetching }: LeadKanbanProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<LeadStatus, Lead[]> = {
      new: [],
      contacted: [],
      test_drive: [],
      negotiating: [],
      closed_won: [],
      lost: [],
    };
    for (const l of leads) map[l.status].push(l);
    return map;
  }, [leads]);

  const activeLead = useMemo(
    () => (activeId ? leads.find((l) => l.id === activeId) ?? null : null),
    [activeId, leads],
  );

  function handleStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const toStatus = over.id as LeadStatus;
    const lead = leads.find((l) => l.id === active.id);
    if (!lead || lead.status === toStatus) return;
    onMove(String(active.id), toStatus);
  }

  // Mount-safe: ensure DOM measurement works after hydration
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
    >
      <div
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 ${
          isFetching ? "opacity-90" : ""
        }`}
      >
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            status={col.id}
            label={col.label}
            tone={col.tone}
            count={grouped[col.id].length}
          >
            {mounted &&
              grouped[col.id].map((lead) => <LeadCard key={lead.id} lead={lead} onMove={onMove} />)}
          </Column>
        ))}
      </div>
      <DragOverlay>
        {activeLead ? (
          <div className="rotate-2">
            <LeadCard lead={activeLead} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
