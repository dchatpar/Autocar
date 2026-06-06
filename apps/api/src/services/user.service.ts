/**
 * User service — business logic for the user-management endpoints.
 *
 * Encapsulates the RBAC rules and the "no self-demote" guard, then
 * delegates persistence to the user repository.
 */

import type { User, UserRole } from "@prisma/client";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { userRepository, type UpdateUserInput } from "../repositories/user.repository.js";
import { toPublicUser, type PublicUser } from "./auth.service.js";
import { logActivity, type AuditContext } from "./activity-logger.service.js";
import type {
  ListUsersQuery,
  UpdateUserBody,
} from "../schemas/auth.schema.js";

export interface ListUsersResult {
  items: PublicUser[];
  pagination: { hasMore: boolean; cursor: string | null };
}

export const userService = {
  async list(
    dealerId: string,
    query: ListUsersQuery,
  ): Promise<ListUsersResult> {
    const args: Parameters<typeof userRepository.list>[0] = {
      dealerId,
      limit: query.limit,
    };
    if (query.cursor !== undefined) args.cursor = query.cursor;
    if (query.role !== undefined) args.role = query.role;
    if (query.status !== undefined) args.status = query.status;
    if (query.search !== undefined) args.search = query.search;

    const { items, hasMore, nextCursor } = await userRepository.list(args);
    return {
      items: items.map(toPublicUser),
      pagination: { hasMore, cursor: nextCursor },
    };
  },

  async getById(dealerId: string, id: string): Promise<PublicUser> {
    const user = await userRepository.findById(dealerId, id);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return toPublicUser(user);
  },

  async update(
    dealerId: string,
    actor: { id: string; role: UserRole },
    targetId: string,
    body: UpdateUserBody,
    auditCtx?: AuditContext,
  ): Promise<PublicUser> {
    const target = await userRepository.findById(dealerId, targetId);
    if (!target) {
      throw new NotFoundError("User not found");
    }

    const isSelf = actor.id === targetId;
    const isAdmin = actor.role === "ADMIN";
    const isManager = actor.role === "MANAGER";

    // Non-admins can only update themselves
    if (!isAdmin && !isManager && !isSelf) {
      throw new ForbiddenError("You can only update your own profile");
    }

    // Managers cannot change anyone's role to ADMIN
    if (isManager && body.role === "ADMIN" && target.role !== "ADMIN") {
      throw new ForbiddenError("Managers cannot promote to admin");
    }

    // Self-edit: if changing own role or status, require admin
    if (isSelf && !isAdmin) {
      if (body.role !== undefined || body.status !== undefined) {
        throw new ForbiddenError("Only admins can change your role or status");
      }
    }

    // If non-admin is updating someone else (e.g. manager updating a sales
    // person), they cannot change role or status either.
    if (!isAdmin && !isSelf && (body.role !== undefined || body.status !== undefined)) {
      throw new ForbiddenError("Only admins can change role or status");
    }

    // Build the update input
    const input: UpdateUserInput = {};
    if (body.name !== undefined) input.name = body.name;
    if (body.phone !== undefined) input.phone = body.phone;
    if (body.role !== undefined) input.role = body.role;
    if (body.status !== undefined) input.status = body.status;
    if (body.permissions !== undefined) input.permissions = body.permissions;

    // Capture role change BEFORE the update so we can emit a
    // dedicated `user.role_changed` audit event for the anomaly
    // detector to consume (in addition to the wrapper's user.updated).
    const roleChanged = body.role !== undefined && body.role !== target.role;

    const updated = await userRepository.update(dealerId, targetId, input);
    if (!updated) {
      throw new NotFoundError("User not found or update failed");
    }

    if (roleChanged && auditCtx) {
      await logActivity(
        { ...auditCtx, dealerId, userId: actor.id },
        {
          action: "user.role_changed",
          entityType: "user",
          entityId: targetId,
          before: { role: target.role },
          after: { role: updated.role },
          metadata: { changedBy: actor.id, targetId },
        },
      ).catch(() => undefined);
    }

    return toPublicUser(updated);
  },

  /**
   * Soft delete — set status to DISABLED. Only admins may delete users.
   * Managers cannot delete at all.
   */
  async softDelete(
    dealerId: string,
    actor: { id: string; role: UserRole },
    targetId: string,
  ): Promise<void> {
    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("Only admins can delete users");
    }
    if (actor.id === targetId) {
      throw new ValidationError("You cannot delete your own account");
    }

    const target = await userRepository.findById(dealerId, targetId);
    if (!target) {
      throw new NotFoundError("User not found");
    }
    if (target.status === "DISABLED") {
      throw new ConflictError("User is already disabled");
    }

    const ok = await userRepository.softDelete(dealerId, targetId);
    if (!ok) {
      throw new NotFoundError("User not found or could not be deleted");
    }
  },
};

/* ============================================================
 * Helper exports for routes (not part of public service surface)
 * ============================================================ */

export async function changeOwnPassword(
  dealerId: string,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await userRepository.findById(dealerId, userId);
  if (!user || !user.passwordHash) {
    throw new NotFoundError("User not found");
  }
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    throw new ForbiddenError("Current password is incorrect");
  }
  const passwordHash = await hashPassword(newPassword);
  await userRepository.update(dealerId, userId, { passwordHash });
}

export type { User };
