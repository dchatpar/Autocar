/**
 * Task schemas — Zod validation for /tasks/*
 */

import { z } from "zod";

export const TaskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const TaskStatusSchema = z.enum(["OPEN", "COMPLETED", "CANCELLED"]);
export const TaskTypeSchema = z.enum([
  "FOLLOW_UP",
  "CALL",
  "EMAIL",
  "MEETING",
  "DOCUMENT",
  "DELIVERY",
  "OTHER",
]);

export const CreateTaskBodySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  type: TaskTypeSchema.default("FOLLOW_UP"),
  priority: TaskPrioritySchema.default("MEDIUM"),
  dueAt: z.string().datetime().optional(),
  assignedToId: z.string().cuid().optional(),
  leadId: z.string().cuid().optional(),
  customerId: z.string().cuid().optional(),
});

export const UpdateTaskBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  type: TaskTypeSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  status: TaskStatusSchema.optional(),
  dueAt: z.string().datetime().optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
  leadId: z.string().cuid().optional().nullable(),
  customerId: z.string().cuid().optional().nullable(),
});

export const PatchTaskStatusBodySchema = z.object({
  status: TaskStatusSchema,
});

export const ListTasksQuerySchema = z.object({
  assigneeId: z.string().cuid().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  type: TaskTypeSchema.optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  leadId: z.string().cuid().optional(),
  customerId: z.string().cuid().optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const TaskIdParamsSchema = z.object({
  id: z.string().cuid(),
});

export type CreateTaskBody = z.infer<typeof CreateTaskBodySchema>;
export type UpdateTaskBody = z.infer<typeof UpdateTaskBodySchema>;
export type PatchTaskStatusBody = z.infer<typeof PatchTaskStatusBodySchema>;
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;
export type TaskIdParams = z.infer<typeof TaskIdParamsSchema>;
