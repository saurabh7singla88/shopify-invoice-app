# SPEC: Refactor Invoice Generation — Move Business Logic to invoice-1 App

## 1. Objective

Refactor the invoice generation flow to:
- Move **all business logic** (tax calculation, discount distribution, order transformation) from `lambda-generate-invoice` into the `invoice-1` app
- Create a new **`lambda-generate-pdf-invoice`** that is a pure PDF generator — accepts pre-computed invoice JSON, generates PDF, uploads to S3, sends email
- Eliminate dual/divergent tax calculation logic
- Ensure GST reporting data (`ShopifyOrderItems` table) is immediately accurate with no placeholder values

---

## Implementation Status

| Phase | Description | Status | Date |
|-------|-------------|--------|------|
| 1 | Create `invoiceTransformer.server.ts` | ✅ Done | 2026-02-07 |
| 2 | Update `writeOrderItems` to accept `GSTLineItemMeta[]` | ✅ Done | 2026-02-07 |
| 3 | Update webhook flow (sync Lambda, Invoices write, invoiceId update) | ✅ Done | 2026-02-07 |
| 4 | Create `lambda-generate-pdf-invoice` project | ✅ Done | 2026-02-07 |
| 5 | Update CloudFormation (new Lambda resource + IAM) | ✅ Done | 2026-02-07 |
| — | Deploy CloudFormation stack update | ⬜ Not started | — |
| — | Build & deploy `lambda-generate-pdf-invoice` to AWS | ⬜ Not started | — |
| — | Deploy updated `invoice-1` app | ⬜ Not started | — |
| — | End-to-end verification with test orders | ⬜ Not started | — |

### Files Created

| File | Lines | Description |
|------|-------|-------------|
| `app/services/invoiceTransformer.server.ts` | ~494 | Tax/discount/HSN calculation, `transformOrderToInvoice()`, TypeScript interfaces |
| `lambda-generate-pdf-invoice/index.mjs` | ~95 | Pure PDF Lambda handler — no business logic, no DB writes |
| `lambda-generate-pdf-invoice/package.json` | 16 | Dependencies (pdfkit, AWS SDK) |
| `lambda-generate-pdf-invoice/deployment/build.ps1` | 36 | Build script for Lambda deployment package |
| `lambda-generate-pdf-invoice/.gitignore` | 3 | node_modules, *.zip, .env |
| `lambda-generate-pdf-invoice/config/*` | — | Copied from `lambda-generate-invoice` (unchanged) |
| `lambda-generate-pdf-invoice/generators/*` | — | Copied from `lambda-generate-invoice` (unchanged) |
| `lambda-generate-pdf-invoice/services/*` | — | Copied from `lambda-generate-invoice` (unchanged) |
| `lambda-generate-pdf-invoice/assets/*` | — | Copied from `lambda-generate-invoice` (unchanged) |

### Files Modified

| File | Key Changes |
|------|-------------|
| `app/routes/webhooks.orders.create.tsx` | Calls `transformOrderToInvoice()`, Lambda `Event` → `RequestResponse`, writes Invoices table, updates ShopifyOrderItems with invoiceId, updates ShopifyOrders with S3 key |
| `app/services/gstReporting.server.ts` | `writeOrderItems()` accepts `GSTLineItemMeta[]` instead of `OrderLineItem[]`; removed internal tax calculation |
| `cloudformation-template.json` | Added `PDFInvoiceLambdaName` param, `PDFInvoiceLambdaRole` (reduced IAM), `PDFInvoiceLambdaFunction`, updated `LambdaInvokeAccess` for both Lambdas, updated `InvoiceLambdaName` default |

### Files Unchanged (kept for rollback)

| File | Reason |
|------|--------|
| `lambda-generate-invoice/*` | Kept as-is; switch back by changing `INVOICE_LAMBDA_NAME` env var |

---

## 2. Current Architecture (Before)

