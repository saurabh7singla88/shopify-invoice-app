/**
 * GST Reporting Service
 * Handles writing and querying GST reporting data for GSTR-1 compliance
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  BatchWriteCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";
import { getStateCode } from "../constants/gstStateCodes";
import { DEFAULT_UQC, type UQCCode } from "../constants/uqcCodes";
import type { GSTLineItemMeta } from "./invoiceTransformer.server";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Interface for line item data from Shopify order
 */
export interface OrderLineItem {
  id: string;
  product_id?: string;
  variant_id?: string;
  sku?: string;
  title: string;
  quantity: number;
  price: string;
  total_discount: string;
  tax_lines: Array<{
    title: string;
    price: string;
    rate: number;
  }>;
}

/**
 * Interface for Shopify order item record (line-item level GST data)
 * Fields are organized in logical sequence for better readability
 */
export interface ShopifyOrderItem {
  // 1. Primary Keys
  shop: string;
  orderNumber_lineItemIdx: string; // "#1001#001"
  
  // 2. Order & Invoice Info
  orderId: string;
  orderNumber?: string;
  invoiceId?: string; // Added after invoice generation
  invoiceNumber?: string;
  invoiceDate: string; // ISO date
  yearMonth: string; // "2026-02"
  yearMonth_invoiceDate: string; // "2026-02#2026-02-15" (for GSI)
  
  // 3. Line Item Details
  lineItemIdx: number;
  productId?: string;
  variantId?: string;
  sku?: string;
  productTitle: string;
  
  // 4. Product Classification (HSN/SAC)
  hsn?: string;
  hsnDescription?: string;
  hsn_yearMonth?: string; // "6109#2026-02" (for GSI)
  uqc: UQCCode;
  sacCode?: string;
  
  // 5. Amount Details
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableValue: number;
  
  // 6. Tax Details
  taxRate: number;
  taxRate_yearMonth?: string; // "18#2026-02" (for GSI)
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  
  // 7. Customer Info
  customerName?: string;
  customerState: string;
  customerStateCode?: string;
  placeOfSupply: string;
  placeOfSupplyCode?: string;
  
  // 8. Company Info
  companyState: string;
  companyStateCode?: string;
  companyGSTIN?: string;
  
  // 9. Transaction Classification
  transactionType: "intrastate" | "interstate";
  supplyType: "B2C" | "B2B";
  
  // 10. Status & References
  status: "active" | "cancelled" | "returned";
  originalInvoiceId?: string;
  creditNoteId?: string;
  creditNoteDate?: string;
  cancellationReason?: "order_cancelled" | "full_return" | "partial_return";
  
  // 11. Audit Fields
  createdAt: string;
  createdBy?: string; // User or system that created the record
  updatedAt?: string;
  updatedBy?: string; // User or system that last updated the record
}

/**
 * Write order items (line-item level GST data) for an invoice.
 * Accepts pre-computed GSTLineItemMeta[] from the invoice transformer
 * — no tax calculation happens here.
 *
 * @param shop - Shop domain
 * @param invoiceData - Invoice and order metadata
 * @param gstLineItems - Pre-computed GST line items from invoiceTransformer
 * @param companyInfo - Company GST information
 */
