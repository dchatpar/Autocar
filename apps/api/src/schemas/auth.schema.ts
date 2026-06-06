/**
 * Zod schemas for the auth + user-management endpoints.
 *
 * All bodies are validated through these schemas (via the `validateBody`
 * helper) before reaching services. Same for query parameters and route
 * params.
 */

import { z } from "zod";

/* ============================================================
 * Shared
 * ============================================================ */

export const UserRoleSchema = z.enum([
  "ADMIN",
  "MANAGER",
  "SALES",
  "BDC",
  "FINANCE",
]);

export const UserStatusSchema = z.enum(["ACTIVE", "INVITED", "DISABLED"]);

const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address");

const SubdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Subdomain too short")
  .max(40, "Subdomain too long")
  .regex(/^[a-z0-9-]+$/, "Subdomain must be lowercase alphanumeric with hyphens");

/* ============================================================
 * /auth/register — create dealer + first admin user
 * ============================================================ */

export const RegisterBodySchema = z.object({
  dealer: z.object({
    name: z.string().trim().min(2).max(120),
    subdomain: SubdomainSchema,
  }),
  user: z.object({
    email: EmailSchema,
    name: z.string().trim().min(1).max(120),
    password: PasswordSchema,
  }),
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

/* ============================================================
 * /auth/login
 * ============================================================ */

export const LoginBodySchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

/* ============================================================
 * /auth/refresh
 * ============================================================ */

export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(10, "Invalid refresh token"),
});
export type RefreshBody = z.infer<typeof RefreshBodySchema>;

/* ============================================================
 * /auth/logout
 * ============================================================ */

export const LogoutBodySchema = z
  .object({
    refreshToken: z.string().min(10).optional(),
  })
  .default({});
export type LogoutBody = z.infer<typeof LogoutBodySchema>;

/* ============================================================
 * /auth/invite
 * ============================================================ */

export const InviteBodySchema = z.object({
  email: EmailSchema,
  name: z.string().trim().min(1).max(120),
  role: UserRoleSchema,
  phone: z.string().trim().min(7).max(32).optional(),
});
export type InviteBody = z.infer<typeof InviteBodySchema>;

export const AcceptInviteBodySchema = z.object({
  token: z.string().min(10, "Invalid invite token"),
  dealerId: z.string().min(1, "dealerId is required"),
  password: PasswordSchema,
  name: z.string().trim().min(1).max(120).optional(),
});
export type AcceptInviteBody = z.infer<typeof AcceptInviteBodySchema>;

/* ============================================================
 * Users — list/get/update/delete
 * ============================================================ */

export const ListUsersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  role: UserRoleSchema.optional(),
  status: UserStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const UserIdParamSchema = z.object({
  id: z.string().min(1, "User id is required"),
});

export const UpdateUserBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(7).max(32).nullable().optional(),
    role: UserRoleSchema.optional(),
    status: UserStatusSchema.optional(),
    permissions: z.array(z.string()).max(64).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.phone !== undefined ||
      v.role !== undefined ||
      v.status !== undefined ||
      v.permissions !== undefined,
    { message: "No updatable fields provided" },
  );
export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;

/* ============================================================
 * Dealer
 * ============================================================ */

export const UpdateDealerBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .refine((v) => v.name !== undefined || v.settings !== undefined, {
    message: "No updatable fields provided",
  });
export type UpdateDealerBody = z.infer<typeof UpdateDealerBodySchema>;
