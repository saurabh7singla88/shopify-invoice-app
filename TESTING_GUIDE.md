# GSTGo - Testing Guide

## Prerequisites
- Shopify development/test store
- Test products and customer data

---

## 1. Install App
1. Install app from Shopify App Store or installation URL
2. Authorize permissions (read orders, customers, products)
3. Verify redirect to dashboard

---

## 2. Configure Company Settings
1. Go to **Settings** → **Company Settings**
2. Fill required fields:
   - Company Name, GSTIN
   - Address, City, State, PIN
   - Email
3. Save settings

✅ Verify: Success message appears

---

## 3. Customize Template (Optional)
1. Go to **Templates**
2. Upload logo, set colors, fonts, invoice prefix
3. Preview and save

✅ Verify: Template preview updates

---

## 4. Add HSN Codes to Products
1. Shopify Admin → **Products** → Select product
2. Add **Metafield**:
   - Namespace: `custom`
   - Key: `hsn` or `hsn_code`
   - Value: HSN code (e.g., "6109")
3. Repeat for 3-4 products

**Test HSN Codes:**
- 6109 (T-shirts, 18%), 6203 (Suits, 12%), 6402 (Footwear, 5-18%)

✅ Verify: Metafields saved

---

## 5. Create Test Orders

### A. Intra-State Order (CGST + SGST)
1. Shopify Admin → **Orders** → **Create order**
2. Customer address: Same state as company
3. Add 2-3 products, mark as **Paid**

✅ Verify: Invoice generated with CGST + SGST

### B. Inter-State Order (IGST)
1. Create order with customer in different state
2. Mark as **Paid**

✅ Verify: Invoice shows IGST

### C. High-Value Order
1. Create order > ₹50,000 with multiple items
2. Mark as **Paid**


## 6. Verify Invoices
1. GSTGo dashboard → **Orders**
2. Download and check PDF:
   - Order number, date, customer details
   - Company logo, GSTIN
   - HSN codes, tax breakdown
   - Correct totals

✅ Verify: All details accurate

---

## 7. Test Order Cancellation
1. Shopify Admin → Select order → **Cancel order**
2. Confirm cancellation
3. Check GSTGo dashboard

✅ Verify: Order status updated to "Cancelled"

---

## 8. Generate GST Reports

### A. GSTR-1 B2C Report
1. GSTGo → **Reports** → **GSTR-1 B2C**
2. Select date range, generate
3. Verify state-wise breakdown, tax rates
4. Export to CSV/Excel

✅ Verify: Data matches orders

### B. HSN Summary Report
1. **Reports** → **HSN Summary**
2. Select date range, generate
3. Verify HSN codes, quantities, values
4. Export report

✅ Verify: HSN aggregation correct

---

## 9. Uninstall/Reinstall
1. Uninstall app from Shopify Admin
2. Wait 2 minutes, reinstall
3. Re-enter settings

✅ Verify: Clean lifecycle

---

## Troubleshooting

**Invoice Not Generated:** Wait 60s, check webhooks, verify order is "Paid"

**Wrong Tax:** Verify company/customer states, HSN codes

**Missing HSN:** Check metafield namespace (`custom`) and key (`hsn`)

**No Report Data:** Verify date range, order status

