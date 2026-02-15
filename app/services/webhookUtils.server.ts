/**
 * Shared utilities for Shopify order webhook handlers.
 *
 * Extracts common code from orders/create, orders/updated, and orders/cancelled
 * webhooks to avoid duplication.
 */

import dynamodb from "../db.server";
import { PutCommand, QueryCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { TABLE_NAMES } from "../constants/tables";
import { writeOrderItems } from "./gstReporting.server";
import {
  transformOrderToInvoice,
  type ShopifyOrderPayload,
} from "./invoiceTransformer.server";
import { getTemplateConfiguration, getLocationState, getShopAccessToken, getShopCompanyDetails } from "./dynamodb.server";
import { enrichLineItemsWithHSN } from "./productMetafields.server";

// ─── Shared clients ──────────────────────────────────────────────────────────

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "us-east-1" });

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WebhookContext {
  payload: any;
  rawBody: string;
  topic: string;
  shop: string;
}

export interface ShopConfig {
  templateId: string;
  templateConfig: any;
  companyState: string;
  companyGSTIN: string | undefined;
  multiWarehouseGST: boolean;
  taxCalculationMethod?: "app" | "shopify"; // New field
}

export interface InvoiceGenerationResult {
  invoiceId: string;
  s3Url: string;
  fileName: string;
  emailSentTo?: string;
  success: boolean;
}

// ─── HMAC Validation ─────────────────────────────────────────────────────────

/**
 * Validates Shopify webhook HMAC signature.
 * Checks against both SHOPIFY_API_SECRET and SHOPIFY_WEBHOOK_SECRET.
 *
 * @returns null if valid, or a 401 Response if invalid
 */
