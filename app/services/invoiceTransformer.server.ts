/**
 * Invoice Transformer Service
 *
 * Transforms a raw Shopify order webhook payload into a fully-computed
 * InvoiceData object used for:
 *   1. PDF generation (passed to lambda-generate-pdf-invoice)
 *   2. GST reporting (via _gstMeta, written to ShopifyOrderItems table)
 *
 * Ported from:
 *   - lambda-generate-invoice/transformers/shopifyOrderTransformer.mjs
 *   - lambda-generate-invoice/utils/gstUtils.mjs
 *
 * This is the SINGLE SOURCE OF TRUTH for tax/discount/HSN calculation.
 */

import { getStateCode } from "../constants/gstStateCodes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw Shopify order webhook payload (relevant fields only). */
export interface ShopifyOrderPayload {
  id: number | string;
  name: string; // e.g. "#1001"
  created_at: string;
  currency: string;
  note?: string;
  current_total_price?: string;
  total_price?: string;
  current_total_discounts?: string;
  total_shipping_price_set?: {
    shop_money?: { amount: string };
  };
  customer?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    email?: string;
    phone?: string;
  };
  email?: string;
  contact_email?: string;
  phone?: string;
  billing_address?: ShopifyAddress;
  shipping_address?: ShopifyAddress;
  line_items?: ShopifyLineItem[];
}

export interface ShopifyAddress {
  name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  phone?: string;
}

export interface ShopifyLineItem {
  id: number | string;
  product_id?: number | string;
  variant_id?: number | string;
  title: string;
  name?: string;
  variant_title?: string;
  sku?: string;
  quantity: number;
  price: string;
  compare_at_price?: string;
  total_discount?: string;
  tax_lines?: Array<{ title: string; price: string; rate: number }>;
  fulfillment_service?: string; // e.g. "manual", "snow-city-warehouse"
  fulfillment_status?: string | null;
  product?: {
    metafields?: Array<{ namespace: string; key: string; value: string }>;
  };
  properties?: Array<{ name: string; value: string }>;
}

// ---- Output types ---------------------------------------------------------

