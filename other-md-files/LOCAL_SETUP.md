# Local Development Setup

## Prerequisites

1. **Node.js** (v20+)
2. **Shopify CLI** installed globally
   ```powershell
   npm install -g @shopify/cli @shopify/app
   ```
3. **AWS CLI** configured with your credentials
   ```powershell
   aws configure
   ```

## Setup Steps

### 1. Install Dependencies
```powershell
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Shopify (automatically managed by Shopify CLI, but you can also set manually)
SHOPIFY_API_KEY=26c20d89cbf54c584dd0ce7109abb831
SHOPIFY_API_SECRET=your-secret-from-partners-dashboard

# AWS Configuration
AWS_REGION=us-east-1
ORDERS_TABLE_NAME=ShopifyOrders
S3_BUCKET_NAME=shopify-invoice-app-assets-442327347395
DYNAMODB_SESSION_TABLE=shopify_sessions
```

### 3. Verify AWS Access

Test that your AWS credentials can access DynamoDB and S3:

```powershell
# Test DynamoDB access
aws dynamodb describe-table --table-name ShopifyOrders --region us-east-1

# Test S3 access
aws s3 ls s3://shopify-invoice-app-assets-442327347395/
```

### 4. Start Development Server

```powershell
npm run dev
```

This will:
- Start the local development server
- Create a tunnel (using Cloudflare)
- Open your app in your development store
- Watch for file changes and hot reload

### 5. Access Your App

The Shopify CLI will provide you with:
- **Preview URL**: A tunneled URL for testing (e.g., `https://random-name.trycloudflare.com`)
- **Admin URL**: Direct link to open the app in your Shopify admin

## Troubleshooting

### Issue: AWS Credentials Not Found
```
Error: Unable to access DynamoDB/S3
```

**Solution**: Configure AWS credentials
```powershell
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and region
```

### Issue: DynamoDB Table Not Found
```
ResourceNotFoundException: Requested resource not found
```

**Solution**: Verify the table exists in your AWS account
```powershell
aws dynamodb list-tables --region us-east-1
```

### Issue: S3 Access Denied
```
Access Denied to S3 bucket
```

**Solution**: Check your IAM user permissions include:
- `s3:GetObject`
- `s3:PutObject`
- `s3:ListBucket`

### Issue: Shopify App Not Loading
```
App initialization failed
```

**Solution**: 
1. Check that `shopify.app.toml` has the correct `client_id`
2. Verify your app is installed in your development store
3. Check the Shopify CLI output for the correct preview URL

## Development Workflow

1. **Make code changes** - Files auto-reload
2. **Test locally** - Use the tunnel URL
3. **Check logs** - Watch terminal output
4. **Debug webhooks** - Use Shopify CLI webhook triggers:
   ```powershell
   shopify app webhook trigger --topic orders/create
   ```

## Local vs Production

| Feature | Local Dev | Production |
|---------|-----------|------------|
| URL | Tunnel (random) | API Gateway (fixed) |
| Database | AWS DynamoDB | AWS DynamoDB |
| Storage | AWS S3 | AWS S3 |
| Hot Reload | ✅ Yes | ❌ No |
| SSL | ✅ Automatic | ✅ Automatic |

## Useful Commands

```powershell
# Start dev server
npm run dev

# Build for production
npm run build

# Deploy to AWS Lambda
npm run deploy:aws

# Test webhooks locally
shopify app webhook trigger --topic orders/create
shopify app webhook trigger --topic orders/cancelled

# Check app info
shopify app info

# Open app in browser
shopify app open
```

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `SHOPIFY_API_KEY` | App client ID from Partners dashboard | `26c20d...` |
| `SHOPIFY_API_SECRET` | App client secret | `shpss_...` |
| `AWS_REGION` | AWS region for resources | `us-east-1` |
| `ORDERS_TABLE_NAME` | DynamoDB table for orders | `ShopifyOrders` |
| `S3_BUCKET_NAME` | S3 bucket for invoices | `shopify-invoice-app-assets-...` |
| `DYNAMODB_SESSION_TABLE` | DynamoDB table for sessions | `shopify_sessions` |

## Next Steps

- Test order creation and invoice generation
- Test order cancellation
- Test invoice download
- Monitor logs in terminal
- Check DynamoDB for order data
- Verify S3 for invoice PDFs