export async function writeOrderItems(
  shop: string,
  invoiceData: {
    invoiceId: string;
    invoiceNumber?: string;
    invoiceDate: string;
    orderId: string;
    orderNumber?: string;
    customerName?: string;
    customerState: string;
    placeOfSupply: string;
  },
  gstLineItems: GSTLineItemMeta[],
  companyInfo: {
    state: string;
    gstin?: string;
  }
): Promise<void> {
  console.log(`[writeOrderItems] Writing ${gstLineItems.length} line items for order ${invoiceData.orderNumber}`);
  
  const yearMonth = invoiceData.invoiceDate.substring(0, 7); // "2026-02"
  const companyStateCode = getStateCode(companyInfo.state);
  const placeOfSupplyCode = getStateCode(invoiceData.placeOfSupply);
  const customerStateCode = getStateCode(invoiceData.customerState);
  
  const transactionType: "intrastate" | "interstate" =
    companyStateCode === placeOfSupplyCode ? "intrastate" : "interstate";
  
  const records: ShopifyOrderItem[] = gstLineItems.map((item, index) => {
    const lineItemIdx = index + 1;
    
    const record: ShopifyOrderItem = {
      // 1. Primary Keys
      shop,
      orderNumber_lineItemIdx: `${invoiceData.orderNumber}#${String(lineItemIdx).padStart(3, "0")}`,
      
      // 2. Order & Invoice Info
      orderId: invoiceData.orderId,
      orderNumber: invoiceData.orderNumber,
      invoiceId: invoiceData.invoiceId || undefined,
      invoiceNumber: invoiceData.invoiceNumber,
      invoiceDate: invoiceData.invoiceDate,
      yearMonth,
      yearMonth_invoiceDate: `${yearMonth}#${invoiceData.invoiceDate}`,
      
      // 3. Line Item Details
      lineItemIdx,
      productId: item.productId || undefined,
      variantId: item.variantId || undefined,
      sku: item.sku || undefined,
      productTitle: item.productTitle,
      
      // 4. Product Classification (HSN/SAC)
      hsn: item.hsn || undefined,
      hsnDescription: undefined,
      uqc: DEFAULT_UQC,
      sacCode: undefined,
      
      // 5. Amount Details — all pre-computed by transformer
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxableValue: item.taxableValue,
      
      // 6. Tax Details — all pre-computed by transformer
      taxRate: item.taxRate,
      cgst: item.cgst,
      sgst: item.sgst,
      igst: item.igst,
      cess: 0,
      totalTax: item.totalTax,
      
      // 7. Customer Info
      customerName: invoiceData.customerName,
      customerState: invoiceData.customerState,
      customerStateCode: customerStateCode || undefined,
      placeOfSupply: invoiceData.placeOfSupply,
      placeOfSupplyCode: placeOfSupplyCode || undefined,
      
      // 8. Company Info
      companyState: companyInfo.state,
      companyStateCode: companyStateCode || undefined,
      companyGSTIN: companyInfo.gstin,
      
      // 9. Transaction Classification
      transactionType,
      supplyType: "B2C", // TODO: Detect B2B based on customer GSTIN
      
      // 10. Status & References
      status: "active",
      
      // 11. Audit Fields
      createdAt: new Date().toISOString(),
      createdBy: "system",
    };
    
    // Add GSI composite keys
    if (record.hsn) {
      record.hsn_yearMonth = `${record.hsn}#${yearMonth}`;
    }
    if (record.taxRate) {
      record.taxRate_yearMonth = `${record.taxRate}#${yearMonth}`;
    }
    
    return record;
  });
  
  console.log(`[writeOrderItems] Created ${records.length} records, batching for DynamoDB`);
  
  // Batch write to DynamoDB (max 25 items per batch)
  const batches: ShopifyOrderItem[][] = [];
  for (let i = 0; i < records.length; i += 25) {
    batches.push(records.slice(i, i + 25));
  }
  
  for (const batch of batches) {
    console.log(`[writeOrderItems] Writing batch of ${batch.length} records`);
    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAMES.SHOPIFY_ORDER_ITEMS]: batch.map((record) => ({
          PutRequest: {
            Item: record,
          },
        })),
      },
    });
    
    await docClient.send(command);
  }
  
  console.log(`[writeOrderItems] Successfully wrote ${records.length} order item records to DynamoDB`);
}

/**
 * Update GST reporting data status (for cancellations/returns)
 * @param shop - Shop domain
 * @param invoiceId - Invoice ID
 * @param status - New status
 * @param creditNoteInfo - Credit note information
 */
