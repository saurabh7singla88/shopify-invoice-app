import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import dynamodb from "../db.server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const TABLE_NAME = process.env.ORDERS_TABLE_NAME || "ShopifyOrders";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Order create webhook received");
  const requestClone = request.clone();
  const rawBody = await requestClone.text();
  
  try {
    console.log("Authenticating webhook...");
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

    // Generate unique ID and timestamp
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    // Prepare item for DynamoDB (following lambda-shopify-orderCreated.mjs logic)
    const item = {
      eventId,
      name: payload.name, // Extract order name as partition key
      timestamp,
      status: "Created",
      payload,
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

    // TODO: Optionally invoke invoice generation Lambda here
    // You can use AWS Lambda SDK to invoke the invoice generation function
    // similar to the logic in lambda-shopify-orderCreated.mjs

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
