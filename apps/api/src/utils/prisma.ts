/**
 * Prisma client singleton.
 *
 * We import from `@prisma/client` (generated into the @dealeros/db package
 * node_modules) and expose a single shared instance to avoid exhausting
 * connection pools in dev (tsx watch reloads the module otherwise).
 */

import { PrismaClient } from "@prisma/client";

declare global {
   
  var __dealerosPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__dealerosPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dealerosPrisma = prisma;
}
