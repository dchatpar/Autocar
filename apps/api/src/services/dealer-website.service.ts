/**
 * DealerWebsite service — business logic for the per-dealer public
 * marketing site (theme, SEO, publishing, custom domain).
 *
 * Responsibilities:
 *   - resolve a website by subdomain or custom domain for the public
 *     marketing app
 *   - ensure a dealer can only ever have one website row
 *   - derive safe defaults for theme/SEO so the marketing app
 *     always has a renderable config
 *   - count public page views
 *   - create lead + customer rows from the public lead-capture
 *     forms (subdomain-aware, source='website_form')
 *
 * Multi-tenant: every mutating method extracts `dealerId` from the
 * row itself (never from a caller-supplied body), and the public
 * read methods always look up the dealer from the subdomain or
 * custom domain — there is no dealerId in the request path.
 */

import type { DealerWebsite, Prisma } from "@prisma/client";

import { prisma as defaultPrisma } from "../utils/prisma.js";
import { dealerRepository } from "../repositories/dealer.repository.js";
import { dealerWebsiteRepository } from "../repositories/dealer-website.repository.js";
import { leadService } from "./lead.service.js";
import { customerService } from "./customer.service.js";
import { logActivity, type AuditContext } from "./activity-logger.service.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import type {
  CreateDealerWebsiteBody,
  UpdateDealerWebsiteBody,
  PublicLeadBody,
  FinanceApplicationBody,
} from "../schemas/dealer-website.schema.js";

/* ============================================================
 * Public-facing helpers
 * ============================================================ */

export interface PublicDealerSite {
  /** Marketing-app-facing projection. Stable, JSON-serialisable. */
  website: {
    id: string;
    dealerId: string;
    subdomain: string;
    themeConfig: Prisma.JsonValue;
    seoConfig: Prisma.JsonValue;
    customDomain: string | null;
    isPublished: boolean;
  };
  dealer: {
    id: string;
    name: string;
    subdomain: string;
  };
}

/* ============================================================
 * Service
 * ============================================================ */

