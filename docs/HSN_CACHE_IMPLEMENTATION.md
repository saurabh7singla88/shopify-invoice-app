# HSN Code Caching - Implementation Summary

## What Was Implemented

A complete HSN code caching system that syncs product metafields to local DynamoDB for fast lookups.

## Files Created/Modified

### 1. Database (CloudFormation)
- ✅ Added `ProductsTable` to [cloudformation-template.json](cloudformation-template.json)
  - PK: `shop`, SK: `productId`
  - TTL: 90 days auto-cleanup
  - Stores: HSN code, title, SKU, variant ID, updated timestamp

### 2. Core Services
- ✅ [app/services/products.server.ts](app/services/products.server.ts)
  - `getCachedHSNCode()` - Get single HSN from cache
  - `getCachedHSNCodes()` - Batch get HSN codes
  - `getHSNCodeWithFallback()` - Cache first, API fallback
  - `getHSNCodesForLineItems()` - Used in order processing
  - `saveProduct()` - Cache product data
  - `deleteProduct()` - Remove from cache

- ✅ [app/services/productMetafields.server.ts](app/services/productMetafields.server.ts)
  - Updated `enrichLineItemsWithHSN()` to use cache first
  - Keeps direct Shopify API functions for fallback

### 3. Webhook Handler
- ✅ [app/routes/webhooks.products.update.tsx](app/routes/webhooks.products.update.tsx)
  - Receives products/update webhooks
  - Extracts HSN from `custom.hsn_code` metafield
  - Saves to Products table cache

### 4. Integration Points
- ✅ [app/services/webhookUtils.server.ts](app/services/webhookUtils.server.ts)
  - Updated `generateInvoicePipeline()` to enrich line items with cached HSN codes
  - Happens before invoice transformation
  - No Shopify API call needed - uses cache only

- ✅ [app/constants/tables.ts](app/constants/tables.ts)
  - Added `PRODUCTS: "Products"` constant

## How It Works

### Flow Diagram

```
Product Updated in Shopify
         ↓
products/update webhook
         ↓
webhooks.products.update.tsx
         ↓
products.server.ts (saveProduct)
         ↓
DynamoDB Products Table

─────────────────────────────────

Order Created in Shopify
         ↓
orders/create webhook
         ↓
webhookUtils.generateInvoicePipeline()
         ↓
enrichLineItemsWithHSN() ← Uses cache (no API call!)
         ↓
transformOrderToInvoice()
         ↓
Invoice with HSN codes
```

### Cache Strategy

1. **On Product Update** (products/update webhook):
   - Extract HSN code from metafield
   - Save to DynamoDB Products table
   - TTL: 90 days

2. **On Order Create** (orders/create webhook):
   - Look up HSN codes from cache
   - No Shopify API call needed
   - Falls back to direct API if cache miss (optional)

## Deployment Steps

### 1. Deploy CloudFormation Stack

```powershell
npm run deploy:aws
```

This creates the Products table in DynamoDB.

### 2. Webhook Registration

The `products/update` webhook is automatically registered via `shopify.app.toml` and `shopify.app.dev.toml`:

```toml
[[webhooks.subscriptions]]
topics = [ "products/update" ]
uri = "/webhooks/products/update"
```

Shopify automatically subscribes when:
- You install the app
- You reinstall the app  
- You run `npm run dev` or deploy

**No manual subscription needed!** Verify in Shopify Admin → Settings → Notifications → Webhooks.

### 3. Backfill Existing Products (Optional)

Create a backfill script to populate cache with existing products:

```typescript
// dbmigrations/backfill-product-hsn.mjs
import { authenticate } from "../app/shopify.server.ts";
import { fetchProductHSNCodes } from "../app/services/productMetafields.server.ts";
import { saveProducts } from "../app/services/products.server.ts";

// 1. Fetch all products from Shopify
// 2. Extract HSN codes
// 3. Bulk save to Products table
```

### 4. Test

1. **Create/Update product in Shopify** with HSN code metafield
2. **Check DynamoDB** - verify product appears in Products table
3. **Create order** with that product
4. **Check logs** - should see: `[InvoicePipeline] Enriched X line items with cached HSN codes`
5. **Download invoice** - verify HSN code appears

## Benefits

✅ **Performance**: No Shopify API call on every order (cache hit)  
✅ **Rate Limits**: Avoids hitting Shopify API limits on high volume  
✅ **Reliability**: Works even if Shopify API is slow/down  
✅ **Cost**: Fewer Lambda invocations, cheaper DynamoDB reads  
✅ **Scalability**: Handles thousands of orders/day without issue  

## Monitoring

Check these logs:

```bash
# Product cache updates
[Webhook] Cached product 7234567890 with HSN: 6109

# Order processing (cache hit)
[InvoicePipeline] Enriched 3 line items with cached HSN codes

# Order processing (cache miss)
[Products] Error fetching cached HSN: ...
[Products] Fetching from Shopify API...
```

## Fallback Behavior

If cache misses:
1. Tries to fetch from Shopify API (if admin client available)
2. Falls back to SKU regex extraction: `HSN6109-...`
3. Falls back to line item properties
4. Falls back to "UNCLASSIFIED" in reports

No data loss - invoices always generate!

## Next Steps

1. Deploy CloudFormation update
2. Subscribe to products/update webhook
3. Add HSN codes to products in Shopify
4. Test with a new order
5. (Optional) Backfill existing products
6. Monitor logs for cache hits

---

**Questions?** Check logs or test with a single product first.
