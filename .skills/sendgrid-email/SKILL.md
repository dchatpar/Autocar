# SendGrid Email & SMTP Skill

Build transactional and bulk email integration for DealerOS.

## When to use this skill

When building features that need:
- Transactional email (welcome, password reset, invite, deal documents)
- Bulk email (campaigns, newsletters, lead nurturing sequences)
- Email open/click tracking
- Bounce handling
- Unsubscribe management (CAN-SPAM, CASL)
- Templated emails with dynamic variables

## SendGrid Node SDK

```typescript
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// Send transactional
await sgMail.send({
  to: 'customer@example.com',
  from: { email: 'noreply@dealeros.com', name: 'DealerOS' },
  subject: 'Welcome to ABC Motors',
  html: '<h1>Welcome!</h1><p>Click <a href="...">here</a> to get started.</p>',
  text: 'Welcome! Click here: ...',
  categories: ['welcome', 'onboarding'],
  customArgs: { dealerId: 'abc-123', userId: 'u-456' },
  mailSettings: {
    sandboxMode: { enable: process.env.NODE_ENV === 'test' }
  }
});

// Send with template
await sgMail.send({
  to: 'customer@example.com',
  from: 'noreply@dealeros.com',
  templateId: 'd-abc123def456',
  dynamicTemplateData: {
    firstName: 'John',
    vehicleName: '2021 Ford Mustang',
    dealerName: 'ABC Motors',
    ctaUrl: 'https://...'
  }
});

// Send bulk with personalizations
await sgMail.send({
  from: 'campaigns@dealeros.com',
  subject: 'New arrivals at {{dealerName}}',
  templateId: 'd-bulk-template',
  personalizations: leads.map(lead => ({
    to: lead.email,
    dynamicTemplateData: { firstName: lead.firstName, ... }
  }))
});
```

## Webhook Event Tracking

```typescript
// Webhook endpoint for delivery, open, click, bounce events
app.post('/webhooks/sendgrid', express.raw({type: 'application/json'}), (req, res) => {
  // Verify signature
  const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
  if (!verifySendGridSignature(signature, timestamp, req.body, publicKey)) {
    return res.status(401).send();
  }
  
  const events = JSON.parse(req.body.toString());
  for (const event of events) {
    // event.event: 'delivered' | 'open' | 'click' | 'bounce' | 'spamreport' | 'unsubscribe'
    // event.sg_message_id, event.email, event.timestamp, event.url (for clicks)
    handleEvent(event);
  }
  res.status(200).send();
});
```

## SMTP Fallback (when SendGrid not available)

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,  // smtp.gmail.com, mailgun, etc.
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

await transporter.sendMail({
  from: '"DealerOS" <noreply@dealeros.com>',
  to: 'customer@example.com',
  subject: 'Hello',
  text: '...',
  html: '...'
});
```

## Email Templates

Common DealerOS templates to build:
- **welcome** — new dealer onboarding
- **invite** — invite team member with accept link
- **password-reset** — with 1-hour expiry token
- **lead-received** — auto to sales rep when new lead
- **appointment-confirm** — to customer when appointment booked
- **appointment-reminder** — 24h and 2h before
- **deal-documents** — DocuSign envelope
- **invoice** — with PDF attachment
- **test-drive-thanks** — post test drive

## Unsubscribe Management (CAN-SPAM + CASL)

Every marketing email MUST include:
- Working unsubscribe link
- Physical mailing address of sender
- Clear "this is a marketing email" subject prefix (optional but best practice)

Build an unsubscribe endpoint:
```typescript
app.get('/unsubscribe/:token', async (req, res) => {
  const sub = await db.emailSubscription.findUnique({ where: { unsubscribeToken: req.params.token } });
  if (!sub) return res.status(404).send('Invalid');
  await db.emailSubscription.update({
    where: { id: sub.id },
    data: { unsubscribedAt: new Date() }
  });
  res.send('You have been unsubscribed.');
});
```

Include in emails:
```html
<a href="https://dealeros.com/unsubscribe/{{token}}">Unsubscribe</a>
```

## Bounce Handling

Hard bounces → mark email invalid, do not send again
Soft bounces → retry with backoff (1h, 6h, 24h, 72h)
Spam reports → immediately unsubscribe

## Rate Limits

- SendGrid free: 100/day
- SendGrid Pro: 100K+/month
- Use queue (BullMQ) for bulk, batch by 1000 per request

## Cost Tracking

```typescript
// SendGrid returns message ID, lookup cost in webhook 'delivered' event
// Or estimate: $0.00025 per email (Essentials plan)
```

## Reference

- https://docs.sendgrid.com/api-reference/mail-send
- https://docs.sendgrid.com/for-developers/tracking-events
- https://nodemailer.com/
