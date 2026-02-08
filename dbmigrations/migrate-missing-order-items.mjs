/**
 * Migration Script: Populate missing ShopifyOrderItems from existing ShopifyOrders
 * 
 * Purpose: For orders that exist in ShopifyOrders & Invoices but are missing from ShopifyOrderItems,
 *          read the payload from ShopifyOrders, look up the invoiceId from Invoices, and write items.
 * 
 * Usage:
 *   node migrate-missing-order-items.mjs --dry-run    # Preview changes without writing
 *   node migrate-missing-order-items.mjs              # Execute migration
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

// ────────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  TARGET_SHOP: 'g0scmu-6k.myshopify.com',
  TABLES: {
    ORDERS: 'ShopifyOrders',
    INVOICES: 'Invoices',
    ORDER_ITEMS: 'ShopifyOrderItems',
  },
  DEFAULT_UQC: 'NOS',
};

// Orders to fix — present in ShopifyOrders but missing from ShopifyOrderItems
const ORDER_NAMES = ['PG1292', 'PG1293', 'PG1294'];

const isDryRun = process.argv.includes('--dry-run');

// ────────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ────────────────────────────────────────────────────────────────────────────────

function getStateCode(stateName) {
  const stateCodes = {
    'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', 'Punjab': '03',
    'Chandigarh': '04', 'Uttarakhand': '05', 'Haryana': '06', 'Delhi': '07',
    'Rajasthan': '08', 'Uttar Pradesh': '09', 'Bihar': '10', 'Sikkim': '11',
    'Arunachal Pradesh': '12', 'Nagaland': '13', 'Manipur': '14', 'Mizoram': '15',
    'Tripura': '16', 'Meghalaya': '17', 'Assam': '18', 'West Bengal': '19',
    'Jharkhand': '20', 'Odisha': '21', 'Chhattisgarh': '22', 'Madhya Pradesh': '23',
    'Gujarat': '24', 'Daman and Diu': '25', 'Dadra and Nagar Haveli': '26',
    'Maharashtra': '27', 'Karnataka': '29', 'Goa': '30', 'Lakshadweep': '31',
    'Kerala': '32', 'Tamil Nadu': '33', 'Puducherry': '34', 'Andaman and Nicobar Islands': '35',
    'Telangana': '36', 'Andhra Pradesh': '37', 'Ladakh': '38',
  };
  return stateCodes[stateName] || null;
}

function extractCustomerName(payload) {
  if (payload.customer?.first_name || payload.customer?.last_name) {
    return `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim();
  }
  if (payload.billing_address?.name) return payload.billing_address.name;
  if (payload.billing_address?.first_name || payload.billing_address?.last_name) {
    return `${payload.billing_address.first_name || ''} ${payload.billing_address.last_name || ''}`.trim();
  }
  if (payload.shipping_address?.name) return payload.shipping_address.name;
  return payload.customer?.email || 'Guest Customer';
}

function extractCustomerState(payload) {
  return payload.billing_address?.province || payload.shipping_address?.province || 'Unknown';
}

function extractPlaceOfSupply(payload) {
  return payload.shipping_address?.province || payload.billing_address?.province || 'Unknown';
}

function parseDate(dateString) {
  return dateString ? new Date(dateString) : new Date();
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

function calculateGSTBreakdown(taxAmount, isIntrastate) {
  if (isIntrastate) {
    const half = round2(taxAmount / 2);
    return { cgst: half, sgst: half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: round2(taxAmount) };
}

// ────────────────────────────────────────────────────────────────────────────────
// Transform — identical to main migration script
// ────────────────────────────────────────────────────────────────────────────────

function transformToOrderItems(payload, orderName, invoiceId) {
  const orderId = payload.id?.toString() || orderName;
  const orderNumber = payload.name || orderName;
  const invoiceDate = parseDate(payload.created_at).toISOString();
  const yearMonth = invoiceDate.substring(0, 7);

  const customerState = extractCustomerState(payload);
  const placeOfSupply = extractPlaceOfSupply(payload);
  const companyState = 'Punjab';
  const companyGSTIN = '03AVNPR3936N1ZI';

  const customerStateCode = getStateCode(customerState);
  const placeOfSupplyCode = getStateCode(placeOfSupply);
  const companyStateCode = getStateCode(companyState);

  const transactionType = companyStateCode === placeOfSupplyCode ? 'intrastate' : 'interstate';
  const isIntrastateTxn = transactionType === 'intrastate';

  // Order-level discount tracking
  const totalOrderDiscount = parseFloat(payload.current_total_discounts || '0');
  let remainingOrderDiscount = totalOrderDiscount;

  const items = [];
  const lineItems = payload.line_items || [];

  lineItems.forEach((item, index) => {
    const lineItemIdx = index + 1;
    const sellingPriceWithTax = parseFloat(item.price || '0');
    const itemQuantity = item.quantity || 1;
    const itemDiscount = item.total_discount ? parseFloat(item.total_discount) : 0;

    const initialApproximateBasePrice = sellingPriceWithTax / 1.05;
    const discountToUse = (totalOrderDiscount > 0 && initialApproximateBasePrice > totalOrderDiscount)
      ? Math.min(totalOrderDiscount, remainingOrderDiscount)
      : itemDiscount;

    if (discountToUse > 0 && totalOrderDiscount > 0) {
      remainingOrderDiscount -= discountToUse;
    }

    let metaTotalTaxableValue = 0;
    let metaTotalTax = 0;
    let metaTotalCGST = 0;
    let metaTotalSGST = 0;
    let metaTotalIGST = 0;
    let metaTaxRate = 0;

    for (let unitIndex = 0; unitIndex < itemQuantity; unitIndex++) {
      const hasDiscount = unitIndex === 0 && discountToUse > 0;

      let taxRate = 0.05;
      let taxDivisor = 1.05;
      let sellingPriceBase = sellingPriceWithTax / taxDivisor;

      const priceAfterDiscount = hasDiscount
        ? sellingPriceBase - discountToUse
        : sellingPriceBase;

      if (priceAfterDiscount >= 2500) {
        taxRate = 0.18;
        taxDivisor = 1.18;
        sellingPriceBase = sellingPriceWithTax / taxDivisor;
      }

      const perUnitTax = sellingPriceWithTax - sellingPriceBase;
      const finalPriceAfterDiscount = hasDiscount
        ? sellingPriceBase - discountToUse
        : sellingPriceBase;

      const gst = calculateGSTBreakdown(perUnitTax, isIntrastateTxn);

      metaTotalTaxableValue += finalPriceAfterDiscount;
      metaTotalTax += perUnitTax;
      metaTotalCGST += gst.cgst;
      metaTotalSGST += gst.sgst;
      metaTotalIGST += gst.igst;
      if (unitIndex === 0) {
        metaTaxRate = Math.round(taxRate * 100);
      }
    }

    const orderItem = {
      shop: CONFIG.TARGET_SHOP,
      orderNumber_lineItemIdx: `${orderNumber}#${String(lineItemIdx).padStart(3, '0')}`,
      orderId,
      orderNumber,
      invoiceId,
      invoiceNumber: orderNumber,
      invoiceDate,
      yearMonth,
      yearMonth_invoiceDate: `${yearMonth}#${invoiceDate}`,
      lineItemIdx,
      productId: item.product_id?.toString() || undefined,
      variantId: item.variant_id?.toString() || undefined,
      sku: item.sku || undefined,
      productTitle: item.title || item.name || 'Unknown Product',
      fulfillmentService: item.fulfillment_service || undefined,
      hsn: undefined,
      uqc: CONFIG.DEFAULT_UQC,
      quantity: itemQuantity,
      unitPrice: round2(sellingPriceWithTax),
      discount: round2(discountToUse),
      taxableValue: round2(metaTotalTaxableValue),
      taxRate: metaTaxRate,
      cgst: round2(metaTotalCGST),
      sgst: round2(metaTotalSGST),
      igst: round2(metaTotalIGST),
      cess: 0,
      totalTax: round2(metaTotalTax),
      customerName: extractCustomerName(payload),
      customerState,
      customerStateCode: customerStateCode || undefined,
      placeOfSupply,
      placeOfSupplyCode: placeOfSupplyCode || undefined,
      companyState,
      companyStateCode: companyStateCode || undefined,
      companyGSTIN,
      transactionType,
      supplyType: 'B2C',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'migration-script',
    };

    if (orderItem.hsn) {
      orderItem.hsn_yearMonth = `${orderItem.hsn}#${yearMonth}`;
    }
    if (orderItem.taxRate) {
      orderItem.taxRate_yearMonth = `${orderItem.taxRate}#${yearMonth}`;
    }

    items.push(orderItem);
  });

  return items;
}

// ────────────────────────────────────────────────────────────────────────────────
// Lookup Functions
// ────────────────────────────────────────────────────────────────────────────────

async function fetchShopifyOrder(orderName) {
  const result = await dynamodb.send(new GetCommand({
    TableName: CONFIG.TABLES.ORDERS,
    Key: { name: orderName },
  }));
  return result.Item || null;
}

async function fetchInvoiceId(orderName) {
  // Query the orderId-index GSI — orderId in Invoices is the Shopify numeric ID,
  // but orderName is stored as "orderName" attribute. We'll scan with a filter instead
  // since we only need 3 records.
  const { DynamoDBClient: _c } = await import('@aws-sdk/client-dynamodb');
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');

  const result = await dynamodb.send(new ScanCommand({
    TableName: CONFIG.TABLES.INVOICES,
    FilterExpression: 'orderName = :name AND shop = :shop',
    ExpressionAttributeValues: {
      ':name': orderName,
      ':shop': CONFIG.TARGET_SHOP,
    },
  }));

  if (result.Items && result.Items.length > 0) {
    return result.Items[0].invoiceId;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────────
// Main Execution
// ────────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Missing ShopifyOrderItems Migration Script');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no changes will be made)' : '⚠️  LIVE MIGRATION'}`);
  console.log(`Orders to fix: ${ORDER_NAMES.join(', ')}`);
  console.log(`Target Shop: ${CONFIG.TARGET_SHOP}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (const orderName of ORDER_NAMES) {
    try {
      console.log(`\n📦 Processing ${orderName}...`);

      // 1. Fetch the ShopifyOrder record
      const order = await fetchShopifyOrder(orderName);
      if (!order) {
        throw new Error(`Order not found in ShopifyOrders table`);
      }
      console.log(`   ├─ Found in ShopifyOrders ✅`);

      const payload = order.payload;
      if (!payload) {
        throw new Error(`Order has no payload`);
      }

      // 2. Look up existing invoiceId from Invoices table
      const invoiceId = await fetchInvoiceId(orderName);
      if (!invoiceId) {
        throw new Error(`Invoice not found in Invoices table for ${orderName}`);
      }
      console.log(`   ├─ Found invoice: ${invoiceId} ✅`);

      // 3. Transform to order items using the existing payload
      const orderItems = transformToOrderItems(payload, orderName, invoiceId);
      console.log(`   ├─ Line items to create: ${orderItems.length}`);

      orderItems.forEach((item, i) => {
        console.log(`   │  ${i + 1}. ${item.productTitle} | qty: ${item.quantity} | taxable: ₹${item.taxableValue} | tax: ${item.taxRate}% | ${item.transactionType}`);
      });

      if (isDryRun) {
        console.log(`   └─ [DRY RUN] Would write ${orderItems.length} items to ${CONFIG.TABLES.ORDER_ITEMS}`);
        successCount++;
        continue;
      }

      // 4. Write to ShopifyOrderItems (batch write in chunks of 25)
      const batches = [];
      for (let i = 0; i < orderItems.length; i += 25) {
        batches.push(orderItems.slice(i, i + 25));
      }

      for (const batch of batches) {
        await dynamodb.send(new BatchWriteCommand({
          RequestItems: {
            [CONFIG.TABLES.ORDER_ITEMS]: batch.map(item => ({
              PutRequest: { Item: item }
            }))
          }
        }));
      }

      console.log(`   └─ ✅ Written ${orderItems.length} items successfully`);
      successCount++;

    } catch (error) {
      console.error(`   └─ ❌ Error: ${error.message}`);
      errorCount++;
      errors.push({ order: orderName, error: error.message });
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`📊 Total Processed: ${ORDER_NAMES.length}`);

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(err => {
      console.log(`   - ${err.order}: ${err.error}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN COMPLETE — No changes were made');
    console.log('💡 Run without --dry-run flag to execute the migration\n');
  } else {
    console.log('✅ MIGRATION COMPLETE\n');
  }
}

main();
