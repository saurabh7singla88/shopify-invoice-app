# Plan: Add GST Reports Feature with GSTR-1 Compliance

## Overview
Add a GST Reports page with filterable views for GSTR-1 B2C (Others) and HSN-wise summary reports. This requires capturing product-level tax data during invoice generation and storing it in a new DynamoDB table optimized for reporting queries.

---

## Steps

### 1. Create new DynamoDB table: `ShopifyOrderItems`
- Design schema with composite keys for efficient querying
- Structure: PK: `shop`, SK: `orderNumber#lineItemIdx`
- Attributes: HSN, description, UQC, quantity, taxableValue, rate, CGST, SGST, IGST, cess, placeOfSupply, customerState, invoiceDate, productId
- GSI: `shop-yearMonth-index` for date range queries
- GSI: `shop-hsn-index` for HSN aggregation
- GSI: `shop-taxRate-index` for rate-wise B2C aggregation
- Data written from `webhooks.orders.create.tsx` after successful invoice generation

### 2. Update webhook handler to populate order items data
- Modify `app/routes/webhooks.orders.create.tsx` to extract line item details from order payload
- For each line item, create ShopifyOrderItems record with HSN, tax breakdown, quantities
- Batch write to DynamoDB after successful invoice generation
- Handle data consistency: only write if invoice generation succeeds
- **Note**: Keep `lambda-generate-invoice` focused on PDF generation only

### 3. Create backend API routes for reports
- Add route: `app/routes/api.reports.gstr1-b2c.tsx` for B2C (Others) report
- Add route: `app/routes/api.reports.hsn-summary.tsx` for HSN-wise summary
- Implement date filtering logic (monthly/quarterly/yearly/custom)
- Aggregate data by state (B2C) or HSN (HSN summary)
- Calculate totals: taxable value, CGST, SGST, IGST, cess
- Return paginated results

### 4. Create Reports UI page
- Add route: `app/routes/app.reports.tsx` with navigation in sidebar
- Implement filter component with:
  - Radio buttons: Monthly/Quarterly/Yearly
  - Date range picker for custom range
  - Apply/Reset buttons
- Create two report tabs: "GSTR-1 B2C" and "HSN Summary"
- Use Polaris DataTable for displaying results
- Add export to CSV/Excel functionality
- Show loading states and error handling

### 5. Add navigation link in sidebar
- Update `app/routes/app.tsx` or sidebar navigation component
- Add "Reports" link with icon (DocumentIcon from Polaris)
- Position between "Templates" and other existing menu items

---

## Database Schema Details

### Table: ShopifyOrderItems

**Design Principle**: One record per line item. Since tax rates (5%, 12%, 18%, 28%) can vary per product within the same invoice, we store granular line-item data and aggregate at query time.

