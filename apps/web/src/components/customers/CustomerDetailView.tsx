"use client";

import { useState } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  Plus,
  Car,
  FileText,
  StickyNote,
  AlertCircle,
  RefreshCw,
  Activity,
  PhoneCall,
  User,
  CheckCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomer, useAddCustomerNote } from "@/hooks/useCustomers";
import { cn, formatCurrency, formatDate, formatDistanceToNow, formatPhone } from "@/lib/utils";
import type { CreditTier, CustomerTimelineEvent } from "@/types/api";

interface CustomerDetailViewProps {
  customerId: string;
}

const TIER_VARIANT = {
  A: "success",
  B: "info",
  C: "warning",
  D: "muted",
  subprime: "danger",
} as const;

const TIER_LABELS: Record<CreditTier, string> = {
  A: "A · Prime",
  B: "B · Near-prime",
  C: "C · Standard",
  D: "D · Substandard",
  subprime: "Subprime",
};

const TIMELINE_ICONS: Record<CustomerTimelineEvent["type"], React.ReactNode> = {
  lead: <User className="h-4 w-4 text-info" />,
  call: <PhoneCall className="h-4 w-4 text-info" />,
  email: <Mail className="h-4 w-4 text-text-muted" />,
  test_drive: <Car className="h-4 w-4 text-accent" />,
  deal: <FileText className="h-4 w-4 text-success" />,
  note: <StickyNote className="h-4 w-4 text-warning" />,
  vehicle: <Car className="h-4 w-4 text-text-muted" />,
};

