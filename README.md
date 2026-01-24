# Invoice-1 Shopify App

A Shopify App built with **React Router v7** that runs on **AWS Lambda** (serverless). It handles Shopify webhooks (specifically `orders/create`) and stores order data in **AWS DynamoDB**.

## Architecture

- **Frontend/Server**: React Router v7 (Server-Side Rendering).
- **Hosting**: AWS Lambda (via `@codegenie/serverless-express` adapter pattern).
- **Database**: AWS DynamoDB (Tables: `shopify_sessions`, `ShopifyOrders`).
- **Assets**: AWS S3 (served via helper in Lambda or directly).
- **Auth**: HMAC signature verification for webhooks; Session tokens for Admin UI.

## Prerequisites

- Node.js (v20+)
- Shopify CLI
- AWS CLI (configured with appropriate permissions)
- PowerShell (for deployment scripts)

## Setup & Installation

1. **Install Dependencies**
   ```powershell
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file for local development (managed by Shopify CLI usually).
   
   For **AWS Lambda**, the following environment variables are required (configured in AWS Console or template):
   - `SHOPIFY_API_KEY`: Your App API Key.
   - `SHOPIFY_API_SECRET`: Your App API Secret.
   - `SHOPIFY_APP_URL`: The Lambda URL (or custom domain).
   - `SCOPES`: `write_products,read_orders` (etc).
   - `SHOPIFY_WEBHOOK_SECRET`: **Important!** If you manually registered webhooks in Shopify Admin settings, this is the hash key shown there. It is *different* from the App API Secret.
   - `SESSION_TABLE_NAME`: `shopify_sessions` (default).
   - `SHOP_CUSTOM_DOMAIN`: (Optional)

## Local Development

Run the Shopify dev server:
```powershell
npm run dev
```
This uses the Shopify CLI to tunnel your local environment.

## Deployment to AWS

The project includes PowerShell scripts to simplify deploying to AWS Lambda.

### 1. Build & Deploy
To build the project, upload assets to S3, and update the Lambda function code:

```powershell
npm run deploy:aws
```
*Script used:* `deploy.ps1`
*Default Region:* `us-east-1`

### 2. Skip Build (Code Update Only)
If you only changed server code and don't need to rebuild client assets:
```powershell
npm run deploy:aws:skip-build
```

### AWS Resources
- **Lambda Function**: `shopify-invoice-app`
- **S3 Bucket**: `shopify-invoice-app-assets-[account-id]`
- **DynamoDB Tables**:
  - `shopify_sessions`: Stores OAuth sessions.
  - `ShopifyOrders`: Stores incoming webhook payloads.

## Webhooks

The app listens for the `orders/create` webhook.

### Handler Location
`app/routes/webhooks.orders.create.tsx`

### Manual vs Automatic Registration
- **Automatic**: The app attempts to register `orders/create` via the API. This often fails for "Protected Customer Data" reasons if the app is not fully approved.
- **Manual**: You can creating the webhook in **Shopify Admin -> Settings -> Notifications -> Webhooks**.
  - **URL**: `https://<your-lambda-url>/webhooks/orders/create`
  - **Secret**: You must update the `SHOPIFY_WEBHOOK_SECRET` env var in AWS Lambda with the key provided in the "Webhooks" creation panel. The app checks *both* the App Secret and this Webhook Secret for HMAC verification.

## Troubleshooting

### Checking Logs
Use CloudWatch logs to debug errors (500s 401s, etc).
```powershell
aws logs tail /aws/lambda/shopify-invoice-app --follow
```

### Common Errors
- **401 Unauthorized (Webhook)**: 
  - Check HMAC signature.
  - Ensure `SHOPIFY_WEBHOOK_SECRET` matches the secret in Shopify Admin if you manually created the webhook.
- **500 Internal Server Error (DynamoDB)**:
  - Check IAM Role permissions. The Lambda needs `dynamodb:PutItem` on the `ShopifyOrders` table.
- **"Handling response" / Auth Loop (Embedded App)**:
  - Ensure `shopify.app.toml` has `use_legacy_install_flow = false` under `[access_scopes]`
  - Run `shopify app deploy` to update the config
  - **Reinstall the app** on your development store (required for managed installation)
  - This is required for the token exchange authentication strategy used in embedded apps
