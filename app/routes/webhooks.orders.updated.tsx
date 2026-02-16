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
  checkShopBillingLimit,
  generateInvoicePipeline,
  moveInvoiceToFolder,
  jsonResponse,
  errorResponse,
} from "../services/webhookUtils.server";
import { archiveWebhookPayload } from "../services/s3.server";

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

    // ── Archive webhook payload to S3 (data loss prevention) ─────────────
    await archiveWebhookPayload(shop, topic, payload, payload.name);

    const orderName = payload.name;
    const paymentStatus = payload.financial_status || (payload as any).paymentStatus;

    console.log(`Webhook authenticated - Topic: ${topic}, Shop: ${shop}`);
    console.log(`Order: ${orderName}, Payment Status: ${paymentStatus}`);
    
    // Log address details specifically
    console.log(`[ADDRESS DEBUG] shipping_address:`, JSON.stringify(payload.shipping_address, null, 2));
    console.log(`[ADDRESS DEBUG] billing_address:`, JSON.stringify(payload.billing_address, null, 2));
    console.log(`[ADDRESS DEBUG] customer:`, JSON.stringify(payload.customer, null, 2));
    
    // ── Exchange Detection: Check for returns array ──────────────────────
    const hasReturns = payload.returns && Array.isArray(payload.returns) && payload.returns.length > 0;
    
    // Determine if this is an EXCHANGE or just a RETURN
    // Exchange = returns exist AND new items were added (line_items count increased or new unfulfilled items)
    // Pure Return = returns exist but no new items added
    let isExchange = false;
    if (hasReturns) {
      // Check if there are any line items that are NOT in the returns (meaning they're new exchange items)
      const returnedLineItemIds = new Set();
      payload.returns?.forEach((returnObj: any) => {
        returnObj.return_line_items?.forEach((rli: any) => {
          if (rli.line_item_id) {
            returnedLineItemIds.add(rli.line_item_id);
          }
        });
      });
      
      // If there are line items not in returns list, it's an exchange
      const hasNonReturnedItems = payload.line_items?.some((li: any) => !returnedLineItemIds.has(li.id));
      isExchange = hasNonReturnedItems;
      
      console.log(`[RETURNS DETECTED] Order ${orderName}:`);
      console.log(`  - Returns array exists: ${payload.returns.length} return(s)`);
      console.log(`  - Returned line item IDs:`, Array.from(returnedLineItemIds));
      console.log(`  - Total line items: ${payload.line_items?.length || 0}`);
      console.log(`  - Has non-returned items: ${hasNonReturnedItems}`);
      console.log(`  - Classification: ${isExchange ? 'EXCHANGE' : 'PURE RETURN'}`);
      console.log(`  Returns:`, JSON.stringify(payload.returns.map((r: any) => ({
        id: r.id,
        name: r.name,
        closed_at: r.closed_at,
        return_line_items: r.return_line_items?.length || 0
      })), null, 2));
    }
    
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

    // Map fulfillment status (don't override with "Exchanged" - track that separately)
    // Move to "returned" folder for pure returns (but not for exchanges)
    if (paymentStatus === "refunded" && !isExchange) {
      newStatus = "Returned";
      s3Action = "returned"; // Will move to returned folder and update s3Key in DB
    } else if (fulfillmentStatus === "fulfilled") {
      newStatus = "Fulfilled";
    } else if (fulfillmentStatus === "partial") {
      newStatus = "Partially Fulfilled";
    } else if (fulfillmentStatus === "on_hold") {
      newStatus = "On Hold";
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
      
      // If exchange detected (returns array present AND new items added), mark as original exchange order
      // For pure returns (no new items), mark as "return" type instead
      if (hasReturns) {
        if (isExchange) {
          expressionParts.push("exchangeType = :exchangeType");
          expressionValues[":exchangeType"] = "original";
          console.log(`[EXCHANGE] Setting exchangeType="original" for order ${orderName}`);
        } else {
          expressionParts.push("returnType = :returnType");
          expressionValues[":returnType"] = "return";
          console.log(`[RETURN] Setting returnType="return" for order ${orderName} (pure return, no exchange)`);
        }
        expressionParts.push("payload = :payload"); // Update payload to include returns array
        expressionValues[":payload"] = payload; // Store updated payload with returns
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
        ...(hasReturns && { exchangeType: "original" }),
      }));
    }

    // ── Regenerate invoice ONLY for exchanges (not pure returns) ──────────
    // Only regenerate when the order is an EXCHANGE and fulfilled/partially fulfilled
    if (isExchange && hasReturns && (fulfillmentStatus === "fulfilled" || fulfillmentStatus === "partial" || fulfillmentStatus === "partially_fulfilled")) {
      console.log(`[EXCHANGE] Order ${orderName} is an exchange and is ${fulfillmentStatus}, regenerating invoice with exchange items`);
      console.log(`[EXCHANGE] Line items at regeneration:`, JSON.stringify(payload.line_items?.map((li: any) => ({
        id: li.id,
        title: li.title,
        variant_title: li.variant_title,
        quantity: li.quantity,
        fulfillment_status: li.fulfillment_status
      })), null, 2));
      
      // Get list of returned line item IDs from returns array
      const returnedLineItemIds = new Set();
      payload.returns?.forEach((returnObj: any) => {
        returnObj.return_line_items?.forEach((rli: any) => {
          if (rli.line_item_id) {
            returnedLineItemIds.add(rli.line_item_id);
          }
        });
      });
      
      console.log(`[EXCHANGE] Returned line item IDs:`, Array.from(returnedLineItemIds));
      
      // Filter line items to exclude the returned/exchanged items
      const exchangedLineItems = payload.line_items?.filter((li: any) => 
        !returnedLineItemIds.has(li.id)
      ) || [];
      
      console.log(`[EXCHANGE] Filtered to ${exchangedLineItems.length} exchange items (excluding returned):`, 
        JSON.stringify(exchangedLineItems.map((li: any) => ({
          id: li.id,
          title: li.title,
          quantity: li.quantity,
        })), null, 2));
      
      if (exchangedLineItems.length === 0) {
        console.log(`[EXCHANGE] No exchange items found (all returned), skipping invoice regeneration`);
      } else {
        // Create modified payload with only exchange line items (not returned items)
        const modifiedPayload = {
          ...payload,
          line_items: exchangedLineItems,
          // Recalculate totals based on exchange items only
          current_subtotal_price: exchangedLineItems.reduce((sum: number, li: any) => 
            sum + parseFloat(li.price || '0') * (li.quantity || 0), 0).toFixed(2),
          current_total_price: exchangedLineItems.reduce((sum: number, li: any) => 
            sum + parseFloat(li.price || '0') * (li.quantity || 0), 0).toFixed(2),
        };
        
        try {
          const shopConfig = await fetchShopConfig(shop);
        const { companyState, companyGSTIN } = shopConfig;
        
        // ── Check billing limits before regenerating invoice ─────────────────
        const billingCheck = await checkShopBillingLimit(shop);
        if (!billingCheck.canProcess) {
          console.log(`[Billing] Order limit reached for shop ${shop}: ${billingCheck.ordersThisMonth}/${billingCheck.orderLimit}, skipping exchange invoice regeneration`);
          
          return jsonResponse({
            success: false,
            message: `Monthly order limit reached (${billingCheck.orderLimit} orders on ${billingCheck.currentPlan} plan). Cannot regenerate exchange invoice.`,
            ordersThisMonth: billingCheck.ordersThisMonth,
            orderLimit: billingCheck.orderLimit,
            currentPlan: billingCheck.currentPlan,
            requiresUpgrade: true,
          }, 402); // 402 Payment Required
        }
        
        // Resolve fulfillment location state
        let fulfillmentState = companyState;
        const locationIdToResolve = fulfillmentData.fulfillmentLocationId || (payload.location_id ? payload.location_id.toString() : null);
        if (locationIdToResolve) {
          try {
            fulfillmentState = await resolveLocationState(shop, locationIdToResolve, companyState);
          } catch (locError) {
            console.log(`[Exchange Invoice] Using company state due to location error:`, locError);
          }
        }

        // Generate new invoice with updated order details (only fulfilled items)
        const invoiceResult = await generateInvoicePipeline({
          shop,
          payload: modifiedPayload,
          orderName: payload.name,
          fulfillmentState,
          companyGSTIN,
          source: "webhook-orders-updated-fulfillment", // Regenerating for exchange
          taxCalculationMethod: shopConfig.taxCalculationMethod,
        });
        
        console.log(`[EXCHANGE] Invoice regenerated successfully: ${invoiceResult.invoiceId}`);
        
        // Update order with exchange amounts and modified payload
        const exchangeTotal = modifiedPayload.current_total_price;
        console.log(`[EXCHANGE] Updating order totals - Exchange total: ${exchangeTotal}`);
        console.log(`[EXCHANGE] Original payload total: ${payload.total_price}, New total: ${exchangeTotal}`);
        
        try {
          await dynamodb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { name: orderName },
            UpdateExpression: "SET total_price = :total, payload = :payload, updatedAt = :ts",
            ExpressionAttributeValues: {
              ":total": exchangeTotal,
              ":payload": modifiedPayload, // Store modified payload with only exchange items
              ":ts": now,
            },
          }));
          console.log(`[EXCHANGE] Updated total_price and payload in DB for ${orderName}: ${exchangeTotal} (exchange items only)`);
        } catch (updateError) {
          console.error(`[EXCHANGE] Failed to update total_price in DB:`, updateError);
        }
        } catch (invoiceError) {
          console.error(`[EXCHANGE] Failed to regenerate invoice:`, invoiceError);
          // Don't fail the webhook if invoice generation fails
        }
      }
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
              taxCalculationMethod: shopConfig.taxCalculationMethod,
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
      
      // Update s3Key in database with new location after moving
      if (movedFiles.length > 0) {
        const newS3Key = movedFiles[0]; // Primary invoice file
        try {
          await dynamodb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { name: orderName },
            UpdateExpression: "SET s3Key = :s3Key, updatedAt = :ts",
            ExpressionAttributeValues: {
              ":s3Key": newS3Key,
              ":ts": now,
            },
          }));
          console.log(`[S3 MOVE] Updated s3Key in DB for ${orderName}: ${newS3Key}`);
        } catch (updateError) {
          console.error(`[S3 MOVE] Failed to update s3Key in DB:`, updateError);
        }
      }
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
