"use client";

/**
 * React Query hooks for DocuSign envelopes.
 *
 * Backend endpoints:
 *   GET    /signatures/templates
 *   POST   /signatures/envelopes
 *   GET    /signatures/envelopes
 *   GET    /signatures/envelopes/:id
 *   POST   /signatures/envelopes/:id/void
 *   POST   /signatures/envelopes/:id/embedded-url
 *   GET    /signatures/envelopes/:id/pdf
 *   GET    /deals/:id/signatures
 *
 * Polling:
 *   - `useEnvelope(id, { pollMs })` auto-refreshes every `pollMs`
 *     (default 10_000ms) when the envelope is in an "in-flight"
 *     state. Used by the embedded signing iframe to surface
 *     status changes without a websocket.
 *   - Polling stops when the envelope reaches a terminal state
 *     (COMPLETED, VOIDED, DECLINED, EXPIRED).
 *
 * While the backend is offline, the hooks fall back to a small
 * mock dataset so the UI is exercisable end-to-end.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type SignatureStatus =
  | "CREATED"
  | "SENT"
  | "DELIVERED"
  | "COMPLETED"
  | "DECLINED"
  | "VOIDED"
  | "EXPIRED";

export type SignerStatus =
  | "created"
  | "sent"
  | "delivered"
  | "completed"
  | "declined";

export type DocumentType =
  | "BILL_OF_SALE"
  | "FI_CONTRACT"
  | "CREDIT_APP"
  | "WARRANTY"
  | "DISCLOSURE"
  | "TRADE_APPRAISAL"
  | "DELIVERY_RECEIPT"
  | "OTHER";

export interface EnvelopeSigner {
  email: string;
  name: string;
  role: string;
  status: SignerStatus;
  signedAt: string | null;
  deliveredAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  clientUserId: string | null;
}

export interface Envelope {
  id: string;
  dealerId: string;
  dealId: string | null;
  documentId: string | null;
  envelopeId: string;
  templateId: string;
  documentType: DocumentType;
  status: SignatureStatus;
  subject: string | null;
  emailMessage: string | null;
  signers: EnvelopeSigner[];
  sentAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  declinedReason: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  expiresAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateRole {
  name: string;
  required: boolean;
  description: string;
}

export interface TemplateListItem {
  slug: string;
  documentType: DocumentType;
  displayName: string;
  description: string;
  roles: TemplateRole[];
  signingOrder: "sequential" | "parallel";
  mergeFields: string[];
  configured: boolean;
}

export interface EnvelopeFilters {
  dealId?: string;
  documentType?: DocumentType;
  status?: SignatureStatus;
  limit?: number;
}

export interface SignerInput {
  roleName: string;
  email: string;
  name: string;
  clientUserId?: string;
}

export interface CreateEnvelopeInput {
  templateSlug: string;
  dealId?: string | null;
  documentId?: string | null;
  signers: SignerInput[];
  mergeFields?: Record<string, string | number | null | undefined>;
  emailSubject?: string;
  emailMessage?: string;
  sendNow?: boolean;
  metadata?: Record<string, unknown>;
}

export interface EmbeddedUrlResponse {
  url: string;
  expiresAt: string | null;
  signer: EnvelopeSigner;
}

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const signatureKeys = {
  all: ["signatures"] as const,
  templates: () => [...signatureKeys.all, "templates"] as const,
  lists: () => [...signatureKeys.all, "list"] as const,
  list: (filters: EnvelopeFilters) => [...signatureKeys.lists(), filters] as const,
  byDeal: (dealId: string) => [...signatureKeys.all, "deal", dealId] as const,
  details: () => [...signatureKeys.all, "detail"] as const,
  detail: (id: string) => [...signatureKeys.details(), id] as const,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

interface EnvelopeListResponse {
  data: Envelope[];
  pagination?: { hasMore: boolean; count: number };
}

interface EnvelopeResponse {
  data: Envelope;
}

interface TemplatesResponse {
  data: TemplateListItem[];
}

function unwrap<T>(response: { data: T } | T): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data: T }).data;
  }
  return response as T;
}

/** Terminal states — no more webhook events expected. */
const TERMINAL_STATUSES: ReadonlySet<SignatureStatus> = new Set([
  "COMPLETED",
  "VOIDED",
  "DECLINED",
  "EXPIRED",
]);

/* ------------------------------------------------------------------ */
/* Mock data (used when backend is offline)                           */
/* ------------------------------------------------------------------ */

