import { PageHeader } from "@/components/layout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { LeadSourceChart } from "@/components/dashboard/LeadSourceChart";
import { AgedInventoryAlert } from "@/components/dashboard/AgedInventoryAlert";
import { Users, ArrowRight } from "lucide-react";
import { MOCK_KPIS, MOCK_LEADS, MOCK_AGED_INVENTORY, MOCK_LEAD_SOURCE_DATA, MOCK_ACTIVITY } from "@/lib/mock-data";
import type { Lead } from "@/types/api";

/* ------------------------------------------------------------------ */
/* Data loaders (server side; swap to real fetch later)               */
/* ------------------------------------------------------------------ */

async function getKpis() {
  // Real: const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/kpis`, { cache: "no-store" });
  // return r.json();
  return MOCK_KPIS;
}

async function getRecentLeads(): Promise<Lead[]> {
  return MOCK_LEADS.slice(0, 5);
}

async function getActivity() {
  return MOCK_ACTIVITY;
}

async function getLeadSource() {
  return MOCK_LEAD_SOURCE_DATA;
}

async function getAgedInventory() {
  return MOCK_AGED_INVENTORY;
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default async function HomePage() {
  const [kpis, recentLeads, activity, sourceData, aged] = await Promise.all([
    getKpis(),
    getRecentLeads(),
    getActivity(),
    getLeadSource(),
    getAgedInventory(),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome back, Marcus. Here's what's happening today."
        actions={
          <Button variant="primary" size="md">
            <span>New Lead</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <QuickActions />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Recent leads — 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Leads</CardTitle>
              <Button variant="ghost" size="sm" className="min-h-[32px]">
                <span>View all</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>Latest leads requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3" role="list">
              {recentLeads.map((lead) => (
                <li
                  key={lead.id}
                  className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg hover:bg-border/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center text-bg-primary font-semibold text-sm flex-shrink-0"
                      style={{ backgroundColor: lead.assignedTo?.avatarColor ?? "#E8FF47" }}
                      aria-hidden="true"
                    >
                      {lead.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{lead.name}</p>
                      <p className="text-xs text-text-muted truncate">{lead.vehicleInterest}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge variant="muted">{lead.source}</Badge>
                    <Badge
                      variant={
                        lead.status === "negotiating"
                          ? "success"
                          : lead.status === "test_drive"
                          ? "warning"
                          : lead.status === "lost"
                          ? "danger"
                          : lead.status === "closed_won"
                          ? "accent"
                          : "info"
                      }
                    >
                      {lead.status.replace("_", " ")}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Activity feed — 1 col */}
        <ActivityFeed items={activity} />
      </div>

      {/* Charts & alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LeadSourceChart data={sourceData} />
        </div>
        <AgedInventoryAlert items={aged} />
      </div>
    </>
  );
}
