/**
 * Invite token repository — Redis-backed single-use invite tokens.
 *
 * Schema: not in the Prisma model (invites are transient). We store the
 * payload in Redis with a 72h TTL. Keys are namespaced by dealer.
 *
 * Key format: invite:{dealerId}:{token}
 * Value: JSON-encoded { email, name, role, phone }
 */

import { randomBytes } from "node:crypto";
import { redis } from "../utils/redis.js";
import { NotFoundError } from "../utils/errors.js";

const INVITE_TTL_SECONDS = 60 * 60 * 72; // 72 hours

export interface InvitePayload {
  email: string;
  name: string;
  role: string;
  phone: string | null;
}

function key(dealerId: string, token: string): string {
  return `invite:${dealerId}:${token}`;
}

export const inviteRepository = {
  generateToken(): string {
    return randomBytes(32).toString("base64url");
  },

  async create(dealerId: string, payload: InvitePayload): Promise<string> {
    if (!redis) {
      throw new Error("Redis is required for invite tokens but is not configured");
    }
    const token = this.generateToken();
    await redis.set(
      key(dealerId, token),
      JSON.stringify(payload),
      "EX",
      INVITE_TTL_SECONDS,
    );
    return token;
  },

  async consume(dealerId: string, token: string): Promise<InvitePayload> {
    if (!redis) {
      throw new NotFoundError("Invite token store unavailable");
    }
    const k = key(dealerId, token);
    const raw = await redis.get(k);
    if (!raw) {
      throw new NotFoundError("Invite token invalid or expired");
    }
    // Single-use — delete immediately.
    await redis.del(k);
    try {
      return JSON.parse(raw) as InvitePayload;
    } catch {
      throw new NotFoundError("Invite token payload corrupt");
    }
  },
};