```
PK: shop (String)                          # "example.myshopify.com"
SK: orderNumber#lineItemIdx (String)       # "#1001#001" (zero-padded for sorting)

Attributes:
# Invoice-level info (denormalized for query efficiency)
- invoiceId (String)                       # "uuid-abc-123" (added after invoice generation)
- invoiceNumber (String)                   # Display number if different
- invoiceDate (String)                     # ISO date "2026-02-15"
- yearMonth (String)                       # "2026-02" for filtering
- orderId (String)                         # Shopify order ID "6789012345678"
- orderNumber (String)                     # Shopify display "#1001"

# Customer info
- customerName (String)                    # "John Doe"
- customerState (String)                   # "Haryana"
- customerStateCode (String)               # "06"
- placeOfSupply (String)                   # "Haryana" (delivery address state)
- placeOfSupplyCode (String)               # "06"

# Company info (denormalized)
- companyState (String)                    # "Maharashtra"
- companyStateCode (String)                # "27"
- companyGSTIN (String)                    # "27AAACB1234F1ZV"

# Line item details
- lineItemIdx (Number)                     # 1, 2, 3... (position in invoice)
- productId (String)                       # Shopify product ID
- variantId (String)                       # Shopify variant ID
- sku (String)                             # Product SKU
- productTitle (String)                    # "Blue Cotton T-Shirt - Medium"

# HSN & Classification
- hsn (String)                             # "6109" (4-8 digit HSN code)
- hsnDescription (String)                  # "T-shirts, singlets and other vests, knitted"
- uqc (String)                             # "NOS" (Unit Quantity Code per GST)
- sacCode (String)                         # For services, if applicable

# Quantity & Value
- quantity (Number)                        # 2
- unitPrice (Number)                       # 499.00 (price per unit before tax)
- discount (Number)                        # 50.00 (total discount on this line)
- taxableValue (Number)                    # 948.00 (quantity * unitPrice - discount)

# Tax breakdown
- taxRate (Number)                         # 18 (percentage: 5, 12, 18, or 28)
- cgst (Number)                            # 85.32 (for intrastate)
- sgst (Number)                            # 85.32 (for intrastate)
- igst (Number)                            # 0 (for interstate, would be 170.64)
- cess (Number)                            # 0 (additional cess if applicable)
- totalTax (Number)                        # 170.64

# Transaction classification
- transactionType (String)                 # "intrastate" | "interstate"
- supplyType (String)                      # "B2C" | "B2B" (for future B2B support)

# Metadata
- createdAt (String)                       # ISO timestamp
- updatedAt (String)                       # Last modification timestamp
- status (String)                          # "active" | "cancelled" | "returned"
- originalInvoiceId (String)               # For credit notes, reference to original
- creditNoteId (String)                    # If cancelled/returned, the credit note reference
- creditNoteDate (String)                  # Date of credit note
- cancellationReason (String)              # "order_cancelled" | "full_return" | "partial_return"

GSI-1: shop-yearMonth-index
  PK: shop
  SK: yearMonth#invoiceDate
  Projection: ALL
  (For monthly/quarterly queries - primary use case)

GSI-2: shop-hsn-index
  PK: shop
  SK: hsn#yearMonth
  Projection: ALL
  (For HSN-wise aggregation)

GSI-3: shop-taxRate-index
  PK: shop
  SK: taxRate#yearMonth
  Projection: ALL
  (For rate-wise B2C aggregation)
```

### Why Line-Item Level Storage?

1. **Variable Tax Rates**: Same invoice can have items at 5%, 12%, 18%, 28%
2. **HSN Aggregation**: Each product has its own HSN code
3. **Accurate GSTR-1**: B2C report groups by (PlaceOfSupply, Rate), needs item-level data
4. **Audit Trail**: Line-level detail for any discrepancy investigation
5. **Future Flexibility**: Easy to add B2B reports, returns handling, amendments

### Query Patterns

| Report | Query |
|--------|-------|
| B2C by State+Rate | Query GSI-1 for date range, group by (placeOfSupply, taxRate) in application |
| HSN Summary | Query GSI-2 for HSN codes, aggregate quantities and values |
| Invoice Details | Query main table by invoiceId prefix |
| Monthly Summary | Query GSI-1 for yearMonth, sum all tax fields |

---

## Order Cancellation & Returns Handling

### GST Compliance Requirements
When an order is cancelled or returned, GST rules require:
1. **Original data preserved** - Never delete; needed for audit trail
2. **Credit Note issued** - Reduces tax liability in the period of cancellation
3. **GSTR-1 reporting** - Credit notes reported in Section 9B (CDN)

### Status Flow

```
Order Created → Invoice Generated → ShopifyOrderItems (status: "active")
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
            Order Cancelled           Full Return              Partial Return
                    │                       │                       │
                    ▼                       ▼                       ▼
        Update status: "cancelled"  Update status: "returned"   Create new record
        Set creditNoteId            Set creditNoteId            with negative qty
        Set creditNoteDate          Set creditNoteDate          for returned items
```

### Handling Scenarios

#### 1. Order Cancelled (before fulfillment)
- **Trigger**: `orders/cancelled` webhook
- **Action**: 
  - Update all line items: `status = "cancelled"`
  - Generate credit note number
  - Set `creditNoteId`, `creditNoteDate`, `cancellationReason = "order_cancelled"`
- **GST Impact**: Full reversal of CGST/SGST/IGST

#### 2. Full Return (after fulfillment)
- **Trigger**: `refunds/create` webhook with full refund
- **Action**:
  - Update all line items: `status = "returned"`
  - Generate credit note number
  - Set `creditNoteId`, `creditNoteDate`, `cancellationReason = "full_return"`
- **GST Impact**: Full reversal of CGST/SGST/IGST