export async function updateGSTReportingStatus(
  shop: string,
  orderNumber: string,
  status: "cancelled" | "returned",
  creditNoteInfo?: {
    creditNoteId: string;
    creditNoteDate: string;
    cancellationReason: "order_cancelled" | "full_return" | "partial_return";
  }
): Promise<void> {
  // Query all line items for this order
  const queryCommand = new QueryCommand({
    TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
    KeyConditionExpression: "shop = :shop AND begins_with(orderNumber_lineItemIdx, :orderNumber)",
    ExpressionAttributeValues: {
      ":shop": shop,
      ":orderNumber": `${orderNumber}#`,
    },
  });
  
  const result = await docClient.send(queryCommand);
  
  if (!result.Items || result.Items.length === 0) {
    return;
  }
  
  // Update each line item
  for (const item of result.Items) {
    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
      Key: {
        shop: item.shop,
        orderNumber_lineItemIdx: item.orderNumber_lineItemIdx,
      },
      UpdateExpression:
        "SET #status = :status, updatedAt = :updatedAt, updatedBy = :updatedBy" +
        (creditNoteInfo ? ", creditNoteId = :creditNoteId, creditNoteDate = :creditNoteDate, cancellationReason = :cancellationReason" : ""),
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":updatedAt": new Date().toISOString(),
        ":updatedBy": "system", // Status update system
        ...(creditNoteInfo && {
          ":creditNoteId": creditNoteInfo.creditNoteId,
          ":creditNoteDate": creditNoteInfo.creditNoteDate,
          ":cancellationReason": creditNoteInfo.cancellationReason,
        }),
      },
    });
    
    await docClient.send(updateCommand);
  }
}

/**
 * Create negative entries for partial returns
 * @param shop - Shop domain
 * @param originalInvoiceId - Original invoice ID
 * @param returnedLineItems - Line items being returned
 * @param creditNoteInfo - Credit note information
 */
export async function createReturnEntries(
  shop: string,
  orderNumber: string,
  returnedLineItems: Array<{ lineItemIdx: number; quantity: number }>,
  creditNoteInfo: {
    creditNoteId: string;
    creditNoteDate: string;
  }
): Promise<void> {
  // Query original line items
  const queryCommand = new QueryCommand({
    TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
    KeyConditionExpression: "shop = :shop AND begins_with(orderNumber_lineItemIdx, :orderNumber)",
    ExpressionAttributeValues: {
      ":shop": shop,
      ":orderNumber": `${orderNumber}#`,
    },
  });
  
  const result = await docClient.send(queryCommand);
  
  if (!result.Items || result.Items.length === 0) {
    return;
  }
  
  const returnRecords: ShopifyOrderItem[] = [];
  
  for (const returnItem of returnedLineItems) {
    const originalItem = result.Items.find(
      (item) => item.lineItemIdx === returnItem.lineItemIdx
    ) as ShopifyOrderItem | undefined;
    
    if (!originalItem) continue;
    
    // Create negative record with credit note as "order number"
    const returnRecord: ShopifyOrderItem = {
      ...originalItem,
      orderNumber_lineItemIdx: `${creditNoteInfo.creditNoteId}#${String(returnItem.lineItemIdx).padStart(3, "0")}`,
      orderNumber: creditNoteInfo.creditNoteId,
      invoiceDate: creditNoteInfo.creditNoteDate,
      
      quantity: -returnItem.quantity,
      taxableValue: -(originalItem.taxableValue * (returnItem.quantity / originalItem.quantity)),
      cgst: -(originalItem.cgst * (returnItem.quantity / originalItem.quantity)),
      sgst: -(originalItem.sgst * (returnItem.quantity / originalItem.quantity)),
      igst: -(originalItem.igst * (returnItem.quantity / originalItem.quantity)),
      totalTax: -(originalItem.totalTax * (returnItem.quantity / originalItem.quantity)),
      
      status: "returned",
      originalInvoiceId: originalItem.invoiceId,
      creditNoteId: creditNoteInfo.creditNoteId,
      creditNoteDate: creditNoteInfo.creditNoteDate,
      cancellationReason: "partial_return",
      
      createdAt: new Date().toISOString(),
      createdBy: "system", // Return processing system
    };
    
    returnRecords.push(returnRecord);
  }
  
  // Batch write return records
  if (returnRecords.length > 0) {
    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAMES.GST_REPORTING_DATA]: returnRecords.map((record) => ({
          PutRequest: {
            Item: record,
          },
        })),
      },
    });
    
    await docClient.send(command);
  }
}