```
Shopify Order Webhook
  ↓
invoice-1 app (webhooks.orders.create.tsx)
  ├── HMAC validation
  ├── Idempotency check (Invoices table)
  ├── Extract customer name
  ├── Store order → ShopifyOrders table
  ├── Invoke Lambda ASYNC (sends raw Shopify order payload)
  ├── Write GST data → ShopifyOrderItems table (placeholder taxable values)
  └── Return 200
         ↓
lambda-generate-invoice (index.mjs)
  ├── Idempotency check (duplicate)
  ├── Fetch template config from DB
  ├── transformShopifyOrderToInvoice() ← TAX/DISCOUNT LOGIC HERE
  ├── generateInvoicePDF()
  ├── Upload to S3
  ├── Send email via SNS
  ├── Save → Invoices table
  ├── Update ShopifyOrderItems with invoiceId
  └── Update ShopifyOrders with s3Key
```

### Problems with Current Architecture

| Problem | Impact |
|---------|--------|
| Tax calculation is duplicated | `writeOrderItems()` uses Shopify's `tax_lines`, transformer uses hardcoded 5%/18% threshold — values diverge |
| GST data has placeholder taxable values | Reports may show incorrect data until Lambda runs |
| Lambda has too many responsibilities | PDF generation + DB writes + tax calculation + email |
| Two idempotency checks | Both webhook and Lambda query Invoices table |
| Raw Shopify payload passed to Lambda | Lambda must understand Shopify data format |
| Race condition | Reports can query ShopifyOrderItems before Lambda updates invoiceId |

---

## 3. Target Architecture (After)

```
Shopify Order Webhook
  ↓
invoice-1 app (webhooks.orders.create.tsx)
  ├── HMAC validation
  ├── Idempotency check (Invoices table)
  ├── Extract customer info from addresses
  ├── Store order → ShopifyOrders table
  ├── transformOrderToInvoice() ← ALL TAX/DISCOUNT LOGIC COMPUTED HERE
  ├── Write GST data → ShopifyOrderItems (with correct taxable values)
  ├── Invoke Lambda SYNC (sends pre-computed invoiceData JSON)
  ├── Receive { invoiceId, s3Url, emailSentTo } from Lambda
  ├── Save → Invoices table
  ├── Update ShopifyOrderItems with invoiceId
  └── Return 200
         ↓
lambda-generate-pdf-invoice (index.mjs) — PURE PDF GENERATOR
  ├── Fetch template config from DB (Shops/Templates/TemplateConfigurations)
  ├── generateInvoicePDF(invoiceData, templateConfig)
  ├── Upload to S3
  ├── Send email via SNS
  └── Return { invoiceId, s3Url, emailSentTo }
```

### Benefits

| Benefit | Detail |
|---------|--------|
| Single source of truth for tax logic | All calculation in invoice-1 app |
| GST reports immediately accurate | No placeholders, no waiting for Lambda |
| Lambda is simpler | Only PDF generation + S3 + email |
| No race conditions | invoiceId written after Lambda returns |
| Testable | Transformer is a pure function in TypeScript |
| Better separation of concerns | Business logic vs presentation |

---

## 4. Phases

### Phase 1: Create Transformer in invoice-1 App

**New file: `app/services/invoiceTransformer.server.ts`**

Port the logic from `lambda-generate-invoice/transformers/shopifyOrderTransformer.mjs` and `lambda-generate-invoice/utils/gstUtils.mjs` into TypeScript.

#### 4.1.1 GST Utilities to Port

From `gstUtils.mjs`:
- `STATE_CODES` map (state name → 2-digit code)
- `getStateCode(stateName)` → string
- `isIntrastate(sellerState, buyerState)` → boolean
- `calculateGSTBreakdown(taxAmount, isIntrastate)` → { cgst, sgst, igst }

> Note: `getStateCode()` already exists in `gstReporting.server.ts`. Reuse it.

#### 4.1.2 Transformer Function

```typescript
export function transformOrderToInvoice(
  shopifyOrder: ShopifyOrderPayload,
  companyState: string
): InvoiceData
```

**Input:** Raw Shopify order webhook payload + company state from shop config

