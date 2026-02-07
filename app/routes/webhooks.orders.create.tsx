import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import dynamodb from "../db.server";
import { PutCommand, QueryCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { TABLE_NAMES } from "../constants/tables";
import { writeOrderItems } from "../services/gstReporting.server";
import {
  transformOrderToInvoice,
  type ShopifyOrderPayload,
} from "../services/invoiceTransformer.server";

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
    
    let invoiceExists = false;
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
        console.log(`[Idempotency] Invoice already exists for order ${orderId} (ID: ${existingInvoice.Items[0].invoiceId})`);
        invoiceExists = true;
        
        // Check if GST data exists - if not, write it even for duplicate webhooks
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
        
        console.log(`[Idempotency] Invoice exists but GST data missing - will write GST data only`);
        // Continue to GST data writing section (skip order storage and invoice generation)
      } else {
        console.log(`[Idempotency] No existing invoice found for order ${orderId}, proceeding with full processing`);
      }
    } catch (checkError) {
      console.log("[Idempotency] Error checking for existing invoice, proceeding:", checkError);
      // Continue processing if check fails
    }

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

    // Get shop configuration for GST info
    let shopConfig: any = null;
    try {
      const shopResult = await dynamodb.send(new GetCommand({
        TableName: SHOPS_TABLE,
        Key: { shop }
      }));
      shopConfig = shopResult.Item;
    } catch (shopError) {
      console.log("Could not fetch shop config:", shopError);
    }

    const companyState = shopConfig?.state || "Unknown";
    const companyGSTIN = shopConfig?.gstin;

    // ---- Transform order → InvoiceData (single source of truth for tax) ----
    let invoiceData;
    try {
      invoiceData = transformOrderToInvoice(
        payload as ShopifyOrderPayload,
        companyState
      );
      console.log(
        `[Transform] Computed ${invoiceData.lineItems.length} expanded line items, ` +
        `${invoiceData._gstMeta.items.length} GST meta items, ` +
        `isIntrastate=${invoiceData._gstMeta.isIntrastate}`
      );
    } catch (transformError) {
      console.error("Error transforming order:", transformError);
      // Cannot proceed without transform — fail gracefully
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to transform order for invoice",
          error: transformError instanceof Error ? transformError.message : String(transformError),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- Write GST reporting data (correct values from the start) ----
    if (invoiceData._gstMeta.items.length > 0) {
      try {
        const invoiceDate = new Date(payload.created_at || Date.now()).toISOString();

        await writeOrderItems(
          shop,
          {
            invoiceId: "", // Will be updated after Lambda returns
            invoiceNumber: payload.name,
            invoiceDate,
            orderId: payload.id?.toString() || payload.name,
            orderNumber: payload.name,
            customerName: invoiceData.customer.name,
            customerState: invoiceData._gstMeta.customerState,
            placeOfSupply: invoiceData._gstMeta.placeOfSupply,
          },
          invoiceData._gstMeta.items,
          {
            state: companyState,
            gstin: companyGSTIN,
          }
        );

        console.log(`GST reporting data written for order ${payload.name}`);
      } catch (gstError) {
        console.error("Error writing GST reporting data:", gstError);
        // Don't fail the webhook if GST reporting fails
      }
    }

    // ---- Invoke PDF Lambda (sync) — only if invoice doesn't exist yet ----
    let lambdaResult: { invoiceId?: string; s3Url?: string; fileName?: string; emailSentTo?: string } = {};

    if (!invoiceExists) {
      try {
        // Strip _gstMeta before sending to Lambda (it only needs display data)
        const { _gstMeta, ...invoiceDataForLambda } = invoiceData;

        const invokeParams = {
          FunctionName: process.env.INVOICE_LAMBDA_NAME || "shopify-generate-pdf-invoice",
          InvocationType: "RequestResponse" as const, // Synchronous — wait for result
          Payload: Buffer.from(
            JSON.stringify({
              invoiceData: invoiceDataForLambda,
              shop,
              orderId: payload.id?.toString(),
              orderName: payload.name,
            }),
            "utf8"
          ),
        };

        const lambdaResponse = await lambdaClient.send(new InvokeCommand(invokeParams));

        if (lambdaResponse.Payload) {
          const responseStr = Buffer.from(lambdaResponse.Payload).toString();
          const parsed = JSON.parse(responseStr);
          // Handle both direct response and API Gateway-style response
          lambdaResult = parsed.body ? JSON.parse(parsed.body) : parsed;
          console.log(
            `Lambda returned: invoiceId=${lambdaResult.invoiceId}, s3Url=${lambdaResult.s3Url}`
          );
        }

        if (lambdaResponse.FunctionError) {
          console.error("Lambda execution error:", lambdaResponse.FunctionError);
          // Try to get error details from payload
          if (lambdaResponse.Payload) {
            console.error("Lambda error payload:", Buffer.from(lambdaResponse.Payload).toString());
          }
        }
      } catch (invokeError) {
        console.error("Error invoking PDF generation Lambda:", invokeError);
        // Continue even if Lambda fails — GST data is already written
      }
    }

    // ---- Save Invoices table record (moved from Lambda) ----
    const invoiceId = lambdaResult.invoiceId || randomUUID();

    if (!invoiceExists) {
      try {
        const now = new Date().toISOString();
        await dynamodb.send(
          new PutCommand({
            TableName: TABLE_NAMES.INVOICES,
            Item: {
              invoiceId,
              shop,
              orderId: payload.id?.toString() || payload.name,
              orderName: payload.name,
              customerName: invoiceData.customer.name || "",
              customerEmail: invoiceData.customer.email || "",
              s3Key: lambdaResult.fileName || "",
              s3Url: lambdaResult.s3Url || "",
              emailSentTo: lambdaResult.emailSentTo || "",
              emailSentAt: lambdaResult.emailSentTo ? now : null,
              total: invoiceData.totals.total,
              status: lambdaResult.emailSentTo ? "sent" : "generated",
              createdAt: now,
              updatedAt: now,
            },
            ConditionExpression: "attribute_not_exists(invoiceId)",
          })
        );
        console.log(`Invoice record saved: ${invoiceId}`);
      } catch (dbError) {
        console.error("Error saving invoice record:", dbError);
      }
    }

    // ---- Update ShopifyOrderItems with invoiceId ----
    if (invoiceId) {
      try {
        const gstQuery = await dynamodb.send(
          new QueryCommand({
            TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
            KeyConditionExpression:
              "shop = :shop AND begins_with(orderNumber_lineItemIdx, :orderNumber)",
            ExpressionAttributeValues: {
              ":shop": shop,
              ":orderNumber": `${payload.name}#`,
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
                UpdateExpression:
                  "SET invoiceId = :invoiceId, updatedAt = :updatedAt, updatedBy = :updatedBy",
                ExpressionAttributeValues: {
                  ":invoiceId": invoiceId,
                  ":updatedAt": new Date().toISOString(),
                  ":updatedBy": "webhook-orders-create",
                },
              })
            );
          }
          console.log(
            `Updated ${gstQuery.Items.length} GST records with invoiceId ${invoiceId}`
          );
        }
      } catch (updateError) {
        console.error("Error updating GST records with invoiceId:", updateError);
      }
    }

    // ---- Update ShopifyOrders table with S3 key ----
    if (lambdaResult.fileName) {
      try {
        await dynamodb.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { name: payload.name },
            UpdateExpression:
              "SET s3Key = :s3Key, invoiceGenerated = :generated, invoiceGeneratedAt = :ts, updatedAt = :ts",
            ExpressionAttributeValues: {
              ":s3Key": lambdaResult.fileName,
              ":generated": true,
              ":ts": new Date().toISOString(),
            },
          })
        );
        console.log(`ShopifyOrders updated with S3 key: ${lambdaResult.fileName}`);
      } catch (dbError) {
        console.error("Error updating ShopifyOrders:", dbError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Order webhook processed successfully",
        eventId,
        invoiceId,
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
