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
  checkShopBillingLimit,
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
    // console.log(`[Webhook Payload] COMPLETE PAYLOAD:`, JSON.stringify(payload, null, 2));
    
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

    // ── Check billing limits BEFORE storing order ────────────────────────
    const billingCheck = await checkShopBillingLimit(shop);
    
    if (!billingCheck.canProcess) {
      console.log(`[Billing] Order limit reached for shop ${shop}: ${billingCheck.ordersThisMonth}/${billingCheck.orderLimit}`);
      
      // Still save the order to DB but mark it with limitReached flag
      if (!invoiceExists) {
        const item = {
          eventId,
          name: payload.name,
          orderId,
          shop,
          status: "Created",
          fulfillment_status: payload.fulfillment_status || "unfulfilled",
          financial_status: payload.financial_status || "pending",
          customerName,
          payload,
          timestamp,
          createdAt: payload.created_at || timestamp,
          sourceIP: payload.browser_ip || payload.client_details?.browser_ip || null,
          topic,
          updatedAt: timestamp,
          limitReached: true,
          billingLimitMessage: `Monthly order limit reached (${billingCheck.orderLimit} orders on ${billingCheck.currentPlan} plan)`,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
        };
        
        await dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
        console.log(`[Billing] Order ${payload.name} saved with limitReached flag`);
      }
      
      return jsonResponse({
        success: false,
        message: `Monthly order limit reached (${billingCheck.orderLimit} orders on ${billingCheck.currentPlan} plan). Please upgrade to continue processing invoices.`,
        ordersThisMonth: billingCheck.ordersThisMonth,
        orderLimit: billingCheck.orderLimit,
        currentPlan: billingCheck.currentPlan,
        requiresUpgrade: true,
        eventId,
        timestamp,
      }, 402);
    }

    // Only store order and invoke Lambda if invoice doesn't exist yet AND limit not reached
    if (!invoiceExists) {
      // Check if this is an exchange order
      // Shopify creates exchange orders as draft orders with source_name="shopify_draft_order"
      // The original order will have a "returns" array (detected in orders/updated webhook)
      const isExchangeOrder = payload.source_name === "shopify_draft_order" || 
                             payload.source_name === "exchange" ||
                             payload.note?.toLowerCase().includes("exchange") ||
                             (payload.note_attributes && payload.note_attributes.some((attr: any) => 
                               attr.name === "exchange_for_order_id" || attr.name === "original_order_id"
                             ));
      
      let exchangeForOrderId: string | null = null;
      if (isExchangeOrder && payload.note_attributes) {
        const exchangeAttr = payload.note_attributes.find((attr: any) => 
          attr.name === "exchange_for_order_id" || attr.name === "original_order_id"
        );
        if (exchangeAttr) {
          exchangeForOrderId = exchangeAttr.value;
        }
      }
      
      console.log(`Order type: ${isExchangeOrder ? 'Exchange order' : 'Regular order'}${exchangeForOrderId ? ` for ${exchangeForOrderId}` : ''}`);
      console.log(`[Exchange Detection] isExchangeOrder: ${isExchangeOrder}, source_name: ${payload.source_name}`);
      
      // Prepare item for DynamoDB (following lambda-shopify-orderCreated.mjs logic)
      const item: any = {
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
      
      // Add exchange metadata if this is an exchange order
      if (isExchangeOrder) {
        item.exchangeType = "exchange";
        if (exchangeForOrderId) {
          item.relatedOrderId = exchangeForOrderId;
        }
      }

      // Store in DynamoDB
      await dynamodb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        })
      );

      console.log(`Order stored successfully: ${eventId}`);
      
      // If this is an exchange order and we have the original order ID, link them
      if (isExchangeOrder && exchangeForOrderId) {
        try {
          await dynamodb.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { name: exchangeForOrderId },
              UpdateExpression: "SET relatedOrderId = :newOrderId, updatedAt = :ts",
              ExpressionAttributeValues: {
                ":newOrderId": payload.name,
                ":ts": timestamp
              }
            })
          );
          console.log(`Linked original order ${exchangeForOrderId} to exchange order ${payload.name}`);
        } catch (linkError) {
          console.error(`Error linking orders:`, linkError);
        }
      }
    }

    // ── Fetch shop config ────────────────────────────────────────────────
    const shopConfig = await fetchShopConfig(shop);
    const { companyState, companyGSTIN, multiWarehouseGST } = shopConfig;
    console.log(`[Shop Config] companyState: ${companyState}, companyGSTIN: ${companyGSTIN}, multiWarehouseGST: ${multiWarehouseGST}`);

    // Check if this is an exchange order (need to check again outside if block)
    const isExchangeOrder = payload.source_name === "shopify_draft_order" || 
                           payload.source_name === "exchange" ||
                           payload.note?.toLowerCase().includes("exchange");
    console.log(`[Invoice Generation Check] Order ${payload.name}:`);
    console.log(`  - isExchangeOrder: ${isExchangeOrder}`);
    console.log(`  - source_name: ${payload.source_name}`);
    console.log(`  - multiWarehouseGST: ${multiWarehouseGST}`);
    console.log(`  - invoiceExists: ${invoiceExists}`);

    // ── Multi-warehouse: defer to fulfillment (except for exchange orders) ────
    if (multiWarehouseGST && !isExchangeOrder) {
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

      console.log(`[Multi-Warehouse] Deferring invoice to fulfillment for ${payload.name}`);
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
      console.log("[OrdersCreate] About to call generateInvoicePipeline");
      console.log("[OrdersCreate] Order:", payload.name, "isExchangeOrder:", isExchangeOrder);
      console.log("[OrdersCreate] shopConfig:", JSON.stringify(shopConfig, null, 2));
      console.log("[OrdersCreate] taxCalculationMethod from shopConfig:", shopConfig.taxCalculationMethod);
      
      invoiceResult = await generateInvoicePipeline({
        shop,
        payload,
        orderName: payload.name,
        fulfillmentState,
        companyGSTIN,
        source: "webhook-orders-create",
        taxCalculationMethod: shopConfig.taxCalculationMethod,
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
