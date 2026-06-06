# Twilio SMS & Voice Skill

Build SMS messaging and voice call integration for DealerOS.

## When to use this skill

When building features that need:
- Outbound SMS (lead follow-up, appointment reminders, BHPH collections)
- Inbound SMS (lead capture, two-way conversations)
- Voice calls (inbound IVR, AI voice agent handoff to Retell AI)
- WhatsApp Business messaging (via Twilio)
- Phone number provisioning (per dealer)
- Two-factor authentication via SMS

## Twilio Node SDK

```typescript
import twilio from 'twilio';

const client = twilio(accountSid, authToken);

// Send SMS
const message = await client.messages.create({
  from: '+15555550100',  // Twilio number
  to: '+14155552671',
  body: 'Hi! Thanks for your interest in the 2021 Mustang. When works for a test drive?',
  statusCallback: 'https://api.dealeros.com/webhooks/twilio/status'
});
// Returns: { sid: 'SM...', status: 'queued', ... }

// Send WhatsApp
const wa = await client.messages.create({
  from: 'whatsapp:+15555550100',
  to: 'whatsapp:+14155552671',
  body: '...'
});

// Make voice call
const call = await client.calls.create({
  from: '+15555550100',
  to: '+14155552671',
  url: 'https://api.dealeros.com/voice/ivr-handler',  // TwiML
  statusCallback: 'https://api.dealeros.com/webhooks/twilio/call-status'
});
```

## Inbound Webhook Verification

```typescript
import twilio from 'twilio';

function verifyTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
  authToken: string
): boolean {
  return twilio.validateRequest(authToken, signature, url, params);
}
```

Webhook handler for inbound SMS:
```typescript
app.post('/webhooks/twilio/sms', (req, res) => {
  if (!verifyTwilioSignature(req.headers['x-twilio-signature'], req.url, req.body, authToken)) {
    return res.status(401).send();
  }
  
  const from = req.body.From;  // +14155552671
  const body = req.body.Body;
  const messageSid = req.body.MessageSid;
  
  // Look up lead by phone, trigger NOVA agent
  
  // Return TwiML (empty = no auto-reply, our agent will respond async)
  res.type('text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
});
```

## Phone Number Provisioning

```typescript
// Search for available numbers
const available = await client.availablePhoneNumbers('US').local.list({
  areaCode: 415,
  smsEnabled: true,
  voiceEnabled: true,
  limit: 10
});

// Purchase
const purchased = await client.incomingPhoneNumbers.create({
  phoneNumber: available[0].phoneNumber,
  smsUrl: 'https://api.dealeros.com/webhooks/twilio/sms',
  voiceUrl: 'https://api.dealeros.com/voice/handler',
  friendlyName: 'DealerOS - Dealer Name'
});
```

## Cost Tracking

Store each message's cost:
```typescript
const message = await client.messages.create({...});
// message.price = '-0.0079' (USD, negative for outbound)
await db.smsMessage.create({
  data: {
    externalId: message.sid,
    cost: Math.abs(parseFloat(message.price)),
    status: 'SENT',
    sentAt: new Date()
  }
});
```

Pricing (US): ~$0.0079/SMS, ~$0.0085/MMS, ~$0.014/min for voice.

## CASL/TCPA Compliance

- Only send to numbers that have opted in
- Include opt-out instructions in first message: "Reply STOP to unsubscribe"
- Honor STOP/UNSUBSCRIBE keywords within 10 seconds
- Maintain quiet hours (no marketing SMS 9pm-9am local time)
- For Canada (CASL): express consent required, record consent timestamp
- For US (TCPA): prior express written consent for marketing

## Common Patterns

### Lead response (auto-reply to new lead)
```typescript
async function autoReplyToLead(lead: Lead, dealer: Dealer) {
  if (!lead.phone) return;
  if (!hasConsent(lead)) return;
  
  const message = `Hi ${lead.firstName}, this is ${dealer.name}. Thanks for your interest in ${lead.vehicleOfInterest}. When works for a test drive? Reply STOP to opt out.`;
  
  await sendSms(lead.phone, dealer.twilioNumber, message);
}
```

### Appointment reminder
```typescript
async function sendAppointmentReminder(appointment: Appointment) {
  const message = `Reminder: Your appointment is at ${formatTime(appointment.scheduledAt)}. Reply C to confirm or R to reschedule.`;
  await sendSms(appointment.customer.phone, appointment.dealer.twilioNumber, message);
}
```

## Reference

- https://www.twilio.com/docs/sms
- https://www.twilio.com/docs/whatsapp
- https://www.twilio.com/docs/voice
- https://www.twilio.com/docs/usage/webhooks/webhooks-security
