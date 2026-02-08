# Shopify Invoice App - GST Compliant

A Shopify App that automatically generates GST-compliant invoices for orders. Built with React Router v7 on AWS Lambda (serverless).

## Features

- ✅ Automatic GST-compliant invoice generation (CGST/SGST/IGST)
- ✅ **HSN/SAC code caching** from product metafields (zero API calls during invoicing)
- ✅ Customizable templates (colors, fonts, logo, company details)
- ✅ Indian states support with dropdown
- ✅ Order tracking (create, cancel, return)
- ✅ S3 storage with secure URLs
- ✅ Serverless architecture (auto-scaling, pay-per-use)

## Architecture

**Tech Stack:** React Router v7 + AWS Lambda + API Gateway + DynamoDB + S3 + PDFKit

```
Shopify Store → API Gateway → Lambda (App) → DynamoDB (Sessions, Orders)
                                    ↓
                            Lambda (Invoice Gen) → S3 (PDFs)
```

## Quick Start

```powershell
# 1. Deploy infrastructure
cd shopify-app-v2/invoice-1
.\setup-aws.ps1

# 2. Deploy code
npm run build
npm run deploy:aws

# 3. Configure Shopify
shopify app deploy

# 4. Install on your store
```

## Prerequisites

- Node.js v20.19+
- AWS CLI (configured)
- Shopify CLI v3.x
- AWS Account
- Shopify Partner Account

## Configuration

### Environment Variables (via CloudFormation)

| Variable | Description |
|----------|-------------|
| `SHOPIFY_API_KEY` | App Client ID |
| `SHOPIFY_API_SECRET` | App Client Secret |
| `SHOPIFY_APP_URL` | Lambda URL |
| `INVOICE_LAMBDA_NAME` | `shopify-generate-invoice` |

### Critical Settings (shopify.app.toml)

```toml
[access_scopes]
scopes = "read_orders,read_customers,read_products"
use_legacy_install_flow = false  # REQUIRED for embedded apps

automatically_update_urls_on_dev = false  # Prevents URL overwrites
```

### HSN/SAC Code Setup

**Add HSN codes to products:**
1. Go to Shopify Admin → Products
2. Edit product → Metafields
3. Add custom metafield: `hsn` or `hsn_code` (namespace: `custom`)
4. Product updates automatically sync to cache via webhook

**Cache behavior:**
- Products table stores HSN codes with 90-day TTL
- `products/update` webhook keeps cache in sync
- Orders fetch HSN from cache (no API calls needed)
- Falls back to Shopify API if cache miss

**Migration:** Run `.\dynamodb-migrations\create-products-table.ps1` to create the Products table.

## Deployment

**Full deployment:**
```powershell
npm run deploy:aws
```

**Skip build:**
```powershell
npm run deploy:aws:skip-build
```

**View logs:**
```powershell
aws logs tail /aws/lambda/shopify-invoice-app --follow
```

## Troubleshooting

### 401 Webhook Errors
- Check `SHOPIFY_WEBHOOK_SECRET` matches Shopify Admin → Settings → Notifications

### Authentication Loop
1. Set `use_legacy_install_flow = false` in shopify.app.toml
2. Run `shopify app deploy`
3. **Reinstall app** on store

### Lambda Timeout
```powershell
aws lambda update-function-configuration `
  --function-name shopify-invoice-app `
  --timeout 60 --memory-size 2048
```

### Assets Not Loading
```powershell
aws s3 sync ./build/client s3://your-bucket/assets/ --delete
```

## Cost Estimate

**~$0-15/month** for low-medium traffic

- Lambda: $0-2
- API Gateway: $0-2
- DynamoDB: $0-5
- S3: $0-2
- CloudWatch: $0-3

## Project Structure

```
shopify-app-v2/invoice-1/
├── app/                      # React Router app
│   ├── routes/              # Webhook handlers
│   └── constants/           # Table names, states
├── build/                   # Compiled output
├── cloudformation-template.json  # Infrastructure
└── server.lambda.mjs        # Lambda entry point

lambda-generate-invoice/
├── index.mjs                # Invoice Lambda handler
├── generators/templates/    # PDF templates
└── services/                # S3, config services
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development |
| `npm run build` | Build for production |
| `npm run deploy:aws` | Deploy to AWS |

## Additional Documentation

**Documentation:**
- [AI_CONTEXT.md](AI_CONTEXT.md) - Technical architecture for AI models
- [AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md) - Detailed deployment guide
- [DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md) - Step-by-step checklist
- [HSN_CACHE_IMPLEMENTATION.md](docs/HSN_CACHE_IMPLEMENTATION.md) - HSN code caching system
- [LOCAL_SETUP.md](docs/LOCAL_SETUP.md) - Local dev setup
- [TEMPLATE_CONFIG_SAVE.md](docs/TEMPLATE_CONFIG_SAVE.md) - Template config feature
- [SHOP_TEMPLATE_SETUP.md](docs/SHOP_TEMPLATE_SETUP.md) - Shop registration system

## Request Protected Data Access

Before deploying:
1. Go to partners.shopify.com → Your App → API Access
2. Click "Access requests / Protected customer data access"
3. Select required data uses
4. Submit request

---

**Built for Indian merchants needing GST-compliant invoices**