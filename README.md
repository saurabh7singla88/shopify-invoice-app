# Shopify Invoice App - GST Compliant

A Shopify App that automatically generates GST-compliant invoices for orders. Built with React Router v7 on AWS Lambda (serverless).

## Features

- ✅ Automatic GST-compliant invoice generation (CGST/SGST/IGST)
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
scopes = "read_orders,read_customers"
use_legacy_install_flow = false  # REQUIRED for embedded apps

automatically_update_urls_on_dev = false  # Prevents URL overwrites
```

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

- [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) - Detailed deployment guide
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Step-by-step checklist
- [LOCAL_SETUP.md](LOCAL_SETUP.md) - Local dev setup
- [AI_CONTEXT.md](AI_CONTEXT.md) - Technical architecture (for AI models)

## Request Protected Data Access

Before deploying:
1. Go to partners.shopify.com → Your App → API Access
2. Click "Access requests / Protected customer data access"
3. Select required data uses
4. Submit request

---

**Built for Indian merchants needing GST-compliant invoices**