/**
 * Query GST reporting data for a date range
 * @param shop - Shop domain
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Array of GST reporting records
 */
export async function queryGSTDataByDateRange(
  shop: string,
  startDate: string,
  endDate: string
): Promise<ShopifyOrderItem[]> {
  const startYearMonth = startDate.substring(0, 7);
  const endYearMonth = endDate.substring(0, 7);
  
  // Generate all year-months in range
  const yearMonths = getYearMonthsInRange(startYearMonth, endYearMonth);
  
  const allRecords: ShopifyOrderItem[] = [];
  
  // Query each year-month using GSI
  for (const yearMonth of yearMonths) {
    const command = new QueryCommand({
      TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
      IndexName: "shop-yearMonth-index",
      KeyConditionExpression: "shop = :shop AND begins_with(yearMonth_invoiceDate, :yearMonth)",
      ExpressionAttributeValues: {
        ":shop": shop,
        ":yearMonth": yearMonth,
      },
    });
    
    const result = await docClient.send(command);
    if (result.Items) {
      allRecords.push(...(result.Items as ShopifyOrderItem[]));
    }
  }
  
  // Filter by exact date range
  return allRecords.filter(
    (record) => record.invoiceDate >= startDate && record.invoiceDate <= endDate
  );
}

/**
 * Generate B2C (Others) report data
 * Aggregates by Place of Supply and Tax Rate
 */
export async function generateB2CReport(
  shop: string,
  startDate: string,
  endDate: string
): Promise<{
  data: Array<{
    placeOfSupply: string;
    placeOfSupplyCode?: string;
    rate: number;
    totalTaxableValue: number;
    integratedTax: number;
    centralTax: number;
    stateTax: number;
    cess: number;
  }>;
  totals: {
    taxableValue: number;
    integratedTax: number;
    centralTax: number;
    stateTax: number;
    cess: number;
  };
}> {
  const records = await queryGSTDataByDateRange(shop, startDate, endDate);
  
  // Group by placeOfSupply + taxRate
  const grouped = new Map<
    string,
    {
      placeOfSupply: string;
      placeOfSupplyCode?: string;
      rate: number;
      totalTaxableValue: number;
      integratedTax: number;
      centralTax: number;
      stateTax: number;
      cess: number;
    }
  >();
  
  records.forEach((record) => {
    // Skip cancelled records (they are reversed/voided transactions)
    // Include returned records (they have negative values to offset original)
    if (record.status === "cancelled") return;
    
    const key = `${record.placeOfSupply}#${record.taxRate}`;
    
    if (!grouped.has(key)) {
      grouped.set(key, {
        placeOfSupply: record.placeOfSupply,
        placeOfSupplyCode: record.placeOfSupplyCode,
        rate: record.taxRate,
        totalTaxableValue: 0,
        integratedTax: 0,
        centralTax: 0,
        stateTax: 0,
        cess: 0,
      });
    }
    
    const entry = grouped.get(key)!;
    entry.totalTaxableValue += record.taxableValue;
    entry.integratedTax += record.igst;
    entry.centralTax += record.cgst;
    entry.stateTax += record.sgst;
    entry.cess += record.cess;
  });
  
  const data = Array.from(grouped.values()).sort((a, b) => {
    if (a.placeOfSupply !== b.placeOfSupply) {
      return a.placeOfSupply.localeCompare(b.placeOfSupply);
    }
    return a.rate - b.rate;
  });
  
  // Calculate totals
  const totals = data.reduce(
    (acc, item) => ({
      taxableValue: acc.taxableValue + item.totalTaxableValue,
      integratedTax: acc.integratedTax + item.integratedTax,
      centralTax: acc.centralTax + item.centralTax,
      stateTax: acc.stateTax + item.stateTax,
      cess: acc.cess + item.cess,
    }),
    {
      taxableValue: 0,
      integratedTax: 0,
      centralTax: 0,
      stateTax: 0,
      cess: 0,
    }
  );
  
  return { data, totals };
}

