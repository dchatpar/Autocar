/**
 * Dealer repository — Prisma access for the `Dealer` model.
 *
 * Multi-tenant: every method takes `dealerId` and includes it in `where`.
 * Subdomain is globally unique (it's a tenant key) so lookups by subdomain
 * are the only cross-tenant operation.
 */

import type { Dealer, Prisma } from "@prisma/client";

import { prisma } from "../utils/prisma.js";

export interface CreateDealerInput {
  name: string;
  subdomain: string;
  settings?: Prisma.InputJsonValue;
  trialEndsAt?: Date | null;
}

export const dealerRepository = {
  async findById(dealerId: string): Promise<Dealer | null> {
    return prisma.dealer.findUnique({ where: { id: dealerId } });
  },

  async findBySubdomain(subdomain: string): Promise<Dealer | null> {
    return prisma.dealer.findUnique({ where: { subdomain } });
  },

  async create(input: CreateDealerInput): Promise<Dealer> {
    return prisma.dealer.create({
      data: {
        name: input.name,
        subdomain: input.subdomain,
        settings: input.settings ?? {},
        trialEndsAt: input.trialEndsAt ?? null,
      },
    });
  },

  async update(
    dealerId: string,
    input: { name?: string; settings?: Prisma.InputJsonValue },
  ): Promise<Dealer> {
    const data: Prisma.DealerUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.settings !== undefined) data.settings = input.settings;
    return prisma.dealer.update({ where: { id: dealerId }, data });
  },
};