#### 3. Partial Return
- **Trigger**: `refunds/create` webhook with partial refund
- **Action**:
  - Keep original records as `status = "active"` 
  - Create NEW records with:
    - Negative quantity (`quantity = -1`)
    - Negative taxable value and taxes
    - `status = "returned"`
    - `originalInvoiceId` pointing to original
    - `creditNoteId` for the credit note
- **GST Impact**: Partial reversal based on returned items

### Credit Note Numbering
```
Format: CN-{invoiceId}-{sequence}
Example: CN-INV-2026-0001-01
```

### Report Aggregation Logic

When generating reports, the query logic must:

```javascript
// For B2C Report
const netTaxableValue = items
  .filter(item => item.yearMonth === targetMonth)
  .reduce((sum, item) => {
    // Active items add, returned items (negative qty) subtract
    return sum + item.taxableValue;  // Already negative for returns
  }, 0);

// For HSN Summary  
const hsnSummary = items
  .filter(item => item.yearMonth === targetMonth)
  .reduce((acc, item) => {
    const key = item.hsn;
    if (!acc[key]) acc[key] = { quantity: 0, taxableValue: 0, ... };
    acc[key].quantity += item.quantity;  // Negative for returns
    acc[key].taxableValue += item.taxableValue;
    return acc;
  }, {});
```

### Additional Webhooks to Handle

Add to `app/routes/webhooks.*.tsx`:
- `webhooks.orders.cancelled.tsx` - Already exists, needs update
- `webhooks.refunds.create.tsx` - NEW: Handle refunds/returns

**Configuration changes for refunds webhook:**

1. **shopify.app.toml** - Add subscription:
```toml
[[webhooks.subscriptions]]
topics = [ "refunds/create" ]
uri = "/webhooks/refunds/create"
```

2. **Access scopes** - No change needed (`read_orders` includes refunds)

3. **Deploy webhook config:**
```powershell
shopify app deploy
```

### Credit Note Document (Future Enhancement)
For full compliance, may need to generate Credit Note PDF:
- Similar to invoice but shows original invoice reference
- Negative amounts
- "Credit Note" watermark
- Same line items with return quantity

---

## API Response Formats

### GSTR-1 B2C (Others) Response

```json
{
  "data": [
    {
      "placeOfSupply": "Haryana",
      "rate": 5,
      "totalTaxableValue": 14817.00,
      "integratedTax": 740.85,
      "centralTax": 0.00,
      "stateTax": 0.00,
      "cess": 0.00,
      "applicablePercentage": null
    }
  ],
  "totals": {
    "taxableValue": 17131.29,
    "integratedTax": 1376.75,
    "centralTax": 911.51,
    "stateTax": 911.51,
    "cess": 0.00
  },
  "period": "January 2026"
}
```

### HSN Summary Response

```json
{
  "data": [
    {
      "srNo": 1,
      "hsn": "6204",
      "description": "",
      "hsnDescription": "WOMENS OR GIRLS SUIT..",
      "uqc": "UNT",
      "totalQuantity": 31,
      "totalTaxableValue": 79621.62,
      "rate": 18,
      "integratedTax": 12963.53,
      "centralTax": 684.18,
      "stateTax": 684.18,
      "cess": 0.00
    }
  ],
  "totals": { }
}
```

---

## Implementation Phases

### Phase 1: Data Layer (Days 1-2)
- Create ShopifyOrderItems table via CloudFormation update
- Create `gstReporting.server.ts` service with write functions
- Update `webhooks.orders.create.tsx` to write order items data
- Test with sample invoices
- Verify data consistency

### Phase 2: Backend APIs (Days 3-4)
- Implement query logic for date filtering
- Create aggregation logic for B2C and HSN reports
- Add pagination support
- Write unit tests

### Phase 3: Frontend UI (Days 5-7)
- Create Reports page with routing
- Implement filter components
- Build DataTable views
- Add export functionality
- Test responsiveness

### Phase 4: Integration & Testing (Day 8)
- End-to-end testing
- Performance optimization for large datasets
- Handle edge cases (missing HSN, zero tax items)
- Deploy to staging

---

## Technical Considerations

