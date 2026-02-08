# AWS Lambda + S3 Deployment Files

This directory contains everything you need to deploy the Shopify Invoice App to AWS Lambda with S3 for static assets.

## 📁 Files Overview

### Core Deployment Files

| File | Description | Usage |
|------|-------------|-------|
| **server.lambda.mjs** | Lambda handler that adapts API Gateway events to React Router | Included in deployment package |
| **cloudformation-template.json** | CloudFormation template (JSON) for infrastructure | `aws cloudformation create-stack` |
| **template.yaml** | SAM template (YAML) for infrastructure | `sam deploy` |
| **deploy.ps1** | PowerShell deployment script (Windows) | `.\deploy.ps1 -BucketName xxx` |
| **deploy.sh** | Bash deployment script (Linux/Mac) | `./deploy.sh --bucket-name xxx` |
| **setup-aws.ps1** | Interactive setup wizard | `.\setup-aws.ps1` |

### Documentation

| File | Description |
|------|-------------|
| **AWS_DEPLOYMENT.md** | Complete deployment guide with detailed instructions |
| **DEPLOYMENT_QUICKREF.md** | Quick reference card for common commands |
| **DEPLOYMENT_CHECKLIST.md** | Step-by-step checklist to ensure successful deployment |

### Configuration

| File | Description |
|------|-------------|
| **.gitignore.deployment** | Suggested additions to .gitignore for deployment artifacts |
| **package.json** | Updated with AWS deployment scripts |

## 🚀 Quick Start (3 Steps)

### Step 1: Setup Infrastructure

**Option A - Interactive Setup (Easiest):**
```powershell
.\setup-aws.ps1
```

**Option B - CloudFormation:**
```powershell
aws cloudformation create-stack \
  --stack-name shopify-invoice-app \
  --template-body file://cloudformation-template.json \
  --parameters ParameterKey=ShopifyApiKey,ParameterValue=YOUR_KEY \
               ParameterKey=ShopifyApiSecret,ParameterValue=YOUR_SECRET \
  --capabilities CAPABILITY_NAMED_IAM
```

**Option C - SAM:**
```powershell
sam deploy --guided
```

### Step 2: Deploy Code

```powershell
# Get bucket and function name from CloudFormation outputs
aws cloudformation describe-stacks --stack-name shopify-invoice-app

# Deploy
.\deploy.ps1 -BucketName YOUR-BUCKET -FunctionName YOUR-FUNCTION
```

### Step 3: Configure Shopify

Update your Shopify app configuration with the API Gateway URL from CloudFormation outputs.

## 📚 Detailed Documentation