/**
 * Generate HSN-wise summary report
 * Aggregates by HSN code
 */
export async function generateHSNReport(
  shop: string,
  startDate: string,
  endDate: string
): Promise<{
  data: Array<{
    srNo: number;
    hsn: string;
    description: string;
    hsnDescription?: string;
    uqc: string;
    totalQuantity: number;
    totalTaxableValue: number;
    rate: number;
    integratedTax: number;
    centralTax: number;
    stateTax: number;
    cess: number;
  }>;
  totals: {
    totalQuantity: number;
    totalTaxableValue: number;
    integratedTax: number;
    centralTax: number;
    stateTax: number;
    cess: number;
  };
}> {
  const records = await queryGSTDataByDateRange(shop, startDate, endDate);
  
  // Group by HSN
  const grouped = new Map<
    string,
    {
      hsn: string;
      description: string;
      hsnDescription?: string;
      uqc: string;
      totalQuantity: number;
      totalTaxableValue: number;
      rate: number;
      integratedTax: number;
      centralTax: number;
      stateTax: number;
      cess: number;
    }
  >();
  
  records.forEach((record) => {
    // Skip cancelled records (they are reversed/voided transactions)
    // Include returned records (they have negative values to offset original)
    if (record.status === "cancelled") return;
    
    const hsn = record.hsn || "UNCLASSIFIED";
    
    if (!grouped.has(hsn)) {
      grouped.set(hsn, {
        hsn,
        description: "", // Can be populated from product data
        hsnDescription: record.hsnDescription,
        uqc: record.uqc,
        totalQuantity: 0,
        totalTaxableValue: 0,
        rate: record.taxRate, // Most common rate for this HSN
        integratedTax: 0,
        centralTax: 0,
        stateTax: 0,
        cess: 0,
      });
    }
    
    const entry = grouped.get(hsn)!;
    entry.totalQuantity += record.quantity;
    entry.totalTaxableValue += record.taxableValue;
    entry.integratedTax += record.igst;
    entry.centralTax += record.cgst;
    entry.stateTax += record.sgst;
    entry.cess += record.cess;
  });
  
  const data = Array.from(grouped.values())
    .sort((a, b) => a.hsn.localeCompare(b.hsn))
    .map((item, index) => ({
      ...item,
      srNo: index + 1,
    }));
  
  // Calculate totals
  const totals = data.reduce(
    (acc, item) => ({
      totalQuantity: acc.totalQuantity + item.totalQuantity,
      totalTaxableValue: acc.totalTaxableValue + item.totalTaxableValue,
      integratedTax: acc.integratedTax + item.integratedTax,
      centralTax: acc.centralTax + item.centralTax,
      stateTax: acc.stateTax + item.stateTax,
      cess: acc.cess + item.cess,
    }),
    {
      totalQuantity: 0,
      totalTaxableValue: 0,
      integratedTax: 0,
      centralTax: 0,
      stateTax: 0,
      cess: 0,
    }
  );
  
  return { data, totals };
}

/**
 * Helper: Generate year-months in range
 */
function getYearMonthsInRange(start: string, end: string): string[] {
  const result: string[] = [];
  let current = new Date(start + "-01");
  const endDate = new Date(end + "-01");
  
  while (current <= endDate) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    result.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }
  
  return result;
}