### 1. Data Migration
Existing invoices won't have reporting data. Options:
- Backfill by reprocessing past orders from ShopifyOrders table (contains raw line_items)
- Start fresh from implementation date
- **Recommendation**: Start fresh, backfill on-demand if user requests historical reports
- **Migration Script**: Create `backfill-gst-data.mjs` that reads ShopifyOrders and creates ShopifyOrderItems entries

### 2. HSN Code Mapping
HSN codes may not be in Shopify product data by default:
- Check Shopify product metafields for HSN (custom namespace)
- Check SKU patterns if shop uses HSN-based SKUs
- Fallback to template-level default HSN
- **Recommendation**: 
  - Add HSN configuration in Customize Template (default HSN, rate)
  - Allow product-level HSN override via metafield: `custom.hsn_code`
  - Show warning in reports for items missing HSN

### 3. GST State Codes
Need mapping from state names to 2-digit GST codes (e.g., Maharashtra → 27):
- Create `constants/gstStateCodes.ts` with all 37 states/UTs
- Use for placeOfSupplyCode, customerStateCode
- Validate during data capture

### 4. UQC (Unit Quantity Codes)
GST requires specific unit codes:
- NOS (Numbers), KGS (Kilograms), MTR (Meters), etc.
- Default to "NOS" for most retail items
- Add UQC mapping in product configuration if needed

### 3. Performance
Large date ranges could return thousands of records
- Implement server-side pagination
- Consider pre-aggregating monthly summaries
- Use DynamoDB parallel scan for faster aggregation
- **Recommendation**: Default to current month, warn on large ranges

### 4. Data Consistency
If invoice generation succeeds but reporting data write fails
- Use DynamoDB transactions where possible
- Implement retry logic with exponential backoff
- Add data reconciliation job (compare Invoices table vs ShopifyOrderItems)
- **Recommendation**: Non-blocking writes with audit logging

### 5. Export Functionality
Excel format requirements
- Use libraries like `exceljs` or `xlsx`
- Format matches GSTR-1 filing format
- Include totals and summary rows
- **Recommendation**: Server-side generation, stream to S3, provide download link

**Export Restrictions (to avoid performance issues):**
- **Maximum date range**: 1 year (365 days)
- **Maximum records**: 10,000 line items per export
- **Validation**: Show error if user selects range > 1 year or record count exceeds limit
- **UI feedback**: Display estimated record count before export
- **Workaround for large exports**: Suggest exporting month-by-month or quarterly

```typescript
// Export validation constants
export const EXPORT_LIMITS = {
  MAX_DATE_RANGE_DAYS: 365,
  MAX_RECORDS: 10000,
};

// Validation before export
function validateExportRequest(startDate: Date, endDate: Date, estimatedCount: number) {
  const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  
  if (daysDiff > EXPORT_LIMITS.MAX_DATE_RANGE_DAYS) {
    throw new Error(`Date range cannot exceed ${EXPORT_LIMITS.MAX_DATE_RANGE_DAYS} days. Please select a shorter period.`);
  }
  
  if (estimatedCount > EXPORT_LIMITS.MAX_RECORDS) {
    throw new Error(`Export limit is ${EXPORT_LIMITS.MAX_RECORDS} records. Found ${estimatedCount}. Please narrow your date range.`);
  }
}
```

---

## Files to Create/Modify

### New Files
- `app/routes/app.reports.tsx` - Reports page UI
- `app/routes/api.reports.gstr1-b2c.tsx` - B2C API
- `app/routes/api.reports.hsn-summary.tsx` - HSN API
- `app/routes/webhooks.refunds.create.tsx` - Handle refunds/returns for GST data
- `app/components/reports/FilterBar.tsx` - Filter component
- `app/components/reports/B2CTable.tsx` - B2C table
- `app/components/reports/HSNTable.tsx` - HSN table
- `app/services/gstReporting.server.ts` - Query logic + write logic for GST data
- `app/services/creditNoteService.server.ts` - Credit note generation
- `app/constants/gstStateCodes.ts` - State name to code mapping
- `app/constants/uqcCodes.ts` - Unit Quantity Codes
- `dynamodb-migrations/create-gst-reporting-table.ps1` - Table creation script (creates ShopifyOrderItems)

