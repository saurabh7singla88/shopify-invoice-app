import type { ActionFunctionArgs } from "react-router";
import dynamodb from "../db.server";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHmac, timingSafeEqual } from "crypto";
import { TABLE_NAMES } from "../constants/tables";
import { updateGSTReportingStatus, createReturnEntries } from "../services/gstReporting.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Refund created webhook received");
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
    const topic = request.headers.get("x-shopify-topic") || "refunds/create";
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";

    console.log(`Webhook authenticated - Topic: ${topic}, Shop: ${shop}`);
    console.log(`Refund ID: ${payload.id}, Order ID: ${payload.order_id}`);
    
    // 🔍 DEBUG: Print complete refund payload
    console.log(`[REFUND WEBHOOK] ========== FULL PAYLOAD START ==========`);
    console.log(JSON.stringify(payload, null, 2));
    console.log(`[REFUND WEBHOOK] ========== FULL PAYLOAD END ==========`);
    
    // 🔍 DEBUG: Print refund line items details
    if (payload.refund_line_items && payload.refund_line_items.length > 0) {
      console.log(`[REFUND WEBHOOK] Refund Line Items:`);
      payload.refund_line_items.forEach((item: any, idx: number) => {
        console.log(`  Item ${idx + 1}:`, JSON.stringify({
          id: item.id,
          line_item_id: item.line_item_id,
          quantity: item.quantity,
          restocking_type: item.restocking_type,
          location_id: item.location_id,
          restock_type: item.restock_type
        }, null, 2));
      });
    }

    const orderId = payload.order_id?.toString();
    const orderName = payload.order?.name; // Shopify order name like "#1001"
    
    if (!orderId || !orderName) {
      console.error("Order ID or name missing from refund payload");
      return new Response("Bad Request: Order ID/name missing", { status: 400 });
    }

    const creditNoteId = `CN-${orderName}-${String(payload.id).slice(-2)}`;
    const creditNoteDate = payload.created_at || new Date().toISOString();

    // Determine if full or partial refund
    const refundLineItems = payload.refund_line_items || [];
    const isFullRefund = refundLineItems.length > 0 && 
                         refundLineItems.every((item: any) => item.quantity === item.line_item?.quantity);

    // Check if this is an exchange
    const isExchange = refundLineItems.some((item: any) => item.restocking_type === "exchange");
    console.log(`Refund type: ${isExchange ? 'Exchange' : 'Regular refund'}, Full refund: ${isFullRefund}`);

    // Update original order to mark as exchanged
    if (isExchange) {
      try {
        await dynamodb.send(
          new UpdateCommand({
            TableName: TABLE_NAMES.ORDERS,
            Key: { name: orderName },
            UpdateExpression: "SET exchangeType = :type, #status = :status, updatedAt = :ts",
            ExpressionAttributeNames: {
              "#status": "status"
            },
            ExpressionAttributeValues: {
              ":type": "original",
              ":status": "Exchanged",
              ":ts": new Date().toISOString()
            }
          })
        );
        console.log(`Marked order ${orderName} as exchanged (original)`);
      } catch (updateError) {
        console.error(`Error marking order as exchanged:`, updateError);
      }
    }

    try {
      if (isFullRefund) {
        // Full return - update all line items status
        console.log(`Processing full ${isExchange ? 'exchange' : 'refund'} for order ${orderName}`);
        
        await updateGSTReportingStatus(
          shop,
          orderName,
          "returned",
          {
            creditNoteId,
            creditNoteDate,
            cancellationReason: isExchange ? "exchange" : "full_return"
          }
        );
        
        console.log(`GST data updated for full refund of order ${orderName}`);
      } else {
        // Partial return - create negative entries
        console.log(`Processing partial refund for order ${orderName}`);
        
        const returnedItems = refundLineItems.map((refundItem: any) => ({
          lineItemIdx: refundItem.line_item_id, // Need to map to our line item index
          quantity: refundItem.quantity
        }));
        
        await createReturnEntries(
          shop,
          orderName,
          returnedItems,
          {
            creditNoteId,
            creditNoteDate
          }
        );
        
        console.log(`Created ${returnedItems.length} negative GST entries for partial refund`);
      }
    } catch (gstError) {
      console.error("Error processing GST refund data:", gstError);
      // Don't fail the webhook
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${isExchange ? 'Exchange' : 'Refund'} processed successfully`,
        orderName,
        creditNoteId,
        type: isExchange ? "exchange" : (isFullRefund ? "full_refund" : "partial_refund"),
        isExchange
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {
    console.error("Failed to process refunds/create webhook:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Failed to process refund webhook",
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
