"use client";

/**
 * InvoiceTable — Stripe invoice history.
 *
 * Renders an accessible table with columns:
 *   - Date
 *   - Amount
 *   - Status
 *   - Actions (download PDF)
 *
 * Empty state: friendly message + CTA to manage payment in the
 * Stripe Customer Portal.
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, FileText, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/types/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  switch (status) {
    case "paid":
      return "success";
    case "open":
    case "draft":
      return "warning";
    case "uncollectible":
    case "void":
      return "danger";
    default:
      return "muted";
  }
}

export interface InvoiceTableProps {
  invoices: Invoice[] | undefined;
  isLoading?: boolean;
}

export function InvoiceTable({ invoices, isLoading = false }: InvoiceTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice history</CardTitle>
        <CardDescription>
          Download PDFs or open them in the Stripe Customer Portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !invoices || invoices.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" aria-hidden="true" />}
            title="No invoices yet"
            description="Your first invoice will appear here after your first billing cycle."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Invoice history">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Amount</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2 pl-4 font-medium text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-border/50 last:border-0 hover:bg-bg-elevated transition-colors"
                  >
                    <td className="py-3 pr-4 text-text-primary">
                      {formatDate(inv.createdAt)}
                    </td>
                    <td className="py-3 pr-4 text-text-primary font-medium tabular-nums">
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={statusVariant(inv.status)}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-3 pl-4 text-right">
                      {inv.pdfUrl ? (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open invoice PDF for ${formatDate(inv.createdAt)}`}
                        >
                          <Button variant="ghost" size="sm" className="min-h-[32px]">
                            <Download className="h-4 w-4" aria-hidden="true" />
                            <span>PDF</span>
                          </Button>
                        </a>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-border">
          <a
            href="/api/billing/create-portal-session"
            onClick={async (e) => {
              e.preventDefault();
              const r = await fetch("/api/billing/create-portal-session", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              });
              const json = (await r.json()) as { data?: { url?: string } };
              if (json.data?.url) window.location.href = json.data.url;
            }}
            className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Manage invoices &amp; payment method in the Stripe portal
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