**Output:** `InvoiceData` — the exact same structure the PDF generator expects:

```typescript
interface InvoiceData {
  order: {
    name: string;           // "#1001"
    date: string;           // "7 Feb 2026" (formatted for display)
    dueDate: string | null;
    notes: string;
  };
  customer: {
    name: string;
    company: string | null;
    email: string;
    phone: string | null;
  };
  shippingAddress: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  lineItems: InvoiceLineItem[];
  totals: InvoiceTotals;
  // NEW: Raw numeric values for GST reporting (not in PDF)
  _gstMeta: {
    isIntrastate: boolean;
    companyState: string;
    customerState: string;
    placeOfSupply: string;
    items: GSTLineItemMeta[];
  };
}

interface InvoiceLineItem {
  name: string;              // Title with "(HSN: XXXX)" if available
  description: string | null;
  sku: string | null;
  quantity: number;          // Always 1 (expanded)
  mrp: string;               // "Rs. 999.00"
  discount: string;          // "Rs. 50.00"
  sellingPrice: string;      // "Rs. 900.00" (base price after discount, before tax)
  tax: string;               // "Rs. 45.00"
  sellingPriceAfterTax: string;
  _totalItemTax: number;     // Raw numeric
  _cgst: number;
  _sgst: number;
  _igst: number;
}

interface InvoiceTotals {
  subtotal: string;
  discount: string | null;
  shipping: string;
  tax: string;
  cgst: string | null;
  sgst: string | null;
  igst: string | null;
  total: string;
}

// NEW: Raw numeric values for writing to ShopifyOrderItems
interface GSTLineItemMeta {
  productId: string;
  variantId: string;
  sku: string | null;
  productTitle: string;
  hsn: string | null;
  quantity: number;           // Original quantity (not expanded)
  unitPrice: number;          // Per-unit price including tax
  discount: number;           // Total discount for this line item
  taxableValue: number;       // Price excluding tax
  taxRate: number;            // e.g., 18
  totalTax: number;
  cgst: number;
  sgst: number;
  igst: number;
}
```

#### 4.1.3 Tax Calculation Logic (from transformer)

```
For each line item:
  1. sellingPriceWithTax = parseFloat(item.price)
  2. itemDiscount = parseFloat(item.total_discount)
  3. Determine discount to use (order-level vs item-level)
  4. For each unit (expand qty N → N rows):
     a. Calculate base price: sellingPriceBase = sellingPriceWithTax / 1.05
     b. Check if price after discount >= 2500:
        - Yes → taxRate = 18%, recalculate base = sellingPriceWithTax / 1.18
        - No → taxRate = 5%
     c. perUnitTax = sellingPriceWithTax - sellingPriceBase
     d. sellingPriceAfterDiscount = sellingPriceBase - discount (first unit only)
     e. Split tax: intrastate → CGST=SGST=tax/2, interstate → IGST=tax
```

#### 4.1.4 HSN Extraction Logic (from transformer)

```
Priority order:
  1. Product metafields: custom.hsn_code
  2. Line item properties: name contains "hsn"
  3. SKU regex: HSN(\d{4,8})
```

---

### Phase 2: Update writeOrderItems to Use Transformer Output

**File: `app/services/gstReporting.server.ts`**

Modify `writeOrderItems()` to accept `GSTLineItemMeta[]` from the transformer instead of raw Shopify line items.

#### Current Signature
```typescript
export async function writeOrderItems(
  shop: string,
  invoiceData: { invoiceId, invoiceNumber, invoiceDate, orderId, orderNumber, customerName, customerState, placeOfSupply },
  lineItems: OrderLineItem[],    // Raw Shopify line items
  companyInfo: { state, gstin }
)
```

#### New Signature
```typescript
export async function writeOrderItems(
  shop: string,
  invoiceData: {
    invoiceId: string;
    invoiceNumber: string;
    invoiceDate: string;
    orderId: string;
    orderNumber: string;
    customerName: string;
    customerState: string;
    placeOfSupply: string;
  },
  gstLineItems: GSTLineItemMeta[],  // Pre-computed from transformer
  companyInfo: { state: string; gstin?: string }
)
```

