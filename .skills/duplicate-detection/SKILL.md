# Duplicate Detection & Merge Skill

Detect and merge duplicate customer and lead records for DealerOS.

## When to use this skill

When building:
- Customer directory duplicate detection (fuzzy match on name+phone+email)
- Lead deduplication on webhook ingestion
- Merge tool that combines 2+ records while preserving all data
- Auto-flagging duplicates with badges

## Algorithm: Multi-field Weighted Matching

Score each pair of records based on weighted similarity across multiple fields:

```typescript
import { distance as levenshtein } from 'fastest-levenshtein';
import jaroWinkler from 'jaro-winkler';

interface MatchWeights {
  email: number;      // exact match = 1.0
  phone: number;      // E.164 match = 1.0, last-7-digits = 0.85
  firstName: number;
  lastName: number;
  address: number;
  vin: number;        // if lead has vehicle_interest.vin
}

const DEFAULT_WEIGHTS: MatchWeights = {
  email: 0.35,
  phone: 0.30,
  firstName: 0.15,
  lastName: 0.15,
  address: 0.05
};

function calculateSimilarity(a: Customer, b: Customer): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  
  // Email (exact match required for full points, otherwise 0)
  if (a.email && b.email) {
    if (a.email.toLowerCase() === b.email.toLowerCase()) {
      score += DEFAULT_WEIGHTS.email;
      reasons.push('email match');
    }
  }
  
  // Phone (E.164 or last 7 digits)
  if (a.phone && b.phone) {
    const aPhone = normalizePhone(a.phone);
    const bPhone = normalizePhone(b.phone);
    if (aPhone === bPhone) {
      score += DEFAULT_WEIGHTS.phone;
      reasons.push('phone match');
    } else {
      // Last 7 digits (ignores country code)
      const aLast = aPhone.slice(-7);
      const bLast = bPhone.slice(-7);
      if (aLast === bLast) {
        score += DEFAULT_WEIGHTS.phone * 0.85;
        reasons.push('phone last-7 match');
      }
    }
  }
  
  // Names (Jaro-Winkler for string similarity)
  if (a.firstName && b.firstName) {
    const sim = jaroWinkler(a.firstName.toLowerCase(), b.firstName.toLowerCase());
    if (sim > 0.85) {
      score += DEFAULT_WEIGHTS.firstName * sim;
      reasons.push(`first name ${(sim * 100).toFixed(0)}% match`);
    }
  }
  
  if (a.lastName && b.lastName) {
    const sim = jaroWinkler(a.lastName.toLowerCase(), b.lastName.toLowerCase());
    if (sim > 0.85) {
      score += DEFAULT_WEIGHTS.lastName * sim;
      reasons.push(`last name ${(sim * 100).toFixed(0)}% match`);
    }
  }
  
  return { score, reasons };
}
```

## Threshold-Based Flagging

```typescript
const DUPLICATE_THRESHOLDS = {
  AUTO_MERGE: 0.90,  // Very high confidence - merge automatically
  FLAG_FOR_REVIEW: 0.65,  // Likely duplicate, show badge
  NOT_DUPLICATE: 0.0
};

function classifyMatch(score: number): 'auto_merge' | 'flag' | 'not_duplicate' {
  if (score >= DUPLICATE_THRESHOLDS.AUTO_MERGE) return 'auto_merge';
  if (score >= DUPLICATE_THRESHOLDS.FLAG_FOR_REVIEW) return 'flag';
  return 'not_duplicate';
}
```

## Duplicate Detection on Lead Ingest

```typescript
async function findDuplicatesForLead(lead: Lead, dealerId: string): Promise<DuplicateMatch[]> {
  // Find candidates by partial match (cheap filter)
  const candidates = await db.customer.findMany({
    where: {
      dealerId,
      OR: [
        lead.email ? { email: { equals: lead.email, mode: 'insensitive' } } : {},
        lead.phone ? { phone: { contains: lead.phone.slice(-7) } } : {},
        { AND: [
          { firstName: { equals: lead.firstName, mode: 'insensitive' } },
          { lastName: { equals: lead.lastName, mode: 'insensitive' } }
        ]}
      ]
    },
    take: 50
  });
  
  // Score each candidate
  const matches: DuplicateMatch[] = candidates.map(candidate => {
    const { score, reasons } = calculateSimilarity(lead, candidate);
    return { customer: candidate, score, reasons, classification: classifyMatch(score) };
  });
  
  // Return sorted by score
  return matches.filter(m => m.score > 0).sort((a, b) => b.score - a.score);
}
```