const MOCK_ENVELOPES: Envelope[] = [
  {
    id: "env_mock_billofsale",
    dealerId: "dealer_demo",
    dealId: "deal_demo",
    documentId: null,
    envelopeId: "docu-envelope-mock-1",
    templateId: "DOCUSIGN_TEMPLATE_BILL_OF_SALE",
    documentType: "BILL_OF_SALE",
    status: "SENT",
    subject: "Please sign your Bill of Sale",
    emailMessage: null,
    signers: [
      {
        email: "alex.morgan@example.com",
        name: "Alex Morgan",
        role: "Buyer",
        status: "delivered",
        signedAt: null,
        deliveredAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        declinedAt: null,
        declineReason: null,
        clientUserId: "dealer_demo:Buyer:1",
      },
      {
        email: "manager@dealership.com",
        name: "Sam Patel",
        role: "Manager",
        status: "sent",
        signedAt: null,
        deliveredAt: null,
        declinedAt: null,
        declineReason: null,
        clientUserId: "dealer_demo:Manager:2",
      },
    ],
    sentAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    deliveredAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    completedAt: null,
    declinedAt: null,
    declinedReason: null,
    voidedAt: null,
    voidedReason: null,
    expiresAt: null,
    pdfUrl: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
];

const MOCK_TEMPLATES: TemplateListItem[] = [
  {
    slug: "bill_of_sale",
    documentType: "BILL_OF_SALE",
    displayName: "Bill of Sale",
    description: "Final sale contract — buyer + manager countersign.",
    roles: [
      { name: "Buyer", required: true, description: "The retail customer purchasing the vehicle." },
      { name: "Manager", required: true, description: "Dealer manager or F&I manager countersigning." },
    ],
    signingOrder: "sequential",
    mergeFields: [
      "buyer_name",
      "dealer_name",
      "vehicle_vin",
      "sale_price",
      "down_payment",
    ],
    configured: true,
  },
  {
    slug: "fi_contract",
    documentType: "FI_CONTRACT",
    displayName: "F&I Contract",
    description: "Finance & Insurance contract.",
    roles: [
      { name: "Buyer", required: true, description: "Primary borrower." },
      { name: "Co-Buyer", required: false, description: "Co-borrower, if any." },
      { name: "Finance Manager", required: true, description: "F&I manager countersigning." },
    ],
    signingOrder: "sequential",
    mergeFields: [
      "buyer_name",
      "vehicle_vin",
      "financed_amount",
      "monthly_payment",
      "term_months",
      "apr",
    ],
    configured: true,
  },
  {
    slug: "credit_app",
    documentType: "CREDIT_APP",
    displayName: "Credit Application",
    description: "Buyer credit application.",
    roles: [{ name: "Buyer", required: true, description: "The retail customer." }],
    signingOrder: "sequential",
    mergeFields: ["buyer_name", "dealer_name"],
    configured: true,
  },
  {
    slug: "warranty",
    documentType: "WARRANTY",
    displayName: "Warranty Agreement",
    description: "Extended warranty / service contract.",
    roles: [{ name: "Buyer", required: true, description: "The retail customer." }],
    signingOrder: "sequential",
    mergeFields: ["buyer_name", "vehicle_vin", "warranty_term", "warranty_price"],
    configured: true,
  },
  {
    slug: "trade_appraisal",
    documentType: "TRADE_APPRAISAL",
    displayName: "Trade Appraisal",
    description: "Trade-in vehicle appraisal — seller + buyer sign.",
    roles: [
      { name: "Seller", required: true, description: "Current owner of the trade-in." },
      { name: "Buyer", required: true, description: "Dealership representative." },
    ],
    signingOrder: "sequential",
    mergeFields: ["seller_name", "trade_vin", "appraisal_value"],
    configured: true,
  },
];

/* ------------------------------------------------------------------ */
/* Fetcher                                                            */
/* ------------------------------------------------------------------ */

async function fetchTemplates(): Promise<TemplateListItem[]> {
  try {
    const res = await api.get<TemplatesResponse>("/signatures/templates");
    return unwrap(res);
  } catch {
    return MOCK_TEMPLATES;
  }
}

async function fetchEnvelopesForDeal(dealId: string): Promise<Envelope[]> {
  try {
    const res = await api.get<EnvelopeListResponse>(`/deals/${dealId}/signatures`);
    return unwrap(res);
  } catch {
    return MOCK_ENVELOPES.filter((e) => e.dealId === dealId || dealId === "deal_demo");
  }
}

async function fetchEnvelope(
  id: string,
  options: { sync?: boolean } = {},
): Promise<Envelope> {
  const query: Record<string, string> = {};
  if (options.sync) query.sync = "1";
  try {
    const res = await api.get<EnvelopeResponse>(`/signatures/envelopes/${id}`, { query });
    return unwrap(res);
  } catch {
    const found = MOCK_ENVELOPES.find((e) => e.id === id);
    if (!found) throw new Error(`Envelope ${id} not found`);
    return found;
  }
}

async function fetchEnvelopes(filters: EnvelopeFilters): Promise<Envelope[]> {
  const query: Record<string, string | number> = {};
  if (filters.dealId) query.dealId = filters.dealId;
  if (filters.documentType) query.documentType = filters.documentType;
  if (filters.status) query.status = filters.status;
  if (filters.limit) query.limit = filters.limit;
  try {
    const res = await api.get<EnvelopeListResponse>("/signatures/envelopes", { query });
    return unwrap(res);
  } catch {
    return MOCK_ENVELOPES;
  }
}

/* ------------------------------------------------------------------ */
/* Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useTemplates(
  options?: Omit<UseQueryOptions<TemplateListItem[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<TemplateListItem[], Error>({
    queryKey: signatureKeys.templates(),
    queryFn: fetchTemplates,
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useEnvelopesForDeal(
  dealId: string | null | undefined,
  options?: Omit<UseQueryOptions<Envelope[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<Envelope[], Error>({
    queryKey: signatureKeys.byDeal(dealId ?? ""),
    queryFn: () => fetchEnvelopesForDeal(dealId ?? ""),
    enabled: Boolean(dealId),
    staleTime: 10_000,
    ...options,
  });
}

export function useEnvelopes(
  filters: EnvelopeFilters = {},
  options?: Omit<UseQueryOptions<Envelope[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<Envelope[], Error>({
    queryKey: signatureKeys.list(filters),
    queryFn: () => fetchEnvelopes(filters),
    staleTime: 10_000,
    ...options,
  });
}

/**
 * Fetch a single envelope. If `pollMs` is provided AND the envelope
 * is in-flight (not terminal), auto-refresh at that interval.
 */
export function useEnvelope(
  id: string | null | undefined,
  options: { pollMs?: number; sync?: boolean } = {},
) {
  const { pollMs = 0, sync = false } = options;
  const query = useQuery<Envelope, Error>({
    queryKey: signatureKeys.detail(id ?? ""),
    queryFn: () => fetchEnvelope(id ?? "", { sync }),
    enabled: Boolean(id),
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!pollMs || !id) return;
    if (!query.data) return;
    if (TERMINAL_STATUSES.has(query.data.status)) return;
    const interval = setInterval(() => {
      void query.refetch();
    }, pollMs);
    return () => {
      clearInterval(interval);
    };
  }, [pollMs, id, query.data?.status, query.refetch, query.data]);

  return query;
}