Key change: No more tax calculation inside `writeOrderItems()`. It receives pre-computed `taxableValue`, `taxRate`, `cgst`, `sgst`, `igst` from the transformer.

---

### Phase 3: Update Webhook to Use New Flow

**File: `app/routes/webhooks.orders.create.tsx`**

#### Current Flow
```typescript
// 1. Store order
// 2. Invoke Lambda (async, raw Shopify payload)
// 3. Write GST data (separate calculation)
```

#### New Flow
```typescript
// 1. Store order → ShopifyOrders
// 2. Get shop config (state, gstin)
// 3. Transform order: invoiceData = transformOrderToInvoice(payload, companyState)
// 4. Write GST data using invoiceData._gstMeta (correct values immediately)
// 5. Invoke Lambda SYNC with invoiceData (without _gstMeta)
// 6. Receive { invoiceId, s3Url, emailSentTo } from Lambda
// 7. Save invoice record → Invoices table
// 8. Update ShopifyOrderItems with invoiceId
// 9. Return 200
```

#### Lambda Invocation Change

```typescript
// BEFORE: Async with raw Shopify payload
const invokeParams = {
  FunctionName: "shopify-generate-invoice",
  InvocationType: "Event",
  Payload: JSON.stringify({ ...payload, shop })
};

// AFTER: Sync with pre-computed invoiceData
const invokeParams = {
  FunctionName: "shopify-generate-pdf-invoice",
  InvocationType: "RequestResponse",
  Payload: JSON.stringify({
    invoiceData,  // Pre-computed: order, customer, lineItems, totals
    shop,
    orderId: payload.id?.toString(),
    orderName: payload.name,
  })
};

const lambdaResponse = await lambdaClient.send(new InvokeCommand(invokeParams));
const result = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
// result = { invoiceId, s3Url, emailSentTo, fileName }
```

---

### Phase 4: Create New Lambda — `lambda-generate-pdf-invoice`

**Location:** `lambda-generate-pdf-invoice/` (new project at workspace root)

#### 4.4.1 Project Structure

```
lambda-generate-pdf-invoice/
├── index.mjs                    # Handler — accepts invoiceData, returns { invoiceId, s3Url }
├── package.json
├── assets/
│   ├── logo.JPG                 # Copy from lambda-generate-invoice
│   └── sampleSign.png           # Copy from lambda-generate-invoice
├── config/
│   └── awsClients.mjs           # Copy: S3Client, SNSClient
├── generators/
│   ├── pdfGenerator.mjs         # Copy: unchanged
│   └── templates/
│       └── minimalistTemplate.mjs  # Copy: unchanged
├── services/
│   ├── s3Service.mjs            # Copy: unchanged
│   ├── snsService.mjs           # Copy: unchanged
│   └── templateConfigService.mjs   # Copy: unchanged
└── deployment/
    ├── build.ps1                # Copy and update paths
    └── README.md
```

#### 4.4.2 Files Removed (vs lambda-generate-invoice)

| File | Reason |
|------|--------|
| `transformers/shopifyOrderTransformer.mjs` | Logic moved to invoice-1 app |
| `utils/gstUtils.mjs` | Logic moved to invoice-1 app |
| `test/` | New tests will be in invoice-1 |

#### 4.4.3 New Handler — `index.mjs`

```javascript
import { randomUUID } from 'crypto';
import { generateInvoicePDF } from './generators/pdfGenerator.mjs';
import { uploadInvoiceToS3 } from './services/s3Service.mjs';
import { sendInvoiceNotification } from './services/snsService.mjs';
import { getTemplateConfig, formatConfigForPDF } from './services/templateConfigService.mjs';

export const handler = async (event) => {
  const { invoiceData, shop, orderId, orderName } = event;
  const invoiceId = randomUUID();

  // 1. Fetch template config from DB
  const rawConfig = await getTemplateConfig(shop);
  const templateConfig = formatConfigForPDF(rawConfig);

  // 2. Generate PDF
  const pdfBuffer = await generateInvoicePDF(invoiceData, templateConfig);

  // 3. Upload to S3
  const { fileName, s3Url } = await uploadInvoiceToS3(pdfBuffer, orderName, shop);

  // 4. Send email notification
  const emailSentTo = await sendInvoiceNotification(invoiceData, s3Url, templateConfig);

  // 5. Return results (NO DB writes — handled by invoice-1 app)
  return {
    statusCode: 200,
    invoiceId,
    fileName,
    s3Url,
    emailSentTo: emailSentTo || null,
  };
};
```

