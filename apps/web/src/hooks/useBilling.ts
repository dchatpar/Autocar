"use client";

/**
 * React Query hooks for the Stripe billing module.
 *
 * Exposed hooks:
 *   - useSubscription   — current dealer's Stripe subscription
 *   - useUsage          — current month usage by metric
 *   - useInvoices       — invoice history
 *   - useCreateCheckout — mutation → returns hosted Checkout URL
 *   - useCreatePortal   — mutation → returns hosted Portal URL
 *   - useUpgradePlan    — mutation → prorated plan change
 *   - useCancel         — mutation → schedule cancellation
 *   - useResume         — mutation → reverse a scheduled cancellation
 *
 * All mutations invalidate the relevant query keys so the UI stays
 * in sync after the action.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type {
  CheckoutSessionResult,
  CurrentUsage,
  Invoice,
  PortalSessionResult,
  Subscription,
  SubscriptionPlan,
  UpgradeResult,
} from "@/types/api";

/* ------------------------------------------------------------------ */
/* Query keys                                                         */
/* ------------------------------------------------------------------ */

export const billingKeys = {
  all: ["billing"] as const,
  subscription: () => [...billingKeys.all, "subscription"] as const,
  usage: () => [...billingKeys.all, "usage"] as const,
  invoices: () => [...billingKeys.all, "invoices"] as const,
  invoiceList: (limit: number) => [...billingKeys.invoices(), limit] as const,
};

/* ------------------------------------------------------------------ */
/* Queries                                                            */
/* ------------------------------------------------------------------ */

async function fetchSubscription(): Promise<Subscription | null> {
  const r = await api.get<{ data: Subscription | null }>("/billing/subscription");
  return r.data;
}

export function useSubscription(
  options?: Omit<UseQueryOptions<Subscription | null, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<Subscription | null, Error>({
    queryKey: billingKeys.subscription(),
    queryFn: fetchSubscription,
    staleTime: 30_000,
    ...options,
  });
}

async function fetchUsage(): Promise<CurrentUsage | null> {
  const r = await api.get<{ data: CurrentUsage | null }>("/billing/usage");
  return r.data;
}

export function useUsage(
  options?: Omit<UseQueryOptions<CurrentUsage | null, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<CurrentUsage | null, Error>({
    queryKey: billingKeys.usage(),
    queryFn: fetchUsage,
    staleTime: 30_000,
    ...options,
  });
}

async function fetchInvoices(limit: number): Promise<Invoice[]> {
  const r = await api.get<{ data: Invoice[] }>("/billing/invoices", {
    query: { limit },
  });
  return r.data;
}

export function useInvoices(
  limit: number = 24,
  options?: Omit<UseQueryOptions<Invoice[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery<Invoice[], Error>({
    queryKey: billingKeys.invoiceList(limit),
    queryFn: () => fetchInvoices(limit),
    staleTime: 60_000,
    ...options,
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                          */
/* ------------------------------------------------------------------ */

interface CreateCheckoutInput {
  plan: SubscriptionPlan;
  successUrl?: string;
  cancelUrl?: string;
}

export function useCreateCheckout(
  options?: UseMutationOptions<CheckoutSessionResult, Error, CreateCheckoutInput>,
) {
  return useMutation<CheckoutSessionResult, Error, CreateCheckoutInput>({
    mutationFn: async (input) => {
      const r = await api.post<{ data: CheckoutSessionResult }>(
        "/billing/create-checkout-session",
        input,
      );
      return r.data;
    },
    ...options,
  });
}

interface CreatePortalInput {
  returnUrl?: string;
}

export function useCreatePortal(
  options?: UseMutationOptions<PortalSessionResult, Error, CreatePortalInput>,
) {
  return useMutation<PortalSessionResult, Error, CreatePortalInput>({
    mutationFn: async (input) => {
      const r = await api.post<{ data: PortalSessionResult }>(
        "/billing/create-portal-session",
        input,
      );
      return r.data;
    },
    ...options,
  });
}

interface UpgradePlanInput {
  plan: SubscriptionPlan;
}

export function useUpgradePlan(
  options?: UseMutationOptions<UpgradeResult, Error, UpgradePlanInput>,
) {
  const qc = useQueryClient();
  return useMutation<UpgradeResult, Error, UpgradePlanInput>({
    mutationFn: async (input) => {
      const r = await api.post<{ data: UpgradeResult }>(
        "/billing/subscription/upgrade",
        input,
      );
      return r.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: billingKeys.subscription() });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useCancelSubscription(
  options?: UseMutationOptions<Subscription, Error, void>,
) {
  const qc = useQueryClient();
  return useMutation<Subscription, Error, void>({
    mutationFn: async () => {
      const r = await api.post<{ data: Subscription }>(
        "/billing/subscription/cancel",
        {},
      );
      return r.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: billingKeys.subscription() });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

export function useResumeSubscription(
  options?: UseMutationOptions<Subscription, Error, void>,
) {
  const qc = useQueryClient();
  return useMutation<Subscription, Error, void>({
    mutationFn: async () => {
      const r = await api.post<{ data: Subscription }>(
        "/billing/subscription/resume",
        {},
      );
      return r.data;
    },
    onSuccess: (data, vars, onMutateResult, context) => {
      qc.invalidateQueries({ queryKey: billingKeys.subscription() });
      options?.onSuccess?.(data, vars, onMutateResult, context);
    },
    ...options,
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Map a `PLAN_LIMIT_EXCEEDED` API error into a human-readable
 * "upgrade to X" message. Use this in toast/alert UIs.
 */
export function planLimitUpgradeMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status !== 402) return null;
  const body = err as ApiError & { code?: string };
  if (body.code && body.code !== "PLAN_LIMIT_EXCEEDED") return null;
  // The body of a PaymentRequiredError carries `details.upgradeTo`.
  // Our ApiError doesn't expose details, so callers should inspect
  // the response. Returning a generic fallback is still useful.
  return "You've hit your plan limit. Upgrade to keep going.";
}

/**
 * Pretty status label for the dashboard.
 */
export function statusLabel(status: Subscription["status"]): string {
  switch (status) {
    case "TRIALING":
      return "Free trial";
    case "ACTIVE":
      return "Active";
    case "PAST_DUE":
      return "Past due";
    case "CANCELED":
      return "Canceled";
    case "UNPAID":
      return "Unpaid";
    case "INCOMPLETE":
      return "Incomplete";
    case "INCOMPLETE_EXPIRED":
      return "Expired";
  }
}

export function metricLabel(metric: string): string {
  switch (metric) {
    case "users":
      return "Active users";
    case "leads":
      return "Leads";
    case "sms_sent":
      return "SMS sent";
    case "emails_sent":
      return "Emails sent";
    case "ai_tokens":
      return "AI tokens";
    default:
      return metric;
  }
}
