/**
 * Ticket schemas — Zod validation for /tickets/*
 */

import { z } from "zod";

export const TicketPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const TicketStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

export const CreateTicketBodySchema = z.object({
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(5000),
  priority: TicketPrioritySchema.default("MEDIUM"),
  category: z.string().max(100).optional(),
  assignedToId: z.string().cuid().optional(),
});

export const UpdateTicketBodySchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  body: z.string().min(1).max(5000).optional(),
  priority: TicketPrioritySchema.optional(),
  category: z.string().max(100).optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
});

export const PatchTicketStatusBodySchema = z.object({
  status: TicketStatusSchema,
});

export const CreateTicketResponseBodySchema = z.object({
  body: z.string().min(1).max(5000),
  isInternal: z.boolean().default(false),
});

export const ListTicketsQuerySchema = z.object({
  status: TicketStatusSchema.optional(),
  priority: TicketPrioritySchema.optional(),
  customerId: z.string().cuid().optional(),
  assigneeId: z.string().cuid().optional(),
  category: z.string().max(100).optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const TicketIdParamsSchema = z.object({
  id: z.string().cuid(),
});

export type CreateTicketBody = z.infer<typeof CreateTicketBodySchema>;
export type UpdateTicketBody = z.infer<typeof UpdateTicketBodySchema>;
export type PatchTicketStatusBody = z.infer<typeof PatchTicketStatusBodySchema>;
export type CreateTicketResponseBody = z.infer<typeof CreateTicketResponseBodySchema>;
export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;
export type TicketIdParams = z.infer<typeof TicketIdParamsSchema>;
