/**
 * POST /api/finance-application — public finance-app proxy.
 *
 * Forwards to POST /public/dealer-website/:subdomain/finance-application
 * on the main API, which creates a Lead + Customer row in a
 * transaction. The marketing app adds:
 *   - zod validation
 *   - per-IP rate limiting
 *   - strip of `ssnLast4` if the field doesn't match /^\d{4}$/
 *     (defence in depth — the API also validates)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitFinanceApplication } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FinanceBodySchema = z.object({
  subdomain: z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9-]+$/),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(40).optional(),
  message: z.string().trim().max(2000).optional(),
  vehicleStockNumber: z.string().trim().max(80).optional(),
  vehicleId: z.string().trim().max(40).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ssnLast4: z.string().regex(/^\d{4}$/).optional(),
  address: z
    .object({
      line1: z.string().max(200).optional(),
      line2: z.string().max(200).optional(),
      city: z.string().max(120).optional(),
      region: z.string().max(120).optional(),
      postal: z.string().max(20).optional(),
    })
    .optional(),
  employmentStatus: z.string().max(60).optional(),
  monthlyIncome: z.number().nonnegative().optional(),
  downPayment: z.number().nonnegative().optional(),
  consentCreditCheck: z.boolean().optional(),
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

// Same simple in-memory rate limit as the /api/lead route. The
// finance app is more expensive than a contact form so we cap
// it tighter.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

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
      { error: { message: "Too many applications. Please try again in a minute." } },
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

  const parsed = FinanceBodySchema.safeParse(body);
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
    const result = await submitFinanceApplication(parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Application submission failed";
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}
