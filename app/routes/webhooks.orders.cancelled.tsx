import type { ActionFunctionArgs } from "react-router";
import dynamodb from "../db.server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";
import { updateGSTReportingStatus } from "../services/gstReporting.server";
import {
  validateWebhookHmac,
  parseWebhookContext,
  moveInvoiceToFolder,
  jsonResponse,
  errorResponse,
} from "../services/webhookUtils.server";
import { archiveWebhookPayload } from "../services/s3.server";

const TABLE_NAME = TABLE_NAMES.ORDERS;

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Order cancelled webhook received");
  const requestClone = request.clone();
  const rawBody = await requestClone.text();

  try {
    // ── HMAC validation ──────────────────────────────────────────────────
    const hmacError = validateWebhookHmac(request, rawBody);
    if (hmacError) return hmacError;

    // ── Parse webhook context ────────────────────────────────────────────
    const { payload, topic, shop } = parseWebhookContext(request, rawBody, "orders/cancelled");

    // ── Archive webhook payload to S3 (data loss prevention) ─────────────
    await archiveWebhookPayload(shop, topic, payload, payload.name);

    const orderName = payload.name;
    
    console.log(`Webhook authenticated - Topic: ${topic}, Shop: ${shop}`);
    console.log(`Order: ${orderName} has been cancelled`);

    if (!orderName) {
       console.error("Order name missing from payload");
       return new Response("Bad Request: Order name missing", { status: 400 });
    }

    // Fetch the DynamoDB record
    const getParams = {
        TableName: TABLE_NAME,
        Key: {
            name: orderName
        }
    };

    const getResult = await dynamodb.send(new GetCommand(getParams));

    if (!getResult.Item) {
        console.log(`No record found for order: ${orderName}`);
        return jsonResponse({ 
            message: "Order record not found",
            orderName 
        });
    }

    console.log("Existing record:", JSON.stringify(getResult.Item, null, 2));

    // Update status to Cancelled
    const updateParams = {
        TableName: TABLE_NAME,
        Key: {
            name: orderName
        },
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
            "#status": "status"
        },
        ExpressionAttributeValues: {
            ":status": "Cancelled",
            ":updatedAt": new Date().toISOString()
        },
        ReturnValues: "ALL_NEW" as const
    };

    const updateResult = await dynamodb.send(new UpdateCommand(updateParams));
    console.log("Updated record:", JSON.stringify(updateResult.Attributes, null, 2));

    // Move invoice to shop's cancelled folder in S3
    const movedFiles = await moveInvoiceToFolder(orderName, shop, 'cancelled');
    
    // Update GST reporting data status to cancelled
    try {
      // Use order name directly (no need to query invoices)
      const creditNoteId = `CN-${orderName}-01`;
      
      await updateGSTReportingStatus(
        shop,
        orderName,
        "cancelled",
        {
          creditNoteId,
          creditNoteDate: new Date().toISOString(),
          cancellationReason: "order_cancelled"
        }
      );
      
      console.log(`GST reporting data updated to cancelled for order ${orderName}`);
    } catch (gstError) {
      console.error("Error updating GST reporting data:", gstError);
      // Don't fail the webhook if GST update fails
    }
    
    return jsonResponse({
      success: true,
      message: "Order status updated to Cancelled successfully",
      orderName,
      movedInvoices: movedFiles,
    });

  } catch (error) {
    console.error("Failed to process orders/cancelled webhook:", error);
    return errorResponse("Failed to process order webhook", error);
  }
};