export const dealerWebsiteService = {
  /**
   * Resolve the public-facing site for a subdomain. Used by the
   * marketing app on every request. Returns `null` if the dealer
   * has not published a site.
   */
  async resolveBySubdomain(subdomain: string): Promise<PublicDealerSite | null> {
    const website = await dealerWebsiteRepository.findBySubdomain(subdomain);
    if (!website) return null;
    const dealer = await dealerRepository.findById(website.dealerId);
    if (!dealer) return null;
    return {
      website: {
        id: website.id,
        dealerId: website.dealerId,
        subdomain: website.subdomain,
        themeConfig: website.themeConfig,
        seoConfig: website.seoConfig,
        customDomain: website.customDomain,
        isPublished: website.isPublished,
      },
      dealer: {
        id: dealer.id,
        name: dealer.name,
        subdomain: dealer.subdomain,
      },
    };
  },

  /**
   * Resolve by custom CNAME'd domain. Used when a dealer has
   * pointed `www.example.com` at our edge.
   */
  async resolveByCustomDomain(host: string): Promise<PublicDealerSite | null> {
    const website = await dealerWebsiteRepository.findByCustomDomain(host);
    if (!website) return null;
    return this.resolveBySubdomain(website.subdomain);
  },

  /**
   * Increment the public view counter. Tenant-scoped. Best-effort:
   * errors are swallowed so a counter write never blocks a page
   * render.
   */
  async trackView(dealerId: string): Promise<void> {
    try {
      await dealerWebsiteRepository.incrementViewCount(dealerId);
    } catch {
      // ignore — counter is non-critical
    }
  },

  /**
   * Get the website config for the current authenticated dealer.
   * Returns `null` if the dealer hasn't configured a website yet.
   */
  async getForDealer(dealerId: string): Promise<DealerWebsite | null> {
    return dealerWebsiteRepository.findByDealerId(dealerId);
  },

  /**
   * Create a website row for the current dealer. Throws ConflictError
   * on duplicate (dealerId or subdomain collision).
   */
  async create(
    ctx: AuditContext,
    dealerId: string,
    body: CreateDealerWebsiteBody,
  ): Promise<DealerWebsite> {
    const existing = await dealerWebsiteRepository.findByDealerId(dealerId);
    if (existing) {
      throw new ConflictError("Dealer already has a website configured");
    }
    const subdomainTaken = await dealerWebsiteRepository.findBySubdomain(
      body.subdomain,
    );
    if (subdomainTaken) {
      throw new ConflictError(`Subdomain '${body.subdomain}' is taken`);
    }
    if (body.customDomain) {
      const domainTaken = await dealerWebsiteRepository.findByCustomDomain(
        body.customDomain,
      );
      if (domainTaken) {
        throw new ConflictError(
          `Custom domain '${body.customDomain}' is already in use`,
        );
      }
    }

    const created = await dealerWebsiteRepository.create({
      dealerId,
      subdomain: body.subdomain,
      themeConfig: body.themeConfig as Prisma.InputJsonValue | undefined,
      seoConfig: body.seoConfig as Prisma.InputJsonValue | undefined,
      customDomain: body.customDomain ?? null,
      isPublished: body.isPublished ?? false,
    });

    await logActivity(ctx, {
      entityType: "DEALER",
      entityId: dealerId,
      action: "WEBSITE_CREATED",
      metadata: { websiteId: created.id, subdomain: created.subdomain },
    });

    return created;
  },

  /**
   * Update a website row. Validates subdomain / custom-domain
   * collisions before writing. Auto-audited.
   */
  async update(
    ctx: AuditContext,
    dealerId: string,
    body: UpdateDealerWebsiteBody,
  ): Promise<DealerWebsite> {
    const existing = await dealerWebsiteRepository.findByDealerId(dealerId);
    if (!existing) {
      throw new NotFoundError("Dealer website not configured");
    }

    if (body.subdomain && body.subdomain !== existing.subdomain) {
      const taken = await dealerWebsiteRepository.findBySubdomain(body.subdomain);
      if (taken && taken.dealerId !== dealerId) {
        throw new ConflictError(`Subdomain '${body.subdomain}' is taken`);
      }
    }
    if (body.customDomain && body.customDomain !== existing.customDomain) {
      const taken = await dealerWebsiteRepository.findByCustomDomain(
        body.customDomain,
      );
      if (taken && taken.dealerId !== dealerId) {
        throw new ConflictError(
          `Custom domain '${body.customDomain}' is already in use`,
        );
      }
    }

    const updated = await dealerWebsiteRepository.update(dealerId, {
      subdomain: body.subdomain,
      themeConfig: body.themeConfig as Prisma.InputJsonValue | undefined,
      seoConfig: body.seoConfig as Prisma.InputJsonValue | undefined,
      customDomain: body.customDomain === undefined ? undefined : body.customDomain,
      isPublished: body.isPublished,
    });

    await logActivity(ctx, {
      entityType: "DEALER",
      entityId: dealerId,
      action: "WEBSITE_UPDATED",
      metadata: {
        websiteId: updated.id,
        published: updated.isPublished,
        subdomainChanged: body.subdomain !== undefined && body.subdomain !== existing.subdomain,
      },
    });

    return updated;
  },

  /**
   * Toggle publishing. Auto-audited.
   */
  async setPublished(
    ctx: AuditContext,
    dealerId: string,
    isPublished: boolean,
  ): Promise<DealerWebsite> {
    const existing = await dealerWebsiteRepository.findByDealerId(dealerId);
    if (!existing) {
      throw new NotFoundError("Dealer website not configured");
    }
    const updated = await dealerWebsiteRepository.update(dealerId, {
      isPublished,
    });
    await logActivity(ctx, {
      entityType: "DEALER",
      entityId: dealerId,
      action: isPublished ? "WEBSITE_PUBLISHED" : "WEBSITE_UNPUBLISHED",
      metadata: { websiteId: updated.id },
    });
    return updated;
  },

  /**
   * Delete a website row. Auto-audited.
   */
  async delete(ctx: AuditContext, dealerId: string): Promise<void> {
    const existing = await dealerWebsiteRepository.findByDealerId(dealerId);
    if (!existing) {
      throw new NotFoundError("Dealer website not configured");
    }
    await dealerWebsiteRepository.delete(dealerId);
    await logActivity(ctx, {
      entityType: "DEALER",
      entityId: dealerId,
      action: "WEBSITE_DELETED",
      metadata: { websiteId: existing.id, subdomain: existing.subdomain },
    });
  },

  /* ============================================================
   * Public lead capture
   *
   * Called by the marketing app from `/{subdomain}/api/lead`. The
   * subdomain is in the body (it's the public form) so we resolve
   * the dealer from it. We never trust a dealerId in the body.
   * ============================================================ */

  /**
   * Create a Lead from a public contact form. Source is always
   * 'website_form'. vehicleInterest is set if the visitor came
   * from a vehicle detail page.
   */
  async createPublicLead(body: PublicLeadBody): Promise<{ id: string }> {
    const site = await this.resolveBySubdomain(body.subdomain);
    if (!site) {
      throw new NotFoundError(`No published site for '${body.subdomain}'`);
    }
    if (!site.website.isPublished) {
      throw new ValidationError("Site is not currently published");
    }

    const vehicleInterest: Prisma.InputJsonValue = body.vehicleStockNumber
      ? [{ stockNumber: body.vehicleStockNumber, vehicleId: body.vehicleId ?? null }]
      : [];

    const lead = await leadService.create(
      {
        userId: null,
        dealerId: site.website.dealerId,
        role: null,
        ipAddress: null,
        userAgent: null,
        requestId: null,
      },
      {
        dealerId: site.website.dealerId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone ?? null,
        source: "website_form",
        vehicleInterest,
        sourceMeta: {
          ...(body.sourceMeta ?? {}),
          subdomain: body.subdomain,
          form: "contact",
        },
      },
    );

    return { id: lead.id };
  },

  /**
   * Create a Lead + Customer from a public finance application.
   * Uses a transaction so we never end up with a lead but no
   * customer. Source 'website_form' identifies these in the CRM.
   */
  async createFinanceApplication(
    body: FinanceApplicationBody,
  ): Promise<{ leadId: string; customerId: string }> {
    const site = await this.resolveBySubdomain(body.subdomain);
    if (!site) {
      throw new NotFoundError(`No published site for '${body.subdomain}'`);
    }
    if (!site.website.isPublished) {
      throw new ValidationError("Site is not currently published");
    }

    // Wrap lead + customer creation in a transaction.
    const result = await defaultPrisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          dealerId: site.website.dealerId,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone ?? null,
          source: "website_form",
          vehicleInterest: body.vehicleStockNumber
            ? [
                {
                  stockNumber: body.vehicleStockNumber,
                  vehicleId: body.vehicleId ?? null,
                },
              ]
            : [],
          sourceMeta: {
            ...(body.sourceMeta ?? {}),
            subdomain: body.subdomain,
            form: "finance_application",
            ...(body.downPayment !== undefined
              ? { requestedDownPayment: body.downPayment }
              : {}),
            ...(body.consentCreditCheck !== undefined
              ? { consentCreditCheck: body.consentCreditCheck }
              : {}),
          },
        },
      });

      // Create or merge with an existing customer row. customerService
      // is the canonical dedupe path.
      const customer = await customerService.upsertFromPublicForm(tx, {
        dealerId: site.website.dealerId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone ?? null,
        dob: body.dob ? new Date(body.dob) : undefined,
        address: body.address as Prisma.InputJsonValue | undefined,
        notes: [
          body.employmentStatus ? `Employment: ${body.employmentStatus}` : null,
          body.monthlyIncome !== undefined
            ? `Monthly income: $${body.monthlyIncome.toFixed(2)}`
            : null,
          body.downPayment !== undefined
            ? `Requested down payment: $${body.downPayment.toFixed(2)}`
            : null,
          body.ssnLast4 ? `SSN last 4: ${body.ssnLast4}` : null,
        ]
          .filter((s): s is string => Boolean(s))
          .join("\n") || null,
      });

      // Link the lead to the customer (so the CRM timeline shows
      // them together).
      await tx.lead.update({
        where: { id: lead.id },
        data: { customerId: customer.id },
      });

      return { leadId: lead.id, customerId: customer.id };
    });

    return result;
  },
};
