/**
 * Local test script for Webhook Handlers
 * Run: node test-webhook-local-cancelled.mjs
 */

import { createHmac } from 'crypto';
import { lambdaHandler } from './server.mjs';

// Environment Setup
process.env.SHOPIFY_APP_URL = 'https://test-url.com';
process.env.SHOPIFY_API_KEY = 'test-key';
process.env.SHOPIFY_API_SECRET = 'test-secret';
process.env.SHOPIFY_WEBHOOK_SECRET = 'test-secret'; // Use same secret for simplicity
process.env.NODE_ENV = 'production';
process.env.ORDERS_TABLE_NAME = 'ShopifyOrders';

const SECRET = process.env.SHOPIFY_API_SECRET;

function computeHmac(body) {
    return createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
}

async function runTest(path, topic, payloadObj) {
    const body = JSON.stringify(payloadObj);
    const hmac = computeHmac(body);

    const event = {
        version: '2.0',
        routeKey: 'POST /webhooks/' + topic.toLowerCase().replace('_', '/'),
        rawPath: path,
        rawQueryString: '',
        headers: {
            'content-type': 'application/json',
            'x-shopify-hmac-sha256': hmac,
            'x-shopify-topic': topic,
            'x-shopify-shop-domain': 'test-store.myshopify.com',
            'host': 'test.com'
        },
        requestContext: {
            http: {
                method: 'POST',
                path: path,
                protocol: 'HTTP/1.1',
                sourceIp: '127.0.0.1',
                userAgent: 'Shopify-Webhook-Test'
            }
        },
        body: body,
        isBase64Encoded: false
    };

    console.log(`\n--- Testing ${topic} at ${path} ---`);
    try {
        const response = await lambdaHandler(event);
        console.log('Status:', response.statusCode);
        console.log('Body:', response.body);
    } catch (error) {
        console.error('Error:', error);
    }
}

async function main() {
    // Test: Order Cancelled
    const orderCancelledPayload = {
        id: 12347,
        name: "#1003",
        cancelled_at: "2023-01-01T12:00:00Z",
        financial_status: "refunded",
        note: "Customer cancelled"
    };
    await runTest('/webhooks/orders/cancelled', 'orders/cancelled', orderCancelledPayload);
}

main();
