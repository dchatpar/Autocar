/**
 * Task Service — business logic for task mutations.
 *
 * Multi-tenant: every Prisma call carries `dealerId`. Tasks are scoped
 * to the authenticated dealer's tenant. The `createdById` is always set
 * to the requesting user from the JWT; `assignedToId` is optional.
 */

import type { Prisma, Task, TaskPriority, TaskStatus, TaskType } from "@prisma/client";

import { prisma } from "../utils/prisma.js";
import { NotFoundError } from "../utils/errors.js";
import { withAuditContext, logActivity, type AuditContext } from "./activity-logger.service.js";
import { realtimeService } from "./realtime.service.js";

export interface CreateTaskInput {
  dealerId: string;
  createdById: string;
  title: string;
  description?: string | null;
  type?: TaskType;
  priority?: TaskPriority;
  dueAt?: Date | null;
  assignedToId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueAt?: Date | null;
  assignedToId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
}

export interface ListTaskFilters {
  assigneeId?: string | null;
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
  type?: TaskType | null;
  dueBefore?: Date | null;
  dueAfter?: Date | null;
  leadId?: string | null;
  customerId?: string | null;
  limit: number;
  cursor?: string | null;
}

export const taskService = {
  /**
   * Create a new task.
   */
  async create(ctx: AuditContext, input: CreateTaskInput): Promise<Task> {
    const task = await prisma.task.create({
      data: {
        dealerId: input.dealerId,
        createdById: input.createdById,
        title: input.title,
        description: input.description ?? null,
        type: input.type ?? "FOLLOW_UP",
        priority: input.priority ?? "MEDIUM",
        status: "OPEN",
        dueAt: input.dueAt ?? null,
        assignedToId: input.assignedToId ?? null,
        leadId: input.leadId ?? null,
        customerId: input.customerId ?? null,
      },
    });

    await logActivity(ctx, {
      action: "task.created",
      entityType: "task",
      entityId: task.id,
      after: { id: task.id, title: task.title, assignedToId: task.assignedToId },
    });

    const dealerSettings = await prisma.dealer
      .findUnique({ where: { id: input.dealerId }, select: { settings: true } })
      .then((d) => d?.settings);
    realtimeService.emitTaskCreated(input.dealerId, task as unknown as Record<string, unknown>, dealerSettings ?? undefined);

    return task;
  },

  /**
   * List tasks for a dealer with filters and cursor pagination.
   */
  async list(
    dealerId: string,
    filters: ListTaskFilters,
  ): Promise<{ data: Task[]; pagination: { hasMore: boolean; cursor: string | null } }> {
    const where: Prisma.TaskWhereInput = { dealerId };

    if (filters.assigneeId) where.assignedToId = filters.assigneeId;
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.type) where.type = filters.type;
    if (filters.leadId) where.leadId = filters.leadId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.dueBefore) where.dueAt = { lte: new Date(filters.dueBefore) };
    if (filters.dueAfter) {
      where.dueAt = where.dueAt
        ? { ...(where.dueAt as Prisma.DateTimeFilter), gte: new Date(filters.dueAfter) }
        : { gte: new Date(filters.dueAfter) };
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit + 1,
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    });

    const hasMore = tasks.length > filters.limit;
    if (hasMore) tasks.pop();
    const cursor = hasMore && tasks.length > 0 ? (tasks[tasks.length - 1]?.id ?? null) : null;

    return { data: tasks, pagination: { hasMore, cursor } };
  },

  /**
   * Get a single task by ID. Throws NotFoundError if not found or wrong dealer.
   */
  async getById(dealerId: string, taskId: string): Promise<Task> {
    const task = await prisma.task.findFirst({
      where: { id: taskId, dealerId },
    });
    if (!task) throw new NotFoundError("Task not found");
    return task;
  },

  /**
   * Update a task. Throws NotFoundError if not found or wrong dealer.
   */
  async update(
    ctx: AuditContext,
    dealerId: string,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<Task> {
    const existing = await this.getById(dealerId, taskId);

    const updateData: Prisma.TaskUpdateInput = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === "COMPLETED") updateData.completedAt = new Date();
    }
    if (input.dueAt !== undefined) updateData.dueAt = input.dueAt;
    if (input.assignedToId !== undefined) updateData.assignedTo = input.assignedToId === null ? { disconnect: true } : { connect: { id: input.assignedToId } };
    if (input.leadId !== undefined) updateData.lead = input.leadId === null ? { disconnect: true } : { connect: { id: input.leadId } };
    if (input.customerId !== undefined) updateData.customer = input.customerId === null ? { disconnect: true } : { connect: { id: input.customerId } };

    const updated = await withAuditContext(ctx, prisma).task.update({
      where: { id: taskId },
      data: updateData,
    });

    await logActivity(ctx, {
      action: "task.updated",
      entityType: "task",
      entityId: taskId,
      before: { title: existing.title },
      after: { title: updated.title },
    });

    const dealerSettings = await prisma.dealer
      .findUnique({ where: { id: dealerId }, select: { settings: true } })
      .then((d) => d?.settings);
    realtimeService.emitTaskUpdated(dealerId, updated as unknown as Record<string, unknown>, dealerSettings ?? undefined);

    return updated;
  },

  /**
   * Update task status (complete/reopen/cancel).
   */
  async updateStatus(
    ctx: AuditContext,
    dealerId: string,
    taskId: string,
    status: TaskStatus,
  ): Promise<Task> {
    const existing = await this.getById(dealerId, taskId);

    const updateData: Prisma.TaskUpdateInput = { status };
    if (status === "COMPLETED") updateData.completedAt = new Date();
    if (status === "OPEN") updateData.completedAt = null;

    const updated = await withAuditContext(ctx, prisma).task.update({
      where: { id: taskId },
      data: updateData,
    });

    await logActivity(ctx, {
      action: status === "COMPLETED" ? "task.completed" : "task.reopened",
      entityType: "task",
      entityId: taskId,
      after: { status },
    });

    const dealerSettings = await prisma.dealer
      .findUnique({ where: { id: dealerId }, select: { settings: true } })
      .then((d) => d?.settings);
    realtimeService.emitTaskUpdated(dealerId, updated as unknown as Record<string, unknown>, dealerSettings ?? undefined);

    return updated;
  },

  /**
   * Delete a task. Throws NotFoundError if not found or wrong dealer.
   */
  async delete(
    ctx: AuditContext,
    dealerId: string,
    taskId: string,
  ): Promise<void> {
    const existing = await this.getById(dealerId, taskId);

    await withAuditContext(ctx, prisma).task.delete({ where: { id: taskId } });

    await logActivity(ctx, {
      action: "task.deleted",
      entityType: "task",
      entityId: taskId,
      before: { title: existing.title },
    });
  },
};

export default taskService;
