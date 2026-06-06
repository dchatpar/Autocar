/**
 * Calendar Service — business logic for calendar event mutations.
 *
 * Multi-tenant: every Prisma call carries `dealerId`. Calendar events are
 * general-purpose and can be tied to CRM entities or stand alone.
 */

import { CalendarEvent, CalendarEventType, Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { NotFoundError } from "../utils/errors.js";

export interface CreateCalendarEventInput {
  dealerId: string;
  title: string;
  description?: string | null;
  type?: CalendarEventType;
  start: Date;
  end: Date;
  allDay?: boolean;
  entityType?: string | null;
  entityId?: string | null;
  color?: string | null;
  location?: string | null;
  userId?: string | null;
  reminderAt?: Date | null;
}

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string | null;
  type?: CalendarEventType;
  start?: Date;
  end?: Date;
  allDay?: boolean;
  entityType?: string | undefined;
  entityId?: string | undefined;
  color?: string | null;
  location?: string | null;
  userId?: string | null;
  reminderAt?: Date | null;
}

export interface ListCalendarEventFilters {
  start: Date;
  end: Date;
  userId?: string | null;
  type?: CalendarEventType | null;
  entityType?: string | null;
  entityId?: string | null;
  limit: number;
  cursor?: string | null;
}

export const calendarService = {
  /**
   * Create a calendar event.
   */
  async create(input: CreateCalendarEventInput): Promise<CalendarEvent> {
    return prisma.calendarEvent.create({
      data: {
        dealerId: input.dealerId,
        title: input.title,
        description: input.description ?? null,
        type: input.type ?? "MEETING",
        start: input.start,
        end: input.end,
        allDay: input.allDay ?? false,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        color: input.color ?? "#6366f1",
        location: input.location ?? null,
        userId: input.userId ?? null,
        reminderAt: input.reminderAt ?? null,
      },
    });
  },

  /**
   * List events in a date range with cursor pagination.
   * Used for month/week/day views.
   */
  async listEvents(
    dealerId: string,
    filters: ListCalendarEventFilters,
  ): Promise<{ data: CalendarEvent[]; pagination: { hasMore: boolean; cursor: string | null } }> {
    const where: Prisma.CalendarEventWhereInput = {
      dealerId,
      start: { gte: filters.start },
      end: { lte: filters.end },
    };

    if (filters.userId) where.userId = filters.userId;
    if (filters.type) where.type = filters.type;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;

    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: { start: "asc" },
      take: filters.limit + 1,
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    });

    const hasMore = events.length > filters.limit;
    if (hasMore) events.pop();
    const cursor = hasMore && events.length > 0 ? events[events.length - 1]?.id ?? null : null;

    return { data: events, pagination: { hasMore, cursor } };
  },

  /**
   * Get a single event by ID. Throws NotFoundError if not found or wrong dealer.
   */
  async getById(dealerId: string, eventId: string): Promise<CalendarEvent> {
    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, dealerId },
    });
    if (!event) throw new NotFoundError("Calendar event not found");
    return event;
  },

  /**
   * Update a calendar event.
   */
  async update(
    dealerId: string,
    eventId: string,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEvent> {
    await this.getById(dealerId, eventId); // Guard

    const updateData: Prisma.CalendarEventUpdateInput = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.start !== undefined) updateData.start = input.start;
    if (input.end !== undefined) updateData.end = input.end;
    if (input.allDay !== undefined) updateData.allDay = input.allDay;
    if (input.entityType !== undefined) updateData.entityType = input.entityType;
    if (input.entityId !== undefined) updateData.entityId = input.entityId;
    if (input.color !== undefined) updateData.color = input.color ?? undefined;
    if (input.location !== undefined) updateData.location = input.location ?? undefined;
    if (input.userId !== undefined) updateData.userId = input.userId;
    if (input.reminderAt !== undefined) updateData.reminderAt = input.reminderAt;

    return prisma.calendarEvent.update({ where: { id: eventId }, data: updateData });
  },

  /**
   * Delete a calendar event.
   */
  async delete(dealerId: string, eventId: string): Promise<void> {
    const result = await prisma.calendarEvent.deleteMany({
      where: { id: eventId, dealerId },
    });
    if (result.count === 0) throw new NotFoundError("Calendar event not found");
  },
};

export default calendarService;
