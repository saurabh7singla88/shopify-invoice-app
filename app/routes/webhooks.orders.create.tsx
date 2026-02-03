import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import dynamodb from "../db.server";
import { PutCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { TABLE_NAMES } from "../constants/tables";

const TABLE_NAME = TABLE_NAMES.ORDERS;
const SHOPS_TABLE = TABLE_NAMES.SHOPS;
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "us-east-1" });

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Order create webhook received");
  const requestClone = request.clone();
  const rawBody = await requestClone.text();
  
  try {
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

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const topic = request.headers.get("x-shopify-topic") || "orders/create";
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";

    console.log(`Webhook authenticated - Topic: ${topic}, Shop: ${shop}`);
    console.log(`Order ID: ${payload.id}, Name: ${payload.name}`);

    // Check if invoice already exists for this order (idempotency)
    const orderId = payload.id?.toString() || payload.name;
    console.log(`[Idempotency Check] Checking for existing invoice with orderId: ${orderId}`);
    
    try {
      const existingInvoice = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAMES.INVOICES,
        IndexName: "orderId-index",
        KeyConditionExpression: "orderId = :orderId",
        ExpressionAttributeValues: {
          ":orderId": orderId
        },
        Limit: 1
      }));
      
      if (existingInvoice.Items && existingInvoice.Items.length > 0) {
        console.log(`[Idempotency] Invoice already exists for order ${orderId} (ID: ${existingInvoice.Items[0].invoiceId}), skipping duplicate processing`);
        return new Response(
          JSON.stringify({
            success: true,
            message: "Order already processed (duplicate webhook)",
            invoiceId: existingInvoice.Items[0].invoiceId,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      
      console.log(`[Idempotency] No existing invoice found for order ${orderId}, proceeding with processing`);
    } catch (checkError) {
      console.log("[Idempotency] Error checking for existing invoice, proceeding:", checkError);
      // Continue processing if check fails
    }

    // Generate unique ID and timestamp
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    // Extract customer name from order addresses
    let customerName = '';
    
    if (payload.billing_address?.name) {
      customerName = payload.billing_address.name;
    }
    else if (payload.shipping_address?.name) {
      customerName = payload.shipping_address.name;
    }
    else if (payload.billing_address?.first_name || payload.billing_address?.last_name) {
      customerName = `${payload.billing_address.first_name || ''} ${payload.billing_address.last_name || ''}`.trim();
    }
    else if (payload.shipping_address?.first_name || payload.shipping_address?.last_name) {
      customerName = `${payload.shipping_address.first_name || ''} ${payload.shipping_address.last_name || ''}`.trim();
    }
    else if (payload.customer?.first_name || payload.customer?.last_name) {
      customerName = `${payload.customer.first_name || ''} ${payload.customer.last_name || ''}`.trim();
    }
    else {
      customerName = payload.contact_email || payload.email || 'Guest';
    }
    
    console.log(`Customer name extracted: ${customerName}`);

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

    // Invoke invoice generation Lambda
    try {
      const invokeParams = {
        FunctionName: process.env.INVOICE_LAMBDA_NAME || "shopify-generate-invoice",
        InvocationType: "Event" as const, // Asynchronous invocation
        Payload: Buffer.from(JSON.stringify({
          ...payload,
          shop,
          shop_domain: shop,
        }),
        "utf8"),
      };

      await lambdaClient.send(new InvokeCommand(invokeParams));
      console.log("Invoice generation Lambda invoked successfully");
    } catch (invokeError) {
      console.error("Error invoking invoice Lambda:", invokeError);
      // Continue even if invoice generation fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Order webhook processed successfully",
        eventId,
        timestamp,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Failed to process orders/create webhook");
    console.error("Error type:", error?.constructor?.name);
    
    // If it's a Response error from authentication, get the details
    if (error instanceof Response) {
      console.error("Response status:", error.status);
      console.error("Response statusText:", error.statusText);
    } else {
      console.error("Error message:", error instanceof Error ? error.message : String(error));
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: "Failed to process order webhook",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
