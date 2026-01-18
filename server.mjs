/**
 * AWS Lambda Handler for React Router App
 * This adapter converts API Gateway events to standard HTTP requests
 * and handles the React Router server-side rendering.
 */

import { createRequestHandler } from "react-router";

let handlerPromise;

async function getHandler() {
  if (!handlerPromise) {
    handlerPromise = import("./build/server/index.js").then((mod) => {
      const build = mod.default ?? mod;
      return createRequestHandler(build, process.env.NODE_ENV || "production");
    });
  }
  return handlerPromise;
}

/**
 * Convert API Gateway event to a standard Request object
 */
function createRequest(event) {
  const {
    headers = {},
    requestContext = {},
    body,
    isBase64Encoded,
  } = event;

  // Determine the URL
  const protocol = headers["x-forwarded-proto"] || "https";
  const host = headers.host || headers.Host || requestContext.domainName;
  const path = event.rawPath || event.path || "/";
  const queryString = event.rawQueryString || "";
  
  const url = `${protocol}://${host}${path}${queryString ? `?${queryString}` : ""}`;

  // Convert headers to Headers object
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      requestHeaders.append(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  // Handle body
  let requestBody = null;
  if (body) {
    if (isBase64Encoded) {
      requestBody = Buffer.from(body, "base64").toString("utf-8");
    } else {
      requestBody = body;
    }
  }

  // Create the Request object
  const request = new Request(url, {
    method: event.requestContext?.http?.method || event.httpMethod || "GET",
    headers: requestHeaders,
    body: requestBody,
  });

  return request;
}

/**
 * Convert Response object to API Gateway response format
 */
async function createResponse(response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body;
  const contentType = headers["content-type"] || "";
  
  if (contentType.includes("application/json") || 
      contentType.includes("text/") ||
      contentType.includes("application/javascript")) {
    body = await response.text();
  } else {
    const buffer = await response.arrayBuffer();
    body = Buffer.from(buffer).toString("base64");
    return {
      statusCode: response.status,
      headers,
      body,
      isBase64Encoded: true,
    };
  }

  return {
    statusCode: response.status,
    headers,
    body,
    isBase64Encoded: false,
  };
}

/**
 * Main Lambda handler
 */
export const lambdaHandler = async (event, context) => {
  try {
    console.log("Lambda Event:", JSON.stringify(event, null, 2));

    // Check if this is a static asset request
    const path = event.rawPath || event.path || "/";
    if (path.startsWith('/assets/')) {
      // Redirect static asset requests to S3
      const s3Url = `https://${process.env.S3_BUCKET_NAME || 'shopify-invoice-app-assets-442327347395'}.s3.amazonaws.com${path}`;
      return {
        statusCode: 302,
        headers: {
          'Location': s3Url,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
        body: '',
      };
    }

    // Create standard Request from API Gateway event
    const request = createRequest(event);

    // Handle the request with React Router
    const handler = await getHandler();
    const response = await handler(request, { context });

    // Convert Response to API Gateway format
    const apiGatewayResponse = await createResponse(response);

    console.log("Response Status:", apiGatewayResponse.statusCode);
    console.log("Response Body Length:", apiGatewayResponse.body?.length || 0);
    return apiGatewayResponse;
  } catch (error) {
    console.error("Lambda Handler Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
    };
  }
};

// For local testing
if (process.env.NODE_ENV !== "production") {
  const testEvent = {
    headers: {
      host: "localhost:3000",
    },
    requestContext: {
      http: {
        method: "GET",
      },
    },
    rawPath: "/",
    rawQueryString: "",
  };
  
  lambdaHandler(testEvent, {}).then((response) => {
    console.log("Test Response:", response);
  });
}
