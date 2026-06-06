# DocuSign E-Signature Skill

Build e-signature integration for DealerOS deal documents.

## When to use this skill

When building features that need:
- Send deal documents (bill of sale, F&I contract, credit app, warranty) for signature
- Multi-party signing (buyer, co-buyer, dealer rep, manager, finance)
- Signing order (sequential or parallel)
- Status tracking (sent, viewed, signed, declined)
- Webhook events for state changes
- Embed signing in-app (no DocuSign redirect) vs email signing

## DocuSign eSign API (Node)

```typescript
import docusign from 'docusign-esign';

const apiClient = new docusign.ApiClient();
apiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi');
apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

const envelopesApi = new docusign.EnvelopesApi(apiClient);

// Create envelope from template
const envelope = await envelopesApi.createEnvelope(accountId, {
  envelopeDefinition: {
    templateId: process.env.DOCUSIGN_TEMPLATE_BILL_OF_SALE,
    templateRoles: [{
      email: buyer.email,
      name: buyer.name,
      roleName: 'Buyer',
      clientUserId: dealer.id  // for embedded signing
    }, {
      email: 'manager@dealer.com',
      name: 'Sales Manager',
      roleName: 'Manager'
    }],
    status: 'sent',
    emailSubject: 'Please sign your bill of sale'
  }
});

// Get embedded signing URL
const view = await envelopesApi.createRecipientView(accountId, envelope.envelopeId, {
  recipientViewRequest: {
    authenticationMethod: 'none',
    clientUserId: dealer.id,
    recipientId: '1',
    returnUrl: `https://app.dealeros.com/deals/${dealId}/signed`,
    userName: buyer.name,
    email: buyer.email
  }
});
// Returns { url: 'https://demo.docusign.net/Signing/...' }
```

## Webhook Handler (DocuSign Connect)

```typescript
app.post('/webhooks/docusign', (req, res) => {
  // DocuSign sends XML by default; configure to send JSON
  const event = req.body;
  
  // event.event: 'envelope-sent', 'envelope-delivered', 'envelope-completed',
  //              'envelope-declined', 'envelope-voided', 'recipient-completed'
  
  // Verify HMAC signature
  if (!verifyDocuSignSignature(req.headers['x-docusign-signature-1'], req.body)) {
    return res.status(401).send();
  }
  
  switch (event.event) {
    case 'envelope-completed':
      await handleEnvelopeCompleted(event.data);
      // Mark deal as delivered, save signed PDF
      break;
    case 'recipient-completed':
      await handleRecipientCompleted(event.data);
      // Update signers_signed status
      break;
    case 'envelope-declined':
      await handleEnvelopeDeclined(event.data);
      // Notify sales rep
      break;
  }
  res.status(200).send();
});
```

## Database Tables

```prisma
model DocumentSignature {
  id              String   @id @default(cuid())
  dealerId        String
  dealId          String?
  documentId      String?
  envelopeId      String   @unique  // DocuSign envelope ID
  templateId      String
  status          SignatureStatus
  signers         Json     // [{email, name, role, status, signedAt}]
  documentType    DocumentType  // bill_of_sale, fi_contract, credit_app, warranty, etc
  completedAt     DateTime?
  declinedAt      DateTime?
  voidedAt        DateTime?
  pdfUrl          String?  // S3 URL of signed PDF
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  dealer   Dealer    @relation(fields: [dealerId], references: [id], onDelete: Cascade)
  deal     Deal?     @relation(fields: [dealId], references: [id])
  document Document? @relation(fields: [documentId], references: [id])

  @@index([dealerId])
  @@index([dealId])
  @@index([status])
  @@map("document_signatures")
}

enum SignatureStatus {
  CREATED
  SENT
  DELIVERED
  COMPLETED
  DECLINED
  VOIDED
  EXPIRED
}

enum DocumentType {
  BILL_OF_SALE
  FI_CONTRACT
  CREDIT_APP
  WARRANTY
  DISCLOSURE
  TRADE_APPRAISAL
  DELIVERY_RECEIPT
  OTHER
}
```

## API Routes

- POST   /signatures/envelopes (create envelope from template)
- GET    /signatures/envelopes/:id (status + signers)
- POST   /signatures/envelopes/:id/void (cancel)
- GET    /signatures/envelopes/:id/pdf (download signed PDF)
- POST   /signatures/envelopes/:id/embedded-url (get signing URL for buyer)
- POST   /webhooks/docusign (DocuSign → us)

## DocuSign Template Setup

Create templates in DocuSign UI for each document type:
- Bill of Sale — Buyer signs, Manager countersigns
- F&I Contract — Buyer, Co-Buyer, Finance Manager
- Credit Application — Buyer only
- Warranty Agreement — Buyer only
- Trade Appraisal — Seller, Buyer

Each template has merge fields:
- {{buyer_name}}, {{buyer_address}}, {{vehicle_vin}}, {{sale_price}},
  {{down_payment}}, {{monthly_payment}}, {{term_months}}, {{rate}},
  {{dealer_name}}, {{dealer_address}}

Pass these as `templateTabs` when creating the envelope.

## Frontend

- /workspace/apps/web/src/app/deals/[id]/signatures (list of all envelopes for a deal)
- /workspace/apps/web/src/app/deals/[id]/sign/[envelopeId] (embedded signing iframe)
- "Send for signature" button on deal detail → opens modal to pick template + signers
- Real-time status update (poll every 10s while embedded signing)
- "Void envelope" button (admin only)

## Reference

- https://developers.docusign.com/docs/esign-rest-api
- https://developers.docusign.com/platform/auth/jwt/jwt-get-token/
