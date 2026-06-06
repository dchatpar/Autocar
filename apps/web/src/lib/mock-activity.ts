/**
 * Mock data for the activity-log audit trail.
 *
 * Used by `useActivityLogs` and downstream components while the
 * backend is offline. The data shape mirrors `ActivityLogRecord`
 * in `hooks/useActivityLogs.ts` exactly.
 */

import type {
  ActivityLogRecord,
  AnomalyRecord,
} from "@/hooks/useActivityLogs";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function isoOffset(daysAgo: number, hoursAgo = 0, minutesAgo = 0): string {
  const t = Date.now();
  return new Date(
    t - daysAgo * 86400_000 - hoursAgo * 3600_000 - minutesAgo * 60_000,
  ).toISOString();
}

function diffOf(
  changed: Array<{ field: string; before: unknown; after: unknown }>,
): ActivityLogRecord["diff"] {
  const added = changed
    .filter((c) => c.before === undefined && c.after !== undefined)
    .map((c) => c.field);
  const removed = changed
    .filter((c) => c.before !== undefined && c.after === undefined)
    .map((c) => c.field);
  return { changed, added, removed };
}

/* ------------------------------------------------------------------ */
/* Dataset                                                            */
/* ------------------------------------------------------------------ */

export const MOCK_ACTIVITY_LOGS: ActivityLogRecord[] = [
  {
    id: "log_01hxy0lead_created",
    dealerId: "dealer_acme",
    userId: "user_sales_01",
    action: "lead.created",
    entityType: "lead",
    entityId: "lead_001",
    before: null,
    after: {
      firstName: "Olivia",
      lastName: "Park",
      email: "olivia.park@example.com",
      source: "Website",
      status: "NEW",
      score: 42,
    },
    diff: diffOf([
      { field: "firstName", before: undefined, after: "Olivia" },
      { field: "lastName", before: undefined, after: "Park" },
      { field: "email", before: undefined, after: "olivia.park@example.com" },
      { field: "source", before: undefined, after: "Website" },
      { field: "status", before: undefined, after: "NEW" },
      { field: "score", before: undefined, after: 42 },
    ]),
    ipAddress: "203.0.113.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) Safari/605",
    metadata: { requestId: "req_001" },
    createdAt: isoOffset(0, 1, 12),
  },
  {
    id: "log_02hxy0lead_scored",
    dealerId: "dealer_acme",
    userId: null,
    action: "lead.score_updated",
    entityType: "lead",
    entityId: "lead_001",
    before: { score: 42 },
    after: { score: 78 },
    diff: diffOf([{ field: "score", before: 42, after: 78 }]),
    ipAddress: "10.0.0.5",
    userAgent: "internal-agent/1.0",
    metadata: { modelVersion: "v2.4", requestId: "req_002" },
    createdAt: isoOffset(0, 1, 5),
  },
  {
    id: "log_03hxy0lead_assigned",
    dealerId: "dealer_acme",
    userId: "user_sales_01",
    action: "lead.assigned",
    entityType: "lead",
    entityId: "lead_001",
    before: { assignedToId: null },
    after: { assignedToId: "user_sales_02" },
    diff: diffOf([
      { field: "assignedToId", before: null, after: "user_sales_02" },
    ]),
    ipAddress: "203.0.113.10",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) Safari/605",
    metadata: { assignedBy: "user_sales_01" },
    createdAt: isoOffset(0, 0, 50),
  },
  {
    id: "log_04hxy0customer_created",
    dealerId: "dealer_acme",
    userId: "user_sales_02",
    action: "customer.created",
    entityType: "customer",
    entityId: "customer_001",
    before: null,
    after: {
      firstName: "Liam",
      lastName: "Nguyen",
      phone: "+1-415-555-0102",
      email: "liam.nguyen@example.com",
      creditTier: "B",
    },
    diff: diffOf([
      { field: "firstName", before: undefined, after: "Liam" },
      { field: "lastName", before: undefined, after: "Nguyen" },
      { field: "phone", before: undefined, after: "+1-415-555-0102" },
      { field: "email", before: undefined, after: "liam.nguyen@example.com" },
      { field: "creditTier", before: undefined, after: "B" },
    ]),
    ipAddress: "198.51.100.42",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    metadata: { requestId: "req_004" },
    createdAt: isoOffset(0, 0, 35),
  },
  {
    id: "log_05hxy0vehicle_price",
    dealerId: "dealer_acme",
    userId: "user_manager_01",
    action: "vehicle.price_changed",
    entityType: "vehicle",
    entityId: "vehicle_001",
    before: { askingPrice: 32500, internetPrice: 31995 },
    after: { askingPrice: 31900, internetPrice: 31495 },
    diff: diffOf([
      { field: "askingPrice", before: 32500, after: 31900 },
      { field: "internetPrice", before: 31995, after: 31495 },
    ]),
    ipAddress: "198.51.100.42",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    metadata: { reason: "Market adjustment", requestId: "req_005" },
    createdAt: isoOffset(0, 0, 22),
  },
  {
    id: "log_06hxy0deal_stage",
    dealerId: "dealer_acme",
    userId: "user_sales_02",
    action: "deal.stage_changed",
    entityType: "deal",
    entityId: "deal_001",
    before: { status: "WORKING" },
    after: { status: "PENDING_FINANCE" },
    diff: diffOf([
      { field: "status", before: "WORKING", after: "PENDING_FINANCE" },
    ]),
    ipAddress: "198.51.100.42",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    metadata: { changedBy: "user_sales_02" },
    createdAt: isoOffset(0, 0, 10),
  },
  /* Anomalies */
  {
    id: "log_07anomaly_login_new_ip",
    dealerId: "dealer_acme",
    userId: "user_admin_01",
    action: "user.login",
    entityType: "user",
    entityId: "user_admin_01",
    before: null,
    after: { method: "password" },
    diff: null,
    ipAddress: "192.0.2.99",
    userAgent: "curl/8.4.0",
    metadata: {
      anomaly: true,
      anomalyReasons: [
        { reason: "login_from_new_ip", severity: "medium" },
        { reason: "off_hours_activity", severity: "low" },
      ],
    },
    createdAt: isoOffset(0, 0, 4),
  },
  {
    id: "log_08anomaly_login_burst",
    dealerId: "dealer_acme",
    userId: null,
    action: "user.login_failed",
    entityType: "user",
    entityId: null,
    before: null,
    after: { reason: "bad_password" },
    diff: null,
    ipAddress: "198.51.100.250",
    userAgent: "python-requests/2.31.0",
    metadata: {
      anomaly: true,
      anomalyReasons: [
        { reason: "failed_login_burst", severity: "high" },
        { reason: "off_hours_activity", severity: "low" },
      ],
    },
    createdAt: isoOffset(0, 0, 2),
  },
  {
    id: "log_09anomaly_role_change",
    dealerId: "dealer_acme",
    userId: "user_admin_01",
    action: "user.role_changed",
    entityType: "user",
    entityId: "user_sales_03",
    before: { role: "SALES" },
    after: { role: "ADMIN" },
    diff: diffOf([{ field: "role", before: "SALES", after: "ADMIN" }]),
    ipAddress: "198.51.100.42",
    userAgent: "Mozilla/5.0 (Macintosh) Safari/605",
    metadata: {
      anomaly: true,
      anomalyReasons: [
        { reason: "permission_escalation", severity: "high" },
      ],
      changedBy: "user_admin_01",
    },
    createdAt: isoOffset(0, 0, 1),
  },
  /* History */
  {
    id: "log_10hxy0vehicle_created",
    dealerId: "dealer_acme",
    userId: "user_sales_02",
    action: "vehicle.created",
    entityType: "vehicle",
    entityId: "vehicle_001",
    before: null,
    after: {
      vin: "1HGCM82633A123456",
      make: "Honda",
      model: "Accord",
      year: 2023,
      status: "AVAILABLE",
    },
    diff: diffOf([
      { field: "vin", before: undefined, after: "1HGCM82633A123456" },
      { field: "make", before: undefined, after: "Honda" },
      { field: "model", before: undefined, after: "Accord" },
      { field: "year", before: undefined, after: 2023 },
      { field: "status", before: undefined, after: "AVAILABLE" },
    ]),
    ipAddress: "198.51.100.42",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    metadata: { requestId: "req_010" },
    createdAt: isoOffset(1, 2),
  },
  {
    id: "log_11hxy0invoice_paid",
    dealerId: "dealer_acme",
    userId: "user_finance_01",
    action: "invoice.paid",
    entityType: "invoice",
    entityId: "invoice_001",
    before: { paidCents: 0, status: "OPEN" },
    after: { paidCents: 125000, status: "PAID" },
    diff: diffOf([
      { field: "paidCents", before: 0, after: 125000 },
      { field: "status", before: "OPEN", after: "PAID" },
    ]),
    ipAddress: "198.51.100.7",
    userAgent: "Mozilla/5.0 (Macintosh) Safari/605",
    metadata: { method: "ACH" },
    createdAt: isoOffset(1, 4),
  },
  {
    id: "log_12hxy0expense_created",
    dealerId: "dealer_acme",
    userId: "user_manager_01",
    action: "expense.created",
    entityType: "expense",
    entityId: "expense_001",
    before: null,
    after: { amountCents: 22500, category: "Marketing", vendor: "Meta" },
    diff: diffOf([
      { field: "amountCents", before: undefined, after: 22500 },
      { field: "category", before: undefined, after: "Marketing" },
      { field: "vendor", before: undefined, after: "Meta" },
    ]),
    ipAddress: "198.51.100.42",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
    metadata: { requestId: "req_012" },
    createdAt: isoOffset(2, 0),
  },
];

/* Convenience selector used by some pages that want a stable list */
export function getMockAnomalies(): AnomalyRecord[] {
  return MOCK_ACTIVITY_LOGS.filter((l) => l.metadata.anomaly === true).map(
    (l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      userId: l.userId,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      createdAt: l.createdAt,
      reasons: (l.metadata.anomalyReasons as AnomalyRecord["reasons"]) ?? [],
      metadata: l.metadata,
    }),
  );
}
