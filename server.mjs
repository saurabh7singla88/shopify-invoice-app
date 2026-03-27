/**
 * AWS Lambda Handler for React Router App
 * This adapter converts API Gateway events to standard HTTP requests
 * and handles the React Router server-side rendering.
 */

import { createRequestHandler } from "react-router";
import { randomUUID } from "crypto";

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
 * Structured logging helper
 */
function logRequest(requestId, data) {
  console.log(JSON.stringify({
    type: "REQUEST",
    requestId,
    timestamp: new Date().toISOString(),
    ...data
  }));
}

function logResponse(requestId, data) {
  console.log(JSON.stringify({
    type: "RESPONSE",
    requestId,
    timestamp: new Date().toISOString(),
    ...data
  }));
}

function logError(requestId, error, context = {}) {
  console.error(JSON.stringify({
    type: "ERROR",
    requestId,
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...context
  }));
}

/**
 * Convert API Gateway event to a standard Request object
 */
function createRequest(event, requestId) {
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
  
  // Extract shop from query params or headers
  const shop = new URL(url).searchParams.get('shop') || headers['x-shopify-shop-domain'] || null;
  const topic = headers['x-shopify-topic'] || null;
  
  logRequest(requestId, {
    method: event.requestContext?.http?.method || event.httpMethod || "GET",
    url,
    path,
    shop,
    topic,
    hasAuth: !!(headers['authorization'] || headers['Authorization']),
    hasCookies: !!(event.cookies?.length || headers['cookie'] || headers['Cookie']),
    userAgent: headers['user-agent'] || headers['User-Agent'],
    sourceIp: requestContext.http?.sourceIp || headers['x-forwarded-for'],
  });

  // Convert headers to Headers object
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      requestHeaders.append(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  // Handle cookies (API Gateway Payload 2.0)
  if (event.cookies && Array.isArray(event.cookies)) {
    requestHeaders.append("Cookie", event.cookies.join("; "));
  }
  
  // Add request ID to headers for downstream logging
  requestHeaders.append("x-request-id", requestId);

  // Handle body
  let requestBody = null;
  if (body) {
    if (isBase64Encoded) {
      // Keep binary data as Buffer, don't convert to UTF-8 string
      requestBody = Buffer.from(body, "base64");
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
  const cookies = [];

  // Handle cookies
  // Use getSetCookie() if available (Node.js 18.14.1+) to correctly handle multiple Set-Cookie headers
  if (typeof response.headers.getSetCookie === 'function') {
    const setCookies = response.headers.getSetCookie();
    if (setCookies && setCookies.length > 0) {
      cookies.push(...setCookies);
    }
  }

  response.headers.forEach((value, key) => {
    // Skip Set-Cookie in headers as it's handled via cookies array for API Gateway v2
    if (key.toLowerCase() !== 'set-cookie') {
      headers[key] = value;
    }
  });

  // Fallback for older environments if getSetCookie is missing
  if (cookies.length === 0 && response.headers.get('set-cookie')) {
    cookies.push(response.headers.get('set-cookie'));
  }

  let body;
  const contentType = headers["content-type"] || "";
  
  if (contentType.includes("application/json") || 
      contentType.includes("text/") ||
      contentType.includes("application/javascript") ||
      contentType.includes("application/xml") ||
      contentType.includes("image/svg+xml")) {
    body = await response.text();
  } else {
    const buffer = await response.arrayBuffer();
    body = Buffer.from(buffer).toString("base64");
    return {
      statusCode: response.status,
      headers,
      cookies,
      body,
      isBase64Encoded: true,
    };
  }

  return {
    statusCode: response.status,
    headers,
    cookies,
    body,
    isBase64Encoded: false,
  };
}

/**
 * Main Lambda handler
 */
export const lambdaHandler = async (event, context) => {
  const requestId = randomUUID();
  try {
    console.log("Lambda Event:", JSON.stringify(event, null, 2));

    // Check if this is a static asset or public file request
    const path = event.rawPath || event.path || "/";
    const isStaticFile = path.startsWith('/assets/') || 
                         path.startsWith('/templates/') || 
                         path.endsWith('.ico') || 
                         path.endsWith('.svg') || 
                         path.endsWith('.png') || 
                         path.endsWith('.jpg');
    
    if (isStaticFile) {
      // Serve static files from S3
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const bucketName = process.env.APP_ASSETS_BUCKET_NAME;
      
      try {
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: path.substring(1), // Remove leading slash
        });
        
        const s3Response = await s3.send(command);
        const body = await s3Response.Body.transformToByteArray();
        
        // Determine content type from file extension
        const ext = path.split('.').pop();
        const contentTypes = {
          'js': 'application/javascript',
          'css': 'text/css',
          'json': 'application/json',
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'svg': 'image/svg+xml',
          'ico': 'image/x-icon',
          'woff': 'font/woff',
          'woff2': 'font/woff2',
        };
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': contentTypes[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
          body: Buffer.from(body).toString('base64'),
          isBase64Encoded: true,
        };
      } catch (err) {
        logError(requestId, err, { context: 'S3 static file serving' });
        return {
          statusCode: 404,
          body: 'File not found',
        };
      }
    }

    // Create standard Request from API Gateway event
    const request = createRequest(event, requestId);

    // Handle the request with React Router
    const handler = await getHandler();
    const response = await handler(request, { context });

    // Convert Response to API Gateway format
    const apiGatewayResponse = await createResponse(response);

    logResponse(requestId, {
      statusCode: apiGatewayResponse.statusCode,
      hasCookies: !!(apiGatewayResponse.cookies?.length),
      cookieCount: apiGatewayResponse.cookies?.length || 0,
      isRedirect: !!(apiGatewayResponse.headers?.Location || apiGatewayResponse.headers?.location),
      redirectTo: apiGatewayResponse.headers?.Location || apiGatewayResponse.headers?.location,
      bodyLength: apiGatewayResponse.body?.length || 0,
      contentType: apiGatewayResponse.headers?.['Content-Type'] || apiGatewayResponse.headers?.['content-type'],
    });

    return apiGatewayResponse;
  } catch (error) {
    logError(requestId, error, { context: 'Lambda handler top-level' });
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
        requestId,
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
