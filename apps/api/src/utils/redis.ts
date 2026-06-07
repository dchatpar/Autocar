/**
 * Redis client singleton — used for the JWT blocklist (logout) and
 * any future caching or rate-limiting that needs cross-instance state.
 *
 * Returns `null` if REDIS_URL is not set so the rest of the codebase
 * can degrade gracefully (in-memory dev) without conditional imports.
 */

import IORedis, { type Redis } from "ioredis";

declare global {
   
  var __dealerosRedis: Redis | null | undefined;
}

function buildClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new IORedis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

export const redis: Redis | null =
  globalThis.__dealerosRedis === undefined
    ? buildClient()
    : globalThis.__dealerosRedis;

if (process.env.NODE_ENV !== "production") {
  globalThis.__dealerosRedis = redis;
}
