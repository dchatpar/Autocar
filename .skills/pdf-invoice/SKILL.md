# PDF Generation Skill

Generate invoices, deal jackets, window stickers, and BHPH contracts for DealerOS.

## When to use this skill

When building features that need PDF output:
- Invoice PDF (with line items, totals, payment status)
- Deal jacket (all deal documents in one PDF)
- Window sticker (Monroney-style for vehicles)
- Bill of sale
- BHPH contract (amortization schedule)
- Buyer order / purchase agreement

## Option 1: @react-pdf/renderer (React-friendly, declarative)

```typescript
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

const InvoicePDF = ({ invoice, dealer, customer, items }) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.dealerName}>{dealer.name}</Text>
        <Text style={styles.invoiceNumber}>Invoice #{invoice.invoiceNumber}</Text>
      </View>
      
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Bill To</Text>
          <Text>{customer.name}</Text>
          <Text>{customer.address}</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Invoice Date</Text>
          <Text>{formatDate(invoice.issuedAt)}</Text>
          <Text style={styles.label}>Due Date</Text>
          <Text>{formatDate(invoice.dueAt)}</Text>
        </View>
      </View>
      
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.colDescription}>Description</Text>
          <Text style={styles.colQty}>Qty</Text>
          <Text style={styles.colPrice}>Unit Price</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>
        {items.map(item => (
          <View key={item.id} style={styles.tableRow}>
            <Text style={styles.colDescription}>{item.description}</Text>
            <Text style={styles.colQty}>{item.quantity}</Text>
            <Text style={styles.colPrice}>${item.unitPrice.toFixed(2)}</Text>
            <Text style={styles.colAmount}>${item.amount.toFixed(2)}</Text>
          </View>
        ))}
      </View>
      
      <View style={styles.totals}>
        <Text>Subtotal: ${invoice.subtotal.toFixed(2)}</Text>
        <Text>Tax: ${invoice.taxAmount.toFixed(2)}</Text>
        <Text style={styles.total}>Total: ${invoice.total.toFixed(2)}</Text>
      </View>
    </Page>
  </Document>
);

// Generate PDF buffer
const buffer = await pdf(<InvoicePDF invoice={invoice} dealer={dealer} customer={customer} items={items} />).toBuffer();
```

## Option 2: pdfkit (programmatic, lower-level)

```typescript
import PDFDocument from 'pdfkit';
import fs from 'fs';

const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
const chunks: Buffer[] = [];
doc.on('data', chunk => chunks.push(chunk));
doc.on('end', () => {
  const pdfBuffer = Buffer.concat(chunks);
  // Upload to S3 or return as stream
});

doc.fontSize(20).text(dealer.name, { align: 'right' });
doc.fontSize(10).text('Invoice #' + invoice.invoiceNumber, { align: 'right' });
doc.moveDown();
doc.fontSize(12).text('Bill To:');
doc.fontSize(10).text(customer.name);
doc.text(customer.address);
doc.moveDown();

doc.fontSize(10).text('Date: ' + formatDate(invoice.issuedAt));
doc.text('Due: ' + formatDate(invoice.dueAt));
doc.moveDown();

// Table header
doc.fontSize(10).fillColor('#666').text('Description', 50, doc.y, { continued: true });
doc.text('Qty', 350, doc.y, { continued: true });
doc.text('Price', 420, doc.y, { continued: true });
doc.text('Amount', 490);
doc.moveDown();
doc.fillColor('#000');

// Items
items.forEach(item => {
  doc.text(item.description, 50, doc.y, { continued: true });
  doc.text(String(item.quantity), 350, doc.y, { continued: true });
  doc.text('$' + item.unitPrice.toFixed(2), 420, doc.y, { continued: true });
  doc.text('$' + item.amount.toFixed(2), 490);
  doc.moveDown(0.5);
});

// Totals
doc.moveDown();
doc.fontSize(12).text('Subtotal: $' + invoice.subtotal.toFixed(2), { align: 'right' });
doc.text('Tax: $' + invoice.taxAmount.toFixed(2), { align: 'right' });
doc.fontSize(14).text('Total: $' + invoice.total.toFixed(2), { align: 'right' });

doc.end();
```

## Window Sticker Template

Window stickers (Monroney) include:
- Dealer name + logo (top)
- Vehicle make/model/year/trim/VIN
- Pricing breakdown (MSRP/asking, options, total)
- Fuel economy (if known)
- Safety ratings
- Standard equipment
- Warranty info
- Dealer contact info

Use a specific font (typically Arial or Helvetica) and brand colors.

## BHPH Contract

BHPH contracts include:
- Buyer and co-buyer info
- Vehicle info (year, make, model, VIN)
- Sale price, down payment, financed amount
- Interest rate, term, payment amount, payment day
- Amortization schedule (full table of all payments)
- Default clause
- Repo clause
- Signature lines

Amortization schedule generator:
```typescript
function generateAmortization(principal: number, annualRate: number, termMonths: number, firstPayment: Date) {
  const monthlyRate = annualRate / 12;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
  
  const schedule = [];
  let balance = principal;
  for (let i = 1; i <= termMonths; i++) {
    const interest = balance * monthlyRate;
    const principalPart = payment - interest;
    balance -= principalPart;
    const paymentDate = new Date(firstPayment);
    paymentDate.setMonth(paymentDate.getMonth() + (i - 1));
    schedule.push({
      number: i,
      date: paymentDate,
      payment: payment,
      principal: principalPart,
      interest: interest,
      balance: Math.max(0, balance)
    });
  }
  return { payment, schedule };
}
```

## Performance

- Generate PDF in under 3 seconds
- Stream to client (don't buffer whole PDF in memory if large)
- Cache generated PDFs in S3, serve via CloudFront
- Use S3 multipart upload for files >5MB

## Storage

- S3 bucket: dealeros-documents-prod
- Path: `{dealerId}/{entityType}/{entityId}/{filename}.pdf`
- Signed URLs valid for 1 hour for download
- CloudFront CDN for fast access

## Reference

- https://react-pdf.org/
- http://pdfkit.org/
- https://www.irs.gov/pub/irs-pdf/f1504.pdf (window sticker format reference)
