/**
 * JWT signing / verifying helpers.
 *
 * Two token kinds:
 *   - access:  15 min, carries userId + dealerId + role (used for auth)
 *   - refresh: 7 days,  carries userId only (rotated to mint new access tokens)
 *
 * The Fastify `@fastify/jwt` plugin is the canonical signer; these helpers
 * thin-wrap it for call-sites that prefer a functional interface.
 */

import type { FastifyInstance } from "fastify";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "7d";

export interface AccessTokenPayload {
  userId: string;
  dealerId: string;
  role: string;
}

export interface RefreshTokenPayload {
  userId: string;
}

export async function signAccessToken(
  app: FastifyInstance,
  payload: AccessTokenPayload,
): Promise<string> {
  return app.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
}

export async function signRefreshToken(
  app: FastifyInstance,
  payload: RefreshTokenPayload,
): Promise<string> {
  return app.jwt.sign(payload, { expiresIn: REFRESH_TOKEN_TTL });
}

export async function verifyToken<T = Record<string, unknown>>(
  app: FastifyInstance,
  token: string,
): Promise<T> {
  return app.jwt.verify(token) as Promise<T>;
}
