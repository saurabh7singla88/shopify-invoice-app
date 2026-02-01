import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import dynamodb from "../db.server";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const TABLE_NAME = process.env.ORDERS_TABLE_NAME || "ShopifyOrders";
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "us-east-1" });

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Order create webhook received");
  const requestClone = request.clone();
  const rawBody = await requestClone.text();
  
  try {
    console.log("Authenticating webhook...");
    const receivedHmac = request.headers.get("x-shopify-hmac-sha256") || "";
    const appSecret = process.env.SHOPIFY_API_SECRET || "";
    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || "";

    console.log("[Webhook Debug] Received HMAC:", receivedHmac);
    console.log("[Webhook Debug] App Secret length:", appSecret.length);
    console.log("[Webhook Debug] App Secret starts with:", appSecret.substring(0, 10));
    console.log("[Webhook Debug] Webhook Secret length:", webhookSecret.length);
    console.log("[Webhook Debug] Raw body length:", rawBody.length);

    const computeHmac = (secret: string) =>
      secret
        ? createHmac("sha256", secret).update(rawBody, "utf8").digest("base64")
        : "";

    const appHmac = computeHmac(appSecret);
    const webhookHmac = computeHmac(webhookSecret);

    console.log("[Webhook Debug] Computed App HMAC:", appHmac);
    console.log("[Webhook Debug] Computed Webhook HMAC:", webhookHmac);
    console.log("[Webhook Debug] HMAC Match (App):", receivedHmac === appHmac);
    console.log("[Webhook Debug] HMAC Match (Webhook):", receivedHmac === webhookHmac);

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
    try {
      const existingInvoice = await dynamodb.send(new QueryCommand({
        TableName: process.env.INVOICES_TABLE_NAME || "Invoices",
        IndexName: "orderId-index",
        KeyConditionExpression: "orderId = :orderId",
        ExpressionAttributeValues: {
          ":orderId": orderId
        },
        Limit: 1
      }));
      
      if (existingInvoice.Items && existingInvoice.Items.length > 0) {
        console.log(`Invoice already exists for order ${orderId}, skipping duplicate processing`);
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
    } catch (checkError) {
      console.log("Error checking for existing invoice, proceeding:", checkError);
      // Continue processing if check fails
    }

    // Generate unique ID and timestamp
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    // Extract customer name from various possible sources
    const customerName = 
      (payload.customer?.first_name && payload.customer?.last_name) 
        ? `${payload.customer.first_name} ${payload.customer.last_name}`.trim()
        : payload.customer?.first_name || payload.customer?.last_name ||
          payload.billing_address?.name ||
          payload.shipping_address?.name ||
          payload.billing_address?.first_name && payload.billing_address?.last_name
            ? `${payload.billing_address.first_name} ${payload.billing_address.last_name}`.trim()
            : payload.billing_address?.first_name || payload.billing_address?.last_name ||
              payload.shipping_address?.first_name && payload.shipping_address?.last_name
                ? `${payload.shipping_address.first_name} ${payload.shipping_address.last_name}`.trim()
                : payload.shipping_address?.first_name || payload.shipping_address?.last_name ||
                  '';

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