export function validateWebhookHmac(request: Request, rawBody: string): Response | null {
  const receivedHmac = request.headers.get("x-shopify-hmac-sha256") || "";
  const appSecret = process.env.SHOPIFY_API_SECRET || "";
  const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || "";

  const computeHmac = (secret: string) =>
    secret
      ? createHmac("sha256", secret).update(rawBody, "utf8").digest("base64")
      : "";

  const appHmac = computeHmac(appSecret);
  const webhookHmac = computeHmac(webhookSecret);

  const hmacMatch = (expected: string, actual: string) => {
    if (!expected || !actual) return false;
    try {
      const expectedBuf = Buffer.from(expected, "utf8");
      const actualBuf = Buffer.from(actual, "utf8");
      if (expectedBuf.length !== actualBuf.length) return false;
      return timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  };

  const appHmacOk = hmacMatch(receivedHmac, appHmac);
  const webhookHmacOk = hmacMatch(receivedHmac, webhookHmac);

  if (!appHmacOk && !webhookHmacOk) {
    console.error("HMAC validation failed. Rejecting webhook.");
    return new Response("Unauthorized", { status: 401 });
  }

  return null; // Valid
}

/**
 * Parse and extract common webhook context (payload, shop, topic).
 */
export function parseWebhookContext(request: Request, rawBody: string, defaultTopic: string): WebhookContext {
  const payload = rawBody ? JSON.parse(rawBody) : {};
  const topic = request.headers.get("x-shopify-topic") || defaultTopic;
  const shop = request.headers.get("x-shopify-shop-domain") || "unknown";

  return { payload, rawBody, topic, shop };
}

// ─── Customer Name Extraction ────────────────────────────────────────────────

/**
 * Extracts customer name from a Shopify order payload, trying multiple address fields.
 */
export function extractCustomerName(payload: any): string {
  if (payload.billing_address?.name) {
    return payload.billing_address.name;
  }
  if (payload.shipping_address?.name) {
    return payload.shipping_address.name;
  }
  if (payload.billing_address?.first_name || payload.billing_address?.last_name) {
    return `${payload.billing_address.first_name || ""} ${payload.billing_address.last_name || ""}`.trim();
  }
  if (payload.shipping_address?.first_name || payload.shipping_address?.last_name) {
    return `${payload.shipping_address.first_name || ""} ${payload.shipping_address.last_name || ""}`.trim();
  }
  if (payload.customer?.first_name || payload.customer?.last_name) {
    return `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim();
  }
  return payload.contact_email || payload.email || "Guest";
}

// ─── Shop Configuration ─────────────────────────────────────────────────────

/**
 * Fetches shop template ID and full template configuration (company info, styling).
 * Returns companyState, companyGSTIN, and multiWarehouseGST flag.
 * Company details are ONLY fetched from Shops.configurations.companyDetails
 */
export async function fetchShopConfig(shop: string): Promise<ShopConfig> {
  let shopTemplateId = "minimalist";
  let configurations: any = {};
  let companyDetails: any = null;
  
  try {
    const shopResult = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAMES.SHOPS,
      Key: { shop },
    }));
    if (shopResult.Item?.templateId) {
      shopTemplateId = shopResult.Item.templateId;
    }
    
    // Get configurations JSON (includes companyDetails and other settings)
    if (shopResult.Item?.configurations) {
      configurations = typeof shopResult.Item.configurations === 'string' 
        ? JSON.parse(shopResult.Item.configurations)
        : shopResult.Item.configurations;
      
      companyDetails = configurations.companyDetails || null;
    }
  } catch (shopError) {
    console.error("Error fetching shop record:", shopError);
  }

  // Get template configuration (styling only)
  let templateConfig: any = null;
  try {
    templateConfig = await getTemplateConfiguration(shop, shopTemplateId);
  } catch (configError) {
    console.error("Could not fetch template config:", configError);
  }

  // Merge company details from Shops table with template config
  const mergedConfig = {
    ...templateConfig,
    company: companyDetails || {},
  };

  return {
    templateId: shopTemplateId,
    templateConfig: mergedConfig,
    companyState: companyDetails?.state || "Unknown",
    companyGSTIN: companyDetails?.gstin,
    multiWarehouseGST: (companyDetails?.multiWarehouseGST === true) || false,
    taxCalculationMethod: configurations.taxCalculationMethod || "shopify", // Default to Shopify tax
  };
}

// ─── Location State Resolution ───────────────────────────────────────────────

/**
 * Resolves a Shopify location_id to a state name.
 * Calls Shopify Admin API to get location details.
 *
 * @returns The resolved state name, or the fallback companyState if resolution fails
 */
export async function resolveLocationState(
  shop: string,
  locationId: string | number,
  companyState: string
): Promise<string> {
  const locId = locationId.toString();

  try {
    const accessToken = await getShopAccessToken(shop);
    if (accessToken) {
      const locationInfo = await getLocationState(shop, locId, accessToken);
      if (locationInfo.state) {
        return locationInfo.state;
      }
    }
  } catch (locError) {
    console.error("Error resolving location state:", locError);
  }

  return companyState;
}

// ─── Invoice Idempotency Check ───────────────────────────────────────────────

/**
 * Checks if an invoice already exists for the given orderId.
 *
 * @returns The existing invoiceId if found, or null
 */
export async function checkInvoiceExists(orderId: string): Promise<string | null> {
  try {
    const existingInvoice = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAMES.INVOICES,
      IndexName: "orderId-index",
      KeyConditionExpression: "orderId = :orderId",
      ExpressionAttributeValues: { ":orderId": orderId },
      Limit: 1,
    }));

    if (existingInvoice.Items && existingInvoice.Items.length > 0) {
      return existingInvoice.Items[0].invoiceId;
    }
  } catch (checkError) {
    console.error("Error checking existing invoice:", checkError);
  }

  return null;
}

// ─── Billing Limit Check ─────────────────────────────────────────────────────

/**
 * Checks if shop can process more orders based on billing plan limits
 * 
 * @returns Object with canProcess flag, current plan, limits, and usage
 */
export async function checkShopBillingLimit(shop: string): Promise<{
  canProcess: boolean;
  currentPlan: string;
  orderLimit: number | null;
  ordersThisMonth: number;
}> {
  // Import billing helpers
  let getOrderLimit, getEffectivePlan;
  try {
    const helpers = await import("../utils/billing-helpers");
    getOrderLimit = helpers.getOrderLimit;
    getEffectivePlan = helpers.getEffectivePlan;
  } catch (importError) {
    console.error("Error importing billing helpers:", importError);
    throw importError;
  }
  
  // Get shop's current billing plan from Shops table
  let currentPlan = "Free";
  try {
    const shopResult = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAMES.SHOPS,
      Key: { shop },
    }));
    
    if (shopResult.Item?.billingPlan) {
      currentPlan = shopResult.Item.billingPlan;
    }
  } catch (error) {
    console.error("Error fetching shop billing plan:", error);
  }
  
  // Get order limit for current plan
  const orderLimit = getOrderLimit(currentPlan);
  
  // If unlimited (null), always allow processing
  if (orderLimit === null) {
    return {
      canProcess: true,
      currentPlan,
      orderLimit: null,
      ordersThisMonth: 0,
    };
  }
  
  // Count orders this month (excluding cancelled orders)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthISO = startOfMonth.toISOString();
  
  try {
    // Query using ScanCommand and filter by shop and timestamp
    const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
    
    const ordersResult = await dynamodb.send(new ScanCommand({
      TableName: TABLE_NAMES.ORDERS,
      FilterExpression: "shop = :shop AND #ts >= :startOfMonth AND #status <> :cancelled",
      ExpressionAttributeNames: {
        "#ts": "timestamp",
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":shop": shop,
        ":startOfMonth": startOfMonthISO,
        ":cancelled": "Cancelled",
      },
    }));
    
    const ordersThisMonth = ordersResult.Items?.length || 0;
    
    // Check if can process (under limit)
    const canProcess = ordersThisMonth < orderLimit;
    
    console.log(`[Billing Check] Shop: ${shop}, Plan: ${currentPlan}, Orders: ${ordersThisMonth}/${orderLimit}, Can process: ${canProcess}`);
    
    return {
      canProcess,
      currentPlan,
      orderLimit,
      ordersThisMonth,
    };
  } catch (error) {
    console.error("[checkShopBillingLimit] Error counting monthly orders:", error);
    // On error, allow processing (fail open)
    return {
      canProcess: true,
      currentPlan,
      orderLimit,
      ordersThisMonth: 0,
    };
  }
}

// ─── Invoice Generation Pipeline ─────────────────────────────────────────────

/**
 * Full invoice generation pipeline:
 *  1. Transform order → InvoiceData
 *  2. Write GST reporting data (ShopifyOrderItems)
 *  3. Invoke PDF generation Lambda
 *  4. Save Invoices table record
 *  5. Update ShopifyOrderItems with invoiceId
 *  6. Update ShopifyOrders with S3 key
 *
 * Used by both orders/create (normal flow) and orders/updated (multi-warehouse flow).
 */
export async function generateInvoicePipeline(opts: {
  shop: string;
  payload: any;
  orderName: string;
  fulfillmentState: string;
  companyGSTIN: string | undefined;
  source: "webhook-orders-create" | "webhook-orders-updated-fulfillment";
  taxCalculationMethod?: "app" | "shopify";
  /** Extra fields to merge into the Invoices table record */
  extraInvoiceFields?: Record<string, any>;
}): Promise<InvoiceGenerationResult> {
  const { shop, payload, orderName, fulfillmentState, companyGSTIN, source, taxCalculationMethod, extraInvoiceFields } = opts;
  const orderId = payload.id?.toString() || orderName;

  // 0. Enrich payload with HSN codes from cache
  let enrichedPayload = payload;
  if (payload.line_items && payload.line_items.length > 0) {
    try {
      const enrichedLineItems = await enrichLineItemsWithHSN(
        shop,
        null, // No admin client available in webhook context - cache only
        payload.line_items
      );
      enrichedPayload = {
        ...payload,
        line_items: enrichedLineItems,
      };
    } catch (error) {
      console.error('Error enriching HSN codes:', error);
      // Continue with original payload
    }
  }

  // 1. Transform order → InvoiceData
  const invoiceData = transformOrderToInvoice(
    enrichedPayload as ShopifyOrderPayload,
    fulfillmentState,
    taxCalculationMethod || "shopify"
  );
  console.log(
    `[InvoicePipeline] Computed ${invoiceData.lineItems.length} line items, ` +
    `${invoiceData._gstMeta.items.length} GST meta items, ` +
    `isIntrastate=${invoiceData._gstMeta.isIntrastate}`
  );

  // 2. Write GST reporting data
  if (invoiceData._gstMeta.items.length > 0) {
    try {
      const invoiceDate = new Date(payload.created_at || Date.now()).toISOString();
      const customerName = extractCustomerName(payload);

      await writeOrderItems(
        shop,
        {
          invoiceId: "", // Updated below after Lambda returns
          invoiceNumber: orderName,
          invoiceDate,
          orderId,
          orderNumber: orderName,
          customerName: invoiceData.customer.name || customerName,
          customerState: invoiceData._gstMeta.customerState,
          placeOfSupply: invoiceData._gstMeta.placeOfSupply,
        },
        invoiceData._gstMeta.items,
        {
          state: fulfillmentState,
          gstin: companyGSTIN,
        }
      );
      console.log(`[InvoicePipeline] GST reporting data written for order ${orderName}`);
    } catch (gstError) {
      console.error("[InvoicePipeline] Error writing GST data:", gstError);
    }
  }

  // 3. Invoke PDF Lambda
  let lambdaResult: { invoiceId?: string; s3Url?: string; fileName?: string; emailSentTo?: string } = {};
  try {
    const { _gstMeta, ...invoiceDataForLambda } = invoiceData;

    const lambdaEvent = {
      invoiceData: invoiceDataForLambda,
      shop,
      orderId,
      orderName,
    };

    console.log("[InvoicePipeline] Invoking Lambda...");
    const invokeParams = {
      FunctionName: process.env.INVOICE_LAMBDA_NAME || "shopify-generate-pdf-invoice",
      InvocationType: "RequestResponse" as const,
      Payload: Buffer.from(JSON.stringify(lambdaEvent), "utf8"),
    };

    const lambdaResponse = await lambdaClient.send(new InvokeCommand(invokeParams));

    if (lambdaResponse.Payload) {
      const responseStr = Buffer.from(lambdaResponse.Payload).toString();
      const parsed = JSON.parse(responseStr);
      lambdaResult = parsed.body ? JSON.parse(parsed.body) : parsed;
      console.log(`[InvoicePipeline] Lambda returned: invoiceId=${lambdaResult.invoiceId}, s3Url=${lambdaResult.s3Url}`);
    }

    if (lambdaResponse.FunctionError) {
      console.error("[InvoicePipeline] Lambda execution error:", lambdaResponse.FunctionError);
      if (lambdaResponse.Payload) {
        console.error("[InvoicePipeline] Lambda error payload:", Buffer.from(lambdaResponse.Payload).toString());
      }
    }
  } catch (invokeError) {
    console.error("[InvoicePipeline] Error invoking PDF Lambda:", invokeError);
  }

  // 4. Save Invoices table record
  const invoiceId = lambdaResult.invoiceId || randomUUID();
  try {
    const nowEpoch = Date.now();
    await dynamodb.send(
      new PutCommand({
        TableName: TABLE_NAMES.INVOICES,
        Item: {
          invoiceId,
          shop,
          orderId,
          orderName,
          customerName: invoiceData.customer.name || "",
          customerEmail: invoiceData.customer.email || "",
          s3Key: lambdaResult.fileName || "",
          s3Url: lambdaResult.s3Url || "",
          emailSentTo: lambdaResult.emailSentTo || "",
          emailSentAt: lambdaResult.emailSentTo ? nowEpoch : null,
          total: invoiceData.totals.total,
          status: lambdaResult.emailSentTo ? "sent" : "generated",
          createdAt: nowEpoch,
          updatedAt: nowEpoch,
          ...(extraInvoiceFields || {}),
        },
        ConditionExpression: "attribute_not_exists(invoiceId)",
      })
    );
    console.log(`[InvoicePipeline] Invoice record saved: ${invoiceId}`);
  } catch (dbError) {
    console.error("[InvoicePipeline] Error saving invoice record:", dbError);
  }

  // 5. Update ShopifyOrderItems with invoiceId
  try {
    const gstQuery = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
        KeyConditionExpression: "shop = :shop AND begins_with(orderNumber_lineItemIdx, :orderNum)",
        ExpressionAttributeValues: {
          ":shop": shop,
          ":orderNum": `${orderName}#`,
        },
      })
    );

    if (gstQuery.Items && gstQuery.Items.length > 0) {
      for (const item of gstQuery.Items) {
        await dynamodb.send(
          new UpdateCommand({
            TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
            Key: {
              shop: item.shop,
              orderNumber_lineItemIdx: item.orderNumber_lineItemIdx,
            },
            UpdateExpression: "SET invoiceId = :invoiceId, updatedAt = :updatedAt, updatedBy = :updatedBy",
            ExpressionAttributeValues: {
              ":invoiceId": invoiceId,
              ":updatedAt": new Date().toISOString(),
              ":updatedBy": source,
            },
          })
        );
      }
      console.log(`[InvoicePipeline] Updated ${gstQuery.Items.length} GST records with invoiceId ${invoiceId}`);
    }
  } catch (updateError) {
    console.error("[InvoicePipeline] Error updating GST records with invoiceId:", updateError);
  }

  // 6. Update ShopifyOrders with S3 key
  if (lambdaResult.fileName) {
    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: TABLE_NAMES.ORDERS,
          Key: { name: orderName },
          UpdateExpression:
            "SET s3Key = :s3Key, invoiceGenerated = :generated, invoiceGeneratedAt = :ts, invoicePending = :pending, updatedAt = :ts",
          ExpressionAttributeValues: {
            ":s3Key": lambdaResult.fileName,
            ":generated": true,
            ":ts": new Date().toISOString(),
            ":pending": false,
          },
        })
      );
      console.log(`[InvoicePipeline] ShopifyOrders updated with S3 key: ${lambdaResult.fileName}`);
    } catch (dbError) {
      console.error("[InvoicePipeline] Error updating ShopifyOrders:", dbError);
    }
  }

  return {
    invoiceId,
    s3Url: lambdaResult.s3Url || "",
    fileName: lambdaResult.fileName || "",
    emailSentTo: lambdaResult.emailSentTo,
    success: true,
  };
}

