# HSN Code Setup & Fetching Guide

## Overview

HSN (Harmonized System of Nomenclature) codes are required for GST reporting in India. This guide explains how to set up and fetch HSN codes from Shopify products.

## Step 1: Create HSN Metafield Definition in Shopify

1. Go to **Shopify Admin** → **Settings** → **Custom data** → **Products**
2. Click **Add definition**
3. Configure:
   - **Name**: `HSN Code`
   - **Namespace and key**: `custom.hsn_code`
   - **Type**: Single line text
   - **Validation**: Minimum 4 characters, Maximum 8 characters
4. Click **Save**

## Step 2: Add HSN Codes to Products

### Option A: Manually in Shopify Admin
1. Go to **Products** → Select a product
2. Scroll to **Metafields** section
3. Find **HSN Code** field
4. Enter the 4-8 digit HSN code (e.g., `6109` for T-shirts)
5. Save

### Option B: Bulk Import via CSV
```csv
Handle,HSN Code
blue-cotton-tshirt,6109
womens-dress,6204
leather-shoes,6403
```

## Step 3: Fetch HSN Codes in Your App

The app now includes a `productMetafields.server.ts` service for fetching HSN codes.

### Usage in Webhook Handler

```typescript
import { enrichLineItemsWithHSN } from "~/services/productMetafields.server";

export async function handleOrderCreated(payload: any, admin: any) {
  // Enrich line items with HSN codes from Shopify
  const enrichedPayload = {
    ...payload,
    line_items: await enrichLineItemsWithHSN(admin, payload.line_items),
  };
  
  // Now use enrichedPayload for invoice generation
  const invoiceData = transformOrderToInvoice(enrichedPayload, companyState);
}
```

### Usage for Single Product

```typescript
import { fetchProductHSNCode } from "~/services/productMetafields.server";

const hsnCode = await fetchProductHSNCode(admin, "7234567890");
console.log(hsnCode); // "6109"
```

### Usage for Multiple Products

```typescript
import { fetchProductHSNCodes } from "~/services/productMetafields.server";

const productIds = ["7234567890", "7234567891", "7234567892"];
const hsnMap = await fetchProductHSNCodes(admin, productIds);

console.log(hsnMap.get("7234567890")); // "6109"
console.log(hsnMap.get("7234567891")); // "6204"
```

## HSN Extraction Priority

The `invoiceTransformer.server.ts` extracts HSN codes in this order:

1. **Product metafield** `custom.hsn_code` ⭐ (Recommended)
2. **Line item properties** containing "hsn"
3. **SKU regex** pattern `HSN(\d{4,8})`

Example SKU formats that work:
- `HSN6109-TSHIRT-001` → extracts `6109`
- `HSN61091000-MEDIUM` → extracts `61091000`

## Common HSN Codes for Apparel

| Product Type | HSN Code | Description |
|-------------|----------|-------------|
| T-shirts | 6109 | T-shirts, singlets, knitted |
| Women's dresses | 6204 | Women's or girls' suits, not knitted |
| Men's shirts | 6205 | Men's or boys' shirts, not knitted |
| Trousers | 6203 | Men's or boys' suits, not knitted |
| Shoes (leather) | 6403 | Footwear with outer soles of rubber |
| Handbags | 4202 | Trunks, suitcases, handbags |

## Troubleshooting

### HSN codes not appearing in invoices?

1. **Check metafield definition**: Go to Shopify Admin → Settings → Custom data → Products
2. **Verify namespace**: Must be exactly `custom.hsn_code`
3. **Check product**: Open product and verify HSN code is filled in metafields section
4. **Test GraphQL query** in Shopify Admin → Apps → GraphiQL:

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

### Performance considerations

- The service batches requests (250 products per query)
- Results are cached within each webhook processing
- Consider caching HSN codes in DynamoDB if you process many orders

## Next Steps

After setting up HSN codes:

1. Test with a new order to verify HSN appears in invoice
2. Check GST reports to ensure HSN codes are populated
3. Use HSN Summary report for GSTR-1 filing compliance

## Resources

- [Shopify Metafields Documentation](https://shopify.dev/docs/apps/custom-data/metafields)
- [GST HSN Code Search (India)](https://www.gst.gov.in/help/hsn)
- [Indian GST Portal](https://www.gst.gov.in/)
