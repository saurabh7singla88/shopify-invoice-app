/**
 * Local test script for Lambda handler
 * Run: node test-lambda-local.mjs
 */

// Set required environment variables for Shopify app
process.env.SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL || 'https://b2d6rmict3.execute-api.us-east-1.amazonaws.com';
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test-key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret';
process.env.NODE_ENV = 'production';

import { lambdaHandler } from './server.mjs';

// Simulate API Gateway event
const testEvent = {
  version: '2.0',
  routeKey: '$default',
  rawPath: '/',
  rawQueryString: '',
  headers: {
    'accept': 'text/html,application/xhtml+xml',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.9',
    'host': 'b2d6rmict3.execute-api.us-east-1.amazonaws.com',
    'user-agent': 'Mozilla/5.0',
    'x-forwarded-for': '127.0.0.1',
    'x-forwarded-port': '443',
    'x-forwarded-proto': 'https'
  },
  requestContext: {
    http: {
      method: 'GET',
      path: '/',
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'Mozilla/5.0'
    }
  },
  isBase64Encoded: false
};

console.log('Testing Lambda handler locally...\n');
console.log('Request:', testEvent.requestContext.http.method, testEvent.rawPath);

try {
  const response = await lambdaHandler(testEvent);
  
  console.log('\n✅ Lambda Response:');
  console.log('Status:', response.statusCode);
  console.log('Headers:', JSON.stringify(response.headers, null, 2));
  console.log('\nBody preview (first 500 chars):');
  console.log(response.body.substring(0, 500));
  
  if (response.statusCode === 200) {
    console.log('\n✅ Success! Handler working locally');
  } else {
    console.log('\n⚠️  Non-200 status code');
  }
} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
