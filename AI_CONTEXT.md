# AI Context - Technical Architecture

This document provides detailed technical context for AI models to understand the Shopify Invoice App codebase architecture, patterns, and implementation details.

---

## System Architecture

### Multi-Lambda Serverless Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                     Shopify Platform                        │
│  - Admin UI (Embedded App)                                  │
│  - OAuth Flow (Token Exchange)                              │
│  - Webhooks (orders/create, orders/cancelled, etc)          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              API Gateway HTTP API (v2 Payload)              │
│  - Route: ANY /{proxy+}                                     │
│  - Integration: Lambda (shopify-invoice-app)                │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│         Lambda: shopify-invoice-app (Node.js 20.x)          │
│  Entry: server.lambda.mjs                                   │
│  Adapter: @codegenie/serverless-express                     │
│  Framework: React Router v7 (SSR)                           │
│                                                              │
│  Routes:                                                     │
│  - /auth/* → OAuth handlers                                 │
│  - /app/* → Admin UI pages                                  │
│  - /webhooks/* → Webhook handlers                           │
└─────┬───────────────────────────┬────────────────────────────┘
      │                           │
      ▼                           ▼
┌──────────────────┐    ┌──────────────────────────────────────┐
│   DynamoDB       │    │  Lambda: shopify-generate-invoice    │
│                  │    │  Entry: index.mjs                     │
│  Tables:         │    │  Libraries: PDFKit, AWS SDK           │
│  - Sessions      │    │                                        │
│  - Orders        │    │  Flow:                                │
│  - Shops         │    │  1. Load template config              │
│  - Templates     │    │  2. Transform order data              │
│  - Configs       │    │  3. Generate PDF                      │
│  - Invoices      │    │  4. Upload to S3                      │
│  - AuditLogs     │    │  5. Save invoice record               │
└──────────────────┘    └─────────────────┬─────────────────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │      S3 Buckets        │
                              │                        │
                              │  - assets/             │
                              │    (Static JS/CSS)     │
                              │  - invoices/           │
                              │    (Generated PDFs)    │
                              │  - cancelled-invoices/ │
                              └────────────────────────┘
```

---

## Technology Stack Details

### Frontend/Server Layer

**React Router v7** (SSR Framework)
- File-based routing: `app/routes/*.tsx`
- Server-side rendering on Lambda
- Entry point: `app/entry.server.tsx`
- Client hydration: `app/entry.client.tsx`

**Shopify App Bridge**
- Embedded app in Shopify Admin
- JWT-based authentication
- Token exchange strategy (OAuth 2.0)

**Polaris Components**
- Shopify's React UI library
- Consistent design with Shopify Admin

### Backend Layer

**AWS Lambda** (Node.js 20.x)
- Runtime: Node.js 20.x
- Handler: `server.lambda.mjs → handler`
- Adapter: `@codegenie/serverless-express` (Express wrapper)
- Memory: 1024 MB (configurable)
- Timeout: 30s (configurable)

**Adapter Pattern (server.lambda.mjs)**
```javascript
import serverless from '@codegenie/serverless-express';
import { handler as remixHandler } from './build/server/index.js';

export const handler = serverless({ app: remixHandler });
```

**API Gateway HTTP API**
- Payload format: v2.0
- Route: `ANY /{proxy+}` → Lambda integration
- No authorization (handled by Lambda)

### Database Layer

**DynamoDB** (NoSQL, On-Demand)

**Table: shopify_sessions**
- PK: `id` (String) - Session ID
- Attributes: `shop`, `state`, `isOnline`, `scope`, `accessToken`, `expires`
- GSI: `shop_index` (shop as PK) - Query sessions by shop
- TTL: `expires` field for auto-cleanup

**Table: ShopifyOrders**
- PK: `orderId` (String) - Shopify order ID
- Attributes: `shop`, `orderName`, `orderData` (JSON), `status`, `createdAt`, `updatedAt`
- Status values: `created`, `cancelled`, `returned`

**Table: Shops**
- PK: `shop` (String) - Shop domain
- Attributes: `shopName`, `email`, `domain`, `installedAt`, `uninstalledAt`, `isActive`

**Table: Templates**
- PK: `templateId` (String)
- Attributes: `name`, `description`, `previewImage`, `defaultConfig` (JSON)

**Table: TemplateConfigurations**
- PK: `shop` (String)
- SK: `templateId` (String)
- Attributes: Nested JSON for fonts, colors, company details, styling

**Table: Invoices**
- PK: `invoiceId` (String)
- Attributes: `orderId`, `shop`, `s3Key`, `s3Url`, `status`, `generatedAt`

**Table: AuditLogs**
- PK: `logId` (String)
- Attributes: `shop`, `action`, `resource`, `metadata`, `timestamp`
- TTL: 90 days

### Storage Layer

**S3 Buckets**

**Bucket 1: `shopify-invoice-app-assets-{accountId}`**
- Purpose: Static assets for the React Router app
- Access: Public read
- Contents: 
  - `assets/` - React Router build output (JS, CSS, images)

**Bucket 2: `shopify-invoice-master` (from env variable `S3_BUCKET_NAME`)**
- Purpose: Invoice PDFs, company assets
- Access: Private (pre-signed URLs for access)
- Folder structure:
  - `invoices/` - Generated invoice PDFs
  - `cancelled-invoices/` - Cancelled order invoice PDFs
  - `logos/` - Company logos uploaded via Customize Template
  - `signatures/` - Signature images uploaded via Customize Template

---

## Authentication & Authorization

### OAuth Flow (Token Exchange Strategy)

**1. Installation Flow**
```
User clicks "Install App"
  ↓
Shopify → /auth (GET)
  ↓
App generates state token → Redirects to Shopify OAuth
  ↓
Shopify OAuth → /auth/callback (GET) with ?code=xxx
  ↓
App exchanges code for access token
  ↓
Store access token in DynamoDB (shopify_sessions)
  ↓
Redirect to /app (Admin UI)
```

**2. Embedded App Authentication (JWT)**
```
Shopify Admin loads embedded app
  ↓
App Bridge injects session token (JWT) in requests
  ↓
App validates JWT signature (SHOPIFY_API_SECRET)
  ↓
Extract shop domain from JWT
  ↓
Load session from DynamoDB
  ↓
Use access token for Shopify API calls
```

**Critical Configuration**
```toml
# shopify.app.toml
[access_scopes]
use_legacy_install_flow = false  # REQUIRED for token exchange
```

Without this setting, the app will fail to authenticate in embedded mode.

### Webhook Verification (HMAC)

**Two-secret verification pattern:**
```javascript
// webhooks.orders.create.tsx
const receivedHmac = request.headers.get("x-shopify-hmac-sha256");
const appSecret = process.env.SHOPIFY_API_SECRET;
const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;

// Try both secrets
const appHmac = createHmac("sha256", appSecret).update(rawBody).digest("base64");
const webhookHmac = createHmac("sha256", webhookSecret).update(rawBody).digest("base64");

if (!timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(appHmac)) &&
    !timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(webhookHmac))) {
  return new Response("Unauthorized", { status: 401 });
}
```

**Why two secrets?**
- Automatic webhooks: Use `SHOPIFY_API_SECRET`
- Manual webhooks: Use `SHOPIFY_WEBHOOK_SECRET` (from Shopify Admin)

---

## Code Organization

### Key Files & Their Responsibilities

**app/shopify.server.ts**
- Shopify API configuration
- Session storage setup
- Scopes: Hardcoded `["read_orders", "read_customers"]`
- Table names: Imported from `constants/tables.ts`

**app/db.server.ts**
- DynamoDB client initialization
- Exports configured DynamoDB DocumentClient

**app/constants/tables.ts**
- Central definition of table names
- Used throughout app instead of environment variables
```typescript
export const TABLE_NAMES = {
  SESSIONS: "shopify_sessions",
  ORDERS: "ShopifyOrders",
  SHOPS: "Shops",
  TEMPLATES: "Templates",
  TEMPLATE_CONFIGURATIONS: "TemplateConfigurations",
  INVOICES: "Invoices",
  AUDIT_LOGS: "AuditLogs"
};
```

**app/constants/indianStates.ts**
- Array of 36 Indian states and union territories
- Used in template customization dropdown

**app/routes/webhooks.orders.create.tsx**
- Handles `orders/create` webhook
- Stores order in DynamoDB
- Invokes `shopify-generate-invoice` Lambda asynchronously
```typescript
const invokeParams = {
  FunctionName: process.env.INVOICE_LAMBDA_NAME || "shopify-generate-invoice",
  InvocationType: "Event" as const,  // Async
  Payload: Buffer.from(JSON.stringify(payload))
};
await lambdaClient.send(new InvokeCommand(invokeParams));
```

**app/routes/app.templates-customize.tsx**
- Template customization UI
- Saves configuration to TemplateConfigurations table
- Fields: company details, logo, signature, colors, fonts

**server.lambda.mjs**
- Lambda handler entry point
- Wraps React Router app with serverless-express
- Handles API Gateway HTTP API v2 payload format

**lambda-generate-invoice/index.mjs**
- Invoice generation Lambda handler
- Flow:
  1. Parse event (order data)
  2. Load template config (4-tier fallback)
  3. Transform order data
  4. Generate PDF with PDFKit
  5. Upload to S3
  6. Save invoice record

**lambda-generate-invoice/generators/templates/minimalistTemplate.mjs**
- PDF template using PDFKit
- Renders: header, order info, line items, totals, footer
- Configurable: fonts, colors, company details
- GST compliance: Shows CGST/SGST or IGST based on state

**lambda-generate-invoice/services/templateConfigService.mjs**
- Loads template configuration from DynamoDB
- 4-tier fallback system:
  1. TemplateConfigurations (shop-specific)
  2. Templates (template defaults)
  3. Environment variables (deprecated)
  4. Hard-coded defaults
- Transforms flat DB structure to nested structure for PDF generator

**lambda-generate-invoice/transformers/shopifyOrderTransformer.mjs**
- Transforms Shopify order JSON to invoice data format
- Calculates GST (CGST/SGST or IGST)
- Formats currency values
- Extracts line items, customer, shipping address

---

## Configuration Hierarchy (4-Tier Fallback)

### Order of Precedence

```
1. TemplateConfigurations Table (shop-specific)
   ↓ (if not found)
2. Templates Table (template defaults)
   ↓ (if not found)
3. Environment Variables (deprecated, still supported)
   ↓ (if not found)
4. Hard-coded Defaults
```

### Example: Company Name Resolution

```javascript
// minimalistTemplate.mjs
const companyName = 
  templateConfig?.company?.name ||          // 1. Shop config
  'Your Company Name';                      // 4. Default

// Previously (deprecated):
// process.env.COMPANY_NAME ||               // 3. Env var
```

### Configuration Structure (DynamoDB)

**Flat structure in DB:**
```json
{
  "shop": "example.myshopify.com",
  "templateId": "minimalist",
  "companyName": "Acme Corp",
  "companyLegalName": "Acme Corporation Pvt Ltd",
  "companyAddressLine1": "123 Main St",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "primaryColor": "#2563eb",
  "fontFamily": "Helvetica"
}
```

**Transformed to nested structure for PDF:**
```javascript
{
  company: {
    name: "Acme Corp",
    legalName: "Acme Corporation Pvt Ltd",
    address: {
      line1: "123 Main St",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001"
    }
  },
  styling: {
    primaryColor: "#2563eb"
  },
  fonts: {
    family: "Helvetica"
  }
}
```

**Transformation happens in:** `templateConfigService.formatConfigForPDF()`

---

## Data Flow Patterns

### Invoice Generation Flow

```
1. Shopify creates order
   ↓
2. Webhook → API Gateway → Lambda (App)
   ↓
3. Webhook handler validates HMAC
   ↓
4. Store order in DynamoDB (ShopifyOrders)
   ↓
5. Invoke Lambda (Invoice Gen) asynchronously
   ↓ [Separate Lambda execution]
6. Load template config (4-tier fallback)
   ↓
7. Transform order data (Shopify JSON → Invoice format)
   ↓
8. Calculate GST (CGST/SGST or IGST based on states)
   ↓
9. Generate PDF with PDFKit
   ↓
10. Upload PDF to S3 (invoices/ folder)
   ↓
11. Save invoice record to DynamoDB (Invoices table)
   ↓
12. Return success
```

### Template Customization Flow

```
1. User opens "Customize Template" page
   ↓
2. Load current config from TemplateConfigurations
   ↓
3. User modifies fields (company, colors, fonts)
   ↓
4. Upload logo/signature to S3 (if changed)
   ↓
5. Save config to TemplateConfigurations (flat structure)
   ↓
6. Next invoice generation uses new config
```

---

## Critical Code Patterns

### Session Storage (DynamoDB Adapter)

**Pattern:** Custom session storage for `@shopify/shopify-api`

**File:** `app/db.server.ts` (implied, or inline in `shopify.server.ts`)

```typescript
const sessionStorage = {
  async storeSession(session) {
    await dynamodb.send(new PutCommand({
      TableName: TABLE_NAMES.SESSIONS,
      Item: {
        id: session.id,
        shop: session.shop,
        state: session.state,
        isOnline: session.isOnline,
        scope: session.scope,
        accessToken: session.accessToken,
        expires: session.expires?.getTime()
      }
    }));
  },
  
  async loadSession(id) {
    const result = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAMES.SESSIONS,
      Key: { id }
    }));
    return result.Item ? new Session(result.Item) : undefined;
  },
  
  async deleteSession(id) {
    await dynamodb.send(new DeleteCommand({
      TableName: TABLE_NAMES.SESSIONS,
      Key: { id }
    }));
  }
};
```

### Lambda Invocation Pattern (Async)

**Pattern:** Fire-and-forget Lambda invocation

**File:** `app/routes/webhooks.orders.create.tsx`

```typescript
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

try {
  await lambdaClient.send(new InvokeCommand({
    FunctionName: process.env.INVOICE_LAMBDA_NAME || "shopify-generate-invoice",
    InvocationType: "Event",  // Async, don't wait for response
    Payload: Buffer.from(JSON.stringify({ ...payload, shop }))
  }));
  console.log("Invoice generation Lambda invoked successfully");
} catch (error) {
  console.error("Error invoking invoice Lambda:", error);
  // Continue even if invoice generation fails
}
```

**Why async?** Webhook must respond quickly (<5s) to avoid retries.

### GST Calculation Pattern

**Pattern:** Determine intrastate vs interstate based on company/customer states

**File:** `lambda-generate-invoice/transformers/shopifyOrderTransformer.mjs`

```javascript
const companyState = templateConfig?.company?.address?.state;
const customerState = order.shipping_address?.province;

if (companyState === customerState) {
  // Intrastate: Split tax into CGST + SGST
  item._cgst = (item.taxAmount / 2);
  item._sgst = (item.taxAmount / 2);
  item._igst = 0;
} else {
  // Interstate: Full tax as IGST
  item._cgst = 0;
  item._sgst = 0;
  item._igst = item.taxAmount;
}
```

---

## Environment Variables vs Constants

### Migration: Environment Variables → Constants

**Old pattern (deprecated):**
```javascript
const sessionTable = process.env.DYNAMODB_SESSION_TABLE || "shopify_sessions";
```

**New pattern (current):**
```typescript
import { TABLE_NAMES } from '../constants/tables';
const sessionTable = TABLE_NAMES.SESSIONS;  // "shopify_sessions"
```

**Rationale:**
- Table names never change across environments
- Simplifies configuration management
- Reduces environment variable clutter
- Type-safe with TypeScript

**Still using environment variables:**
- `SHOPIFY_API_KEY` - Varies per app
- `SHOPIFY_API_SECRET` - Varies per app
- `SHOPIFY_APP_URL` - Varies per environment
- `SHOPIFY_WEBHOOK_SECRET` - Varies per app
- `S3_BUCKET_NAME` - Varies per environment
- `INVOICE_LAMBDA_NAME` - Varies per environment (via CloudFormation parameter)

---

## Deployment Architecture

### Build Process

```
npm run build
  ↓
Vite builds React Router app
  ↓
Output:
  - build/client/  → Static assets (JS, CSS, images)
  - build/server/  → Server-side code (SSR)
```

### Deployment Package

**Lambda (App):**
```
deployment-package.zip
├── build/server/        # SSR code
├── node_modules/        # Production dependencies only
└── server.lambda.mjs    # Lambda handler
```

**Lambda (Invoice Gen):**
```
deployment-package.zip
├── index.mjs
├── generators/
├── services/
├── transformers/
├── utils/
├── config/
└── node_modules/
```

### Deployment Steps (deploy.ps1)

```powershell
1. npm run build                           # Build React Router app
2. aws s3 sync build/client s3://bucket/   # Upload static assets
3. Create ZIP: build/server + node_modules + handler
4. aws lambda update-function-code         # Upload ZIP to Lambda
5. Verify deployment
```

---

## Common Failure Points & Solutions

### 1. Cold Start Timeout

**Symptom:** First request after idle period times out

**Root Cause:** Lambda cold start + large bundle

**Solutions:**
- Increase memory (faster cold start): 2048 MB
- Increase timeout: 60s
- Consider Lambda Provisioned Concurrency (cost: ~$40/month)

### 2. Session Not Found (Auth Loop)

**Symptom:** App redirects to `/auth/session-token` repeatedly

**Root Cause:** `use_legacy_install_flow = true` or not set

**Solution:**
```toml
[access_scopes]
use_legacy_install_flow = false  # CRITICAL
```
Then reinstall app.

### 3. Webhook HMAC Validation Fails

**Symptom:** 401 errors on webhook endpoints

**Root Causes:**
- Manually registered webhook using different secret
- Body parsed before HMAC validation

**Solution:**
```javascript
const requestClone = request.clone();  // Clone before parsing
const rawBody = await requestClone.text();  // Get raw body for HMAC
// ... validate HMAC ...
const payload = await request.json();  // Parse after validation
```

### 4. Pincode Not Showing in Invoice

**Symptom:** Pincode field saved in DB but not in PDF

**Root Cause:** Data transformation mismatch

**Solution:** Ensure `templateConfigService.formatConfigForPDF()` maps pincode:
```javascript
company: {
  address: {
    line1: config.companyAddressLine1,
    line2: config.companyAddressLine2,
    city: config.city,
    state: config.state,
    pincode: config.pincode  // Ensure this is included
  }
}
```

### 5. Assets Not Loading (404)

**Symptom:** CSS/JS return 404 from S3

**Root Causes:**
- Assets not synced to S3
- Bucket policy doesn't allow public read

**Solution:**
```powershell
# Re-sync assets
aws s3 sync build/client s3://bucket/assets/ --delete

# Verify bucket policy allows GetObject
```

---

## Performance Considerations

### Lambda Memory vs Cold Start

| Memory | Cold Start | Warm Execution | Cost |
|--------|------------|----------------|------|
| 512 MB | ~5-8s | ~300ms | Low |
| 1024 MB | ~3-5s | ~200ms | Medium |
| 2048 MB | ~2-3s | ~150ms | High |

**Recommendation:** 1024 MB for balance

### DynamoDB Billing Mode

**On-Demand** (Current):
- No capacity planning needed
- Pay per request
- Good for unpredictable traffic

**Provisioned** (Alternative):
- Fixed capacity (RCU/WCU)
- Lower cost for consistent traffic
- Requires capacity planning

**When to switch:** If traffic is consistent and high (>100k requests/day)

### S3 Storage Classes

**Standard** (Current):
- Instant access
- $0.023/GB/month

**Glacier Instant Retrieval** (For old invoices):
- Instant access, lower cost
- $0.004/GB/month
- Use S3 Lifecycle Policy: Move invoices >90 days old

---

## Security Patterns

### HMAC Timing-Safe Comparison

```javascript
import { timingSafeEqual } from 'crypto';

// UNSAFE - vulnerable to timing attacks
if (receivedHmac === computedHmac) { ... }

// SAFE - constant-time comparison
if (timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(computedHmac))) { ... }
```

### Session Token Encryption

Sessions stored in DynamoDB include `accessToken` (unencrypted).

**Improvement:** Encrypt `accessToken` using AWS KMS before storing.

### S3 Bucket Policies

**Current:** Public read for assets, private for invoices

**Recommendation:** Use CloudFront signed URLs for invoices instead of S3 pre-signed URLs (longer expiry, better performance)

---

## Testing Strategies

### Local Webhook Testing

```powershell
# Terminal 1: Start local dev
npm run dev

# Terminal 2: Test webhook
curl -X POST http://localhost:3000/webhooks/orders/create `
  -H "Content-Type: application/json" `
  -H "X-Shopify-Hmac-Sha256: COMPUTED_HMAC" `
  -d @test-events/order-create.json
```

### Lambda Testing (Local)

```powershell
# Test invoice generation locally
cd lambda-generate-invoice
node test/test-pdf-local.mjs
```

### Lambda Testing (AWS)

```powershell
# Invoke invoice Lambda with test event
aws lambda invoke `
  --function-name shopify-generate-invoice `
  --payload file://test-events/list-invoices-no-filters.json `
  response.json
```

---

## Monitoring & Observability

### Key CloudWatch Metrics

**Lambda (App):**
- Invocations
- Duration (p50, p99)
- Errors
- Throttles
- Cold starts (InitDuration)

**Lambda (Invoice Gen):**
- Invocations
- Duration
- Errors

**DynamoDB:**
- ConsumedReadCapacityUnits
- ConsumedWriteCapacityUnits
- UserErrors (throttling)

**API Gateway:**
- Count (requests)
- Latency (p50, p99)
- 4XXError, 5XXError

### Custom Logging Pattern

```javascript
// Structured logging for CloudWatch Insights
console.log(JSON.stringify({
  level: "INFO",
  timestamp: new Date().toISOString(),
  shop: shop,
  orderId: orderId,
  action: "invoice_generated",
  metadata: { s3Key, invoiceId }
}));
```

### CloudWatch Insights Queries

**Query: Find slow requests**
```
fields @timestamp, @duration, @requestId
| filter @duration > 5000
| sort @duration desc
```

**Query: Find webhook errors**
```
fields @timestamp, @message
| filter @message like /ERROR/
| filter @message like /webhook/
```

---

## Future Enhancements

### Potential Improvements

1. **Event-Driven Architecture**
   - Use SNS/SQS between webhooks and invoice generation
   - Better error handling and retries

2. **Caching Layer**
   - Use ElastiCache (Redis) for template configs
   - Reduce DynamoDB reads

3. **Multi-Region Deployment**
   - Deploy to multiple AWS regions
   - Use Route 53 for failover

4. **Enhanced Monitoring**
   - X-Ray tracing for request flow
   - Custom CloudWatch dashboards

5. **Cost Optimization**
   - S3 Lifecycle policies (move old invoices to Glacier)
   - DynamoDB TTL for expired sessions
   - Lambda Reserved Concurrency limits

---

## Key Decisions & Rationale

### Why React Router v7 instead of Next.js?

- Official Shopify template
- Built-in SSR support
- Better integration with Shopify CLI
- Simpler deployment model (single Lambda)

### Why DynamoDB instead of RDS?

- Serverless (no idle costs)
- Auto-scaling
- Single-digit millisecond latency
- Pay-per-request pricing
- Simpler to manage (no connection pooling)

### Why Two Lambdas instead of One?

- Separation of concerns (app vs invoice generation)
- Different memory/timeout requirements
- Invoice generation can be triggered by other sources (API, scheduled)
- Better error isolation

### Why Hardcode Table Names?

- Table names never change across environments
- Reduces configuration complexity
- Type-safe with constants
- Easier to refactor

### Why 4-Tier Config Fallback?

- Flexibility for migration (env vars deprecated but supported)
- Shop-specific overrides (tier 1)
- Template defaults (tier 2)
- Graceful degradation (tier 4)

---

**This document provides comprehensive technical context for AI models to understand and extend the Shopify Invoice App codebase.**
