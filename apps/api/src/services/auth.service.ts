/**
 * Auth service — business logic for register, login, refresh, invite.
 *
 * The service layer:
 *   - validates business rules (uniqueness, role permissions to invite)
 *   - coordinates repositories
 *   - mints tokens via the Fastify app instance
 *   - never returns the passwordHash to the caller
 */

import type { FastifyInstance } from "fastify";
import type { User, UserRole } from "@prisma/client";

import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  REFRESH_TOKEN_TTL,
} from "../utils/jwt.js";
import { userRepository } from "../repositories/user.repository.js";
import { dealerRepository } from "../repositories/dealer.repository.js";
import { inviteRepository } from "../repositories/invite.repository.js";
import { tokenBlocklist } from "../repositories/token-blocklist.repository.js";
import { logActivity, type AuditContext } from "./activity-logger.service.js";
import type { RegisterBody, LoginBody, InviteBody, AcceptInviteBody } from "../schemas/auth.schema.js";

export interface PublicUser {
  id: string;
  dealerId: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  status: string;
  lastLogin: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access expiry
}

export interface LoginResult {
  user: PublicUser;
  tokens: AuthTokens;
}

function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    dealerId: u.dealerId,
    email: u.email,
    name: u.name,
    role: u.role,
    phone: u.phone,
    status: u.status,
    lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const ACCESS_TTL_SECONDS = 15 * 60; // 15 min