#### 4.4.4 package.json

```json
{
  "name": "lambda-generate-pdf-invoice",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "pdfkit": "^0.15.0",
    "@aws-sdk/client-s3": "^3.637.0",
    "@aws-sdk/s3-request-presigner": "^3.637.0",
    "@aws-sdk/client-dynamodb": "^3.637.0",
    "@aws-sdk/lib-dynamodb": "^3.637.0",
    "@aws-sdk/client-sns": "^3.637.0"
  }
}
```

#### 4.4.5 IAM Permissions (Reduced)

New Lambda only needs:
```json
{
  "Action": ["dynamodb:GetItem", "dynamodb:Query"],
  "Resource": [
    "arn:aws:dynamodb:*:*:table/Shops",
    "arn:aws:dynamodb:*:*:table/Templates",
    "arn:aws:dynamodb:*:*:table/TemplateConfigurations",
    "arn:aws:dynamodb:*:*:table/TemplateConfigurations/index/*"
  ]
}
```

No longer needs:
- ❌ `dynamodb:PutItem` on Invoices (moved to invoice-1 app)
- ❌ `dynamodb:UpdateItem` on ShopifyOrderItems (moved to invoice-1 app)
- ❌ `dynamodb:UpdateItem` on ShopifyOrders (moved to invoice-1 app)

---

### Phase 5: Update CloudFormation & Deploy

**File: `cloudformation-template.json`**

#### 5.1 Changes

1. Add parameter `PDFInvoiceLambdaName` (default: `shopify-generate-pdf-invoice`)
2. Add new Lambda function resource `PDFInvoiceLambdaFunction`
3. Add IAM role with reduced permissions (S3 + SNS + DynamoDB read-only for config tables)
4. Update `ShopifyAppFunction` environment variable:
   - `INVOICE_LAMBDA_NAME` → `shopify-generate-pdf-invoice`
5. Update `LambdaInvokeAccess` policy to allow invoking new Lambda
6. Keep old Lambda resources for rollback

#### 5.2 Rollback Strategy

- Keep `lambda-generate-invoice` deployed and unchanged
- Switch between old and new by changing `INVOICE_LAMBDA_NAME` env var
- If new Lambda has issues, revert env var to `shopify-generate-invoice`

---

## 5. Data Flow Comparison

### Before (Current)

```
Webhook                          Lambda
  │                                │
  ├─ taxableValue = price - disc   │
  │  (WRONG: includes tax)         │
  │                                ├─ taxableValue = price / (1 + rate)
  ├─ Write ShopifyOrderItems ──►   │  (CORRECT: excludes tax)
  │  (placeholder values)          │
  │                                ├─ Update ShopifyOrderItems
  │                                │  (overwrite taxableValue)
  │                                │
  │  ◄── Race condition gap ──►    │
```

### After (Refactored)

```
Webhook
  │
  ├─ transformOrderToInvoice()
  │  ├─ taxableValue = price / (1 + rate)  ← CORRECT
  │  ├─ discount distribution
  │  ├─ HSN extraction
  │  └─ CGST/SGST/IGST split
  │
  ├─ Write ShopifyOrderItems (correct values immediately)
  │
  ├─ Invoke Lambda SYNC ──────────► Lambda
  │                                   ├─ Fetch template config
  │                                   ├─ Generate PDF
  │                                   ├─ Upload S3
  │                                   ├─ Send email
  │  ◄─ { invoiceId, s3Url } ◄────── └─ Return
  │
  ├─ Save Invoices table
  ├─ Update ShopifyOrderItems with invoiceId
  └─ Return 200 (all done, no gaps)
```

