"use client";

import { useDraggable } from "@dnd-kit/core";
import { Phone, Mail, MoreHorizontal, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuLegacy } from "@/components/ui/dropdown-menu";
import { cn, formatDistanceToNow, formatPhone } from "@/lib/utils";
import { ScoreBadge, type Classification } from "./ScoreBadge";
import type { Lead, LeadStatus } from "@/types/api";

interface LeadCardProps {
  lead: Lead;
  onMove?: (id: string, toStatus: LeadStatus) => void;
}

function deriveClassification(score: number): Classification {
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  return "hot";
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  test_drive: "Test drive",
  negotiating: "Negotiating",
  closed_won: "Closed won",
  lost: "Lost",
};

export function LeadCard({ lead, onMove }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group bg-bg-elevated border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing",
        "hover:border-border-active hover:shadow-md transition-shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      )}
      tabIndex={0}
      role="button"
      aria-label={`Lead: ${lead.name}, ${lead.source}, score ${lead.score}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary truncate">{lead.name}</p>
          <p className="text-xs text-text-muted truncate flex items-center gap-1 mt-0.5">
            <Phone className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {formatPhone(lead.phone)}
          </p>
        </div>
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <DropdownMenuLegacy
            align="right"
            trigger={
              <button
                type="button"
                aria-label="Lead actions"
                className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-bg-card transition-all min-h-[28px] min-w-[28px] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
            items={[
              {
                id: "move",
                label: "Move to…",
                children: (Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => ({
                  id: `move-${s}`,
                  label: STATUS_LABELS[s],
                  onClick: () => onMove?.(lead.id, s),
                })),
              },
              { id: "sep", label: "", separator: true },
              { id: "call", label: "Call", onClick: () => window.location.href = `tel:${lead.phone}` },
              { id: "email", label: "Email", onClick: () => window.location.href = `mailto:${lead.email}` },
            ]}
          />
        </div>
      </div>

      <p className="text-xs text-text-muted truncate mb-2">{lead.vehicleInterest}</p>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Badge variant="muted">{lead.source}</Badge>
        <ScoreBadge
          score={lead.currentScore ?? lead.score}
          classification={lead.classification ?? deriveClassification(lead.score)}
          signals={null}
          topSignals={lead.topSignals ?? null}
          size="xs"
        />
      </div>

      <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {lead.assignedTo ? (
            <>
              <div
                className="h-5 w-5 rounded-full flex items-center justify-center text-bg-primary text-[10px] font-semibold flex-shrink-0"
                style={{ backgroundColor: lead.assignedTo.avatarColor ?? "#E8FF47" }}
                aria-hidden="true"
              >
                {lead.assignedTo.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <span className="text-xs text-text-muted truncate">{lead.assignedTo.name}</span>
            </>
          ) : (
            <span className="text-xs text-text-muted">Unassigned</span>
          )}
        </div>
        <span className="text-[10px] text-text-muted inline-flex items-center gap-1 flex-shrink-0">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatDistanceToNow(lead.updatedAt)}
        </span>
      </div>
    </div>
  );
}