/* ------------------------------------------------------------------ */
/* Mutations                                                          */
/* ------------------------------------------------------------------ */

export function useCreateEnvelope(
  options?: UseMutationOptions<Envelope, Error, CreateEnvelopeInput>,
) {
  const qc = useQueryClient();
  return useMutation<Envelope, Error, CreateEnvelopeInput>({
    mutationFn: async (input) => {
      try {
        const res = await api.post<EnvelopeResponse>("/signatures/envelopes", input);
        return unwrap(res);
      } catch (err) {
        // Optimistic mock: synthesize an envelope so the UI works
        // without a backend. Useful for the demo.
        const env: Envelope = {
          id: `env_mock_${Date.now()}`,
          dealerId: "dealer_demo",
          dealId: input.dealId ?? null,
          documentId: input.documentId ?? null,
          envelopeId: `docu-mock-${Date.now()}`,
          templateId: input.templateSlug,
          documentType: "OTHER",
          status: input.sendNow === false ? "CREATED" : "SENT",
          subject: input.emailSubject ?? null,
          emailMessage: input.emailMessage ?? null,
          signers: input.signers.map((s) => ({
            email: s.email,
            name: s.name,
            role: s.roleName,
            status: "sent" as const,
            signedAt: null,
            deliveredAt: null,
            declinedAt: null,
            declineReason: null,
            clientUserId: s.clientUserId ?? null,
          })),
          sentAt: new Date().toISOString(),
          deliveredAt: null,
          completedAt: null,
          declinedAt: null,
          declinedReason: null,
          voidedAt: null,
          voidedReason: null,
          expiresAt: null,
          pdfUrl: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return env;
      }
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: signatureKeys.lists() });
      if (data.dealId) {
        qc.invalidateQueries({ queryKey: signatureKeys.byDeal(data.dealId) });
      }
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useVoidEnvelope(
  options?: UseMutationOptions<Envelope, Error, { id: string; reason: string }>,
) {
  const qc = useQueryClient();
  return useMutation<Envelope, Error, { id: string; reason: string }>({
    mutationFn: async ({ id, reason }) => {
      const res = await api.post<EnvelopeResponse>(`/signatures/envelopes/${id}/void`, { reason });
      return unwrap(res);
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: signatureKeys.lists() });
      qc.invalidateQueries({ queryKey: signatureKeys.detail(data.id) });
      if (data.dealId) {
        qc.invalidateQueries({ queryKey: signatureKeys.byDeal(data.dealId) });
      }
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useEmbeddedSigningUrl(
  options?: UseMutationOptions<
    EmbeddedUrlResponse,
    Error,
    { id: string; signerEmail: string; returnUrl: string }
  >,
) {
  return useMutation<
    EmbeddedUrlResponse,
    Error,
    { id: string; signerEmail: string; returnUrl: string }
  >({
    mutationFn: async ({ id, signerEmail, returnUrl }) => {
      const res = await api.post<{ data: EmbeddedUrlResponse }>(
        `/signatures/envelopes/${id}/embedded-url`,
        { signerEmail, returnUrl },
      );
      return unwrap(res);
    },
    ...options,
  });
}

export function useEnvelopePdfUrl(id: string | null | undefined): string | null {
  // The PDF is streamed; the URL is enough for the browser to
  // attach `Authorization` via the api client. We return the
  // path; the consumer can call `api.get` with `responseType: blob`.
  return id ? `/signatures/envelopes/${id}/pdf` : null;
}
