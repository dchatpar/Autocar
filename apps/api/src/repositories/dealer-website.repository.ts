/**
 * DealerWebsite repository — Prisma access for the `DealerWebsite` model.
 *
 * Multi-tenant: every method takes an explicit `dealerId` and includes
 * it in the `where` clause. Subdomain and customDomain are globally
 * unique tenant keys, so the only cross-tenant operations are
 * `findBySubdomain()` and `findByCustomDomain()` — both used by the
 * public marketing app to resolve the dealer from the URL.
 *
 * `dealerWebsite` is the relation name used by `dealer` on Dealer, so
 * reads here use `prisma.dealerWebsite` (not `prisma.dealer_websites`).
 */

import type { DealerWebsite, Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";

export interface CreateDealerWebsiteInput {
  dealerId: string;
  subdomain: string;
  themeConfig?: Prisma.InputJsonValue;
  seoConfig?: Prisma.InputJsonValue;
  customDomain?: string | null;
  isPublished?: boolean;
}

export interface UpdateDealerWebsiteInput {
  subdomain?: string;
  themeConfig?: Prisma.InputJsonValue;
  seoConfig?: Prisma.InputJsonValue;
  customDomain?: string | null;
  isPublished?: boolean;
}

export const dealerWebsiteRepository = {
  /**
   * Find a website row scoped to a dealer. Returns `null` if the dealer
   * has not configured a public site yet.
   */
  async findByDealerId(dealerId: string): Promise<DealerWebsite | null> {
    return prisma.dealerWebsite.findUnique({ where: { dealerId } });
  },

  /**
   * Find a website row by primary key, scoped to the owning dealer.
   * Returns `null` on tenant mismatch (never leaks another dealer's
   * site config).
   */
  async findById(dealerId: string, id: string): Promise<DealerWebsite | null> {
    return prisma.dealerWebsite.findFirst({ where: { dealerId, id } });
  },

  /**
   * Public lookup by subdomain. Cross-tenant by design (the marketing
   * app hits this on every request to resolve the dealer). The caller
   * is responsible for honouring `isPublished` and `viewCount`
   * semantics.
   */
  async findBySubdomain(subdomain: string): Promise<DealerWebsite | null> {
    return prisma.dealerWebsite.findUnique({ where: { subdomain } });
  },

  /**
   * Public lookup by CNAME'd custom domain. The marketing app first
   * checks the Host header; if it isn't a bare `*.dealeros.com`, this
   * method is used to resolve the dealer.
   */
  async findByCustomDomain(host: string): Promise<DealerWebsite | null> {
    return prisma.dealerWebsite.findUnique({ where: { customDomain: host } });
  },

  /**
   * Create a new website row for a dealer. Unique on `dealerId` and
   * `subdomain` so duplicate-key errors surface as 409 from the route.
   */
  async create(input: CreateDealerWebsiteInput): Promise<DealerWebsite> {
    return prisma.dealerWebsite.create({
      data: {
        dealerId: input.dealerId,
        subdomain: input.subdomain,
        themeConfig: input.themeConfig ?? {},
        seoConfig: input.seoConfig ?? {},
        customDomain: input.customDomain ?? null,
        isPublished: input.isPublished ?? false,
      },
    });
  },

  /**
   * Update a website row, scoped to dealer. Empty update is a no-op.
   */
  async update(
    dealerId: string,
    input: UpdateDealerWebsiteInput,
  ): Promise<DealerWebsite> {
    const data: Prisma.DealerWebsiteUpdateInput = {};
    if (input.subdomain !== undefined) data.subdomain = input.subdomain;
    if (input.themeConfig !== undefined) data.themeConfig = input.themeConfig;
    if (input.seoConfig !== undefined) data.seoConfig = input.seoConfig;
    if (input.customDomain !== undefined) data.customDomain = input.customDomain;
    if (input.isPublished !== undefined) data.isPublished = input.isPublished;
    return prisma.dealerWebsite.update({ where: { dealerId }, data });
  },

  /**
   * Upsert by dealerId — used when a dealer's settings page saves
   * website config and we don't know whether the row exists yet.
   */
  async upsert(
    dealerId: string,
    subdomain: string,
    input: Omit<UpdateDealerWebsiteInput, "subdomain">,
  ): Promise<DealerWebsite> {
    return prisma.dealerWebsite.upsert({
      where: { dealerId },
      create: {
        dealerId,
        subdomain,
        themeConfig: input.themeConfig ?? {},
        seoConfig: input.seoConfig ?? {},
        customDomain: input.customDomain ?? null,
        isPublished: input.isPublished ?? false,
      },
      update: {
        ...(input.themeConfig !== undefined ? { themeConfig: input.themeConfig } : {}),
        ...(input.seoConfig !== undefined ? { seoConfig: input.seoConfig } : {}),
        ...(input.customDomain !== undefined ? { customDomain: input.customDomain } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      },
    });
  },

  /**
   * Increment the public view counter. Called by the marketing app
   * on every page view. Tenant-scoped via the dealer relation.
   */
  async incrementViewCount(dealerId: string): Promise<void> {
    await prisma.dealerWebsite.update({
      where: { dealerId },
      data: { viewCount: { increment: 1 } },
    });
  },

  /**
   * Hard delete a website row (used when a dealer churns and we
   * purge tenant data). Tenant-scoped.
   */
  async delete(dealerId: string): Promise<void> {
    await prisma.dealerWebsite.delete({ where: { dealerId } });
  },
};