export function CustomerDetailView({ customerId }: CustomerDetailViewProps) {
  const { data: customer, isLoading, isError, error, refetch } = useCustomer(customerId);
  const { addNote } = useAddCustomerNote(customerId);
  const [noteBody, setNoteBody] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Card>
          <div className="flex items-center gap-4">
            <Skeleton variant="circular" width={64} height={64} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="40%" height={24} />
              <Skeleton variant="text" width="60%" />
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton height={240} />
            <Skeleton height={200} />
          </div>
          <div className="space-y-4">
            <Skeleton height={200} />
            <Skeleton height={160} />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 bg-bg-card border border-border rounded-xl">
        <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
        <p className="text-sm text-text-primary">Couldn't load this customer.</p>
        <p className="text-xs text-text-muted">{error?.message ?? "Not found"}</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  async function handleAddNote() {
    const body = noteBody.trim();
    if (!body || submittingNote) return;
    setSubmittingNote(true);
    try {
      await addNote(body);
      setNoteBody("");
    } finally {
      setSubmittingNote(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card>
        <div className="flex items-start gap-4 flex-wrap">
          <div
            className="h-16 w-16 rounded-full flex items-center justify-center text-bg-primary text-xl font-bold flex-shrink-0"
            style={{ backgroundColor: "#E8FF47" }}
            aria-hidden="true"
          >
            {customer.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-text-primary">{customer.name}</h2>
              <Badge variant={TIER_VARIANT[customer.creditTier]}>
                {TIER_LABELS[customer.creditTier]} · {customer.creditScore}
              </Badge>
            </div>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Phone className="h-4 w-4 text-text-muted flex-shrink-0" aria-hidden="true" />
                <dt className="sr-only">Phone</dt>
                <dd className="text-text-primary truncate">
                  <a
                    href={`tel:${customer.phone}`}
                    className="hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                  >
                    {formatPhone(customer.phone)}
                  </a>
                </dd>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="h-4 w-4 text-text-muted flex-shrink-0" aria-hidden="true" />
                <dt className="sr-only">Email</dt>
                <dd className="text-text-primary truncate">
                  <a
                    href={`mailto:${customer.email}`}
                    className="hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                  >
                    {customer.email}
                  </a>
                </dd>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="h-4 w-4 text-text-muted flex-shrink-0" aria-hidden="true" />
                <dt className="sr-only">Address</dt>
                <dd className="text-text-primary truncate">
                  {customer.address.city}, {customer.address.state} {customer.address.zip}
                </dd>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="h-4 w-4 text-text-muted flex-shrink-0" aria-hidden="true" />
                <dt className="sr-only">Last contact</dt>
                <dd className="text-text-primary truncate">
                  {formatDistanceToNow(customer.lastContact)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-text-muted">Lifetime value</p>
            <p className="text-2xl font-bold text-accent tabular-nums">
              {formatCurrency(customer.lifetimeValue)}
            </p>
            <p className="text-xs text-text-muted mt-1">{customer.openDeals} open deals</p>
          </div>
        </div>
      </Card>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Timeline + Notes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Timeline */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-text-muted" aria-hidden="true" />
                <CardTitle>Timeline</CardTitle>
              </div>
              <CardDescription>Activity history with this customer</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 pl-6 before:absolute before:left-2 before:top-0 before:bottom-0 before:w-px before:bg-border">
                {customer.timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      className="absolute -left-[18px] top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-bg-card border border-border"
                      aria-hidden="true"
                    >
                      {TIMELINE_ICONS[event.type]}
                    </span>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{event.title}</p>
                        <p className="text-xs text-text-muted">{event.detail}</p>
                      </div>
                      <time
                        dateTime={event.timestamp}
                        className="text-xs text-text-muted flex-shrink-0"
                      >
                        {formatDistanceToNow(event.timestamp)}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-text-muted" aria-hidden="true" />
                <CardTitle>Notes</CardTitle>
              </div>
              <CardDescription>Internal notes about this customer</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4">
                {customer.notes.length === 0 && (
                  <p className="text-sm text-text-muted">No notes yet.</p>
                )}
                {customer.notes.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 bg-bg-elevated border border-border rounded-lg"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold text-text-primary">{n.authorName}</p>
                      <time
                        dateTime={n.createdAt}
                        className="text-xs text-text-muted"
                      >
                        {formatDistanceToNow(n.createdAt)}
                      </time>
                    </div>
                    <p className="text-sm text-text-primary">{n.body}</p>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddNote();
                }}
                className="space-y-2"
              >
                <label htmlFor="note-input" className="sr-only">
                  Add a note
                </label>
                <textarea
                  id="note-input"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={3}
                  placeholder="Add a note…"
                  className="w-full px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-y min-h-[80px]"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={submittingNote}
                    disabled={!noteBody.trim()}
                  >
                    <Plus className="h-4 w-4" /> Add note
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right column — Vehicles of interest + Open deals */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-text-muted" aria-hidden="true" />
                <CardTitle>Vehicles of interest</CardTitle>
              </div>
              <CardDescription>What they're shopping for</CardDescription>
            </CardHeader>
            <CardContent>
              {customer.vehiclesOfInterest.length === 0 ? (
                <p className="text-sm text-text-muted py-4 text-center">No vehicles saved.</p>
              ) : (
                <ul className="space-y-2" role="list">
                  {customer.vehiclesOfInterest.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-elevated/60 transition-colors min-h-[44px]"
                    >
                      <div className="h-10 w-10 rounded-lg bg-bg-elevated flex items-center justify-center flex-shrink-0">
                        <Car className="h-5 w-5 text-text-muted" aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {v.year} {v.make} {v.model}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatCurrency(v.price)} · {v.mileage.toLocaleString()} mi
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-text-muted" aria-hidden="true" />
                <CardTitle>Open deals</CardTitle>
              </div>
              <CardDescription>Active deal jackets</CardDescription>
            </CardHeader>
            <CardContent>
              {customer.deals.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" aria-hidden="true" />
                  <p className="text-sm text-text-muted">No open deals.</p>
                </div>
              ) : (
                <ul className="space-y-2" role="list">
                  {customer.deals.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-bg-elevated/60 transition-colors min-h-[44px]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {d.vehicleLabel}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatDate(d.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold text-text-primary tabular-nums">
                          {formatCurrency(d.amount)}
                        </span>
                        <Badge
                          variant={
                            d.status === "closed"
                              ? "success"
                              : d.status === "pending_funding"
                              ? "warning"
                              : d.status === "cancelled"
                              ? "danger"
                              : "info"
                          }
                        >
                          {d.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
