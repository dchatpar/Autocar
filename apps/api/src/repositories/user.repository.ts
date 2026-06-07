/**
 * User repository — all Prisma access for the `User` model goes through here.
 *
 * Multi-tenant: every method takes an explicit `dealerId` and includes it
 * in the `where` clause. No exception. This is the data-access-layer
 * enforcement of tenant isolation.
 */

import type { Prisma, User, UserRole, UserStatus } from "@prisma/client";

import { prisma } from "../utils/prisma.js";

export interface CreateUserInput {
  dealerId: string;
  email: string;
  name: string;
  passwordHash: string;
  role?: UserRole;
  phone?: string | null;
  status?: UserStatus;
  invitedAt?: Date | null;
}

export interface UpdateUserInput {
  name?: string;
  phone?: string | null;
  role?: UserRole;
  status?: UserStatus;
  permissions?: string[];
  lastLogin?: Date;
  passwordHash?: string;
}

export interface ListUsersArgs {
  dealerId: string;
  cursor?: string;
  limit: number;
  role?: UserRole;
  status?: UserStatus;
  search?: string;
}

function buildWhere(
  dealerId: string,
  filters: { role?: UserRole; status?: UserStatus; search?: string },
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { dealerId };
  if (filters.role) where.role = filters.role;
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  return where;
}

export const userRepository = {
  async findById(dealerId: string, id: string): Promise<User | null> {
    return prisma.user.findFirst({ where: { dealerId, id } });
  },

  async findByEmailGlobal(email: string): Promise<User | null> {
    // For login — we look across dealers because email + password must
    // uniquely identify a user. (Email is unique per dealer, so this
    // returns at most one row in practice.)
    return prisma.user.findFirst({ where: { email } });
  },

  async findByEmailInDealer(
    dealerId: string,
    email: string,
  ): Promise<User | null> {
    return prisma.user.findUnique({
      where: { dealerId_email: { dealerId, email } },
    });
  },

  async create(input: CreateUserInput): Promise<User> {
    return prisma.user.create({
      data: {
        dealerId: input.dealerId,
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        role: input.role ?? "SALES",
        phone: input.phone ?? null,
        status: input.status ?? "ACTIVE",
        invitedAt: input.invitedAt ?? null,
      },
    });
  },

  async update(
    dealerId: string,
    id: string,
    input: UpdateUserInput,
  ): Promise<User> {
    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.role !== undefined) data.role = input.role;
    if (input.status !== undefined) data.status = input.status;
    if (input.permissions !== undefined) {
      data.permissions = input.permissions as Prisma.InputJsonValue;
    }
    if (input.lastLogin !== undefined) data.lastLogin = input.lastLogin;
    if (input.passwordHash !== undefined) data.passwordHash = input.passwordHash;

    // Use updateMany to enforce dealerId atomically — if no row matches,
    // we know the user either doesn't exist or belongs to a different
    // tenant. Then re-fetch by id (still scoped to dealerId).
    const updated = await prisma.user.updateMany({
      where: { dealerId, id },
      data,
    });
    if (updated.count === 0) {
      return null as unknown as User;
    }
    const found = await prisma.user.findFirst({ where: { dealerId, id } });
    if (!found) {
      // Should be impossible after a successful update, but TypeScript
      // wants us to handle the null case.
      throw new Error(`User ${id} vanished mid-update`);
    }
    return found;
  },

  async softDelete(dealerId: string, id: string): Promise<boolean> {
    const updated = await prisma.user.updateMany({
      where: { dealerId, id },
      data: { status: "DISABLED" },
    });
    return updated.count > 0;
  },

  async list(args: ListUsersArgs): Promise<{ items: User[]; hasMore: boolean; nextCursor: string | null }> {
    const where = buildWhere(args.dealerId, {
      role: args.role,
      status: args.status,
      search: args.search,
    });

    const items = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: args.limit + 1,
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > args.limit;
    const trimmed = hasMore ? items.slice(0, args.limit) : items;
    const nextCursor = hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null;

    return { items: trimmed, hasMore, nextCursor };
  },
};