async function mintTokens(
  app: FastifyInstance,
  user: User,
): Promise<AuthTokens> {
  const accessToken = await signAccessToken(app, {
    userId: user.id,
    dealerId: user.dealerId,
    role: user.role,
  });
  const refreshToken = await signRefreshToken(app, {
    userId: user.id,
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
}

export const authService = {
  /**
   * Register a new dealer + the first ADMIN user in a single transaction.
   */
  async register(
    app: FastifyInstance,
    body: RegisterBody,
  ): Promise<LoginResult> {
    // 1. Check subdomain uniqueness
    const existingDealer = await dealerRepository.findBySubdomain(
      body.dealer.subdomain,
    );
    if (existingDealer) {
      throw new ConflictError("Subdomain already taken");
    }

    // 2. Check email uniqueness across the (dealerless) system. Email is
    //    unique per dealer, but to keep registration atomic we ensure no
    //    other user anywhere already has this email.
    const existingUser = await userRepository.findByEmailGlobal(body.user.email);
    if (existingUser) {
      throw new ConflictError("Email already registered");
    }

    // 3. Hash password
    const passwordHash = await hashPassword(body.user.password);

    // 4. Create dealer + first admin user in a transaction
    const { prisma } = await import("../utils/prisma.js");
    const created = await prisma.$transaction(async (tx) => {
      const dealer = await tx.dealer.create({
        data: {
          name: body.dealer.name,
          subdomain: body.dealer.subdomain,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
        },
      });
      const user = await tx.user.create({
        data: {
          dealerId: dealer.id,
          email: body.user.email,
          name: body.user.name,
          passwordHash,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      return { dealer, user };
    });

    const tokens = await mintTokens(app, created.user);
    return { user: toPublicUser(created.user), tokens };
  },

  /**
   * Login by email + password. Returns tokens.
   */
  async login(
    app: FastifyInstance,
    body: LoginBody,
    auditCtx?: AuditContext,
  ): Promise<LoginResult> {
    const user = await userRepository.findByEmailGlobal(body.email);
    if (!user || !user.passwordHash) {
      // Log a failed login. The email itself isn't part of the log
      // payload so we don't write secrets; we record the lookup
      // miss so the anomaly detector can correlate IP bursts.
      if (auditCtx) {
        await logActivity(
          { ...auditCtx, dealerId: user?.dealerId ?? null, userId: null },
          {
            action: "user.login_failed",
            entityType: "user",
            after: { reason: "no_such_user" },
          },
        ).catch(() => undefined);
      }
      throw new AuthError("Invalid credentials");
    }
    if (user.status === "DISABLED") {
      if (auditCtx) {
        await logActivity(
          { ...auditCtx, dealerId: user.dealerId, userId: user.id },
          {
            action: "user.login_failed",
            entityType: "user",
            entityId: user.id,
            after: { reason: "account_disabled" },
          },
        ).catch(() => undefined);
      }
      throw new ForbiddenError("Account is disabled");
    }

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      if (auditCtx) {
        await logActivity(
          { ...auditCtx, dealerId: user.dealerId, userId: user.id },
          {
            action: "user.login_failed",
            entityType: "user",
            entityId: user.id,
            after: { reason: "bad_password" },
          },
        ).catch(() => undefined);
      }
      throw new AuthError("Invalid credentials");
    }

    // Update lastLogin (best-effort)
    await userRepository.update(user.dealerId, user.id, {
      lastLogin: new Date(),
    }).catch(() => {
      // non-fatal
    });

    const fresh = { ...user, lastLogin: new Date() };
    const tokens = await mintTokens(app, fresh);

    if (auditCtx) {
      await logActivity(
        { ...auditCtx, dealerId: fresh.dealerId, userId: fresh.id },
        {
          action: "user.login",
          entityType: "user",
          entityId: fresh.id,
          after: { method: "password" },
        },
      ).catch(() => undefined);
    }

    return { user: toPublicUser(fresh), tokens };
  },

  /**
   * Exchange a refresh token for a new access + refresh pair.
   */
  async refresh(
    app: FastifyInstance,
    refreshToken: string,
  ): Promise<AuthTokens> {
    let payload: { userId: string };
    try {
      payload = await verifyToken<{ userId: string }>(app, refreshToken);
    } catch {
      throw new AuthError("Invalid refresh token");
    }

    // Blocklist check
    if (await tokenBlocklist.isBlocked(refreshToken)) {
      throw new AuthError("Refresh token revoked");
    }

    // We need the user across dealers (the refresh token only carries
    // userId), so use a direct lookup. This is a deliberate exception to
    // the tenant-scoped repository pattern.
    const { prisma } = await import("../utils/prisma.js");
    const direct = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!direct || direct.status === "DISABLED") {
      throw new AuthError("User no longer active");
    }

    return mintTokens(app, direct);
  },

  /**
   * Logout — blocklist the provided refresh token (and optionally an
   * access token from the Authorization header). Best-effort.
   */
  async logout(
    refreshToken: string | undefined,
    accessToken: string | undefined,
    auditCtx?: AuditContext,
  ): Promise<void> {
    if (refreshToken) {
      await tokenBlocklist.block(refreshToken, REFRESH_TTL_SECONDS);
    }
    if (accessToken) {
      await tokenBlocklist.block(accessToken, ACCESS_TTL_SECONDS);
    }
    if (auditCtx) {
      await logActivity(
        auditCtx,
        {
          action: "user.logout",
          entityType: "user",
          entityId: auditCtx.userId,
        },
      ).catch(() => undefined);
    }
  },

  /**
   * Invite a new user. Only ADMIN or MANAGER may invite. Returns the
   * invite token (in production, this would be emailed).
   */
  async invite(
    dealerId: string,
    inviter: { id: string; role: UserRole },
    body: InviteBody,
    auditCtx?: AuditContext,
  ): Promise<{ token: string; expiresInHours: number }> {
    if (inviter.role !== "ADMIN" && inviter.role !== "MANAGER") {
      throw new ForbiddenError("Only admins and managers can invite users");
    }

    // Managers can't invite admins
    if (inviter.role === "MANAGER" && body.role === "ADMIN") {
      throw new ForbiddenError("Managers cannot invite admins");
    }

    const existing = await userRepository.findByEmailInDealer(
      dealerId,
      body.email,
    );
    if (existing) {
      throw new ConflictError("A user with this email already exists in your dealer");
    }

    const token = await inviteRepository.create(dealerId, {
      email: body.email,
      name: body.name,
      role: body.role,
      phone: body.phone ?? null,
    });

    if (auditCtx) {
      await logActivity(
        { ...auditCtx, dealerId, userId: inviter.id },
        {
          action: "user.invited",
          entityType: "user",
          after: {
            email: body.email,
            name: body.name,
            role: body.role,
            phone: body.phone ?? null,
            invitedBy: inviter.id,
          },
        },
      ).catch(() => undefined);
    }

    return { token, expiresInHours: 72 };
  },

  /**
   * Accept an invite — create the user, set their password, activate,
   * mint tokens.
   */
  async acceptInviteWithApp(
    app: FastifyInstance,
    dealerId: string,
    body: AcceptInviteBody,
    auditCtx?: AuditContext,
  ): Promise<LoginResult> {
    if (!body.token || body.token.length < 10) {
      throw new ValidationError("Invalid invite token");
    }

    const payload = await inviteRepository.consume(dealerId, body.token);

    const existing = await userRepository.findByEmailInDealer(
      dealerId,
      payload.email,
    );
    if (existing) {
      throw new ConflictError("User already exists for this email");
    }

    const passwordHash = await hashPassword(body.password);

    const { prisma } = await import("../utils/prisma.js");
    const user = await prisma.user.create({
      data: {
        dealerId,
        email: payload.email,
        name: body.name ?? payload.name,
        passwordHash,
        role: payload.role as UserRole,
        phone: payload.phone,
        status: "ACTIVE",
        invitedAt: new Date(),
      },
    });

    const tokens = await mintTokens(app, user);

    if (auditCtx) {
      await logActivity(
        { ...auditCtx, dealerId, userId: user.id },
        {
          action: "user.invited",
          entityType: "user",
          entityId: user.id,
          after: {
            email: payload.email,
            role: payload.role,
            accepted: true,
          },
        },
      ).catch(() => undefined);
    }

    return { user: toPublicUser(user), tokens };
  },

  toPublicUser,
};

export { toPublicUser };
