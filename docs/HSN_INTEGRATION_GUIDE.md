# HSN Code Integration — Implementation Guide

## Where to Add HSN Fetching

The best place to fetch HSN codes is in the webhook handler **before** calling `transformOrderToInvoice()`.

### Location: `app/services/webhookUtils.server.ts`

**Current flow (line ~259):**
```typescript
export async function generateInvoicePipeline(opts: {
  shop: string;
  payload: any;
  // ...
}): Promise<InvoiceGenerationResult> {
  const { shop, payload, /* ... */ } = opts;
  
  // 1. Transform order → InvoiceData
  const invoiceData = transformOrderToInvoice(
    payload as ShopifyOrderPayload,
    fulfillmentState
  );
  // ...
}
```

**Updated flow with HSN fetching:**
```typescript
import { enrichLineItemsWithHSN } from "./productMetafields.server";

export async function generateInvoicePipeline(opts: {
  shop: string;
  payload: any;
  admin?: any;  // Add admin client
  // ...
}): Promise<InvoiceGenerationResult> {
  const { shop, payload, admin, /* ... */ } = opts;
  
  // NEW: Enrich payload with HSN codes from Shopify
  let enrichedPayload = payload;
  if (admin && payload.line_items) {
    try {
      const enrichedLineItems = await enrichLineItemsWithHSN(admin, payload.line_items);
      enrichedPayload = {
        ...payload,
        line_items: enrichedLineItems,
      };
      console.log(`[InvoicePipeline] Enriched ${enrichedLineItems.length} line items with HSN codes`);
    } catch (error) {
      console.error('[InvoicePipeline] Error fetching HSN codes:', error);
      // Continue with original payload
    }
  }
  
  // 1. Transform order → InvoiceData
  const invoiceData = transformOrderToInvoice(
    enrichedPayload as ShopifyOrderPayload,
    fulfillmentState
  );
  // ...
}
```

## Webhook Route Integration

You also need to pass the `admin` client to `generateInvoicePipeline()` from your webhook routes.

### Example: Lambda webhook handler

If using Lambda handlers (`lambda-shopify-orderCreated.mjs`), you'll need to:

1. **Store shop access token** in DynamoDB when shop installs the app
2. **Fetch access token** in Lambda
3. **Create admin GraphQL client** in Lambda
4. **Pass to pipeline**

### Example: App-embedded webhook handler

If processing webhooks in the Remix app itself:

```typescript
// app/routes/webhooks.orders.create.tsx
import { authenticate } from "~/shopify.server";
import { generateInvoicePipeline } from "~/services/webhookUtils.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop, payload, admin } = await authenticate.webhook(request);
  
  await generateInvoicePipeline({
    shop,
    payload,
    admin,  // Pass admin client
    orderName: payload.name,
    fulfillmentState: "Punjab",
    companyGSTIN: "03AVNPR3936N1ZI",
    source: "webhook-orders-create",
  });
  
  return new Response("OK", { status: 200 });
}
```

## Testing HSN Fetching

### 1. Set up test product in Shopify

```bash
# Using Shopify Admin
1. Go to Products → Add product
2. Add title, price, etc.
3. Scroll to Metafields
4. Set HSN Code = "6109"
5. Save
```

### 2. Test GraphQL query

```graphql
{
  product(id: "gid://shopify/Product/YOUR_PRODUCT_ID") {
    id
    title
    metafield(namespace: "custom", key: "hsn_code") {
      value
    }
  }
}
```

### 3. Create test order

1. Create order in Shopify with the test product
2. Check Lambda logs for: `[InvoicePipeline] Enriched X line items with HSN codes`
3. Download invoice → verify HSN appears in product name
4. Check GST reports → verify HSN column is populated

## Performance Considerations

### Batching
- Service fetches up to 250 products per GraphQL request
- Multi-product orders only make 1 API call

### Caching
Consider caching HSN codes in DynamoDB:

```typescript
// products-table: { productId, hsnCode, lastUpdated }
// Check cache first, fallback to Shopify API
```

### Rate limits
- Shopify: 2 requests/second for REST, 50 cost points/second for GraphQL
- Our query costs ~1-2 points per product
- Safe for typical order volumes (1-10 products per order)

## Fallback Strategy

The system has multiple fallback methods:

1. **Shopify metafield** (requires API call) ← NEW
2. **Line item properties** (webhook includes this)
3. **SKU pattern** `HSN6109-...` (no API call needed)
4. **"UNCLASSIFIED"** if none found

So even if the API call fails, invoices will still generate.

## Migration: Adding HSN to Existing Orders

For historical orders already in the database, you can:

1. **Backfill script**: Fetch HSN codes and update ShopifyOrderItems table
2. **Regenerate invoices**: Delete old PDFs, trigger regeneration with enriched data
3. **Manual CSV update**: Export ShopifyOrderItems, add HSN column, reimport

Example backfill script structure:

```typescript
// dbmigrations/backfill-hsn-codes.mjs
import { fetchProductHSNCodes } from '../app/services/productMetafields.server';

// 1. Scan ShopifyOrderItems where hsn is missing
// 2. Group by productId
// 3. Fetch HSN codes in batches
// 4. Update records with UpdateCommand
```

## Next Steps

1. ✅ Create metafield definition in Shopify Admin
2. ✅ Add HSN codes to your products
3. ⏳ Update webhook handlers to pass `admin` client
4. ⏳ Test with a new order
5. ⏳ Verify HSN appears in invoice & reports
6. ⏳ (Optional) Backfill existing orders

Need help with any of these steps? Let me know!
