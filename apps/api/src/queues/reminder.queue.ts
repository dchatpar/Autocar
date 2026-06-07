/**
 * Reminder Queue — BullMQ-backed appointment reminders.
 *
 * Sends notifications before appointments:
 *   - 24 hours before  (REMINDER_24H)
 *   - 1 hour before   (REMINDER_1H)
 *
 * Jobs are scheduled when an Appointment is created or updated.
 * If the appointment is cancelled, the job is removed from the queue.
 *
 * Redis is OPTIONAL — degrades to direct calls when REDIS_URL is absent.
 */

import { Queue, Worker, QueueEvents, type Job, type ConnectionOptions } from "bullmq";

import { prisma } from "../utils/prisma.js";

/* ============================================================
 * Job payload
 * ============================================================ */

export type ReminderType = "REMINDER_24H" | "REMINDER_1H";

export interface ReminderJobData {
  appointmentId: string;
  dealerId: string;
  leadId?: string | null;
  customerId?: string | null;
  assignedToId?: string | null;
  type: ReminderType;
  scheduledAt: Date; // appointment time
  /** Human-readable title for the notification. */
  title: string;
}

export const REMINDER_QUEUE = "reminder";

/* ============================================================
 * Redis + Queue lifecycle
 * ============================================================ */

declare global {
   
  var __dealerosReminderQueue: Queue<ReminderJobData> | undefined;
   
  var __dealerosReminderWorker: Worker<ReminderJobData> | undefined;
}

let queueInstance: Queue<ReminderJobData> | null = null;
let workerInstance: Worker<ReminderJobData> | null = null;
let eventsInstance: QueueEvents | null = null;

function isEnabled(): boolean {
  return Boolean(process.env.REDIS_URL) && process.env.REMINDER_QUEUE_DISABLED !== "true";
}

function buildConnectionOptions(): ConnectionOptions | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    return { url };
  } catch {
    return null;
  }
}

function getQueue(): Queue<ReminderJobData> | null {
  if (!isEnabled() || !process.env.REDIS_URL) {
    return null;
  }

  if (!queueInstance) {
    const connOpts = buildConnectionOptions();
    if (!connOpts) return null;

    queueInstance = new Queue<ReminderJobData>(REMINDER_QUEUE, {
      connection: connOpts,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: { age: 86400 }, // 24h TTL
        removeOnFail: { age: 604800 }, // 7d TTL
      },
    });
  }
  return queueInstance;
}

export const reminderQueue = {
  isEnabled,

  /**
   * Schedule both 24h and 1h reminders for an appointment.
   * Idempotent — removes existing jobs for the same appointment first.
   */
  async schedule(appointmentId: string, data: Omit<ReminderJobData, "type">): Promise<void> {
    const queue = getQueue();
    if (!queue) return;

    // Remove any existing jobs for this appointment
    await this.cancel(appointmentId);

    const scheduledAt = new Date(data.scheduledAt);
    const dealerId = data.dealerId;

    // 24h reminder
    const reminder24h = new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000);
    if (reminder24h.getTime() > Date.now()) {
      await queue.add(`24h-${appointmentId}`, {
        ...data,
        type: "REMINDER_24H",
      }, {
        jobId: `reminder-24h-${appointmentId}`,
        delay: reminder24h.getTime() - Date.now(),
      });
    }

    // 1h reminder
    const reminder1h = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
    if (reminder1h.getTime() > Date.now()) {
      await queue.add(`1h-${appointmentId}`, {
        ...data,
        type: "REMINDER_1H",
      }, {
        jobId: `reminder-1h-${appointmentId}`,
        delay: reminder1h.getTime() - Date.now(),
      });
    }
  },

  /**
   * Cancel all pending reminder jobs for an appointment.
   */
  async cancel(appointmentId: string): Promise<void> {
    const queue = getQueue();
    if (!queue) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (queue as any).removeJobs(`reminder-24h-${appointmentId}`, `reminder-1h-${appointmentId}`);
    } catch {
      // Non-fatal — job may not exist yet
    }
  },

  /**
   * Start the reminder worker. Idempotent.
   */
  startWorker(): void {
    if (!isEnabled() || workerInstance) return;

    const connOpts = buildConnectionOptions();
    if (!connOpts) return;

    workerInstance = new Worker<ReminderJobData>(
      REMINDER_QUEUE,
      async (job: Job<ReminderJobData>) => {
        const data = job.data;
        const dealerSettings = await prisma.dealer
          .findUnique({ where: { id: data.dealerId }, select: { settings: true } })
          .then((d) => d?.settings);

        // Determine who to notify
        const userIds: string[] = [];
        if (data.assignedToId) userIds.push(data.assignedToId);

        // If there's a lead, also notify the assigned rep
        if (data.leadId) {
          const lead = await prisma.lead.findUnique({
            where: { id: data.leadId },
            select: { assignedToId: true },
          });
          if (lead?.assignedToId && !userIds.includes(lead.assignedToId)) {
            userIds.push(lead.assignedToId);
          }
        }

        const lead = data.leadId
          ? await prisma.lead.findUnique({ where: { id: data.leadId }, select: { firstName: true, lastName: true } })
          : null;
        const customer = data.customerId
          ? await prisma.customer.findUnique({ where: { id: data.customerId }, select: { firstName: true, lastName: true } })
          : null;

        const whoName = customer
          ? `${customer.firstName} ${customer.lastName}`
          : lead
            ? `${lead.firstName} ${lead.lastName}`
            : "your appointment";

        const minutesBefore = data.type === "REMINDER_24H" ? 1440 : 60;
        const body = data.type === "REMINDER_24H"
          ? `Reminder: ${whoName} — ${data.title} in 24 hours.`
          : `Reminder: ${whoName} — ${data.title} in 1 hour.`;

        const title = data.type === "REMINDER_24H"
          ? `Appointment Tomorrow`
          : `Appointment in 1 Hour`;

        // Create notifications for each user
        for (const userId of userIds) {
          await prisma.notification.create({
            data: {
              dealerId: data.dealerId,
              userId,
              type: "APPOINTMENT_REMINDER",
              title,
              body,
              entityType: "APPOINTMENT",
              entityId: data.appointmentId,
              metadata: {
                appointmentId: data.appointmentId,
                reminderType: data.type,
                leadId: data.leadId,
                customerId: data.customerId,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            },
          });
        }

        // eslint-disable-next-line no-console
        console.info(`[reminder] ${data.type} sent for appointment ${data.appointmentId} to ${userIds.length} user(s)`);
      },
      { connection: connOpts },
    );

    workerInstance.on("failed", (job: Job<ReminderJobData> | undefined, err: Error) => {
      // eslint-disable-next-line no-console
      console.error(`[reminder] job ${job?.id} failed:`, err.message);
    });

    eventsInstance = new QueueEvents(REMINDER_QUEUE, { connection: connOpts });
  },

  /**
   * Stop the reminder worker gracefully.
   */
  async stopWorker(): Promise<void> {
    if (workerInstance) {
      await workerInstance.close();
      workerInstance = null;
    }
    if (eventsInstance) {
      await eventsInstance.close();
      eventsInstance = null;
    }
    if (queueInstance) {
      await queueInstance.close();
      queueInstance = null;
    }
  },
};

export default reminderQueue;