## Merge Operation

When user confirms merge, combine records:

```typescript
async function mergeCustomers(masterId: string, duplicateId: string, fieldChoices: Record<string, 'master' | 'duplicate'>): Promise<Customer> {
  return await db.$transaction(async (tx) => {
    const master = await tx.customer.findUniqueOrThrow({ where: { id: masterId } });
    const duplicate = await tx.customer.findUniqueOrThrow({ where: { id: duplicateId } });
    
    // For each field, pick the chosen value
    const merged = {
      firstName: fieldChoices.firstName === 'duplicate' ? duplicate.firstName : master.firstName,
      lastName: fieldChoices.lastName === 'duplicate' ? duplicate.lastName : master.lastName,
      email: fieldChoices.email === 'duplicate' ? duplicate.email : master.email,
      phone: fieldChoices.phone === 'duplicate' ? duplicate.phone : master.phone,
      // ... other fields
    };
    
    // Update master with chosen values
    await tx.customer.update({ where: { id: masterId }, data: merged });
    
    // Move all related records from duplicate to master
    await tx.deal.updateMany({ where: { customerId: duplicateId }, data: { customerId: masterId } });
    await tx.lead.updateMany({ where: { customerId: duplicateId }, data: { customerId: masterId } });
    await tx.appointment.updateMany({ where: { customerId: duplicateId }, data: { customerId: masterId } });
    await tx.testDrive.updateMany({ where: { customerId: duplicateId }, data: { customerId: masterId } });
    await tx.activity.updateMany({ where: { entityType: 'customer', entityId: duplicateId }, data: { entityId: masterId } });
    await tx.invoice.updateMany({ where: { customerId: duplicateId }, data: { customerId: masterId } });
    
    // Log merge in activity
    await tx.activity.create({
      data: {
        entityType: 'customer',
        entityId: masterId,
        type: 'merge',
        body: `Merged customer ${duplicateId} (${duplicate.firstName} ${duplicate.lastName}) into this record`,
        metadata: { mergedFrom: duplicateId, fieldChoices }
      }
    });
    
    // Soft-delete duplicate (30-day recovery)
    await tx.customer.update({
      where: { id: duplicateId },
      data: { 
        deletedAt: new Date(),
        mergedIntoId: masterId,
        // Save merge metadata for recovery
      }
    });
    
    return await tx.customer.findUniqueOrThrow({ where: { id: masterId } });
  });
}
```

## Performance

- Use database indexes on (dealer_id, email), (dealer_id, phone), (dealer_id, last_name, first_name)
- For 50K customers per dealer, do pair-wise comparison in batches (not all-vs-all)
- Use a blocking step (cheap filter) before expensive similarity computation
- Consider LSH (locality-sensitive hashing) for very large datasets

## Storage

- `Customer.deletedAt` for soft delete
- `Customer.mergedIntoId` to track merge history
- Recovery endpoint to unmerge within 30 days

## Frontend: Merge UI

Show 2 columns side-by-side, each field with radio to pick which value:
```
┌──────────────────────┬──────────────────────┐
│ Record A (master)    │ Record B (duplicate) │
├──────────────────────┼──────────────────────┤
│ First Name:          │ First Name:          │
│ ● John Smith         │ ○ Jon Smith          │
├──────────────────────┼──────────────────────┤
│ Email:               │ Email:               │
│ ● john@example.com   │ ○ johnny@example.com │
├──────────────────────┼──────────────────────┤
│ Phone:               │ Phone:               │
│ ○ 604-555-1234       │ ● 604-555-1234       │
└──────────────────────┴──────────────────────┘
[Preview] [Cancel] [Confirm Merge]
```

## Reference

- https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance
- https://en.wikipedia.org/wiki/Levenshtein_distance
- https://github.com/oliver-moran/jip-johnson