export interface InvoiceData {
  order: {
    name: string;
    date: string; // Formatted for display, e.g. "7 Feb 2026"
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
  /** Raw numeric values for GST reporting — NOT sent to Lambda */
  _gstMeta: GSTMeta;
}

export interface InvoiceLineItem {
  name: string;
  description: string | null;
  sku: string | null;
  quantity: number; // Always 1 (expanded)
  mrp: string;
  discount: string;
  sellingPrice: string; // Base price after discount, before tax
  tax: string;
  sellingPriceAfterTax: string;
  _totalItemTax: number;
  _cgst: number;
  _sgst: number;
  _igst: number;
}

export interface InvoiceTotals {
  subtotal: string;
  discount: string | null;
  shipping: string;
  tax: string;
  cgst: string | null;
  sgst: string | null;
  igst: string | null;
  total: string;
}

export interface GSTMeta {
  isIntrastate: boolean;
  companyState: string;
  customerState: string;
  placeOfSupply: string;
  items: GSTLineItemMeta[];
}

/**
 * Per-line-item GST data for writing to ShopifyOrderItems table.
 * Values are aggregated across quantity (not expanded).
 */
export interface GSTLineItemMeta {
  productId: string;
  variantId: string;
  sku: string | null;
  productTitle: string;
  hsn: string | null;
  fulfillmentService: string | null; // Warehouse/location identifier
  quantity: number; // Original quantity (not expanded)
  unitPrice: number; // Per-unit price including tax
  discount: number; // Total discount applied to this line item
  taxableValue: number; // Sum of base prices (excl tax) for all units
  taxRate: number; // e.g. 18 (may vary per unit — uses first unit's rate)
  totalTax: number;
  cgst: number;
  sgst: number;
  igst: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round a number to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// GST Utilities (ported from gstUtils.mjs)
// ---------------------------------------------------------------------------

/**
 * Determine if the transaction is intrastate (same state) or interstate.
 * Uses getStateCode from gstStateCodes.ts for the lookup.
 */
export function isIntrastate(sellerState: string, buyerState: string): boolean {
  if (!sellerState || !buyerState) return false;

  const sellerCode = getStateCode(sellerState);
  const buyerCode = getStateCode(buyerState);

  return sellerCode === buyerCode && sellerCode !== null;
}

/**
 * Split a tax amount into CGST/SGST (intrastate) or IGST (interstate).
 */
export function calculateGSTBreakdown(
  taxAmount: number,
  isIntrastateTxn: boolean
): { cgst: number; sgst: number; igst: number } {
  if (isIntrastateTxn) {
    const half = taxAmount / 2;
    return { cgst: half, sgst: half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: taxAmount };
}

// ---------------------------------------------------------------------------
// HSN Extraction
// ---------------------------------------------------------------------------

/**
 * Extract HSN code from a Shopify line item using multiple methods.
 *
 * Priority:
 *  1. Product metafield `custom.hsn_code`
 *  2. Line item properties containing "hsn"
 *  3. SKU regex `HSN(\d{4,8})`
 */
function extractHSNCode(item: ShopifyLineItem): string | null {
  // Method 1: Product metafields
  if (item.product?.metafields) {
    const hsnMetafield = item.product.metafields.find(
      (m) => m.namespace === "custom" && m.key === "hsn_code"
    );
    if (hsnMetafield?.value) return hsnMetafield.value;
  }

  // Method 2: Line item properties
  if (item.properties) {
    const hsnProperty = item.properties.find(
      (p) => p.name && p.name.toLowerCase().includes("hsn")
    );
    if (hsnProperty?.value) return hsnProperty.value;
  }

  // Method 3: SKU regex
  if (item.sku) {
    const match = item.sku.match(/HSN(\d{4,8})/i);
    if (match) return match[1];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Customer / Address Extraction
// ---------------------------------------------------------------------------

function extractCustomerName(order: ShopifyOrderPayload): string {
  if (order.customer?.first_name || order.customer?.last_name) {
    return `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim();
  }
  if (order.billing_address?.name) return order.billing_address.name;
  if (order.billing_address?.first_name || order.billing_address?.last_name) {
    return `${order.billing_address.first_name || ""} ${order.billing_address.last_name || ""}`.trim();
  }
  if (order.shipping_address?.name) return order.shipping_address.name;
  if (order.shipping_address?.first_name || order.shipping_address?.last_name) {
    return `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim();
  }
  return order.contact_email || order.email || "Guest";
}

// ---------------------------------------------------------------------------
// Main Transformer
// ---------------------------------------------------------------------------

/**
 * Transform a raw Shopify order into a fully-computed InvoiceData.
 *
 * @param shopifyOrder - Raw Shopify order webhook payload
 * @param companyState - Seller's state (from shop config)
 * @returns InvoiceData ready for PDF generation + GST reporting
 */
export function transformOrderToInvoice(
  shopifyOrder: ShopifyOrderPayload,
  companyState: string
): InvoiceData {
  const currencySymbol =
    shopifyOrder.currency === "INR" ? "Rs." : shopifyOrder.currency;

  // Determine intrastate vs interstate
  const buyerState =
    shopifyOrder.shipping_address?.province ||
    shopifyOrder.billing_address?.province ||
    "";
  const isIntrastateTxn = isIntrastate(companyState, buyerState);

  // Order-level discount tracking
  const totalOrderDiscount = parseFloat(
    shopifyOrder.current_total_discounts || "0"
  );
  let remainingOrderDiscount = totalOrderDiscount;
  let discountAppliedInLineItems = false;

  // Accumulators for per-line-item GST meta (aggregated, not expanded)
  const gstLineItemMetas: GSTLineItemMeta[] = [];

  // Build expanded line items for PDF
  const lineItems: InvoiceLineItem[] =
    shopifyOrder.line_items?.flatMap((item) => {
      const sellingPriceWithTax = parseFloat(item.price);
      const itemQuantity = item.quantity;
      const itemDiscount = item.total_discount
        ? parseFloat(item.total_discount)
        : 0;
      const mrp = item.compare_at_price
        ? parseFloat(item.compare_at_price)
        : sellingPriceWithTax;

      const hsnCode = extractHSNCode(item);

      // Determine discount to apply for this line item
      const initialApproximateBasePrice = sellingPriceWithTax / 1.05;
      const discountToUse =
        totalOrderDiscount > 0 &&
        initialApproximateBasePrice > totalOrderDiscount
          ? Math.min(totalOrderDiscount, remainingOrderDiscount)
          : itemDiscount;

      if (discountToUse > 0 && totalOrderDiscount > 0) {
        remainingOrderDiscount -= discountToUse;
        discountAppliedInLineItems = true;
      }

      // --- Accumulators for this line item's GST meta (summed across units) ---
      let metaTotalTaxableValue = 0;
      let metaTotalTax = 0;
      let metaTotalCGST = 0;
      let metaTotalSGST = 0;
      let metaTotalIGST = 0;
      let metaTaxRate = 0; // will use first unit's rate

      const itemName = item.title || item.name || "";
      const itemNameWithHSN = hsnCode
        ? `${itemName} (HSN: ${hsnCode})`
        : itemName;

      // Expand quantity → one row per unit
      const expandedRows = Array.from(
        { length: itemQuantity },
        (_, unitIndex) => {
          const hasDiscount = unitIndex === 0 && discountToUse > 0;

          // Start with 5% assumption
          let taxRate = 0.05;
          let taxDivisor = 1.05;
          let sellingPriceBase = sellingPriceWithTax / taxDivisor;

          const priceAfterDiscount = hasDiscount
            ? sellingPriceBase - discountToUse
            : sellingPriceBase;

          // Re-evaluate: if price after discount >= ₹2500 → 18%
          if (priceAfterDiscount >= 2500) {
            taxRate = 0.18;
            taxDivisor = 1.18;
            sellingPriceBase = sellingPriceWithTax / taxDivisor;
          }

          const perUnitTax = sellingPriceWithTax - sellingPriceBase;
          const finalPriceAfterDiscount = hasDiscount
            ? sellingPriceBase - discountToUse
            : sellingPriceBase;
          const finalPriceAfterTax = finalPriceAfterDiscount + perUnitTax;

          const gst = calculateGSTBreakdown(perUnitTax, isIntrastateTxn);

          // Accumulate for GST meta
          metaTotalTaxableValue += finalPriceAfterDiscount;
          metaTotalTax += perUnitTax;
          metaTotalCGST += gst.cgst;
          metaTotalSGST += gst.sgst;
          metaTotalIGST += gst.igst;
          if (unitIndex === 0) {
            metaTaxRate = Math.round(taxRate * 100); // e.g. 5 or 18
          }

          return {
            name: itemNameWithHSN,
            description: item.variant_title
              ? `Variant: ${item.variant_title}`
              : null,
            sku: item.sku || null,
            quantity: 1,
            mrp: `${currencySymbol} ${mrp.toFixed(2)}`,
            discount: hasDiscount
              ? `${currencySymbol} ${discountToUse.toFixed(2)}`
              : `${currencySymbol} 0.00`,
            sellingPrice: `${currencySymbol} ${finalPriceAfterDiscount.toFixed(2)}`,
            tax: `${currencySymbol} ${perUnitTax.toFixed(2)}`,
            sellingPriceAfterTax: `${currencySymbol} ${finalPriceAfterTax.toFixed(2)}`,
            _totalItemTax: perUnitTax,
            _cgst: gst.cgst,
            _sgst: gst.sgst,
            _igst: gst.igst,
          } satisfies InvoiceLineItem;
        }
      );

      // Push aggregated GST meta for this original line item (rounded to 2 dp)
      gstLineItemMetas.push({
        productId: (item.product_id ?? "").toString(),
        variantId: (item.variant_id ?? "").toString(),
        sku: item.sku || null,
        productTitle: item.title || "",
        hsn: hsnCode,
        fulfillmentService: item.fulfillment_service || null,
        quantity: itemQuantity,
        unitPrice: round2(sellingPriceWithTax),
        discount: round2(discountToUse),
        taxableValue: round2(metaTotalTaxableValue),
        taxRate: metaTaxRate,
        totalTax: round2(metaTotalTax),
        cgst: round2(metaTotalCGST),
        sgst: round2(metaTotalSGST),
        igst: round2(metaTotalIGST),
      });

      return expandedRows;
    }) || [];

  // ---- Totals ----
  const calculatedTotalTax = lineItems.reduce(
    (sum, li) => sum + (li._totalItemTax || 0),
    0
  );
  const totalCGST = lineItems.reduce((sum, li) => sum + (li._cgst || 0), 0);
  const totalSGST = lineItems.reduce((sum, li) => sum + (li._sgst || 0), 0);
  const totalIGST = lineItems.reduce((sum, li) => sum + (li._igst || 0), 0);

  const calculatedSubtotalBeforeTax = lineItems.reduce((sum, li) => {
    const price = parseFloat(
      li.sellingPrice.replace("Rs. ", "").replace(/,/g, "")
    );
    return sum + price;
  }, 0);

  const shippingAmount = parseFloat(
    shopifyOrder.total_shipping_price_set?.shop_money?.amount || "0"
  );

  const placeOfSupply =
    shopifyOrder.shipping_address?.province || buyerState;

  return {
    order: {
      name: shopifyOrder.name,
      date: new Date(shopifyOrder.created_at).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      dueDate: null,
      notes: shopifyOrder.note || "Thank you for your purchase!",
    },
    customer: {
      name: extractCustomerName(shopifyOrder),
      company:
        shopifyOrder.customer?.company ||
        shopifyOrder.billing_address?.company ||
        null,
      email: shopifyOrder.email || shopifyOrder.customer?.email || "",
      phone:
        shopifyOrder.phone ||
        shopifyOrder.customer?.phone ||
        shopifyOrder.billing_address?.phone ||
        null,
    },
    shippingAddress: {
      name:
        shopifyOrder.shipping_address?.name ||
        shopifyOrder.billing_address?.name ||
        "",
      address: `${shopifyOrder.shipping_address?.address1 || ""} ${shopifyOrder.shipping_address?.address2 || ""}`.trim(),
      city: shopifyOrder.shipping_address?.city || "",
      state: shopifyOrder.shipping_address?.province || "",
      zip: shopifyOrder.shipping_address?.zip || "",
    },
    lineItems,
    totals: {
      subtotal: `${currencySymbol} ${calculatedSubtotalBeforeTax.toFixed(2)}`,
      discount:
        !discountAppliedInLineItems && totalOrderDiscount > 0
          ? `-${currencySymbol} ${totalOrderDiscount.toFixed(2)}`
          : null,
      shipping: `${currencySymbol} ${shippingAmount.toFixed(2)}`,
      tax: `${currencySymbol} ${calculatedTotalTax.toFixed(2)}`,
      cgst:
        totalCGST > 0 ? `${currencySymbol} ${totalCGST.toFixed(2)}` : null,
      sgst:
        totalSGST > 0 ? `${currencySymbol} ${totalSGST.toFixed(2)}` : null,
      igst:
        totalIGST > 0 ? `${currencySymbol} ${totalIGST.toFixed(2)}` : null,
      total: `${currencySymbol} ${parseFloat(shopifyOrder.current_total_price || shopifyOrder.total_price || "0").toFixed(2)}`,
    },
    _gstMeta: {
      isIntrastate: isIntrastateTxn,
      companyState,
      customerState: buyerState,
      placeOfSupply,
      items: gstLineItemMetas,
    },
  };
}