// ─── S3 Invoice Move ─────────────────────────────────────────────────────────

/**
 * Moves invoice file(s) from invoices/ folder to a target folder in S3.
 * Used for cancelled/returned orders.
 */
export async function moveInvoiceToFolder(
  orderName: string,
  shop: string,
  targetFolder: string = "returned"
): Promise<string[]> {
  const movedFiles: string[] = [];
  const orderNameClean = orderName.replace("#", "");
  const sanitizedShop = shop.replace(/\./g, "-");
  const bucketName = process.env.S3_BUCKET_NAME || "";

  if (!bucketName) {
    console.warn("S3_BUCKET_NAME not set, skipping S3 operations");
    return movedFiles;
  }

  try {
    const listResult = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `shops/${sanitizedShop}/invoices/`,
      })
    );

    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`No invoices found for order: ${orderName}`);
      return movedFiles;
    }

    const matchingFiles = listResult.Contents.filter((item) =>
      item.Key?.includes(`invoice-${orderNameClean}`)
    );

    if (matchingFiles.length === 0) {
      console.log(`No matching invoice files found for order: ${orderName}`);
      return movedFiles;
    }

    for (const file of matchingFiles) {
      const sourceKey = file.Key;
      if (!sourceKey) continue;

      const fileName = sourceKey.split("/").pop();
      const destinationKey = `shops/${sanitizedShop}/${targetFolder}/${fileName}`;

      await s3Client.send(
        new CopyObjectCommand({
          Bucket: bucketName,
          CopySource: `${bucketName}/${sourceKey}`,
          Key: destinationKey,
        })
      );
      console.log(`Copied ${sourceKey} to ${destinationKey}`);

      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: sourceKey,
        })
      );
      console.log(`Deleted ${sourceKey}`);
      movedFiles.push(destinationKey);
    }

    return movedFiles;
  } catch (error) {
    console.error(`Error moving invoice to ${targetFolder} folder:`, error);
    return movedFiles;
  }
}

// ─── Response Helpers ────────────────────────────────────────────────────────

export function jsonResponse(body: Record<string, any>, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, error: unknown): Response {
  return jsonResponse(
    {
      success: false,
      message,
      error: error instanceof Error ? error.message : "Unknown error",
    },
    500
  );
}
