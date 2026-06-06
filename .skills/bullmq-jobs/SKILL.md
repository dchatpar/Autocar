# BullMQ Background Jobs Skill

Build reliable background job processing for DealerOS.

## When to use this skill

When building features that need async, scheduled, or retryable background work:
- Email/SMS send queue
- Image processing (resize, optimize, AI quality score)
- VIN decode + data enrichment
- Meta/WhatsApp webhook retries
- Inventory syndication to AutoTrader/CarGurus/Kijiji
- NOVA agent LangGraph runs
- Calendar reminders
- Report generation
- Daily digests (aged inventory, BHPH payment reminders)

## BullMQ Setup

```typescript
import { Queue, Worker, QueueEvents, type Processor } from 'bullmq';
import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,  // required for BullMQ
  enableReadyCheck: false
});

// Queue
const emailQueue = new Queue('email', { connection: redis });
const smsQueue = new Queue('sms', { connection: redis });
const imageQueue = new Queue('images', { connection: redis });

// Worker
const emailWorker = new Worker('email', async (job) => {
  const { to, subject, html, dealerId } = job.data;
  await sendEmail(to, subject, html, dealerId);
}, {
  connection: redis,
  concurrency: 10,
  limiter: { max: 100, duration: 60_000 }  // 100 jobs per minute
});

// Event listeners
const emailEvents = new QueueEvents('email', { connection: redis });
emailEvents.on('completed', ({ jobId }) => logger.info('Email sent', { jobId }));
emailEvents.on('failed', ({ jobId, failedReason }) => logger.error('Email failed', { jobId, failedReason }));
```

## Job Scheduling Patterns

### Immediate async work
```typescript
await emailQueue.add('send', { to, subject, html }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400, count: 1000 },  // 24h or 1000
  removeOnFail: { age: 7 * 86400 }  // 7 days
});
```

### Scheduled (delayed)
```typescript
// Send reminder 24 hours before appointment
await emailQueue.add('reminder', { appointmentId, customerId }, {
  delay: appointment.scheduledAt.getTime() - 24 * 60 * 60 * 1000 - Date.now(),
  jobId: `reminder-${appointmentId}-24h`  // idempotency
});

// Send reminder 2 hours before
await emailQueue.add('reminder', { appointmentId, customerId }, {
  delay: appointment.scheduledAt.getTime() - 2 * 60 * 60 * 1000 - Date.now(),
  jobId: `reminder-${appointmentId}-2h`
});
```

### Recurring (cron)
```typescript
// Daily aged inventory report at 8am
await emailQueue.add('aged-inventory-report', { dealerId }, {
  repeat: { pattern: '0 8 * * *', tz: 'America/Los_Angeles' },
  jobId: 'aged-inventory-daily'
});

// Every 15 minutes: check for new leads
await leadQueue.add('process-new-leads', {}, {
  repeat: { pattern: '*/15 * * * *' }
});
```

### Fan-out (one trigger, many jobs)
```typescript
// Bulk import: 1 trigger, 1000 jobs
const jobs = records.map((record, i) => ({
  name: 'import-row',
  data: { rowIndex: i, record },
  opts: { jobId: `import-${batchId}-${i}` }  // idempotency
}));
await importQueue.addBulk(jobs);
```

## Retry & Failure Handling

```typescript
const worker = new Worker('webhook', async (job) => {
  const { payload } = job.data;
  // If throws, BullMQ retries per `attempts` and `backoff`
  await processWebhook(payload);
}, {
  connection: redis,
  concurrency: 5,
  settings: {
    backoffStrategy: (attemptsMade) => {
      // Exponential: 1s, 2s, 4s, 8s, 16s
      return Math.min(30000, Math.pow(2, attemptsMade) * 1000);
    }
  }
});

// Dead letter queue
worker.on('failed', async (job, err) => {
  if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
    // Move to DLQ for manual review
    await dlqQueue.add('webhook-failed', { 
      originalJob: job.data, 
      error: err.message 
    });
  }
});
```

## Job Priorities

```typescript
// High priority: user-facing
await emailQueue.add('send', data, { priority: 1 });

// Low priority: background batch
await emailQueue.add('campaign', data, { priority: 10 });
```

Lower number = higher priority.

## Flow Producer-Consumer

```typescript
// Image upload job
const job = await imageQueue.add('process-vehicle-photo', {
  vehicleId, s3Key, dealerId
});

// Get result (with timeout)
const result = await job.finished({ timeout: 30000 });
// Returns: { processed: true, cdnUrl, aiScore }
```

## Observability

Use Bull Board for visual monitoring:
```typescript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(smsQueue), new BullMQAdapter(imageQueue)],
  serverAdapter
});

app.use('/admin/queues', serverAdapter.getRouter());
```

Accessible at `/admin/queues` (admin-only).

## Common Job Types for DealerOS

| Queue | Job Types |
|---|---|
| `email` | send, campaign, template-render, bounce-handler |
| `sms` | send, bulk-send, delivery-receipt |
| `webhook` | meta-lead, whatsapp-inbound, twilio-status, sendgrid-event |
| `images` | process-photo, generate-thumbnails, ai-quality-score, background-removal |
| `inventory` | vin-decode, syndicate-to-autotrader, syndicate-to-cargurus, syndicate-to-fb |
| `agents` | nova-respond, score-lead, vin-gpt-listing, revive-sequence, pulse-weekly |
| `calendar` | reminder-24h, reminder-2h, followup-due |
| `reports` | generate-sales-summary, generate-inventory-aging, export-pdf |
| `finance` | aged-inventory-daily, bhph-payment-due, monthly-digest |

## Reference

- https://docs.bullmq.io/
- https://github.com/felixmosh/bull-board
