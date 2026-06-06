/**
 * API response types for DealerOS.
 * These mirror the backend shapes. The API client returns these directly.
 */

export type UUID = string;
export type ISODate = string;

/* ------------------------------------------------------------------ */
/* Users                                                              */
/* ------------------------------------------------------------------ */

export type UserRole = "owner" | "manager" | "salesperson" | "admin";

export interface User {
  id: UUID;
  name: string;
  role: UserRole;
  email: string;
  avatarColor?: string;
  avatarUrl?: string;
}

/* ------------------------------------------------------------------ */
/* Leads                                                              */
/* ------------------------------------------------------------------ */

export type LeadSource =
  | "Website"
  | "Walk-in"
  | "Phone"
  | "Referral"
  | "Facebook"
  | "Google Ads"
  | "Email"
  | "Other";

export type LeadStatus =
  | "new"
  | "contacted"
  | "test_drive"
  | "negotiating"
  | "closed_won"
  | "lost";

export interface Lead {
  id: UUID;
  name: string;
  email: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  score: number;
  /** New canonical score field (rules-based, 0-100). */
  currentScore?: number;
  /** Classification band: cold (0-30) / warm (31-60) / hot (61-100). */
  classification?: "cold" | "warm" | "hot";
  /** ISO 8601 timestamp of the last score recompute. */
  lastScoredAt?: ISODate | null;
  /** Top 3 contributing signals (when available from the API). */
  topSignals?: ReadonlyArray<{ rule: string; delta: number; label: string }> | null;
  assignedTo: User | null;
  vehicleInterest: string;
  notes: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface LeadFilters {
  source?: LeadSource | "all";
  status?: LeadStatus | "all";
  assignedTo?: UUID | "all";
  search?: string;
  /** Filter by classification. */
  classification?: "cold" | "warm" | "hot" | "all";
  /** Filter by minimum currentScore (inclusive). */
  minScore?: number;
  /** Filter by maximum currentScore (inclusive). */
  maxScore?: number;
}

/* ------------------------------------------------------------------ */
/* Vehicles / Inventory                                               */
/* ------------------------------------------------------------------ */

export type VehicleStatus =
  | "available"
  | "pending"
  | "sold"
  | "in_service"
  | "wholesale";

export type BodyStyle = "Sedan" | "SUV" | "Truck" | "Coupe" | "Wagon" | "Van";
export type FuelType = "Gas" | "Hybrid" | "Electric" | "Diesel";
export type Transmission = "Automatic" | "Manual";

export interface Vehicle {
  id: UUID;
  vin: string;
  stockNumber: string;
  make: string;
  model: string;
  year: number;
  trim: string;
  price: number;
  mileage: number;
  color: string;
  status: VehicleStatus;
  daysOnLot: number;
  photoUrl: string | null;
  bodyStyle: BodyStyle;
  fuelType: FuelType;
  transmission: Transmission;
  createdAt: ISODate;
}

export interface VehicleFilters {
  status?: VehicleStatus | "all";
  make?: string | "all";
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}

/* ------------------------------------------------------------------ */
/* Customers                                                          */
/* ------------------------------------------------------------------ */

export type CreditTier = "A" | "B" | "C" | "D" | "subprime";

export interface CustomerAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface Customer {
  id: UUID;
  name: string;
  email: string;
  phone: string;
  creditTier: CreditTier;
  creditScore: number;
  address: CustomerAddress;
  vehicles: Vehicle[];
  openDeals: number;
  lifetimeValue: number;
  lastContact: ISODate;
  createdAt: ISODate;
}

export interface CustomerNote {
  id: UUID;
  authorId: UUID;
  authorName: string;
  body: string;
  createdAt: ISODate;
}

export type CustomerTimelineEventType =
  | "lead"
  | "deal"
  | "call"
  | "email"
  | "note"
  | "vehicle"
  | "test_drive";

export interface CustomerTimelineEvent {
  id: UUID;
  type: CustomerTimelineEventType;
  title: string;
  detail: string;
  timestamp: ISODate;
}

export interface CustomerDetail extends Customer {
  notes: CustomerNote[];
  timeline: CustomerTimelineEvent[];
  vehiclesOfInterest: Vehicle[];
  deals: Deal[];
}

/* ------------------------------------------------------------------ */
/* Deals                                                              */
/* ------------------------------------------------------------------ */

export type DealStatus = "open" | "pending_funding" | "closed" | "cancelled";

export interface Deal {
  id: UUID;
  customerId: UUID;
  customerName: string;
  vehicleId: UUID;
  vehicleLabel: string;
  amount: number;
  status: DealStatus;
  createdAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Activity                                                           */
/* ------------------------------------------------------------------ */

export type ActivityType =
  | "deal_closed"
  | "vehicle_added"
  | "payment_received"
  | "lead_aged"
  | "test_drive"
  | "lead_assigned"
  | "ai_call"
  | "note";

export interface Activity {
  id: UUID;
  type: ActivityType;
  actor: string;
  target: string;
  detail: string;
  timestamp: ISODate;
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

export type KpiTone = "info" | "success" | "warning" | "danger" | "accent";
export type KpiIcon = "users" | "car" | "handshake" | "dollar" | "trending";
export type KpiFormat = "number" | "currency" | "percent";

export interface DashboardKpi {
  label: string;
  value: number;
  change: number;
  icon: KpiIcon;
  tone: KpiTone;
  format?: KpiFormat;
}

export interface LeadSourceDatum {
  source: LeadSource;
  count: number;
}

export interface AgedInventoryItem {
  id: UUID;
  label: string;
  stockNumber: string;
  daysOnLot: number;
  price: number;
}

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

export interface DealerProfile {
  id: UUID;
  name: string;
  subdomain: string;
  logoUrl: string | null;
  email: string;
  phone: string;
  address: CustomerAddress;
}

export interface BusinessHours {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

/* ------------------------------------------------------------------ */
/* Billing — Stripe subscriptions                                     */
/* ------------------------------------------------------------------ */

export type SubscriptionPlan = "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED";

export interface SubscriptionPlanLimits {
  label: string;
  price: number;
  tagline: string;
  features: ReadonlyArray<string>;
}

export interface Subscription {
  id: string;
  dealerId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialStart: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  planLimits?: SubscriptionPlanLimits;
}

export type MeteredMetric =
  | "users"
  | "leads"
  | "sms_sent"
  | "emails_sent"
  | "ai_tokens";

export interface UsageByMetric {
  metric: MeteredMetric;
  quantity: number;
  cap: number | null;
  pct: number | null;
}

export interface CurrentUsage {
  dealerId: string;
  plan: SubscriptionPlan;
  periodStart: string;
  periodEnd: string;
  metrics: UsageByMetric[];
}

export interface Invoice {
  id: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface UpgradeResult {
  subscription: Subscription;
  changed: boolean;
  direction: "upgrade" | "downgrade" | "lateral";
}

/* ------------------------------------------------------------------ */
/* Marketing Campaigns                                                */
/* ------------------------------------------------------------------ */

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

export type CampaignTriggerType =
  | "LEAD_CREATED"
  | "LEAD_UPDATED"
  | "STATUS_CHANGE"
  | "NO_ACTIVITY"
  | "DEAL_STAGE"
  | "APPOINTMENT"
  | "SCORE_CHANGE"
  | "BIRTHDAY"
  | "VEHICLE_MATCH"
  | "MANUAL"
  | "API";

export type CampaignStepType =
  | "EMAIL"
  | "SMS"
  | "WAIT"
  | "BRANCH"
  | "WEBHOOK"
  | "TASK"
  | "EXIT";

export type CampaignEnrollmentStatus =
  | "PENDING"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "EXITED"
  | "FAILED";

export interface CampaignSummary {
  id: UUID;
  name: string;
  description: string | null;
  status: CampaignStatus;
  triggerType: CampaignTriggerType;
  enrolledCount: number;
  activeCount: number;
  completedCount: number;
  exitedCount: number;
  failedCount: number;
  activatedAt: ISODate | null;
  pausedAt: ISODate | null;
  archivedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  createdBy: { id: UUID; name: string };
  stepCount: number;
}

export interface CampaignStep {
  id: UUID;
  campaignId: UUID;
  order: number;
  name: string;
  stepType: CampaignStepType;
  template: string | null;
  subject: string | null;
  waitHours: number | null;
  branchConfig: Record<string, unknown> | null;
  webhookUrl: string | null;
  webhookMethod: string | null;
  taskAssignToId: UUID | null;
  fromAddress: string | null;
  skipWeekends: boolean;
  metadata: Record<string, unknown>;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CampaignDetail extends CampaignSummary {
  triggerConfig: Record<string, unknown>;
  audience: Record<string, unknown>;
  steps: CampaignStep[];
}

export interface CampaignBranchCondition {
  field: string;
  op:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "not_contains"
    | "exists"
    | "not_exists";
  value?: string | number | boolean;
  thenStep: number;
  elseStep: number;
}

export interface CampaignStepInput {
  name: string;
  stepType: CampaignStepType;
  template?: string;
  subject?: string;
  waitHours?: number;
  branchConfig?: CampaignBranchCondition;
  webhookUrl?: string;
  webhookMethod?: "GET" | "POST" | "PUT" | "PATCH";
  taskAssignToId?: UUID;
  fromAddress?: string;
  skipWeekends?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CampaignCreateInput {
  name: string;
  description?: string;
  triggerType: CampaignTriggerType;
  triggerConfig?: Record<string, unknown>;
  audience?: Record<string, unknown>;
  steps: CampaignStepInput[];
}

export interface CampaignUpdateInput {
  name?: string;
  description?: string;
  triggerType?: CampaignTriggerType;
  triggerConfig?: Record<string, unknown>;
  audience?: Record<string, unknown>;
  steps?: CampaignStepInput[];
}

export interface CampaignEnrollInput {
  leadIds?: UUID[];
  customerIds?: UUID[];
  useAudience?: boolean;
  replace?: boolean;
}

export interface CampaignEnrollResult {
  enrolled: number;
  skipped: number;
  backfilled: number;
}

export interface CampaignEnrollment {
  id: UUID;
  campaignId: UUID;
  leadId: UUID | null;
  customerId: UUID | null;
  status: CampaignEnrollmentStatus;
  currentStepOrder: number;
  nextRunAt: ISODate | null;
  stepsExecuted: number;
  stepsFailed: number;
  emailsSent: number;
  smsSent: number;
  lastError: string | null;
  enrolledAt: ISODate;
  startedAt: ISODate | null;
  completedAt: ISODate | null;
  exitedAt: ISODate | null;
  failedAt: ISODate | null;
  subjectName: string | null;
  subjectEmail: string | null;
  subjectPhone: string | null;
}

export interface CampaignStats {
  enrolledCount: number;
  activeCount: number;
  completedCount: number;
  exitedCount: number;
  failedCount: number;
  emailsSent: number;
  smsSent: number;
  conversionRate: number;
  recentEnrollments: number;
  recentCompletions: number;
  recentFailures: number;
  timeline: Array<{
    date: string;
    enrolled: number;
    completed: number;
    failed: number;
  }>;
}

export interface CampaignListResponse {
  data: CampaignSummary[];
  pagination: { hasMore: boolean; cursor: string | null };
}

export interface CampaignEnrollmentsResponse {
  data: CampaignEnrollment[];
  pagination: { hasMore: boolean; cursor: string | null };
}
