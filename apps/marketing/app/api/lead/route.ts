/**
 * POST /api/lead — public lead-capture proxy.
 *
 * The marketing app receives the form submission from the browser,
 * validates it, and forwards it to the main API at
 * POST /public/dealer-website/:subdomain/lead. The main API
 * creates a Lead with source='website_form'.
 *
 * Why proxy instead of letting the browser call the main API
 * directly?
 *   1. CORS — the main API's CORS allowlist is for the dealer
 *      dashboard, not the public marketing domain.
 *   2. Server-side rate limiting via the route handler.
 *   3. Centralised zod validation (the schemas in lib/api.ts are
 *      also shared with the main API for type-safety).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitPublicLead } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LeadBodySchema = z.object({
  subdomain: z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9-]+$/),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(40).optional(),
  message: z.string().trim().max(2000).optional(),
  vehicleStockNumber: z.string().trim().max(80).optional(),
  vehicleId: z.string().trim().max(40).optional(),
  sourceMeta: z
    .object({
      utm_source: z.string().max(80).optional(),
      utm_medium: z.string().max(80).optional(),
      utm_campaign: z.string().max(80).optional(),
      utm_term: z.string().max(80).optional(),
      utm_content: z.string().max(80).optional(),
      referrer: z.string().max(500).optional(),
      page: z.string().max(500).optional(),
    })
    .optional(),
});

// Simple in-memory rate limit: 5 leads / IP / minute. Production
// would back this with Upstash or a similar Redis store so the
// limit is shared across serverless instances.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: { message: "Too many submissions. Please try again in a minute." } },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = LeadBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await submitPublicLead(parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lead submission failed";
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}
