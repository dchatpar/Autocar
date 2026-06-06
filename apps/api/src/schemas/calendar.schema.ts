/**
 * Calendar schemas — Zod validation for /calendar/*
 */

import { z } from "zod";

export const CalendarEventTypeSchema = z.enum([
  "MEETING",
  "SHOWING",
  "SERVICE",
  "TEAM_EVENT",
  "COMPANY_HOLIDAY",
  "TRAINING",
  "REMINDER",
  "BLOCKED_TIME",
]);

export const CreateCalendarEventBodySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  type: CalendarEventTypeSchema.default("MEETING"),
  start: z.string().datetime(),
  end: z.string().datetime(),
  allDay: z.boolean().default(false),
  entityType: z.enum(["LEAD", "CUSTOMER", "VEHICLE", "DEAL", "APPOINTMENT"]).optional(),
  entityId: z.string().cuid().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  location: z.string().max(255).optional(),
  userId: z.string().cuid().optional(),
  reminderAt: z.string().datetime().optional(),
});

export const UpdateCalendarEventBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  type: CalendarEventTypeSchema.optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  entityType: z.enum(["LEAD", "CUSTOMER", "VEHICLE", "DEAL", "APPOINTMENT"]).optional().nullable(),
  entityId: z.string().cuid().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  userId: z.string().cuid().optional().nullable(),
  reminderAt: z.string().datetime().optional().nullable(),
});

export const ListCalendarEventsQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  userId: z.string().cuid().optional(),
  type: CalendarEventTypeSchema.optional(),
  entityType: z.string().optional(),
  entityId: z.string().cuid().optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const CalendarEventIdParamsSchema = z.object({
  id: z.string().cuid(),
});

export type CreateCalendarEventBody = z.infer<typeof CreateCalendarEventBodySchema>;
export type UpdateCalendarEventBody = z.infer<typeof UpdateCalendarEventBodySchema>;
export type ListCalendarEventsQuery = z.infer<typeof ListCalendarEventsQuerySchema>;
export type CalendarEventIdParams = z.infer<typeof CalendarEventIdParamsSchema>;
