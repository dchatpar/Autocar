"use client";

import Link from "next/link";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn, formatDistanceToNow, formatPhone } from "@/lib/utils";
import { ScoreBadge, type Classification } from "./ScoreBadge";
import type { Lead } from "@/types/api";

interface LeadTableProps {
  leads: Lead[];
}

const STATUS_VARIANT = {
  new: "info",
  contacted: "muted",
  test_drive: "warning",
  negotiating: "accent",
  closed_won: "success",
  lost: "danger",
} as const;

function deriveClassification(score: number): Classification {
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  return "hot";
}

export function LeadTable({ leads }: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-text-muted">No leads match your filters.</p>
      </div>
    );
  }
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id} className="hover:bg-bg-elevated/40">
              <TableCell>
                <Link
                  href={`/customers/${lead.id}`}
                  className="text-text-primary font-medium hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                >
                  {lead.name}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex flex-col text-xs">
                  <span className="text-text-primary">{formatPhone(lead.phone)}</span>
                  <span className="text-text-muted truncate max-w-[180px]">{lead.email}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="muted">{lead.source}</Badge>
              </TableCell>
              <TableCell className="text-text-muted">{lead.vehicleInterest}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[lead.status]}>
                  {lead.status.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell>
                <ScoreBadge
                  score={lead.currentScore ?? lead.score}
                  classification={lead.classification ?? deriveClassification(lead.score)}
                  signals={null}
                  topSignals={lead.topSignals ?? null}
                  size="xs"
                />
              </TableCell>
              <TableCell>
                {lead.assignedTo ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="h-6 w-6 rounded-full flex items-center justify-center text-bg-primary text-[10px] font-semibold flex-shrink-0"
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
                    <span className="text-xs text-text-primary">{lead.assignedTo.name}</span>
                  </div>
                ) : (
                  <span className="text-xs text-text-muted">Unassigned</span>
                )}
              </TableCell>
              <TableCell className="text-text-muted text-xs">
                {formatDistanceToNow(lead.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