### Modified Files
- `cloudformation-template.json` - Add ShopifyOrderItems table + GSIs
- `app/routes/webhooks.orders.create.tsx` - Write order items data after invoice generation
- `app/constants/tables.ts` - Add SHOPIFY_ORDER_ITEMS constant
- `app/routes/app.tsx` - Add Reports to navigation
- `app/routes/webhooks.orders.cancelled.tsx` - Update GST data on cancellation
- `shopify.app.toml` - Add refunds/create webhook subscription

---

## Risks & Mitigations

### Risk 1: Missing HSN codes in Shopify products
**Mitigation**: Allow manual HSN entry in Customize Template, show warnings for missing HSN

### Risk 2: Large data volume slows queries
**Mitigation**: Implement pagination, caching, date range limits

### Risk 3: Tax calculation changes not reflected in old data
**Mitigation**: Store calculation metadata (version, date) for audit trail

### Risk 4: Report format changes in GST regulations
**Mitigation**: Make report templates configurable, version the format

---

## Success Criteria

✅ Users can view GSTR-1 B2C (Others) report with accurate state-wise aggregation  
✅ Users can view HSN-wise summary with product-level details  
✅ Filters work correctly for monthly/quarterly/yearly/custom date ranges  
✅ Reports can be exported to Excel/CSV  
✅ No performance degradation during invoice generation  
✅ Data accuracy matches actual invoices generated  
✅ UI is responsive and user-friendly

---

## Next Steps

1. Review and approve this specification
2. Update CloudFormation template with ShopifyOrderItems table definition
3. Begin Phase 1 implementation
4. Schedule daily standup reviews during implementation

---

## Appendix: GST State Codes Reference

```javascript
// app/constants/gstStateCodes.ts
export const GST_STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01",
  "Himachal Pradesh": "02",
  "Punjab": "03",
  "Chandigarh": "04",
  "Uttarakhand": "05",
  "Haryana": "06",
  "Delhi": "07",
  "Rajasthan": "08",
  "Uttar Pradesh": "09",
  "Bihar": "10",
  "Sikkim": "11",
  "Arunachal Pradesh": "12",
  "Nagaland": "13",
  "Manipur": "14",
  "Mizoram": "15",
  "Tripura": "16",
  "Meghalaya": "17",
  "Assam": "18",
  "West Bengal": "19",
  "Jharkhand": "20",
  "Odisha": "21",
  "Chhattisgarh": "22",
  "Madhya Pradesh": "23",
  "Gujarat": "24",
  "Dadra and Nagar Haveli and Daman and Diu": "26",
  "Maharashtra": "27",
  "Andhra Pradesh": "28",  // Old code, now split
  "Karnataka": "29",
  "Goa": "30",
  "Lakshadweep": "31",
  "Kerala": "32",
  "Tamil Nadu": "33",
  "Puducherry": "34",
  "Andaman and Nicobar Islands": "35",
  "Telangana": "36",
  "Andhra Pradesh (New)": "37",
  "Ladakh": "38",
};

// Reverse mapping for code to state
export const STATE_CODE_TO_NAME: Record<string, string> = 
  Object.fromEntries(Object.entries(GST_STATE_CODES).map(([k, v]) => [v, k]));

// Get state code from state name (case-insensitive, handles common variations)
export function getStateCode(stateName: string): string | null {
  const normalized = stateName.trim();
  // Direct match
  if (GST_STATE_CODES[normalized]) return GST_STATE_CODES[normalized];
  // Case-insensitive match
  const found = Object.entries(GST_STATE_CODES).find(
    ([key]) => key.toLowerCase() === normalized.toLowerCase()
  );
  return found ? found[1] : null;
}
```

## Appendix: Common UQC Codes

```javascript
// app/constants/uqcCodes.ts
export const UQC_CODES = {
  NOS: "Numbers",
  KGS: "Kilograms",
  GMS: "Grams",
  MTR: "Meters",
  LTR: "Liters",
  PCS: "Pieces",
  SQM: "Square Meters",
  CBM: "Cubic Meters",
  SET: "Sets",
  PAC: "Packs",
  DOZ: "Dozens",
  BOX: "Box",
  BTL: "Bottles",
  BDL: "Bundles",
  ROL: "Rolls",
  PAR: "Pairs",
} as const;

// Default UQC for most retail products
export const DEFAULT_UQC = "NOS";
```