---

## 6. Files Changed Summary

### New Files

| File | Description |
|------|-------------|
| `invoice-1/app/services/invoiceTransformer.server.ts` | Tax/discount calculation + order transformation (ported from Lambda) |
| `lambda-generate-pdf-invoice/index.mjs` | New pure PDF Lambda handler |
| `lambda-generate-pdf-invoice/package.json` | Dependencies |
| `lambda-generate-pdf-invoice/deployment/build.ps1` | Build script |
| `lambda-generate-pdf-invoice/assets/*` | Copied logo + signature |
| `lambda-generate-pdf-invoice/config/*` | Copied AWS clients |
| `lambda-generate-pdf-invoice/generators/*` | Copied PDF generator + templates |
| `lambda-generate-pdf-invoice/services/*` | Copied S3, SNS, template config services |

### Modified Files

| File | Changes |
|------|---------|
| `invoice-1/app/routes/webhooks.orders.create.tsx` | Call transformer, invoke Lambda sync, write Invoices table, update ShopifyOrderItems with invoiceId |
| `invoice-1/app/services/gstReporting.server.ts` | Accept pre-computed `GSTLineItemMeta[]` instead of raw line items |
| `invoice-1/cloudformation-template.json` | Add new Lambda, update env var, update IAM |

### Unchanged Files

| File | Status |
|------|--------|
| `lambda-generate-invoice/*` | Keep as-is for rollback |
| `invoice-1/app/routes/app.reports.tsx` | No changes needed |
| `invoice-1/app/routes/api.reports.*.tsx` | No changes needed |

---

## 7. Testing Plan

### 7.1 Unit Tests

- [ ] `invoiceTransformer.server.ts` — Test with sample Shopify order payloads
  - Item with 5% tax (price < ₹2500)
  - Item with 18% tax (price >= ₹2500)
  - Item with discount (item-level)
  - Order with discount (order-level)
  - Item with quantity > 1 (expansion)
  - Item with no tax
  - HSN extraction from metafields, properties, SKU
  - Intrastate vs interstate GST split

### 7.2 Integration Tests

- [ ] Create test order in Shopify → verify ShopifyOrderItems has correct taxable values immediately
- [ ] Verify Lambda returns { invoiceId, s3Url } synchronously
- [ ] Verify Invoices table is populated by webhook (not Lambda)
- [ ] Verify PDF content matches the computed values
- [ ] Verify GST reports show correct data without delay

### 7.3 Regression Tests

- [ ] Existing orders still display correctly in app
- [ ] Order cancellation flow still works
- [ ] Download invoice still works
- [ ] Email notification still works
- [ ] Idempotency check prevents duplicate invoices

---

## 8. Migration Notes

### 8.1 Deployment Order

1. Deploy `lambda-generate-pdf-invoice` to AWS
2. Test Lambda independently with sample invoiceData payload
3. Deploy updated `invoice-1` app with new transformer + sync invocation
4. Verify end-to-end with test orders
5. Monitor for 24-48 hours
6. Deprecate `lambda-generate-invoice` (do not delete — keep for rollback)

### 8.2 Environment Variables

| Variable | Before | After |
|----------|--------|-------|
| `INVOICE_LAMBDA_NAME` | `shopify-generate-invoice` | `shopify-generate-pdf-invoice` |

### 8.3 Backward Compatibility

- Old invoices/orders are unaffected
- ShopifyOrderItems records created before this change will have the old taxable values
- Reports will show mixed data until old records age out or are backfilled

---

## 9. Implementation Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-07 | system | Spec created |
| 2026-02-07 | system | Phases 1–5 implemented: invoiceTransformer.server.ts, writeOrderItems refactored, webhook updated (sync Lambda + Invoices write + invoiceId update), lambda-generate-pdf-invoice project created, CloudFormation updated with new Lambda + IAM |