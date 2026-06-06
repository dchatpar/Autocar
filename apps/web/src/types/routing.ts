/**
 * Frontend types for the lead-routing engine.
 *
 * Mirrors the API response shapes from /routing/* and LeadRoutingLog.
 */

export type RoutingStrategy =
  | "ROUND_ROBIN"
  | "LOAD_BALANCED"
  | "SOURCE_BASED"
  | "GEOGRAPHIC"
  | "VEHICLE_MATCH"
  | "AI_SCORED";

export type RepAvailability = "AVAILABLE" | "AWAY" | "OFF_DUTY";

export interface RoutingConfig {
  strategy: RoutingStrategy;
  priority: RoutingStrategy[];
  source_routing: Record<string, string>;
  rep_availability: Record<string, RepAvailability>;
  meta_page_id?: string;
  default_dealer_id?: string;
}

export interface RepWithAvailability {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  load: number;
  availability: RepAvailability;
  territories: string[];
  vehicleStockNumbers: string[];
}

export interface RoutingLogRow {
  id: string;
  leadId: string;
  leadName: string | null;
  strategyUsed: string;
  selectedRepId: string | null;
  selectedRepName: string | null;
  reason: string;
  responseTimeMs: number;
  routedAt: string;
  candidateReps: Array<{ id: string; name?: string }>;
}

export interface RoutingPreviewInput {
  source: string;
  vehicleInterest?: string | null;
  score?: number;
  vehicleOwnerId?: string | null;
}

export interface RoutingPreviewOutput {
  assignedTo: string | null;
  assignedToName: string | null;
  reason: string;
  strategy: RoutingStrategy;
  alternativeReps: Array<{ id: string; name: string | null }>;
  candidateReps: Array<{ id: string; name: string; load?: number }>;
  responseTimeMs: number;
}

export const ROUTING_STRATEGY_LABEL: Record<RoutingStrategy, string> = {
  ROUND_ROBIN: "Round Robin",
  LOAD_BALANCED: "Load Balanced",
  SOURCE_BASED: "Source-Based",
  GEOGRAPHIC: "Geographic",
  VEHICLE_MATCH: "Vehicle Match",
  AI_SCORED: "AI Scored",
};

export const ROUTING_STRATEGY_DESCRIPTION: Record<RoutingStrategy, string> = {
  ROUND_ROBIN:
    "Cycles new leads through every active rep in a fair, repeating order.",
  LOAD_BALANCED:
    "Sends each new lead to the rep with the fewest open leads right now.",
  SOURCE_BASED:
    "Routes by source — e.g. every Meta Lead Ad goes to a specific rep.",
  GEOGRAPHIC:
    "Matches a lead's postal code prefix to a rep's assigned territory.",
  VEHICLE_MATCH:
    "Sends the inquiry to the rep who owns the vehicle the lead is interested in.",
  AI_SCORED:
    "Composite scoring blends lead quality with rep affinity, routing hot leads to top reps.",
};

export const REP_AVAILABILITY_LABEL: Record<RepAvailability, string> = {
  AVAILABLE: "Available",
  AWAY: "Away",
  OFF_DUTY: "Off-Duty",
};

/** Common inbound lead sources the UI exposes. */
export const LEAD_SOURCES_FOR_ROUTING: Array<{ key: string; label: string }> = [
  { key: "meta_lead_ad", label: "Meta Lead Ad" },
  { key: "click_to_whatsapp", label: "Click-to-WhatsApp" },
  { key: "whatsapp_inbound", label: "WhatsApp Inbound" },
  { key: "website", label: "Website Form" },
  { key: "phone", label: "Phone Call" },
  { key: "walk_in", label: "Walk-In" },
  { key: "referral", label: "Referral" },
];
