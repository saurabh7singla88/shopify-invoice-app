import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import dynamodb from "../db.server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createHmac, timingSafeEqual } from "crypto";

const TABLE_NAME = process.env.ORDERS_TABLE_NAME || "ShopifyOrders";
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "";
const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

/**
 * Moves invoice file(s) from invoices/ folder to target folder in S3
 */
async function moveInvoiceToFolder(orderName: string, shop: string, targetFolder: string = 'cancelled') {
  const movedFiles: string[] = [];
  const orderNameClean = orderName.replace("#", "");
  const sanitizedShop = shop.replace(/\./g, '-');

  if (!S3_BUCKET_NAME) {
    console.warn("S3_BUCKET_NAME not set, skipping S3 operations");
    return movedFiles;
  }

  try {
    // List all objects with the order name in the shop's invoices folder
    const listParams = {
      Bucket: S3_BUCKET_NAME,
      Prefix: `shops/${sanitizedShop}/invoices/`,
    };

    const listResult = await s3Client.send(new ListObjectsV2Command(listParams));

    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`No invoices found for order: ${orderName}`);
      return movedFiles;
    }

    // Filter files that match the order name
    const matchingFiles = listResult.Contents.filter((item) =>
      item.Key?.includes(`invoice-${orderNameClean}`)
    );

    if (matchingFiles.length === 0) {
      console.log(`No matching invoice files found for order: ${orderName}`);
      return movedFiles;
    }

    // Move each matching file to the target folder
    for (const file of matchingFiles) {
      const sourceKey = file.Key;
      if (!sourceKey) continue;
      
      const fileName = sourceKey.split("/").pop();
      const destinationKey = `shops/${sanitizedShop}/${targetFolder}/${fileName}`;

      // Copy to target folder
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: S3_BUCKET_NAME,
          CopySource: `${S3_BUCKET_NAME}/${sourceKey}`,
          Key: destinationKey,
        })
      );

      console.log(`Copied ${sourceKey} to ${destinationKey}`);

      // Delete from original location
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: sourceKey,
        })
      );

      console.log(`Deleted ${sourceKey}`);
      movedFiles.push(destinationKey);
    }

    return movedFiles;
  } catch (error) {
    console.error(`Error moving invoice to ${targetFolder} folder:`, error);
    // Don't throw, just return what happened so far so we don't fail the webhook response
    return movedFiles;
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Order cancelled webhook received");
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
    const topic = request.headers.get("x-shopify-topic") || "orders/cancelled";
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";

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
        return new Response(JSON.stringify({ 
            message: "Order record not found",
            orderName 
        }), { status: 200 });
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
    
    return new Response(JSON.stringify({
        success: true,
        message: "Order status updated to Cancelled successfully",
        orderName,
        movedInvoices: movedFiles
    }), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
        },
    });

  } catch (error) {
    console.error("Failed to process orders/cancelled webhook:", error);
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