- **New to AWS Lambda?** Start with [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md)
- **Need quick commands?** See [DEPLOYMENT_QUICKREF.md](./DEPLOYMENT_QUICKREF.md)
- **Deploying for first time?** Follow [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

## 🏗️ What Gets Created

The CloudFormation/SAM template creates:

### Core Resources
- **Lambda Function** - Runs your React Router app
- **API Gateway (HTTP API)** - Routes requests to Lambda
- **S3 Bucket** - Hosts static assets (JS, CSS, images)
- **DynamoDB Table** - Stores Shopify sessions
- **IAM Role** - Lambda execution role with minimal permissions

### Optional Resources
- **CloudFront Distribution** - CDN for static assets (in SAM template)
- **Lambda Function URL** - Alternative to API Gateway (in SAM template)

## 🎯 Deployment Architecture

```
Internet
   │
   ├─→ API Gateway (app requests)
   │        ↓
   │   Lambda Function
   │        ↓
   │   DynamoDB (sessions)
   │
   └─→ S3/CloudFront (static assets)
```

## 💻 Available npm Scripts

Add these to your workflow:

```json
{
  "deploy:aws": "npm run build && powershell -File ./deploy.ps1",
  "deploy:aws:skip-build": "powershell -File ./deploy.ps1 -SkipBuild",
  "setup:aws": "powershell -File ./setup-aws.ps1",
  "validate:aws": "powershell -File ./setup-aws.ps1 -Validate"
}
```

Usage:
```powershell
npm run setup:aws        # One-time infrastructure setup
npm run deploy:aws       # Build and deploy code
npm run deploy:aws:skip-build  # Deploy without rebuilding
npm run validate:aws     # Validate CloudFormation template
```

## 🔧 Configuration

### Required Environment Variables

Set these in Lambda or pass to deployment script:

```bash
NODE_ENV=production
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-api-gateway-url.amazonaws.com
SCOPES=read_orders,write_orders
DYNAMODB_SESSION_TABLE=shopify_sessions
AWS_REGION=us-east-1
```

### Deployment Script Parameters

**deploy.ps1 / deploy.sh:**
- `--bucket-name` / `-BucketName` - S3 bucket for assets (required)
- `--function-name` / `-FunctionName` - Lambda function name (default: shopify-invoice-app)
- `--region` / `-Region` - AWS region (default: us-east-1)
- `--skip-build` / `-SkipBuild` - Skip npm build step

**setup-aws.ps1:**
- `-StackName` - CloudFormation stack name (default: shopify-invoice-app)
- `-Region` - AWS region (default: us-east-1)
- `-Validate` - Just validate template without deploying

## 🧪 Testing Deployment

### 1. Test Lambda Function
```powershell
aws lambda invoke \
  --function-name shopify-invoice-app \
  --payload '{"rawPath":"/","requestContext":{"http":{"method":"GET"}},"headers":{"host":"localhost"}}' \
  response.json
```

### 2. Test API Endpoint
```powershell
curl https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com
```

### 3. View Logs
```powershell
aws logs tail /aws/lambda/shopify-invoice-app --follow
```

## 🐛 Troubleshooting

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Lambda timeout | Increase timeout: `aws lambda update-function-configuration --function-name shopify-invoice-app --timeout 60` |
| Out of memory | Increase memory: `aws lambda update-function-configuration --function-name shopify-invoice-app --memory-size 2048` |
| Assets not loading | Re-sync S3: `aws s3 sync ./build/client s3://YOUR-BUCKET/assets/ --delete` |
| Session errors | Check DynamoDB table exists and Lambda has permissions |
| CORS errors | Verify API Gateway CORS configuration |

### Getting Help

1. Check CloudWatch Logs for detailed errors
2. Review [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md) troubleshooting section
3. Verify all checklist items in [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

## 💰 Cost Estimate

**Monthly cost for low-medium traffic (~10,000 requests):**
- Lambda: $0-5 (free tier: 1M requests)
- API Gateway: $0-5 (free tier: 1M requests)
- DynamoDB: $0-2 (on-demand, low usage)
- S3: $0-1 (storage + requests)
- **Total: ~$0-15/month**

Free tier is available for 12 months for new AWS accounts.

## 🔐 Security

This deployment follows AWS security best practices:
- ✅ IAM roles with least privilege
- ✅ Encrypted environment variables
- ✅ VPC support (optional)
- ✅ API throttling and rate limiting
- ✅ CloudWatch logging enabled

**Recommendations:**
- Store secrets in AWS Secrets Manager
- Enable CloudTrail for audit logging
- Set up CloudWatch alarms for errors
- Regular security updates (`npm audit`)

## 🔄 CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Deploy to AWS
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm run build
      - uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: ./deploy.sh --bucket-name ${{ secrets.S3_BUCKET }}
```

## 📞 Support

- **AWS Documentation**: https://docs.aws.amazon.com/lambda/
- **Shopify App Docs**: https://shopify.dev/docs/apps
- **React Router**: https://reactrouter.com/

## ✅ Next Steps After Deployment

1. ✅ Update Shopify app URL with API Gateway endpoint
2. ✅ Configure webhooks in Shopify Partner Dashboard
3. ✅ Set up CloudWatch alarms for monitoring
4. ✅ Test app installation on a development store
5. ✅ Monitor logs for 24-48 hours
6. ✅ Optimize based on real-world usage

---

**Happy Deploying! 🚀**

For detailed instructions, see [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md)
