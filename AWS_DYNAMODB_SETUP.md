# AWS DynamoDB Setup for Shopify OAuth Sessions

## Overview
The app has been migrated from Prisma (SQLite) to DynamoDB for session storage to support AWS serverless deployment with Lambda and API Gateway.

## Required DynamoDB Table

### Table Name
`shopify_sessions` (or set via `DYNAMODB_SESSION_TABLE` env variable)

### Create Table Command

```bash
aws dynamodb create-table \
  --table-name shopify_sessions \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=shop,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    IndexName=shop_index,KeySchema=[{AttributeName=shop,KeyType=HASH}],Projection={ProjectionType=ALL} \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### Table Schema

**Primary Key:**
- `id` (String, Hash Key) - Session identifier (format: `offline_<shop-domain>` or `<session-id>`)

**Global Secondary Index:**
- `shop_index` - Index on `shop` attribute for querying sessions by shop domain

**Attributes:**
- `id` - Session identifier
- `shop` - Shop domain (e.g., `mystore.myshopify.com`)
- `state` - OAuth state parameter
- `isOnline` - Boolean indicating online/offline session
- `scope` - Granted permission scopes
- `accessToken` - Shopify access token (sensitive!)
- `expires` - Expiration timestamp (for online sessions)
- `onlineAccessInfo` - Additional online session data

## Environment Variables

Add these to your `.env` file:

```bash
# DynamoDB Configuration
DYNAMODB_SESSION_TABLE=shopify_sessions
AWS_REGION=us-east-1

# For local development with DynamoDB Local (optional)
# DYNAMODB_ENDPOINT=http://localhost:8000
```

## IAM Permissions Required

Your Lambda function or EC2 instance needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/shopify_sessions",
        "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/shopify_sessions/index/*"
      ]
    }
  ]
}
```

## Changes Made

1. **Session Storage**: Replaced `PrismaSessionStorage` with `DynamoDBSessionStorage` in [app/shopify.server.ts](app/shopify.server.ts)
2. **Database Client**: Replaced Prisma client with DynamoDB DocumentClient in [app/db.server.ts](app/db.server.ts)
3. **Webhook Handlers**: Updated webhooks to use `sessionStorage` API instead of Prisma queries:
   - [app/routes/webhooks.app.uninstalled.tsx](app/routes/webhooks.app.uninstalled.tsx)
   - [app/routes/webhooks.app.scopes_update.tsx](app/routes/webhooks.app.scopes_update.tsx)

## Local Development

For local development, you can use DynamoDB Local:

```bash
# Start DynamoDB Local with Docker
docker run -p 8000:8000 amazon/dynamodb-local

# Set environment variable
DYNAMODB_ENDPOINT=http://localhost:8000
```

## Next Steps for AWS Lambda Deployment

1. **API Gateway**: Set up REST API or HTTP API
2. **Lambda Functions**: Package and deploy your app as Lambda functions
3. **Environment Variables**: Configure all required env vars in Lambda
4. **VPC** (optional): If using VPC, ensure Lambda has internet access or VPC endpoints for DynamoDB

## Removed Dependencies

You can optionally remove Prisma dependencies if not using them elsewhere:

```bash
npm uninstall @prisma/client prisma @shopify/shopify-app-session-storage-prisma
```

And remove the `prisma/` directory if no longer needed.
