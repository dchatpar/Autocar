# Facebook & Meta Integration Skill

Build Facebook Lead Ads, Click-to-WhatsApp, and Marketplace posting for DealerOS.

## When to use this skill

When building the social-media-integration task or any task that needs to:
- Receive Meta Lead Ads webhooks
- OAuth flow with Facebook Business
- Post vehicles to Facebook Page
- Post vehicles to Facebook Marketplace
- Send conversion events back to Meta CAPI
- Use the Conversions API for ad attribution

## Key APIs

### Meta Marketing API (Lead Ads)
- Webhook verification: `GET /webhooks/meta/leads?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...`
- Webhook receiver: `POST /webhooks/meta/leads` with HMAC SHA-256 signature
- Payload format: `{ entry: [{ changes: [{ value: { leadgen_id, page_id, form_id, field_data: [{name, values}] } }] }] }`
- Must respond within 5 seconds (Meta retries otherwise)

### Facebook Graph API
- OAuth: `https://www.facebook.com/v21.0/dialog/oauth?client_id=...&redirect_uri=...&scope=pages_show_list,pages_manage_posts,pages_read_engagement,business_management`
- Token exchange: `GET https://graph.facebook.com/v21.0/oauth/access_token?client_id=...&client_secret=...&code=...`
- Get user pages: `GET /me/accounts?access_token=...`
- Post to page: `POST /{page-id}/feed?message=...&link=...&access_token=...`
- Post photo: `POST /{page-id}/photos?url=...&caption=...&access_token=...`
- Marketplace listing: `POST /{page-id}/marketplace_listings?title=...&description=...&price=...&availability=...&condition=...&access_token=...`

### Meta Conversions API (CAPI)
- Endpoint: `POST https://graph.facebook.com/v21.0/{pixel-id}/events`
- Payload: `{ data: [{ event_name, event_time, user_data, custom_data, action_source }] }`
- Hash user data (email, phone) with SHA-256 before sending

## HMAC Signature Verification

```typescript
import crypto from 'crypto';

function verifyMetaSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature.slice(7)), Buffer.from(expected));
}
```

## E.164 Phone Normalization

```typescript
function normalizePhone(phone: string, defaultCountry = 'US'): string {
  // Use libphonenumber-js for robust parsing
  const parsed = parsePhoneNumberFromString(phone, defaultCountry);
  if (!parsed?.isValid()) throw new Error('Invalid phone');
  return parsed.format('E.164'); // +14155552671
}
```

## Template Variables for Posts

Common variables to substitute in social post templates:
- `{{make}}`, `{{model}}`, `{{year}}`, `{{trim}}`
- `{{price}}`, `{{mileage}}`, `{{vin}}`
- `{{dealer_name}}`, `{{dealer_phone}}`, `{{dealer_address}}`
- `{{stock_number}}`, `{{exterior_color}}`, `{{fuel_type}}`

## Rate Limits

- Webhook receiver: 100 req/min per IP (per dealer)
- Graph API post: 200 calls/hour per user, 4800 calls/hour per app
- CAPI: 1000 events per request, 10K events per minute

## CASL/PIPEDA Compliance

Before posting or messaging:
- Get explicit consent for commercial messages
- Include unsubscribe mechanism
- Record consent in `communications` table
- Apply GUARD agent compliance check before sending

## Reference

- https://developers.facebook.com/docs/marketing-api/guides/lead-ads
- https://developers.facebook.com/docs/graph-api
- https://developers.facebook.com/docs/marketing-api/conversions-api
