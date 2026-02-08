/**
 * Migration Script: PistaGreenOrders → ShopifyOrders + Invoices + ShopifyOrderItems
 * 
 * Purpose: Migrate historical order data from PistaGreenOrders table to the new app structure
 * Target Shop: g0scmu-6k.myshopify.com
 * Date Filter: timestamp > 2025-12-29
 * 
 * Usage:
 *   node migrate-pistagreen-orders.mjs --dry-run    # Preview changes without writing
 *   node migrate-pistagreen-orders.mjs              # Execute migration
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

// ────────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  SOURCE_TABLE: 'PistaGreenOrders',
  TARGET_SHOP: 'g0scmu-6k.myshopify.com',
  DATE_FILTER: '2025-12-29',
  TABLES: {
    ORDERS: 'ShopifyOrders',
    INVOICES: 'Invoices',
    ORDER_ITEMS: 'ShopifyOrderItems',
  },
  DEFAULT_UQC: 'NOS', // Nos (Numbers) - default unit of quantity
};

const isDryRun = process.argv.includes('--dry-run');
const singleIdx = process.argv.indexOf('--single');
const singleRecordName = singleIdx !== -1 ? process.argv[singleIdx + 1] : null;
const fromIdx = process.argv.indexOf('--from');
const toIdx = process.argv.indexOf('--to');
const fromName = fromIdx !== -1 ? process.argv[fromIdx + 1] : null;
const toName = toIdx !== -1 ? process.argv[toIdx + 1] : null;

function extractOrderNumber(name) {
  const match = name?.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

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
  // For B2C, place of supply is shipping address state
  return payload.shipping_address?.province || payload.billing_address?.province || 'Unknown';
}

function parseDate(dateString) {
  return dateString ? new Date(dateString) : new Date();
}

// ────────────────────────────────────────────────────────────────────────────────
// Data Transformation
// ────────────────────────────────────────────────────────────────────────────────

function transformToShopifyOrder(record) {
  const payload = record.payload;
  const orderName = payload.name || record.name;
  const timestamp = parseDate(payload.created_at).toISOString();
  
  return {
    name: orderName,
    timestamp,
    status: payload.cancelled_at ? 'Cancelled' : (payload.fulfillment_status || 'Created'),
    payload,
    customerName: extractCustomerName(payload),
    customer: payload.customer || null,
    currency: payload.currency || payload.presentment_currency || 'INR',
    total_price: payload.total_price || payload.current_total_price || '0.00',
    financial_status: payload.financial_status || 'pending',
    sourceIP: payload.browser_ip || payload.client_details?.browser_ip || null,
    shop: CONFIG.TARGET_SHOP,
    topic: 'orders/create',
    updatedAt: timestamp,
    ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
    // Migration metadata
    migratedFrom: 'PistaGreenOrders',
    migratedAt: new Date().toISOString(),
  };
}

function transformToInvoice(record) {
  const payload = record.payload;
  const orderId = payload.id?.toString() || record.name;
  const orderName = payload.name || record.name;
  const nowEpoch = Date.now();
  const totalPrice = parseFloat(payload.current_total_price || payload.total_price || '0');
  
  return {
    invoiceId: randomUUID(),
    shop: CONFIG.TARGET_SHOP,
    orderId,
    orderName,
    customerName: extractCustomerName(payload),
    customerEmail: payload.customer?.email || payload.email || '',
    s3Key: '',
    s3Url: '',
    emailSentTo: '',
    emailSentAt: null,
    total: `Rs. ${totalPrice.toFixed(2)}`,
    status: 'pending',
    createdAt: nowEpoch,
    updatedAt: nowEpoch,
    // Migration metadata
    migratedFrom: 'PistaGreenOrders',
    migratedAt: new Date().toISOString(),
  };
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

function transformToOrderItems(record, invoiceId) {
  const payload = record.payload;
  const orderId = payload.id?.toString() || record.name;
  const orderNumber = payload.name || record.name;
  const invoiceDate = parseDate(payload.created_at).toISOString();
  const yearMonth = invoiceDate.substring(0, 7); // "2026-01"
  
  const customerState = extractCustomerState(payload);
  const placeOfSupply = extractPlaceOfSupply(payload);
  const companyState = 'Punjab'; // PistaGreen location
  const companyGSTIN = '03AVNPR3936N1ZI';
  
  const customerStateCode = getStateCode(customerState);
  const placeOfSupplyCode = getStateCode(placeOfSupply);
  const companyStateCode = getStateCode(companyState);
  
  const transactionType = companyStateCode === placeOfSupplyCode ? 'intrastate' : 'interstate';
  const isIntrastateTxn = transactionType === 'intrastate';
  
  // Order-level discount tracking (same as app's invoiceTransformer)
  const totalOrderDiscount = parseFloat(payload.current_total_discounts || '0');
  let remainingOrderDiscount = totalOrderDiscount;
  
  const items = [];
  const lineItems = payload.line_items || [];
  
  lineItems.forEach((item, index) => {
    const lineItemIdx = index + 1;
    const sellingPriceWithTax = parseFloat(item.price || '0');
    const itemQuantity = item.quantity || 1;
    const itemDiscount = item.total_discount ? parseFloat(item.total_discount) : 0;
    
    // Determine discount to use (same logic as app's invoiceTransformer)
    const initialApproximateBasePrice = sellingPriceWithTax / 1.05;
    const discountToUse = (totalOrderDiscount > 0 && initialApproximateBasePrice > totalOrderDiscount)
      ? Math.min(totalOrderDiscount, remainingOrderDiscount)
      : itemDiscount;
    
    if (discountToUse > 0 && totalOrderDiscount > 0) {
      remainingOrderDiscount -= discountToUse;
    }
    
    // Accumulators for this line item's GST meta (summed across units)
    let metaTotalTaxableValue = 0;
    let metaTotalTax = 0;
    let metaTotalCGST = 0;
    let metaTotalSGST = 0;
    let metaTotalIGST = 0;
    let metaTaxRate = 0;
    
    // Expand quantity → compute per unit (same as app's invoiceTransformer)
    for (let unitIndex = 0; unitIndex < itemQuantity; unitIndex++) {
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
    }
    
    const orderItem = {
      // 1. Primary Keys
      shop: CONFIG.TARGET_SHOP,
      orderNumber_lineItemIdx: `${orderNumber}#${String(lineItemIdx).padStart(3, '0')}`,
      
      // 2. Order & Invoice Info
      orderId,
      orderNumber,
      invoiceId,
      invoiceNumber: orderNumber,
      invoiceDate,
      yearMonth,
      yearMonth_invoiceDate: `${yearMonth}#${invoiceDate}`,
      
      // 3. Line Item Details
      lineItemIdx,
      productId: item.product_id?.toString() || undefined,
      variantId: item.variant_id?.toString() || undefined,
      sku: item.sku || undefined,
      productTitle: item.title || item.name || 'Unknown Product',
      fulfillmentService: item.fulfillment_service || undefined,
      
      // 4. Product Classification
      hsn: undefined,
      uqc: CONFIG.DEFAULT_UQC,
      
      // 5. Amount Details — computed using app's tax logic
      quantity: itemQuantity,
      unitPrice: round2(sellingPriceWithTax),
      discount: round2(discountToUse),
      taxableValue: round2(metaTotalTaxableValue),
      
      // 6. Tax Details
      taxRate: metaTaxRate,
      cgst: round2(metaTotalCGST),
      sgst: round2(metaTotalSGST),
      igst: round2(metaTotalIGST),
      cess: 0,
      totalTax: round2(metaTotalTax),
      
      // 7. Customer Info
      customerName: extractCustomerName(payload),
      customerState,
      customerStateCode: customerStateCode || undefined,
      placeOfSupply,
      placeOfSupplyCode: placeOfSupplyCode || undefined,
      
      // 8. Company Info
      companyState,
      companyStateCode: companyStateCode || undefined,
      companyGSTIN,
      
      // 9. Transaction Classification
      transactionType,
      supplyType: 'B2C',
      
      // 10. Status
      status: 'active',
      
      // 11. Audit Fields
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'migration-script',
    };
    
    // Add GSI composite keys
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
// Migration Logic
// ────────────────────────────────────────────────────────────────────────────────

async function fetchSourceRecords() {
  console.log(`\n📥 Fetching records from ${CONFIG.SOURCE_TABLE}...`);
  
  // Single record mode
  if (singleRecordName) {
    console.log(`   🎯 Single record mode: fetching "${singleRecordName}"`);
    const result = await dynamodb.send(new GetCommand({
      TableName: CONFIG.SOURCE_TABLE,
      Key: { name: singleRecordName },
    }));
    if (!result.Item) {
      console.log(`   ❌ Record "${singleRecordName}" not found`);
      return [];
    }
    console.log(`✅ Found record: ${singleRecordName} (timestamp: ${result.Item.timestamp})`);
    return [result.Item];
  }
  
  const filterDateISO = new Date(CONFIG.DATE_FILTER).toISOString(); // e.g. "2025-12-29T00:00:00.000Z"
  const allRecords = [];
  let lastEvaluatedKey = undefined;
  
  do {
    const scanParams = {
      TableName: CONFIG.SOURCE_TABLE,
      FilterExpression: '#ts > :dateFilter',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':dateFilter': filterDateISO },
      ExclusiveStartKey: lastEvaluatedKey,
    };
    
    const result = await dynamodb.send(new ScanCommand(scanParams));
    
    if (result.Items) {
      allRecords.push(...result.Items);
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
    console.log(`   Scanned ${result.ScannedCount} items, matched ${result.Count}, total so far: ${allRecords.length}`);
  } while (lastEvaluatedKey);
  
  // Sort by timestamp ascending
  allRecords.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  
  // Apply --from / --to range filter
  let filtered = allRecords;
  if (fromName || toName) {
    const fromNum = fromName ? extractOrderNumber(fromName) : 0;
    const toNum = toName ? extractOrderNumber(toName) : Infinity;
    filtered = allRecords.filter(item => {
      const num = extractOrderNumber(item.name);
      return num >= fromNum && num <= toNum;
    });
    console.log(`   🎯 Range filter: ${fromName || '*'} → ${toName || '*'} (${filtered.length} of ${allRecords.length} records)`);
  }
  
  console.log(`✅ Total records to migrate: ${filtered.length}`);
  return filtered;
}

async function migrateRecords(records) {
  console.log(`\n🔄 ${isDryRun ? '[DRY RUN]' : 'Migrating'} ${records.length} records...`);
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  for (const record of records) {
    try {
      const orderName = record.name || record.payload?.name;
      console.log(`\n   Processing ${orderName}...`);
      
      // 1. Transform data
      const shopifyOrder = transformToShopifyOrder(record);
      const invoice = transformToInvoice(record);
      const orderItems = transformToOrderItems(record, invoice.invoiceId);
      
      console.log(`      ├─ Order: ${shopifyOrder.name} (${shopifyOrder.financial_status}, ${shopifyOrder.currency})`);
      console.log(`      ├─ Invoice: ${invoice.invoiceId} | total: ${invoice.total}`);
      console.log(`      └─ Line Items: ${orderItems.length}`);
      
      if (isDryRun) {
        console.log(`      [DRY RUN] Would write to:`);
        console.log(`         - ${CONFIG.TABLES.ORDERS}: 1 record`);
        console.log(`         - ${CONFIG.TABLES.INVOICES}: 1 record`);
        console.log(`         - ${CONFIG.TABLES.ORDER_ITEMS}: ${orderItems.length} records`);
        successCount++;
        continue;
      }
      
      // 2. Write to ShopifyOrders
      await dynamodb.send(new PutCommand({
        TableName: CONFIG.TABLES.ORDERS,
        Item: shopifyOrder,
      }));
      
      // 3. Write to Invoices
      await dynamodb.send(new PutCommand({
        TableName: CONFIG.TABLES.INVOICES,
        Item: invoice,
      }));
      
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
      
      console.log(`      ✅ Migrated successfully`);
      successCount++;
      
    } catch (error) {
      console.error(`      ❌ Error: ${error.message}`);
      errorCount++;
      errors.push({
        record: record.name,
        error: error.message,
      });
    }
  }
  
  return { successCount, errorCount, errors };
}

// ────────────────────────────────────────────────────────────────────────────────
// Main Execution
// ────────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  PistaGreenOrders Migration Script');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no changes will be made)' : '⚠️  LIVE MIGRATION'}`);
  console.log(`Source: ${CONFIG.SOURCE_TABLE}`);
  console.log(`Target Shop: ${CONFIG.TARGET_SHOP}`);
  console.log(`Date Filter: > ${CONFIG.DATE_FILTER}`);
  console.log(`Target Tables:`);
  console.log(`  - ${CONFIG.TABLES.ORDERS}`);
  console.log(`  - ${CONFIG.TABLES.INVOICES}`);
  console.log(`  - ${CONFIG.TABLES.ORDER_ITEMS}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  try {
    // Fetch records
    const records = await fetchSourceRecords();
    
    if (records.length === 0) {
      console.log('\n⚠️  No records found matching the filter criteria.');
      return;
    }
    
    // Migrate
    const result = await migrateRecords(records);
    
    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Migration Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ Successful: ${result.successCount}`);
    console.log(`❌ Failed: ${result.errorCount}`);
    console.log(`📊 Total Processed: ${records.length}`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(err => {
        console.log(`   - ${err.record}: ${err.error}`);
      });
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    if (isDryRun) {
      console.log('🔍 DRY RUN COMPLETE - No changes were made');
      console.log('💡 Run without --dry-run flag to execute the migration\n');
    } else {
      console.log('✅ MIGRATION COMPLETE\n');
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
