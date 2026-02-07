import type { ActionFunctionArgs } from "react-router";
import dynamodb from "../db.server";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { TABLE_NAMES } from "../constants/tables";
import {
  validateWebhookHmac,
  parseWebhookContext,
  extractCustomerName,
  fetchShopConfig,
  resolveLocationState,
  checkInvoiceExists,
  generateInvoicePipeline,
  jsonResponse,
  errorResponse,
} from "../services/webhookUtils.server";

const TABLE_NAME = TABLE_NAMES.ORDERS;

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Order create webhook received");
  const requestClone = request.clone();
  const rawBody = await requestClone.text();
  
  try {
    // ── HMAC validation ──────────────────────────────────────────────────
    const hmacError = validateWebhookHmac(request, rawBody);
    if (hmacError) return hmacError;

    // ── Parse webhook context ────────────────────────────────────────────
    const { payload, topic, shop } = parseWebhookContext(request, rawBody, "orders/create");

    console.log(`Webhook authenticated - Topic: ${topic}, Shop: ${shop}`);
    console.log(`Order ID: ${payload.id}, Name: ${payload.name}`);
    
    // Log complete webhook payload for debugging
    console.log(`[Webhook Payload] COMPLETE PAYLOAD:`, JSON.stringify(payload, null, 2));
    
    // Log specific fields we're interested in
    console.log(`[Webhook Payload] location_id: ${payload.location_id}`);
    if (payload.line_items && payload.line_items.length > 0) {
      console.log(`[Webhook Payload] Line items count: ${payload.line_items.length}`);
      payload.line_items.forEach((item: any, idx: number) => {
        console.log(`[Webhook Payload] Item ${idx + 1}:`, JSON.stringify({
          product_id: item.product_id,
          variant_id: item.variant_id,
          fulfillment_service: item.fulfillment_service,
          fulfillment_status: item.fulfillment_status,
          title: item.title,
          sku: item.sku,
        }));
      });
    }

    // ── Idempotency check ────────────────────────────────────────────────
    const orderId = payload.id?.toString() || payload.name;
    console.log(`[Idempotency Check] Checking for existing invoice with orderId: ${orderId}`);
    
    let invoiceExists = false;
    const existingInvoiceId = await checkInvoiceExists(orderId);
    if (existingInvoiceId) {
      console.log(`[Idempotency] Invoice already exists for order ${orderId} (ID: ${existingInvoiceId})`);
      invoiceExists = true;
        
      // Check if GST data exists - if not, write it even for duplicate webhooks
      try {
        const existingGSTData = await dynamodb.send(new QueryCommand({
          TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
          KeyConditionExpression: "shop = :shop AND begins_with(orderNumber_lineItemIdx, :orderNum)",
          ExpressionAttributeValues: {
            ":shop": shop,
            ":orderNum": `${payload.name}#`
          },
          Limit: 1
        }));
        
        if (existingGSTData.Items && existingGSTData.Items.length > 0) {
          console.log(`[Idempotency] GST data already exists, skipping duplicate processing`);
          return jsonResponse({
            success: true,
            message: "Order already processed (duplicate webhook)",
            invoiceId: existingInvoiceId,
          });
        }
        
        console.log(`[Idempotency] Invoice exists but GST data missing - will write GST data only`);
      } catch (checkError) {
        console.log("[Idempotency] Error checking GST data, proceeding:", checkError);
      }
    } else {
      console.log(`[Idempotency] No existing invoice found for order ${orderId}, proceeding with full processing`);
    }

    // ── Extract customer name ────────────────────────────────────────────
    const customerName = extractCustomerName(payload);
    console.log(`Customer name extracted: ${customerName}`);

    // Generate unique ID and timestamp (used for both new and existing invoices)
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    // Only store order and invoke Lambda if invoice doesn't exist yet
    if (!invoiceExists) {
      // Prepare item for DynamoDB (following lambda-shopify-orderCreated.mjs logic)
      const item = {
        eventId,
        name: payload.name, // Extract order name as partition key
        timestamp,
        status: "Created",
        payload,
        customerName, // Store extracted customer name at top level for easy access
        customer: payload.customer || null,
        currency: payload.currency || payload.presentment_currency || "INR",
        total_price: payload.total_price || payload.current_total_price || "0.00",
        financial_status: payload.financial_status || "pending",
        sourceIP: payload.browser_ip || payload.client_details?.browser_ip || null,
        shop, // Include shop domain
        topic, // Include webhook topic
        updatedAt: timestamp,
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days expiration
      };

      // Store in DynamoDB
      await dynamodb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        })
      );

      console.log(`Order stored successfully: ${eventId}`);
    }

    // ── Fetch shop config ────────────────────────────────────────────────
    const shopConfig = await fetchShopConfig(shop);
    const { companyState, companyGSTIN, multiWarehouseGST } = shopConfig;
    console.log(`[Shop Config] companyState: ${companyState}, companyGSTIN: ${companyGSTIN}, multiWarehouseGST: ${multiWarehouseGST}`);

    // ── Multi-warehouse: defer to fulfillment ────────────────────────────
    if (multiWarehouseGST) {
      console.log(`[Multi-Warehouse] Enabled — skipping invoice & GST at order creation. Will generate on fulfillment.`);
      
      if (!invoiceExists) {
        try {
          await dynamodb.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { name: payload.name },
              UpdateExpression: "SET invoicePending = :pending, invoicePendingReason = :reason, updatedAt = :ts",
              ExpressionAttributeValues: {
                ":pending": true,
                ":reason": "multi-warehouse-gst-awaiting-fulfillment",
                ":ts": new Date().toISOString(),
              },
            })
          );
        } catch (updateError) {
          console.error("Error setting invoicePending flag:", updateError);
        }
      }

      return jsonResponse({
        success: true,
        message: "Order stored — invoice deferred to fulfillment (multi-warehouse GST)",
        eventId,
        timestamp,
        multiWarehouseGST: true,
      });
    }

    // ── Resolve fulfillment location state ───────────────────────────────
    let fulfillmentState = companyState;
    const locationId = payload.location_id;
    if (locationId) {
      fulfillmentState = await resolveLocationState(shop, locationId, companyState);
    } else {
      console.log(`[Location] No location_id in order, using company state: ${companyState}`);
    }

    // ── Generate invoice (transform + GST + PDF + save) ──────────────────
    let invoiceResult;
    try {
      invoiceResult = await generateInvoicePipeline({
        shop,
        payload,
        orderName: payload.name,
        fulfillmentState,
        companyGSTIN,
        source: "webhook-orders-create",
      });
    } catch (pipelineError) {
      console.error("Error in invoice pipeline:", pipelineError);
      return jsonResponse({
        success: false,
        message: "Failed to generate invoice",
        error: pipelineError instanceof Error ? pipelineError.message : String(pipelineError),
      }, 500);
    }

    return jsonResponse({
      success: true,
      message: "Order webhook processed successfully",
      eventId,
      invoiceId: invoiceResult.invoiceId,
      timestamp,
    });
  } catch (error) {
    console.error("Failed to process orders/create webhook");
    console.error("Error type:", (error as any)?.constructor?.name);
    
    if (error instanceof Response) {
      console.error("Response status:", error.status);
      console.error("Response statusText:", error.statusText);
    } else {
      console.error("Error message:", error instanceof Error ? error.message : String(error));
    }

    return errorResponse("Failed to process order webhook", error);
  }
};
