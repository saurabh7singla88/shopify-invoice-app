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
  
  console.log("Processing Request:", {
    url,
    method: event.requestContext?.http?.method || event.httpMethod || "GET",
    headersKeys: Object.keys(headers),
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
    console.log("Cookies found in event:", event.cookies.length);
  } else {
    // Fallback: Check if cookies were in the headers (common in local testing or different payload versions)
    const headerCookie = headers['cookie'] || headers['Cookie'];
    if (headerCookie) {
       console.log("Cookies found in headers (fallback)");
       // Note: They were likely added in the loop above, but we log for confirmation
    } else {
       console.log("No cookies in event or headers");
    }
  }

  // Debug Authorization Header
  const authHeader = headers['authorization'] || headers['Authorization'];
  console.log("Authorization Header Present:", !!authHeader);

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
  try {
    console.log("Lambda Event:", JSON.stringify(event, null, 2));

    // Check if this is a static asset request
    const path = event.rawPath || event.path || "/";
    if (path.startsWith('/assets/')) {
      // Serve static assets from S3
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
        console.error('Error serving asset from S3:', err);
        return {
          statusCode: 404,
          body: 'Asset not found',
        };
      }
    }

    // Create standard Request from API Gateway event
    const request = createRequest(event);

    // Handle the request with React Router
    const handler = await getHandler();
    const response = await handler(request, { context });

    // Convert Response to API Gateway format
    const apiGatewayResponse = await createResponse(response);

    console.log("Response Status:", apiGatewayResponse.statusCode);
    if (apiGatewayResponse.cookies && apiGatewayResponse.cookies.length > 0) {
      console.log("Outgoing Cookies (Set-Cookie):", apiGatewayResponse.cookies.length);
      apiGatewayResponse.cookies.forEach((c, i) => {
        const cookieParts = c.split(';');
        console.log(`Cookie ${i}: ${cookieParts[0]}`);
        // Log important attributes
        const attrs = cookieParts.slice(1).map(p => p.trim()).filter(p => 
          p.toLowerCase().startsWith('samesite') || 
          p.toLowerCase().startsWith('secure') || 
          p.toLowerCase().startsWith('httponly')
        );
        if (attrs.length > 0) console.log(`  Attributes: ${attrs.join(', ')}`);
      });
    } else {
      console.log("No Outgoing Cookies set.");
    }
    
    if (apiGatewayResponse.headers['Location'] || apiGatewayResponse.headers['location']) {
         const location = apiGatewayResponse.headers['Location'] || apiGatewayResponse.headers['location'];
         console.log("Redirect Location:", location.substring(0, 150) + (location.length > 150 ? '...' : ''));
    }

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
