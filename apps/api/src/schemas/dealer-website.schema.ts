/**
 * Zod schemas for the /dealer-website endpoints (CRUD) and the public
 * /public/dealer-website/:subdomain resolver used by the marketing app.
 *
 * All request bodies / params are validated through these schemas
 * (via the `validateBody` / `validateParams` helpers) before reaching
 * the service layer.
 */

import { z } from "zod";

/* ============================================================
 * Subdomain
 * ============================================================ */

export const SubdomainParamSchema = z.object({
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Subdomain too short")
    .max(40, "Subdomain too long")
    .regex(/^[a-z0-9-]+$/, "Subdomain must be lowercase alphanumeric with hyphens"),
});
export type SubdomainParam = z.infer<typeof SubdomainParamSchema>;

/* ============================================================
 * Theme config (themeConfig)
 *
 * Free-form JSON. The marketing app reads these values to render
 * the homepage, hero, footer, and brand colors. Stored as JSON in
 * Prisma to allow non-breaking extension.
 * ============================================================ */

export const ThemeConfigSchema = z
  .object({
    logo: z.string().url().nullable().optional(),
    primaryColor: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Invalid hex color")
      .optional(),
    accentColor: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Invalid hex color")
      .optional(),
    heroImage: z.string().url().nullable().optional(),
    heroTitle: z.string().max(160).optional(),
    heroSubtitle: z.string().max(500).optional(),
    heroCtaText: z.string().max(60).optional(),
    heroCtaHref: z.string().max(500).optional(),
    aboutText: z.string().max(5000).optional(),
    footerLinks: z
      .array(
        z.object({
          label: z.string().min(1).max(60),
          href: z.string().min(1).max(500),
        }),
      )
      .max(20)
      .optional(),
    fontFamily: z.string().max(120).optional(),
    address: z
      .object({
        line1: z.string().max(200).optional(),
        line2: z.string().max(200).optional(),
        city: z.string().max(120).optional(),
        region: z.string().max(120).optional(),
        postal: z.string().max(20).optional(),
        country: z.string().max(80).optional(),
      })
      .optional(),
    phone: z.string().max(40).optional(),
    email: z.string().email().optional(),
    hours: z
      .array(
        z.object({
          day: z.string().max(20),
          open: z.string().max(20),
          close: z.string().max(20),
        }),
      )
      .max(14)
      .optional(),
  })
  .partial();
export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;

/* ============================================================
 * SEO config (seoConfig)
 * ============================================================ */

export const SeoConfigSchema = z
  .object({
    title: z.string().max(160).optional(),
    description: z.string().max(500).optional(),
    keywords: z.array(z.string().max(60)).max(40).optional(),
    ogImage: z.string().url().nullable().optional(),
    googleAnalyticsId: z.string().max(40).optional(),
    facebookPixelId: z.string().max(40).optional(),
    hreflang: z
      .array(
        z.object({
          lang: z.string().min(2).max(10),
          url: z.string().url(),
        }),
      )
      .max(40)
      .optional(),
  })
  .partial();
export type SeoConfig = z.infer<typeof SeoConfigSchema>;

/* ============================================================
 * POST /dealer-website — create
 * ============================================================ */

export const CreateDealerWebsiteBodySchema = z.object({
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Subdomain too short")
    .max(40, "Subdomain too long")
    .regex(/^[a-z0-9-]+$/, "Subdomain must be lowercase alphanumeric with hyphens"),
  themeConfig: ThemeConfigSchema.optional(),
  seoConfig: SeoConfigSchema.optional(),
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Custom domain too short")
    .max(255, "Custom domain too long")
    .optional(),
  isPublished: z.boolean().optional(),
});
export type CreateDealerWebsiteBody = z.infer<typeof CreateDealerWebsiteBodySchema>;

/* ============================================================
 * PUT /dealer-website — update
 * ============================================================ */

export const UpdateDealerWebsiteBodySchema = z
  .object({
    subdomain: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    themeConfig: ThemeConfigSchema.optional(),
    seoConfig: SeoConfigSchema.optional(),
    customDomain: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(255)
      .nullable()
      .optional(),
    isPublished: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.subdomain !== undefined ||
      v.themeConfig !== undefined ||
      v.seoConfig !== undefined ||
      v.customDomain !== undefined ||
      v.isPublished !== undefined,
    { message: "No updatable fields provided" },
  );
export type UpdateDealerWebsiteBody = z.infer<typeof UpdateDealerWebsiteBodySchema>;

/* ============================================================
 * Public lead capture (used by the marketing app to POST
 * /api/lead and /api/finance-application). Lives here so the
 * API and the marketing app share the same source of truth.
 * ============================================================ */

export const PublicLeadBodySchema = z.object({
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(40).optional(),
  message: z.string().trim().max(2000).optional(),
  vehicleStockNumber: z.string().trim().max(80).optional(),
  vehicleId: z.string().trim().max(40).optional(),
  // UTM / referrer metadata captured by the marketing site
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
export type PublicLeadBody = z.infer<typeof PublicLeadBodySchema>;

export const FinanceApplicationBodySchema = PublicLeadBodySchema.extend({
  // Credit-app specific fields
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD")
    .optional(),
  ssnLast4: z.string().regex(/^\d{4}$/, "SSN last 4 must be 4 digits").optional(),
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
});
export type FinanceApplicationBody = z.infer<typeof FinanceApplicationBodySchema>;
