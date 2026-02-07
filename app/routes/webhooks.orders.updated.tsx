import type { ActionFunctionArgs } from "react-router";
import dynamodb from "../db.server";
import { UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";
import {
  validateWebhookHmac,
  parseWebhookContext,
  fetchShopConfig,
  resolveLocationState,
  checkInvoiceExists,
  generateInvoicePipeline,
  moveInvoiceToFolder,
  jsonResponse,
  errorResponse,
} from "../services/webhookUtils.server";

const TABLE_NAME = TABLE_NAMES.ORDERS;

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Order update webhook received");
  const requestClone = request.clone();
  const rawBody = await requestClone.text();

  try {
    // ── HMAC validation ──────────────────────────────────────────────────
    const hmacError = validateWebhookHmac(request, rawBody);
    if (hmacError) return hmacError;

    // ── Parse webhook context ────────────────────────────────────────────
    const { payload, topic, shop } = parseWebhookContext(request, rawBody, "orders/updated");

    const orderName = payload.name;
    const paymentStatus = payload.financial_status || (payload as any).paymentStatus;

    console.log(`Webhook authenticated - Topic: ${topic}, Shop: ${shop}`);
    console.log(`Order: ${orderName}, Payment Status: ${paymentStatus}`);
    
    // Log complete webhook payload for debugging
    console.log(`[orders/updated Payload] COMPLETE PAYLOAD:`, JSON.stringify(payload, null, 2));
    
    // Log key status fields
    console.log(`[orders/updated Payload] Key fields:`, JSON.stringify({
      name: payload.name,
      financial_status: payload.financial_status,
      fulfillment_status: payload.fulfillment_status,
      cancel_reason: payload.cancel_reason,
      cancelled_at: payload.cancelled_at,
      closed_at: payload.closed_at,
      location_id: payload.location_id,
      fulfillments: payload.fulfillments?.map((f: any) => ({
        id: f.id,
        status: f.status,
        location_id: f.location_id,
        tracking_number: f.tracking_number,
        tracking_company: f.tracking_company,
        line_items: f.line_items?.map((li: any) => ({ id: li.id, title: li.title, quantity: li.quantity })),
      })),
      line_items_fulfillment: payload.line_items?.map((li: any) => ({
        id: li.id,
        title: li.title,
        fulfillment_service: li.fulfillment_service,
        fulfillment_status: li.fulfillment_status,
      })),
    }, null, 2));

    if (!orderName) {
       console.error("Order name missing from payload");
       return new Response("Bad Request: Order name missing", { status: 400 });
    }

    const fulfillmentStatus = payload.fulfillment_status; // null, "fulfilled", "partial"
    const now = new Date().toISOString();

    // Determine what changed and map to our internal status
    let newStatus: string | null = null;
    let s3Action: string | null = null; // "returned" folder move if needed

    if (paymentStatus === "refunded") {
      newStatus = "Returned";
      s3Action = "returned";
    } else if (fulfillmentStatus === "fulfilled") {
      newStatus = "Fulfilled";
    } else if (fulfillmentStatus === "partial") {
      newStatus = "Partially Fulfilled";
    }

    // Extract fulfillment details (tracking, location, etc.)
    const latestFulfillment = payload.fulfillments?.length > 0
      ? payload.fulfillments[payload.fulfillments.length - 1]
      : null;

    const fulfillmentData: Record<string, any> = {};
    if (latestFulfillment) {
      if (latestFulfillment.tracking_number) fulfillmentData.trackingNumber = latestFulfillment.tracking_number;
      if (latestFulfillment.tracking_company) fulfillmentData.trackingCompany = latestFulfillment.tracking_company;
      if (latestFulfillment.tracking_url) fulfillmentData.trackingUrl = latestFulfillment.tracking_url;
      if (latestFulfillment.location_id) fulfillmentData.fulfillmentLocationId = latestFulfillment.location_id.toString();
      if (latestFulfillment.status) fulfillmentData.fulfillmentDetailStatus = latestFulfillment.status;
      if (latestFulfillment.created_at) fulfillmentData.fulfilledAt = latestFulfillment.created_at;
      if (latestFulfillment.shipment_status) fulfillmentData.shipmentStatus = latestFulfillment.shipment_status;
    }

    // Resolve fulfillment location_id → state (via Shopify API)
    const locationIdToResolve = fulfillmentData.fulfillmentLocationId || (payload.location_id ? payload.location_id.toString() : null);
    if (locationIdToResolve) {
      try {
        const resolvedState = await resolveLocationState(shop, locationIdToResolve, "Unknown");
        if (resolvedState !== "Unknown") {
          fulfillmentData.fulfillmentState = resolvedState;
        }
      } catch (locError) {
        console.log(`[Location] Error resolving location state:`, locError);
      }
    }

    // Always update ShopifyOrders with latest status + fulfillment data
    {
      // Build dynamic UpdateExpression
      const expressionParts: string[] = [
        "#status = :status",
        "updatedAt = :updatedAt",
        "financial_status = :financialStatus",
        "fulfillment_status = :fulfillmentStatus",
      ];
      const expressionValues: Record<string, any> = {
        ":status": newStatus || (fulfillmentStatus ? `fulfillment:${fulfillmentStatus}` : "Created"),
        ":updatedAt": now,
        ":financialStatus": paymentStatus || "unknown",
        ":fulfillmentStatus": fulfillmentStatus || "unfulfilled",
      };
      const expressionNames: Record<string, string> = {
        "#status": "status",
      };

      // Add fulfillment data fields if present
      for (const [key, value] of Object.entries(fulfillmentData)) {
        expressionParts.push(`${key} = :${key}`);
        expressionValues[`:${key}`] = value;
      }

      // Add location_id from order level if present
      if (payload.location_id) {
        expressionParts.push("locationId = :locationId");
        expressionValues[":locationId"] = payload.location_id.toString();
      }

      const updateResult = await dynamodb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { name: orderName },
        UpdateExpression: `SET ${expressionParts.join(", ")}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        ReturnValues: "ALL_NEW" as const,
      }));

      console.log(`[ShopifyOrders] Updated order ${orderName} → status: ${newStatus || "Updated"}`, JSON.stringify({
        ...fulfillmentData,
        financial_status: paymentStatus,
        fulfillment_status: fulfillmentStatus,
      }));
    }

    // Update ShopifyOrderItems with fulfillment info
    try {
      const gstQuery = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
        KeyConditionExpression: "shop = :shop AND begins_with(orderNumber_lineItemIdx, :orderNum)",
        ExpressionAttributeValues: {
          ":shop": shop,
          ":orderNum": `${orderName}#`,
        },
      }));

      if (gstQuery.Items && gstQuery.Items.length > 0) {
        const itemUpdateParts: string[] = [
          "updatedAt = :updatedAt",
          "updatedBy = :updatedBy",
        ];
        const itemUpdateValues: Record<string, any> = {
          ":updatedAt": now,
          ":updatedBy": "webhook-orders-updated",
        };

        if (newStatus) {
          itemUpdateParts.push("orderStatus = :orderStatus");
          itemUpdateValues[":orderStatus"] = newStatus;
        }
        if (fulfillmentData.fulfillmentLocationId) {
          itemUpdateParts.push("fulfillmentLocationId = :locationId");
          itemUpdateValues[":locationId"] = fulfillmentData.fulfillmentLocationId;
        }
        if (fulfillmentData.trackingNumber) {
          itemUpdateParts.push("trackingNumber = :trackingNumber");
          itemUpdateValues[":trackingNumber"] = fulfillmentData.trackingNumber;
        }
        if (fulfillmentData.fulfillmentState) {
          itemUpdateParts.push("fulfillmentState = :fulfillmentState");
          itemUpdateValues[":fulfillmentState"] = fulfillmentData.fulfillmentState;
        }

        for (const item of gstQuery.Items) {
          await dynamodb.send(new UpdateCommand({
            TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
            Key: {
              shop: item.shop,
              orderNumber_lineItemIdx: item.orderNumber_lineItemIdx,
            },
            UpdateExpression: `SET ${itemUpdateParts.join(", ")}`,
            ExpressionAttributeValues: itemUpdateValues,
          }));
        }
        console.log(`[ShopifyOrderItems] Updated ${gstQuery.Items.length} records for ${orderName}`);
      }
    } catch (itemUpdateError) {
      console.error("[ShopifyOrderItems] Error updating:", itemUpdateError);
    }

    // ---- Generate invoice on fulfillment if multi-warehouse GST is enabled ----
    let invoiceGeneratedOnFulfillment = false;
    let invoiceResult: { invoiceId?: string; s3Url?: string; fileName?: string } = {};

    if ((fulfillmentStatus === "fulfilled") && latestFulfillment) {
      const shopConfig = await fetchShopConfig(shop);
      console.log(`[Multi-Warehouse] multiWarehouseGST=${shopConfig.multiWarehouseGST}, fulfillmentStatus=${fulfillmentStatus}`);

      if (shopConfig.multiWarehouseGST) {
        // Check if invoice already exists (idempotency)
        const orderId = payload.id?.toString() || orderName;
        const existingInvoiceId = await checkInvoiceExists(orderId);

        if (existingInvoiceId) {
          console.log(`[Multi-Warehouse] Invoice already exists for order ${orderId}, skipping`);
        } else {
          console.log(`[Multi-Warehouse] Generating invoice on fulfillment for order ${orderName}`);

          // Resolve fulfillment location → state
          const fulfillmentLocId = latestFulfillment.location_id?.toString();
          let fulfillmentLocationState = shopConfig.companyState;
          if (fulfillmentLocId) {
            fulfillmentLocationState = await resolveLocationState(shop, fulfillmentLocId, shopConfig.companyState);
          }

          try {
            const result = await generateInvoicePipeline({
              shop,
              payload,
              orderName,
              fulfillmentState: fulfillmentLocationState,
              companyGSTIN: shopConfig.companyGSTIN,
              source: "webhook-orders-updated-fulfillment",
              extraInvoiceFields: {
                generatedAt: "fulfillment",
                fulfillmentLocationId: fulfillmentLocId || "",
                fulfillmentState: fulfillmentLocationState,
              },
            });

            invoiceResult = result;
            invoiceGeneratedOnFulfillment = true;
          } catch (pipelineError) {
            console.error("[Multi-Warehouse] Error in invoice pipeline:", pipelineError);
          }
        }
      }
    }

    // Move invoice to returned folder in S3 if refunded
    let movedFiles: string[] = [];
    if (s3Action) {
      movedFiles = await moveInvoiceToFolder(orderName, shop, s3Action);
    }

    return jsonResponse({
      success: true,
      message: `Order ${orderName} updated → ${newStatus || "Updated"}`,
      orderName,
      paymentStatus,
      fulfillmentStatus,
      fulfillmentData,
      movedInvoices: movedFiles,
      invoiceGeneratedOnFulfillment,
      invoiceId: invoiceResult.invoiceId || null,
    });

  } catch (error) {
    console.error("Failed to process orders/updated webhook:", error);
    return errorResponse("Failed to process order webhook", error);
  }
};
