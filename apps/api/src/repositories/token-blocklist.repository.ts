/**
 * Token blocklist — used by /auth/logout.
 *
 * We block by `jti` (jwt id) when present, or by a SHA-256 of the token
 * string as a fallback. TTL matches the token's remaining lifetime so
 * the key auto-expires.
 */

import { createHash } from "node:crypto";

import { redis } from "../utils/redis.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const tokenBlocklist = {
  async block(token: string, ttlSeconds: number): Promise<void> {
    if (!redis) return; // graceful no-op when Redis is offline
    const id = hashToken(token);
    await redis.set(`token:blocklist:${id}`, "1", "EX", Math.max(1, ttlSeconds));
  },

  async isBlocked(token: string): Promise<boolean> {
    if (!redis) return false;
    const id = hashToken(token);
    const v = await redis.get(`token:blocklist:${id}`);
    return v !== null;
  },

  async blockJti(jti: string, ttlSeconds: number): Promise<void> {
    if (!redis) return;
    await redis.set(`token:blocklist:jti:${jti}`, "1", "EX", Math.max(1, ttlSeconds));
  },
};
