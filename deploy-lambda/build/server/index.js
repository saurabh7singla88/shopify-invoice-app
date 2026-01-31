var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var _a;
import { jsx, jsxs } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData, useActionData, Form, redirect, UNSAFE_withErrorBoundaryProps, useRouteError, useSearchParams, useNavigation, useNavigate } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-react-router/server";
import { Session } from "@shopify/shopify-api";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState, useRef, useEffect } from "react";
class DynamoDBSessionStorageWrapper {
  constructor(options) {
    __publicField(this, "client");
    __publicField(this, "tableName");
    __publicField(this, "shopIndexName");
    this.tableName = options.sessionTableName;
    this.shopIndexName = options.shopIndexName;
    const dynamoClient = new DynamoDBClient({
      region: options.config.region
    });
    this.client = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true
      }
    });
  }
  /**
   * Convert session to storable format (Date -> ISO string)
   */
  toStorableSession(session) {
    const obj = session.toObject ? session.toObject() : { ...session };
    const converted = JSON.parse(JSON.stringify(obj, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }));
    return converted;
  }
  /**
   * Convert stored data back to Session (ISO string -> Date)
   */
  fromStoredSession(data) {
    if (data.expires && typeof data.expires === "string") {
      data.expires = new Date(data.expires);
    }
    return new Session(data);
  }
  async storeSession(session) {
    const item = this.toStorableSession(session);
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: item
    }));
    return true;
  }
  async loadSession(id) {
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { id }
    }));
    if (!result.Item) {
      return void 0;
    }
    return this.fromStoredSession(result.Item);
  }
  async deleteSession(id) {
    await this.client.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { id }
    }));
    return true;
  }
  async deleteSessions(ids) {
    await Promise.all(ids.map((id) => this.deleteSession(id)));
    return true;
  }
  async findSessionsByShop(shop) {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: this.shopIndexName,
      KeyConditionExpression: "shop = :shop",
      ExpressionAttributeValues: {
        ":shop": shop
      }
    }));
    if (!result.Items) {
      return [];
    }
    return result.Items.map((item) => this.fromStoredSession(item));
  }
}
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new DynamoDBSessionStorageWrapper({
    sessionTableName: process.env.DYNAMODB_SESSION_TABLE || "shopify_sessions",
    shopIndexName: "shop_index",
    config: {
      region: process.env.AWS_REGION || "us-east-1"
    }
  }),
  distribution: AppDistribution.AppStore,
  isEmbeddedApp: true,
  future: {
    unstable_newEmbeddedAuthStrategy: true
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.October25;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
const sessionStorage = shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, reactRouterContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        ServerRouter,
        {
          context: reactRouterContext,
          url: request.url
        }
      ),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width,initial-scale=1"
      }), /* @__PURE__ */ jsx("link", {
        rel: "preconnect",
        href: "https://cdn.shopify.com/"
      }), /* @__PURE__ */ jsx("link", {
        rel: "stylesheet",
        href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root
}, Symbol.toStringTag, { value: "Module" }));
const action$8 = async ({
  request
}) => {
  const {
    payload,
    session,
    topic,
    shop
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    session.scope = current.join(",");
    await sessionStorage.storeSession(session);
  }
  return new Response();
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8
}, Symbol.toStringTag, { value: "Module" }));
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
});
const dynamodb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    convertClassInstanceToMap: true,
    // Convert Date objects and other class instances
    removeUndefinedValues: true
    // Remove undefined values
  }
});
const TABLE_NAME$2 = process.env.ORDERS_TABLE_NAME || "ShopifyOrders";
const S3_BUCKET_NAME$2 = process.env.S3_BUCKET_NAME || "";
const s3Client$2 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1"
});
async function moveInvoiceToFolder$1(orderName, targetCancelledFolder) {
  const movedFiles = [];
  const orderNameClean = orderName.replace("#", "");
  if (!S3_BUCKET_NAME$2) {
    console.warn("S3_BUCKET_NAME not set, skipping S3 operations");
    return movedFiles;
  }
  try {
    const listParams = {
      Bucket: S3_BUCKET_NAME$2,
      Prefix: "invoices/"
    };
    const listResult = await s3Client$2.send(new ListObjectsV2Command(listParams));
    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`No invoices found for order: ${orderName}`);
      return movedFiles;
    }
    const matchingFiles = listResult.Contents.filter((item) => {
      var _a2;
      return (_a2 = item.Key) == null ? void 0 : _a2.includes(`invoice-${orderNameClean}`);
    });
    if (matchingFiles.length === 0) {
      console.log(`No matching invoice files found for order: ${orderName}`);
      return movedFiles;
    }
    for (const file of matchingFiles) {
      const sourceKey = file.Key;
      if (!sourceKey) continue;
      const fileName = sourceKey.split("/").pop();
      const destinationKey = `${targetCancelledFolder}/${fileName}`;
      await s3Client$2.send(new CopyObjectCommand({
        Bucket: S3_BUCKET_NAME$2,
        CopySource: `${S3_BUCKET_NAME$2}/${sourceKey}`,
        Key: destinationKey
      }));
      console.log(`Copied ${sourceKey} to ${destinationKey}`);
      await s3Client$2.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME$2,
        Key: sourceKey
      }));
      console.log(`Deleted ${sourceKey}`);
      movedFiles.push(destinationKey);
    }
    return movedFiles;
  } catch (error) {
    console.error(`Error moving invoice to ${targetCancelledFolder} folder:`, error);
    return movedFiles;
  }
}
const action$7 = async ({
  request
}) => {
  console.log("Order cancelled webhook received");
  const requestClone = request.clone();
  const rawBody = await requestClone.text();
  try {
    console.log("Authenticating webhook...");
    const receivedHmac = request.headers.get("x-shopify-hmac-sha256") || "";
    const appSecret = process.env.SHOPIFY_API_SECRET || "";
    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || "";
    const computeHmac = (secret) => secret ? createHmac("sha256", secret).update(rawBody, "utf8").digest("base64") : "";
    const appHmac = computeHmac(appSecret);
    const webhookHmac = computeHmac(webhookSecret);
    const hmacMatch = (expected, actual) => {
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
      return new Response("Unauthorized", {
        status: 401
      });
    }
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const topic = request.headers.get("x-shopify-topic") || "orders/cancelled";
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
    const orderName = payload.name;
    console.log(`Webhook authenticated - Topic: ${topic}, Shop: ${shop}`);
    console.log(`Order: ${orderName} has been cancelled`);
    if (!orderName) {
      console.error("Order name missing from payload");
      return new Response("Bad Request: Order name missing", {
        status: 400
      });
    }
    const getParams = {
      TableName: TABLE_NAME$2,
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
      }), {
        status: 200
      });
    }
    console.log("Existing record:", JSON.stringify(getResult.Item, null, 2));
    const updateParams = {
      TableName: TABLE_NAME$2,
      Key: {
        name: orderName
      },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":status": "Cancelled",
        ":updatedAt": (/* @__PURE__ */ new Date()).toISOString()
      },
      ReturnValues: "ALL_NEW"
    };
    const updateResult = await dynamodb.send(new UpdateCommand(updateParams));
    console.log("Updated record:", JSON.stringify(updateResult.Attributes, null, 2));
    const targetCancelledFolder = "cancelled-invoices";
    const movedFiles = await moveInvoiceToFolder$1(orderName, targetCancelledFolder);
    return new Response(JSON.stringify({
      success: true,
      message: "Order status updated to Cancelled successfully",
      orderName,
      movedInvoices: movedFiles
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Failed to process orders/cancelled webhook:", error);
    return new Response(JSON.stringify({
      success: false,
      message: "Failed to process order webhook",
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7
}, Symbol.toStringTag, { value: "Module" }));
const action$6 = async ({
  request
}) => {
  const {
    shop,
    session,
    topic
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await sessionStorage.deleteSessions([session.id]);
  }
  return new Response();
};
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6
}, Symbol.toStringTag, { value: "Module" }));
const TABLE_NAME$1 = process.env.ORDERS_TABLE_NAME || "ShopifyOrders";
const S3_BUCKET_NAME$1 = process.env.S3_BUCKET_NAME || "";
const s3Client$1 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1"
});
async function moveInvoiceToFolder(orderName, targetReturnFolder) {
  const movedFiles = [];
  const orderNameClean = orderName.replace("#", "");
  if (!S3_BUCKET_NAME$1) {
    console.warn("S3_BUCKET_NAME not set, skipping S3 operations");
    return movedFiles;
  }
  try {
    const listParams = {
      Bucket: S3_BUCKET_NAME$1,
      Prefix: "invoices/"
    };
    const listResult = await s3Client$1.send(new ListObjectsV2Command(listParams));
    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`No invoices found for order: ${orderName}`);
      return movedFiles;
    }
    const matchingFiles = listResult.Contents.filter((item) => {
      var _a2;
      return (_a2 = item.Key) == null ? void 0 : _a2.includes(`invoice-${orderNameClean}`);
    });
    if (matchingFiles.length === 0) {
      console.log(`No matching invoice files found for order: ${orderName}`);
      return movedFiles;
    }
    for (const file of matchingFiles) {
      const sourceKey = file.Key;
      if (!sourceKey) continue;
      const fileName = sourceKey.split("/").pop();
      const destinationKey = `${targetReturnFolder}/${fileName}`;
      await s3Client$1.send(new CopyObjectCommand({
        Bucket: S3_BUCKET_NAME$1,
        CopySource: `${S3_BUCKET_NAME$1}/${sourceKey}`,
        Key: destinationKey
      }));
      console.log(`Copied ${sourceKey} to ${destinationKey}`);
      await s3Client$1.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME$1,
        Key: sourceKey
      }));
      console.log(`Deleted ${sourceKey}`);
      movedFiles.push(destinationKey);
    }
    return movedFiles;
  } catch (error) {
    console.error(`Error moving invoice to ${targetReturnFolder} folder:`, error);
    return movedFiles;
  }
}
const action$5 = async ({
  request
}) => {
  console.log("Order update webhook received");
  const requestClone = request.clone();
  const rawBody = await requestClone.text();
  try {
    console.log("Authenticating webhook...");
    const receivedHmac = request.headers.get("x-shopify-hmac-sha256") || "";
    const appSecret = process.env.SHOPIFY_API_SECRET || "";
    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || "";
    const computeHmac = (secret) => secret ? createHmac("sha256", secret).update(rawBody, "utf8").digest("base64") : "";
    const appHmac = computeHmac(appSecret);
    const webhookHmac = computeHmac(webhookSecret);
    const hmacMatch = (expected, actual) => {
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
      return new Response("Unauthorized", {
        status: 401
      });
    }
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const topic = request.headers.get("x-shopify-topic") || "orders/updated";
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
    const orderName = payload.name;
    const paymentStatus = payload.financial_status || payload.paymentStatus;
    console.log(`Webhook authenticated - Topic: ${topic}, Shop: ${shop}`);
    console.log(`Order: ${orderName}, Payment Status: ${paymentStatus}`);
    if (paymentStatus !== "refunded") {
      console.log(`Payment status is not refunded (${paymentStatus}), skipping status update`);
      return new Response(JSON.stringify({
        message: "Payment status is not refunded, no action taken",
        orderName,
        paymentStatus
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    if (!orderName) {
      console.error("Order name missing from payload");
      return new Response("Bad Request: Order name missing", {
        status: 400
      });
    }
    const getParams = {
      TableName: TABLE_NAME$1,
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
      }), {
        status: 200
      });
    }
    console.log("Existing record:", JSON.stringify(getResult.Item, null, 2));
    const updateParams = {
      TableName: TABLE_NAME$1,
      Key: {
        name: orderName
      },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":status": "Returned",
        ":updatedAt": (/* @__PURE__ */ new Date()).toISOString()
      },
      ReturnValues: "ALL_NEW"
    };
    const updateResult = await dynamodb.send(new UpdateCommand(updateParams));
    console.log("Updated record:", JSON.stringify(updateResult.Attributes, null, 2));
    const targetReturnFolder = "returned-invoices";
    const movedFiles = await moveInvoiceToFolder(orderName, targetReturnFolder);
    return new Response(JSON.stringify({
      success: true,
      message: "Order status updated to Returned successfully",
      orderName,
      paymentStatus,
      movedInvoices: movedFiles
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Failed to process orders/updated webhook:", error);
    return new Response(JSON.stringify({
      success: false,
      message: "Failed to process order webhook",
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
};
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
const TABLE_NAME = process.env.ORDERS_TABLE_NAME || "ShopifyOrders";
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || "us-east-1"
});
const action$4 = async ({
  request
}) => {
  var _a2;
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
    const computeHmac = (secret) => secret ? createHmac("sha256", secret).update(rawBody, "utf8").digest("base64") : "";
    const appHmac = computeHmac(appSecret);
    const webhookHmac = computeHmac(webhookSecret);
    console.log("[Webhook Debug] Computed App HMAC:", appHmac);
    console.log("[Webhook Debug] Computed Webhook HMAC:", webhookHmac);
    console.log("[Webhook Debug] HMAC Match (App):", receivedHmac === appHmac);
    console.log("[Webhook Debug] HMAC Match (Webhook):", receivedHmac === webhookHmac);
    const hmacMatch = (expected, actual) => {
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
      return new Response("Unauthorized", {
        status: 401
      });
    }
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const topic = request.headers.get("x-shopify-topic") || "orders/create";
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
    console.log(`Webhook authenticated - Topic: ${topic}, Shop: ${shop}`);
    console.log(`Order ID: ${payload.id}, Name: ${payload.name}`);
    const eventId = randomUUID();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const item = {
      eventId,
      name: payload.name,
      // Extract order name as partition key
      timestamp,
      status: "Created",
      payload,
      shop,
      // Include shop domain
      topic,
      // Include webhook topic
      ttl: Math.floor(Date.now() / 1e3) + 90 * 24 * 60 * 60
      // 90 days expiration
    };
    await dynamodb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item
    }));
    console.log(`Order stored successfully: ${eventId}`);
    try {
      const invokeParams = {
        FunctionName: process.env.INVOICE_LAMBDA_NAME || "shopify-generate-invoice",
        InvocationType: "Event",
        // Asynchronous invocation
        Payload: JSON.stringify(payload)
      };
      await lambdaClient.send(new InvokeCommand(invokeParams));
      console.log("Invoice generation Lambda invoked successfully");
    } catch (invokeError) {
      console.error("Error invoking invoice Lambda:", invokeError);
    }
    return new Response(JSON.stringify({
      success: true,
      message: "Order webhook processed successfully",
      eventId,
      timestamp
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Failed to process orders/create webhook");
    console.error("Error type:", (_a2 = error == null ? void 0 : error.constructor) == null ? void 0 : _a2.name);
    if (error instanceof Response) {
      console.error("Response status:", error.status);
      console.error("Response statusText:", error.statusText);
    } else {
      console.error("Error message:", error instanceof Error ? error.message : String(error));
    }
    return new Response(JSON.stringify({
      success: false,
      message: "Failed to process order webhook",
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
};
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "";
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1"
});
const action$3 = async ({
  request
}) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405
    });
  }
  try {
    let s3Key;
    const contentType = request.headers.get("content-type");
    if (contentType == null ? void 0 : contentType.includes("application/json")) {
      const body = await request.json();
      s3Key = body.s3Key;
    } else if (contentType == null ? void 0 : contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      s3Key = formData.get("s3Key");
    } else {
      return new Response(JSON.stringify({
        error: "Unsupported content type"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    if (!s3Key) {
      return new Response(JSON.stringify({
        error: "s3Key is required"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    console.log(`Downloading invoice from S3: ${S3_BUCKET_NAME}/${s3Key}`);
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key
    });
    const response = await s3Client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const filename = s3Key.split("/").pop() || "invoice.pdf";
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString()
      }
    });
  } catch (error) {
    console.error("Error downloading invoice:", error);
    if (error.name === "NoSuchKey") {
      return new Response(JSON.stringify({
        error: "Invoice file not found"
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      error: error.message || "Failed to download invoice"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
};
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const loader$8 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const action$2 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const route$1 = UNSAFE_withComponentProps(function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const {
    errors
  } = actionData || loaderData;
  return /* @__PURE__ */ jsx(AppProvider, {
    embedded: false,
    children: /* @__PURE__ */ jsx("s-page", {
      children: /* @__PURE__ */ jsx(Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-section", {
          heading: "Log in",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            name: "shop",
            label: "Shop domain",
            details: "example.myshopify.com",
            value: shop,
            onChange: (e) => setShop(e.currentTarget.value),
            autocomplete: "on",
            error: errors.shop
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Log in"
          })]
        })
      })
    })
  });
});
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  default: route$1,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
const loader$7 = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const headers$3 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  headers: headers$3,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const index = "_index_1hqgz_1";
const heading = "_heading_1hqgz_21";
const text = "_text_1hqgz_23";
const content = "_content_1hqgz_43";
const form = "_form_1hqgz_53";
const label = "_label_1hqgz_69";
const input = "_input_1hqgz_85";
const button = "_button_1hqgz_93";
const list = "_list_1hqgz_101";
const styles = {
  index,
  heading,
  text,
  content,
  form,
  label,
  input,
  button,
  list
};
const loader$6 = async ({
  request
}) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {
    showForm: Boolean(login)
  };
};
const route = UNSAFE_withComponentProps(function App2() {
  const {
    showForm
  } = useLoaderData();
  return /* @__PURE__ */ jsx("div", {
    className: styles.index,
    children: /* @__PURE__ */ jsxs("div", {
      className: styles.content,
      children: [/* @__PURE__ */ jsx("h1", {
        className: styles.heading,
        children: "A short heading about [your app]"
      }), /* @__PURE__ */ jsx("p", {
        className: styles.text,
        children: "A tagline about [your app] that describes your value proposition."
      }), showForm && /* @__PURE__ */ jsxs(Form, {
        className: styles.form,
        method: "post",
        action: "/auth/login",
        children: [/* @__PURE__ */ jsxs("label", {
          className: styles.label,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Shop domain"
          }), /* @__PURE__ */ jsx("input", {
            className: styles.input,
            type: "text",
            name: "shop"
          }), /* @__PURE__ */ jsx("span", {
            children: "e.g: my-shop-domain.myshopify.com"
          })]
        }), /* @__PURE__ */ jsx("button", {
          className: styles.button,
          type: "submit",
          children: "Log in"
        })]
      }), /* @__PURE__ */ jsxs("ul", {
        className: styles.list,
        children: [/* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        })]
      })]
    })
  });
});
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: route,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const loader$5 = async ({
  request
}) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const shop = url.searchParams.get("shop");
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    host: host || "",
    shop: shop || ""
  };
};
const app = UNSAFE_withComponentProps(function App3() {
  const {
    apiKey,
    host,
    shop
  } = useLoaderData();
  return /* @__PURE__ */ jsxs(AppProvider, {
    embedded: true,
    apiKey,
    host,
    children: [/* @__PURE__ */ jsxs("s-app-nav", {
      children: [/* @__PURE__ */ jsx("s-link", {
        href: "/app",
        children: "Home"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/templates",
        children: "Templates"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/additional",
        children: "Additional page"
      })]
    }), /* @__PURE__ */ jsx(Outlet, {})]
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  return boundary.error(useRouteError());
});
const headers$2 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  headers: headers$2,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const loader$4 = async ({
  request
}) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const templateId = url.searchParams.get("template") || "minimalist";
  const configuration = {
    // Fonts and Colors
    styling: {
      primaryColor: {
        label: "Primary Color",
        type: "color",
        default: "#333333",
        envVar: "INVOICE_PRIMARY_COLOR"
      },
      fontFamily: {
        label: "Font Family",
        type: "select",
        default: "Helvetica",
        options: ["Helvetica", "Courier", "Times-Roman"],
        envVar: "INVOICE_FONT_FAMILY"
      },
      titleFontSize: {
        label: "Title Font Size",
        type: "number",
        default: 28,
        min: 20,
        max: 40,
        envVar: "INVOICE_TITLE_FONT_SIZE"
      },
      headingFontSize: {
        label: "Heading Font Size",
        type: "number",
        default: 16,
        min: 12,
        max: 24,
        envVar: "INVOICE_HEADING_FONT_SIZE"
      },
      bodyFontSize: {
        label: "Body Font Size",
        type: "number",
        default: 11,
        min: 8,
        max: 16,
        envVar: "INVOICE_BODY_FONT_SIZE"
      }
    },
    // Company Configuration
    company: {
      companyName: {
        label: "Company Name",
        type: "text",
        default: "",
        envVar: "COMPANY_NAME"
      },
      legalName: {
        label: "Legal Name",
        type: "text",
        default: "",
        envVar: "COMPANY_LEGAL_NAME"
      },
      addressLine1: {
        label: "Address Line 1",
        type: "text",
        default: "",
        envVar: "COMPANY_ADDRESS_LINE1"
      },
      addressLine2: {
        label: "Address Line 2",
        type: "text",
        default: "",
        envVar: "COMPANY_ADDRESS_LINE2"
      },
      state: {
        label: "State",
        type: "text",
        default: "",
        envVar: "COMPANY_STATE"
      },
      gstin: {
        label: "GSTIN",
        type: "text",
        default: "",
        envVar: "COMPANY_GSTIN"
      },
      supportEmail: {
        label: "Support Email",
        type: "email",
        default: "",
        envVar: "COMPANY_SUPPORT_EMAIL"
      },
      phone: {
        label: "Phone",
        type: "text",
        default: "",
        envVar: "COMPANY_PHONE"
      },
      logoFilename: {
        label: "Logo Filename",
        type: "file",
        default: "logo.jpg",
        envVar: "COMPANY_LOGO_FILENAME"
      },
      signatureFilename: {
        label: "Signature Filename",
        type: "file",
        default: "",
        envVar: "COMPANY_SIGNATURE_FILENAME"
      }
    }
  };
  return {
    templateId,
    configuration
  };
};
const action$1 = async ({
  request
}) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  console.log("Saving configuration:", Object.fromEntries(formData));
  return {
    success: true
  };
};
const app_templatesCustomize = UNSAFE_withComponentProps(function CustomizeTemplate() {
  const {
    templateId,
    configuration
  } = useLoaderData();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  useNavigate();
  const [activeSection, setActiveSection] = useState("styling");
  const sections = [{
    id: "styling",
    label: "Fonts and Colors",
    icon: "🎨"
  }, {
    id: "company",
    label: "Company Configuration",
    icon: "🏢"
  }];
  const isSubmitting = navigation.state === "submitting";
  const renderFormField = (key, config) => {
    var _a2;
    const commonStyle = {
      padding: "10px 12px",
      border: "1px solid #d1d5db",
      borderRadius: "6px",
      fontSize: "14px",
      width: "100%",
      boxSizing: "border-box"
    };
    switch (config.type) {
      case "color":
        return /* @__PURE__ */ jsxs("div", {
          style: {
            display: "flex",
            gap: "12px",
            alignItems: "center"
          },
          children: [/* @__PURE__ */ jsx("input", {
            type: "color",
            name: key,
            defaultValue: config.default,
            style: {
              width: "60px",
              height: "44px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              cursor: "pointer",
              padding: "2px"
            }
          }), /* @__PURE__ */ jsx("input", {
            type: "text",
            defaultValue: config.default,
            style: {
              ...commonStyle,
              width: "140px"
            },
            placeholder: "#333333"
          })]
        });
      case "select":
        return /* @__PURE__ */ jsx("select", {
          name: key,
          defaultValue: config.default,
          style: {
            ...commonStyle,
            cursor: "pointer"
          },
          children: (_a2 = config.options) == null ? void 0 : _a2.map((option) => /* @__PURE__ */ jsx("option", {
            value: option,
            children: option
          }, option))
        });
      case "number":
        return /* @__PURE__ */ jsxs("div", {
          style: {
            display: "flex",
            gap: "12px",
            alignItems: "center"
          },
          children: [/* @__PURE__ */ jsx("input", {
            type: "number",
            name: key,
            defaultValue: config.default,
            min: config.min,
            max: config.max,
            style: {
              ...commonStyle,
              width: "100px"
            }
          }), /* @__PURE__ */ jsx("input", {
            type: "range",
            defaultValue: config.default,
            min: config.min,
            max: config.max,
            style: {
              flex: 1
            }
          }), /* @__PURE__ */ jsxs("span", {
            style: {
              fontSize: "12px",
              color: "#6b7280",
              width: "80px"
            },
            children: [config.min, " - ", config.max]
          })]
        });
      case "file":
        return /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("input", {
            type: "text",
            name: key,
            defaultValue: config.default,
            style: commonStyle,
            placeholder: config.label
          }), /* @__PURE__ */ jsx("p", {
            style: {
              fontSize: "12px",
              color: "#6b7280",
              marginTop: "4px"
            },
            children: "Place file in lambda-generate-invoice/assets/ folder"
          })]
        });
      case "email":
        return /* @__PURE__ */ jsx("input", {
          type: "email",
          name: key,
          defaultValue: config.default,
          style: commonStyle,
          placeholder: config.label
        });
      default:
        return /* @__PURE__ */ jsx("input", {
          type: "text",
          name: key,
          defaultValue: config.default,
          style: commonStyle,
          placeholder: config.label
        });
    }
  };
  return /* @__PURE__ */ jsxs("s-page", {
    children: [/* @__PURE__ */ jsxs("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 0",
        borderBottom: "1px solid #e5e7eb",
        marginBottom: "24px"
      },
      children: [/* @__PURE__ */ jsxs("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "12px"
        },
        children: [/* @__PURE__ */ jsx("s-link", {
          href: "/app/templates",
          style: {
            textDecoration: "none"
          },
          children: /* @__PURE__ */ jsx("button", {
            style: {
              fontSize: "18px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#374151",
              padding: "4px 8px"
            },
            children: "←"
          })
        }), /* @__PURE__ */ jsx("h1", {
          style: {
            fontSize: "20px",
            fontWeight: "600",
            margin: 0
          },
          children: "Customize Template"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        style: {
          display: "flex",
          gap: "12px"
        },
        children: [/* @__PURE__ */ jsx("button", {
          type: "button",
          style: {
            padding: "10px 20px",
            backgroundColor: "white",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer"
          },
          children: "Reset to Defaults"
        }), /* @__PURE__ */ jsx("button", {
          type: "submit",
          form: "customize-form",
          disabled: isSubmitting,
          style: {
            padding: "10px 20px",
            backgroundColor: "#1f2937",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            opacity: isSubmitting ? 0.7 : 1
          },
          children: isSubmitting ? "Saving..." : "Save Template"
        })]
      })]
    }), /* @__PURE__ */ jsxs("div", {
      style: {
        display: "flex",
        gap: "24px",
        minHeight: "600px"
      },
      children: [/* @__PURE__ */ jsxs("div", {
        style: {
          width: "280px",
          backgroundColor: "white",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "16px",
          height: "fit-content"
        },
        children: [/* @__PURE__ */ jsx("h2", {
          style: {
            fontSize: "14px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#6b7280",
            textTransform: "uppercase"
          },
          children: "Customize"
        }), sections.map((section) => /* @__PURE__ */ jsxs("button", {
          onClick: () => setActiveSection(section.id),
          style: {
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            backgroundColor: activeSection === section.id ? "#f3f4f6" : "transparent",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            marginBottom: "4px",
            fontSize: "14px",
            color: activeSection === section.id ? "#1f2937" : "#6b7280",
            fontWeight: activeSection === section.id ? "500" : "400",
            textAlign: "left",
            transition: "all 0.2s"
          },
          children: [/* @__PURE__ */ jsxs("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "12px"
            },
            children: [/* @__PURE__ */ jsx("span", {
              style: {
                fontSize: "16px"
              },
              children: section.icon
            }), /* @__PURE__ */ jsx("span", {
              children: section.label
            })]
          }), /* @__PURE__ */ jsx("span", {
            style: {
              color: "#9ca3af"
            },
            children: "›"
          })]
        }, section.id))]
      }), /* @__PURE__ */ jsx("div", {
        style: {
          flex: 1,
          backgroundColor: "white",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "24px"
        },
        children: /* @__PURE__ */ jsxs(Form, {
          method: "post",
          id: "customize-form",
          children: [/* @__PURE__ */ jsx("input", {
            type: "hidden",
            name: "templateId",
            value: templateId
          }), /* @__PURE__ */ jsx("input", {
            type: "hidden",
            name: "section",
            value: activeSection
          }), activeSection === "styling" && /* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("h3", {
              style: {
                fontSize: "18px",
                fontWeight: "600",
                marginBottom: "8px"
              },
              children: "Fonts and Colors"
            }), /* @__PURE__ */ jsx("p", {
              style: {
                fontSize: "14px",
                color: "#6b7280",
                marginBottom: "24px"
              },
              children: "Customize the visual appearance of your invoices"
            }), Object.entries(configuration.styling).map(([key, config]) => /* @__PURE__ */ jsxs("div", {
              style: {
                marginBottom: "24px"
              },
              children: [/* @__PURE__ */ jsx("label", {
                style: {
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "8px",
                  color: "#374151"
                },
                children: config.label
              }), renderFormField(key, config), /* @__PURE__ */ jsxs("p", {
                style: {
                  fontSize: "11px",
                  color: "#9ca3af",
                  marginTop: "6px"
                },
                children: ["Environment variable: ", /* @__PURE__ */ jsx("code", {
                  style: {
                    backgroundColor: "#f3f4f6",
                    padding: "2px 6px",
                    borderRadius: "4px"
                  },
                  children: config.envVar
                })]
              })]
            }, key))]
          }), activeSection === "company" && /* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("h3", {
              style: {
                fontSize: "18px",
                fontWeight: "600",
                marginBottom: "8px"
              },
              children: "Company Configuration"
            }), /* @__PURE__ */ jsx("p", {
              style: {
                fontSize: "14px",
                color: "#6b7280",
                marginBottom: "24px"
              },
              children: "Configure your company details that appear on invoices"
            }), /* @__PURE__ */ jsx("div", {
              style: {
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "24px"
              },
              children: Object.entries(configuration.company).map(([key, config]) => /* @__PURE__ */ jsxs("div", {
                style: {
                  gridColumn: ["addressLine1", "addressLine2"].includes(key) ? "span 2" : "span 1"
                },
                children: [/* @__PURE__ */ jsx("label", {
                  style: {
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    marginBottom: "8px",
                    color: "#374151"
                  },
                  children: config.label
                }), renderFormField(key, config), /* @__PURE__ */ jsx("p", {
                  style: {
                    fontSize: "11px",
                    color: "#9ca3af",
                    marginTop: "6px"
                  },
                  children: /* @__PURE__ */ jsx("code", {
                    style: {
                      backgroundColor: "#f3f4f6",
                      padding: "2px 6px",
                      borderRadius: "4px"
                    },
                    children: config.envVar
                  })
                })]
              }, key))
            })]
          })]
        })
      })]
    })]
  });
});
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: app_templatesCustomize,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const app_additional = UNSAFE_withComponentProps(function AdditionalPage() {
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Additional page",
    children: [/* @__PURE__ */ jsxs("s-section", {
      heading: "Multiple pages",
      children: [/* @__PURE__ */ jsxs("s-paragraph", {
        children: ["The app template comes with an additional page which demonstrates how to create multiple pages within app navigation using", " ", /* @__PURE__ */ jsx("s-link", {
          href: "https://shopify.dev/docs/apps/tools/app-bridge",
          target: "_blank",
          children: "App Bridge"
        }), "."]
      }), /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["To create your own page and have it show up in the app navigation, add a page inside ", /* @__PURE__ */ jsx("code", {
          children: "app/routes"
        }), ", and a link to it in the", " ", /* @__PURE__ */ jsx("code", {
          children: "<ui-nav-menu>"
        }), " component found in", " ", /* @__PURE__ */ jsx("code", {
          children: "app/routes/app.jsx"
        }), "."]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      slot: "aside",
      heading: "Resources",
      children: /* @__PURE__ */ jsx("s-unordered-list", {
        children: /* @__PURE__ */ jsx("s-list-item", {
          children: /* @__PURE__ */ jsx("s-link", {
            href: "https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav",
            target: "_blank",
            children: "App nav best practices"
          })
        })
      })
    })]
  });
});
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_additional
}, Symbol.toStringTag, { value: "Module" }));
const loader$3 = async ({
  request
}) => {
  await authenticate.admin(request);
  const templates = [{
    id: "minimalist",
    name: "Minimalist",
    description: "Clean, professional design with GST compliance and configurable colors. Supports both intrastate (CGST/SGST) and interstate (IGST) transactions.",
    previewImage: "/templates/minimalist-preview.svg",
    isConfigurable: true,
    configurations: {
      primaryColor: {
        type: "color",
        label: "Primary Color",
        default: "#333333",
        envVar: "INVOICE_PRIMARY_COLOR"
      },
      fontFamily: {
        type: "select",
        label: "Font Family",
        default: "Helvetica",
        options: ["Helvetica", "Courier", "Times-Roman"],
        envVar: "INVOICE_FONT_FAMILY"
      },
      titleFontSize: {
        type: "number",
        label: "Title Font Size",
        default: 28,
        min: 20,
        max: 40,
        envVar: "INVOICE_TITLE_FONT_SIZE"
      },
      headingFontSize: {
        type: "number",
        label: "Heading Font Size",
        default: 16,
        min: 12,
        max: 24,
        envVar: "INVOICE_HEADING_FONT_SIZE"
      },
      bodyFontSize: {
        type: "number",
        label: "Body Font Size",
        default: 11,
        min: 8,
        max: 16,
        envVar: "INVOICE_BODY_FONT_SIZE"
      }
    }
  }];
  const selectedTemplate = "minimalist";
  return {
    selectedTemplate,
    templates
  };
};
const app_templates = UNSAFE_withComponentProps(function Templates() {
  const {
    selectedTemplate,
    templates
  } = useLoaderData();
  useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("templates");
  useRef(null);
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  const buildUrl = (path) => {
    const params = new URLSearchParams();
    if (searchParams.get("host")) params.set("host", searchParams.get("host"));
    if (searchParams.get("shop")) params.set("shop", searchParams.get("shop"));
    if (searchParams.get("embedded")) params.set("embedded", searchParams.get("embedded"));
    const queryString = params.toString();
    return queryString ? `${path}${path.includes("?") ? "&" : "?"}${queryString}` : path;
  };
  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate);
  const availableTemplates = templates.filter((t) => t.id !== selectedTemplate);
  return /* @__PURE__ */ jsx("s-page", {
    heading: "Templates",
    children: /* @__PURE__ */ jsxs("s-section", {
      children: [/* @__PURE__ */ jsx("div", {
        style: {
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid #e5e7eb",
          marginBottom: "24px"
        },
        children: /* @__PURE__ */ jsx("button", {
          onClick: () => setActiveTab("templates"),
          style: {
            padding: "12px 16px",
            backgroundColor: "transparent",
            border: "none",
            borderBottom: activeTab === "templates" ? "2px solid #2563eb" : "2px solid transparent",
            color: activeTab === "templates" ? "#2563eb" : "#6b7280",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer"
          },
          children: "Templates"
        })
      }), selectedTemplateData && /* @__PURE__ */ jsxs("div", {
        style: {
          marginBottom: "32px"
        },
        children: [/* @__PURE__ */ jsx("h2", {
          style: {
            fontSize: "18px",
            fontWeight: "600",
            marginBottom: "16px"
          },
          children: "Selected invoice template"
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "24px",
            display: "flex",
            gap: "24px",
            alignItems: "flex-start"
          },
          children: [/* @__PURE__ */ jsx("div", {
            style: {
              width: "400px",
              height: "520px",
              backgroundColor: "#f3f4f6",
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
            },
            children: selectedTemplateData.previewImage ? /* @__PURE__ */ jsx("img", {
              src: selectedTemplateData.previewImage,
              alt: `${selectedTemplateData.name} Preview`,
              style: {
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }
            }) : /* @__PURE__ */ jsx("div", {
              style: {
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: "14px"
              },
              children: "Template Preview"
            })
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              flex: 1
            },
            children: [/* @__PURE__ */ jsx("h3", {
              style: {
                fontSize: "20px",
                fontWeight: "600",
                marginBottom: "12px"
              },
              children: selectedTemplateData.name
            }), /* @__PURE__ */ jsx("p", {
              style: {
                fontSize: "14px",
                color: "#6b7280",
                marginBottom: "20px",
                lineHeight: "1.6"
              },
              children: selectedTemplateData.description
            }), selectedTemplateData.isConfigurable && selectedTemplateData.configurations && /* @__PURE__ */ jsxs("div", {
              style: {
                marginBottom: "20px",
                padding: "16px",
                backgroundColor: "#f9fafb",
                borderRadius: "6px"
              },
              children: [/* @__PURE__ */ jsx("h4", {
                style: {
                  fontSize: "14px",
                  fontWeight: "600",
                  marginBottom: "12px",
                  color: "#374151"
                },
                children: "Configuration Options:"
              }), /* @__PURE__ */ jsx("ul", {
                style: {
                  fontSize: "13px",
                  color: "#6b7280",
                  marginLeft: "20px",
                  lineHeight: "1.8"
                },
                children: Object.entries(selectedTemplateData.configurations).map(([key, config]) => {
                  var _a2;
                  return /* @__PURE__ */ jsxs("li", {
                    children: [/* @__PURE__ */ jsxs("strong", {
                      children: [config.label, ":"]
                    }), " ", config.type === "color" ? "Color picker" : config.type === "select" ? `Options: ${(_a2 = config.options) == null ? void 0 : _a2.join(", ")}` : `Range: ${config.min}-${config.max}`, config.default && /* @__PURE__ */ jsxs("span", {
                      style: {
                        color: "#9ca3af"
                      },
                      children: [" (default: ", config.default, ")"]
                    })]
                  }, key);
                })
              })]
            }), /* @__PURE__ */ jsx("s-button", {
              href: buildUrl(`/app/templates-customize?template=${selectedTemplateData.id}`),
              variant: "primary",
              children: "Customize"
            })]
          })]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        children: [/* @__PURE__ */ jsx("h2", {
          style: {
            fontSize: "18px",
            fontWeight: "600",
            marginBottom: "16px"
          },
          children: "Available Templates"
        }), /* @__PURE__ */ jsx("div", {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "24px"
          },
          children: availableTemplates.map((template) => /* @__PURE__ */ jsxs("div", {
            style: {
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              overflow: "hidden",
              cursor: "pointer",
              transition: "box-shadow 0.2s"
            },
            onMouseEnter: (e) => {
              e.currentTarget.style.boxShadow = "0 4px 6px -1px rgb(0 0 0 / 0.1)";
            },
            onMouseLeave: (e) => {
              e.currentTarget.style.boxShadow = "none";
            },
            children: [/* @__PURE__ */ jsx("div", {
              style: {
                width: "100%",
                height: "280px",
                backgroundColor: "#f3f4f6",
                overflow: "hidden"
              },
              children: template.previewImage ? /* @__PURE__ */ jsx("img", {
                src: template.previewImage,
                alt: `${template.name} Preview`,
                style: {
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }
              }) : /* @__PURE__ */ jsx("div", {
                style: {
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#9ca3af",
                  fontSize: "14px"
                },
                children: "Template Preview"
              })
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                padding: "16px"
              },
              children: [/* @__PURE__ */ jsx("h3", {
                style: {
                  fontSize: "16px",
                  fontWeight: "600",
                  marginBottom: "8px"
                },
                children: template.name
              }), /* @__PURE__ */ jsx("p", {
                style: {
                  fontSize: "13px",
                  color: "#6b7280",
                  marginBottom: "12px",
                  lineHeight: "1.5"
                },
                children: template.description
              }), /* @__PURE__ */ jsx("button", {
                onClick: (e) => {
                  e.stopPropagation();
                  alert(`Selected template: ${template.name}`);
                },
                style: {
                  padding: "8px 16px",
                  backgroundColor: "white",
                  color: "#1f2937",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: "500",
                  cursor: "pointer",
                  width: "100%"
                },
                children: "Select Template"
              })]
            })]
          }, template.id))
        })]
      })]
    })
  });
});
const headers$1 = boundary.headers;
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_templates,
  headers: headers$1,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const loader$2 = async ({
  request
}) => {
  var _a2, _b;
  const {
    admin
  } = await authenticate.admin(request);
  try {
    const webhookResponse = await admin.graphql(`#graphql
        query {
          webhookSubscriptions(first: 50) {
            edges {
              node {
                id
                topic
                endpoint {
                  __typename
                  ... on WebhookHttpEndpoint {
                    callbackUrl
                  }
                }
              }
            }
          }
        }
      `);
    const responseJson = await webhookResponse.json();
    const webhooks = ((_b = (_a2 = responseJson == null ? void 0 : responseJson.data) == null ? void 0 : _a2.webhookSubscriptions) == null ? void 0 : _b.edges) || [];
    return Response.json({
      success: true,
      webhooks: webhooks.map((edge) => edge.node)
    });
  } catch (error) {
    console.error("Error listing webhooks:", error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, {
      status: 500
    });
  }
};
const app_webhooks = UNSAFE_withComponentProps(function WebhooksPage() {
  return /* @__PURE__ */ jsxs("div", {
    style: {
      padding: "20px"
    },
    children: [/* @__PURE__ */ jsx("h1", {
      children: "Registered Webhooks"
    }), /* @__PURE__ */ jsx("p", {
      children: "Check API response for webhook list"
    })]
  });
});
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_webhooks,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const TABLE_NAME2 = process.env.ORDERS_TABLE_NAME || "ShopifyOrders";
  const S3_BUCKET_NAME2 = process.env.S3_BUCKET_NAME || "";
  new S3Client({
    region: process.env.AWS_REGION || "us-east-1"
  });
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    let allItems = [];
    let lastEvaluatedKey = void 0;
    do {
      const scanParams = {
        TableName: TABLE_NAME2,
        FilterExpression: "shop = :shop",
        ExpressionAttributeValues: {
          ":shop": session.shop
        }
      };
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      const result = await dynamodb.send(new ScanCommand(scanParams));
      allItems = allItems.concat(result.Items || []);
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    const sortedOrders = allItems.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.timestamp || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.timestamp || b.createdAt || 0).getTime();
      const dayA = new Date(dateA).toDateString();
      const dayB = new Date(dateB).toDateString();
      if (dayA !== dayB) {
        return dateB - dateA;
      }
      const orderNumA = parseInt((a.name || "").replace(/\D/g, ""), 10) || 0;
      const orderNumB = parseInt((b.name || "").replace(/\D/g, ""), 10) || 0;
      return orderNumB - orderNumA;
    });
    const itemsPerPage = 10;
    const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const displayOrders = sortedOrders.slice(startIndex, endIndex);
    return {
      orders: displayOrders,
      currentPage: page,
      totalPages,
      totalOrders: sortedOrders.length,
      bucketName: S3_BUCKET_NAME2,
      shop: session.shop
    };
  } catch (error) {
    console.error("Error loading orders:", error);
    return {
      orders: [],
      currentPage: 1,
      totalPages: 1,
      totalOrders: 0,
      bucketName: S3_BUCKET_NAME2,
      shop: session.shop,
      error: String(error)
    };
  }
};
const app__index = UNSAFE_withComponentProps(function Index() {
  const {
    orders,
    currentPage,
    totalPages,
    totalOrders,
    bucketName,
    shop,
    error
  } = useLoaderData();
  const [downloading, setDownloading] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    setIsClient(true);
  }, []);
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      navigate(`?page=${currentPage + 1}`);
    }
  };
  const handlePrevPage = () => {
    if (currentPage > 1) {
      navigate(`?page=${currentPage - 1}`);
    }
  };
  const downloadInvoice = async (orderName, s3Key) => {
    setDownloading(orderName);
    const startTime = Date.now();
    try {
      const response = await fetch("/api/download-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          s3Key
        })
      });
      if (!response.ok) {
        const errorData = await response.text();
        console.error("[DOWNLOAD] Error response:", errorData);
        throw new Error(`Download failed: ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cleanOrderName = orderName.replace("#", "");
      a.href = url;
      a.download = `invoice-${cleanOrderName}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("[DOWNLOAD] Error downloading invoice:", err);
      alert(`Failed to download invoice: ${err.message}`);
    } finally {
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 1500 - elapsed);
      await new Promise((resolve) => setTimeout(resolve, remainingTime));
      setDownloading(null);
    }
  };
  const printInvoice = async (orderName, s3Key) => {
    try {
      const response = await fetch("/api/download-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          s3Key
        })
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, "_blank");
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 1e4);
    } catch (err) {
      console.error("[PRINT] Error printing invoice:", err);
      alert(`Failed to print invoice: ${err.message}`);
    }
  };
  const getStatusBadge = (status) => {
    const statusColors = {
      "Generated": "success",
      "Cancelled": "critical",
      "Returned": "warning"
    };
    return statusColors[status] || "default";
  };
  return /* @__PURE__ */ jsx("s-page", {
    heading: "APP NAME",
    children: /* @__PURE__ */ jsxs("s-section", {
      children: [error && /* @__PURE__ */ jsx("s-banner", {
        tone: "critical",
        children: /* @__PURE__ */ jsxs("s-text", {
          children: ["Error loading orders: ", error]
        })
      }), orders.length === 0 ? /* @__PURE__ */ jsx("s-banner", {
        tone: "info",
        children: /* @__PURE__ */ jsx("s-text", {
          children: "No orders found. Create an order in your Shopify store to generate invoices."
        })
      }) : /* @__PURE__ */ jsxs("s-stack", {
        direction: "block",
        gap: "large",
        children: [/* @__PURE__ */ jsxs("div", {
          style: {
            display: "flex",
            gap: "16px",
            flexWrap: "wrap"
          },
          children: [/* @__PURE__ */ jsxs("div", {
            style: {
              backgroundColor: "white",
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              minWidth: "150px"
            },
            children: [/* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "24px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "4px"
              },
              children: orders.filter((o) => o.s3Key && o.status !== "Cancelled" && o.status !== "Returned").length
            }), /* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "13px",
                color: "#6b7280"
              },
              children: "Active Invoices"
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              backgroundColor: "white",
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              minWidth: "150px"
            },
            children: [/* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "24px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "4px"
              },
              children: orders.filter((o) => o.status === "Cancelled").length
            }), /* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "13px",
                color: "#6b7280"
              },
              children: "Cancelled"
            })]
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              backgroundColor: "white",
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              minWidth: "150px"
            },
            children: [/* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "24px",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "4px"
              },
              children: orders.filter((o) => o.status === "Returned").length
            }), /* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "13px",
                color: "#6b7280"
              },
              children: "Returned"
            })]
          })]
        }), /* @__PURE__ */ jsx("div", {
          style: {
            fontSize: "18px",
            fontWeight: "600",
            color: "#111827"
          },
          children: "Recent orders"
        }), /* @__PURE__ */ jsx("div", {
          style: {
            backgroundColor: "white",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            overflow: "hidden"
          },
          children: /* @__PURE__ */ jsxs("table", {
            style: {
              width: "100%",
              borderCollapse: "collapse"
            },
            children: [/* @__PURE__ */ jsx("thead", {
              children: /* @__PURE__ */ jsxs("tr", {
                style: {
                  backgroundColor: "#f9fafb",
                  borderBottom: "1px solid #e5e7eb"
                },
                children: [/* @__PURE__ */ jsx("th", {
                  style: {
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.3px"
                  },
                  children: "Order"
                }), /* @__PURE__ */ jsx("th", {
                  style: {
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.3px"
                  },
                  children: "Date"
                }), /* @__PURE__ */ jsx("th", {
                  style: {
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.3px"
                  },
                  children: "Customer"
                }), /* @__PURE__ */ jsx("th", {
                  style: {
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.3px"
                  },
                  children: "Total"
                }), /* @__PURE__ */ jsx("th", {
                  style: {
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.3px"
                  },
                  children: "Payment Status"
                }), /* @__PURE__ */ jsx("th", {
                  style: {
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.3px"
                  },
                  children: "Fulfillment Status"
                }), /* @__PURE__ */ jsx("th", {
                  style: {
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.3px"
                  },
                  children: "Actions"
                })]
              })
            }), /* @__PURE__ */ jsx("tbody", {
              children: orders.map((order) => {
                var _a2, _b;
                return /* @__PURE__ */ jsxs("tr", {
                  style: {
                    borderBottom: "1px solid #e5e7eb"
                  },
                  children: [/* @__PURE__ */ jsx("td", {
                    style: {
                      padding: "10px 16px",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#111827"
                    },
                    children: order.name
                  }), /* @__PURE__ */ jsx("td", {
                    style: {
                      padding: "10px 16px",
                      fontSize: "13px",
                      color: "#374151"
                    },
                    children: new Date(order.timestamp || order.updatedAt || order.createdAt || order.created_at).toLocaleDateString("en-GB")
                  }), /* @__PURE__ */ jsxs("td", {
                    style: {
                      padding: "10px 16px",
                      fontSize: "13px",
                      color: "#374151"
                    },
                    children: [(_a2 = order.customer) == null ? void 0 : _a2.first_name, " ", ((_b = order.customer) == null ? void 0 : _b.last_name) || "N/A"]
                  }), /* @__PURE__ */ jsxs("td", {
                    style: {
                      padding: "10px 16px",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#111827"
                    },
                    children: [order.currency, " ", order.total_price]
                  }), /* @__PURE__ */ jsx("td", {
                    style: {
                      padding: "10px 16px"
                    },
                    children: /* @__PURE__ */ jsx("s-badge", {
                      tone: order.financial_status === "paid" ? "success" : order.financial_status === "pending" ? "attention" : "default",
                      children: order.financial_status || "Pending"
                    })
                  }), /* @__PURE__ */ jsx("td", {
                    style: {
                      padding: "10px 16px"
                    },
                    children: /* @__PURE__ */ jsx("s-badge", {
                      tone: getStatusBadge(order.status),
                      children: order.status || "Created"
                    })
                  }), /* @__PURE__ */ jsx("td", {
                    style: {
                      padding: "10px 16px"
                    },
                    children: order.s3Key && /* @__PURE__ */ jsxs("div", {
                      style: {
                        position: "relative",
                        display: "inline-flex",
                        gap: "8px"
                      },
                      children: [isClient && downloading === order.name && /* @__PURE__ */ jsx("div", {
                        style: {
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: "rgba(0,0,0,0.5)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "6px",
                          zIndex: 10,
                          color: "white",
                          fontSize: "12px",
                          fontWeight: "600"
                        },
                        children: "....."
                      }), /* @__PURE__ */ jsxs("form", {
                        method: "post",
                        action: "/api/download-invoice",
                        onSubmit: (e) => {
                          e.preventDefault();
                          downloadInvoice(order.name, order.s3Key);
                        },
                        style: {
                          display: "inline"
                        },
                        children: [/* @__PURE__ */ jsx("input", {
                          type: "hidden",
                          name: "s3Key",
                          value: order.s3Key
                        }), /* @__PURE__ */ jsx("button", {
                          type: "submit",
                          disabled: downloading === order.name,
                          title: "Download PDF",
                          style: {
                            padding: "8px",
                            backgroundColor: downloading === order.name ? "#9ca3af" : "white",
                            color: downloading === order.name ? "white" : "#1f2937",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            cursor: downloading === order.name ? "not-allowed" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: "32px",
                            minHeight: "32px"
                          },
                          children: /* @__PURE__ */ jsxs("svg", {
                            width: "16",
                            height: "16",
                            viewBox: "0 0 16 16",
                            fill: "currentColor",
                            children: [/* @__PURE__ */ jsx("path", {
                              d: "M8.5 1.5v9.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 11.293V1.5a.5.5 0 0 1 1 0z"
                            }), /* @__PURE__ */ jsx("path", {
                              d: "M1 12.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"
                            })]
                          })
                        })]
                      }), /* @__PURE__ */ jsx("button", {
                        type: "button",
                        onClick: () => printInvoice(order.name, order.s3Key),
                        title: "Print PDF",
                        style: {
                          padding: "8px",
                          backgroundColor: "white",
                          color: "#1f2937",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: "32px",
                          minHeight: "32px"
                        },
                        children: /* @__PURE__ */ jsxs("svg", {
                          width: "16",
                          height: "16",
                          viewBox: "0 0 16 16",
                          fill: "currentColor",
                          children: [/* @__PURE__ */ jsx("path", {
                            d: "M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"
                          }), /* @__PURE__ */ jsx("path", {
                            d: "M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"
                          })]
                        })
                      })]
                    })
                  })]
                }, order.name);
              })
            })]
          })
        }), totalPages > 1 && /* @__PURE__ */ jsxs("div", {
          style: {
            display: "flex",
            gap: "12px",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "16px"
          },
          children: [/* @__PURE__ */ jsx("button", {
            disabled: currentPage === 1,
            onClick: handlePrevPage,
            style: {
              padding: "8px 16px",
              backgroundColor: "white",
              color: currentPage === 1 ? "#9ca3af" : "#1f2937",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: "500"
            },
            children: "Previous"
          }), /* @__PURE__ */ jsxs("s-text", {
            variant: "body-sm",
            children: ["Page ", currentPage, " of ", totalPages]
          }), /* @__PURE__ */ jsx("button", {
            disabled: currentPage === totalPages,
            onClick: handleNextPage,
            style: {
              padding: "8px 16px",
              backgroundColor: "white",
              color: currentPage === totalPages ? "#9ca3af" : "#1f2937",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: "500"
            },
            children: "Next"
          })]
        })]
      })]
    })
  });
});
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app__index,
  headers,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const loader = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const action = async ({
  request
}) => {
  var _a2, _b, _c, _d, _e;
  const {
    admin,
    session
  } = await authenticate.admin(request);
  const topics = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED"];
  const results = [];
  try {
    for (const topic of topics) {
      const subpath = topic.toLowerCase().replace("_", "/");
      const callbackUrl = `${process.env.SHOPIFY_APP_URL}/webhooks/${subpath}`;
      const webhookResponse = await admin.graphql(`#graphql
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
            }
            userErrors {
              field
              message
            }
          }
        }`, {
        variables: {
          topic,
          webhookSubscription: {
            callbackUrl,
            format: "JSON"
          }
        }
      });
      const responseJson = await webhookResponse.json();
      const {
        data,
        errors
      } = responseJson;
      if (errors || ((_b = (_a2 = data == null ? void 0 : data.webhookSubscriptionCreate) == null ? void 0 : _a2.userErrors) == null ? void 0 : _b.length) > 0) {
        console.error(`Error registering ${topic}:`, errors || ((_c = data == null ? void 0 : data.webhookSubscriptionCreate) == null ? void 0 : _c.userErrors));
        results.push({
          topic,
          success: false,
          error: errors || ((_d = data == null ? void 0 : data.webhookSubscriptionCreate) == null ? void 0 : _d.userErrors)
        });
      } else {
        console.log(`Registered ${topic} successfully`);
        results.push({
          topic,
          success: true,
          webhook: (_e = data == null ? void 0 : data.webhookSubscriptionCreate) == null ? void 0 : _e.webhookSubscription
        });
      }
    }
    return Response.json({
      success: true,
      results
    });
  } catch (error) {
    console.error("Error registering webhooks:", error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, {
      status: 500
    });
  }
};
const app_setup = UNSAFE_withComponentProps(function SetupPage() {
  return /* @__PURE__ */ jsxs("div", {
    style: {
      padding: "20px"
    },
    children: [/* @__PURE__ */ jsx("h1", {
      children: "App Setup"
    }), /* @__PURE__ */ jsx("p", {
      children: "Setting up webhooks..."
    }), /* @__PURE__ */ jsx("form", {
      method: "post",
      children: /* @__PURE__ */ jsx("button", {
        type: "submit",
        children: "Register Order Webhooks"
      })
    })]
  });
});
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: app_setup,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-B30WBmdf.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/root-CZ69h36I.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.orders.cancelled": { "id": "routes/webhooks.orders.cancelled", "parentId": "root", "path": "webhooks/orders/cancelled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.orders.cancelled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.orders.updated": { "id": "routes/webhooks.orders.updated", "parentId": "root", "path": "webhooks/orders/updated", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.orders.updated-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.orders.create": { "id": "routes/webhooks.orders.create", "parentId": "root", "path": "webhooks/orders/create", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.orders.create-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.download-invoice": { "id": "routes/api.download-invoice", "parentId": "root", "path": "api/download-invoice", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.download-invoice-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-30VBbTPm.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js", "/assets/AppProxyProvider-D-PsnqTe.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-HDJQwefh.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js"], "css": ["/assets/route-CNPfFM0M.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/app-p48TWdE9.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js", "/assets/AppProxyProvider-D-PsnqTe.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.templates-customize": { "id": "routes/app.templates-customize", "parentId": "routes/app", "path": "templates-customize", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.templates-customize-BwD1u32j.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.additional-gZx99Ufd.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.templates": { "id": "routes/app.templates", "parentId": "routes/app", "path": "templates", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.templates-5xlSaFik.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.webhooks": { "id": "routes/app.webhooks", "parentId": "routes/app", "path": "webhooks", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.webhooks-ClIhuQJn.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app._index-BSi1vX_m.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.setup": { "id": "routes/app.setup", "parentId": "routes/app", "path": "setup", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.setup-CGE4SjqT.js", "imports": ["/assets/chunk-EPOLDU6W-Ca4NheZO.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-90f1ae68.js", "version": "90f1ae68", "sri": void 0 };
const assetsBuildDirectory = "build\\client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "unstable_subResourceIntegrity": false, "unstable_trailingSlashAwareDataRequests": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks.orders.cancelled": {
    id: "routes/webhooks.orders.cancelled",
    parentId: "root",
    path: "webhooks/orders/cancelled",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/webhooks.orders.updated": {
    id: "routes/webhooks.orders.updated",
    parentId: "root",
    path: "webhooks/orders/updated",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/webhooks.orders.create": {
    id: "routes/webhooks.orders.create",
    parentId: "root",
    path: "webhooks/orders/create",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/api.download-invoice": {
    id: "routes/api.download-invoice",
    parentId: "root",
    path: "api/download-invoice",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route9
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/app.templates-customize": {
    id: "routes/app.templates-customize",
    parentId: "routes/app",
    path: "templates-customize",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/app.templates": {
    id: "routes/app.templates",
    parentId: "routes/app",
    path: "templates",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/app.webhooks": {
    id: "routes/app.webhooks",
    parentId: "routes/app",
    path: "webhooks",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route15
  },
  "routes/app.setup": {
    id: "routes/app.setup",
    parentId: "routes/app",
    path: "setup",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  }
};
const allowedActionOrigins = false;
export {
  allowedActionOrigins,
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
