# AWS Lambda + S3 Deployment Guide

## Shopify Invoice App - Serverless Deployment

This guide walks you through deploying the Shopify Invoice App (`invoice-1`) to AWS Lambda with S3 for static assets.

## 🏗️ Architecture Overview

```
┌─────────────────┐
│   Shopify App   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│     API Gateway / Function URL      │
└────────────┬────────────────────────┘
             │
             ▼
      ┌──────────────┐
      │ AWS Lambda   │◄────► DynamoDB (Sessions)
      │ (Node.js)    │
      └──────┬───────┘
             │
             ▼
      ┌──────────────┐
      │ S3 + CDN     │
      │ (Static      │
      │  Assets)     │
      └──────────────┘
```

## 📋 Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
   ```powershell
   aws --version
   aws configure
   ```
3. **Node.js** (v20.19 or higher)
4. **Shopify Partner Account** and App credentials
5. **SAM CLI** (optional, for SAM template deployment)
   ```powershell
   pip install aws-sam-cli
   ```

## 🚀 Quick Start Deployment

### Option 1: Using CloudFormation (Recommended)

#### Step 1: Create the Infrastructure

```powershell
# Navigate to the app directory
cd shopify-app-v2/invoice-1

# Deploy the CloudFormation stack
aws cloudformation create-stack `
  --stack-name shopify-invoice-app `
  --template-body file://cloudformation-template.json `
  --parameters `
    ParameterKey=ShopifyApiKey,ParameterValue=YOUR_SHOPIFY_API_KEY `
    ParameterKey=ShopifyApiSecret,ParameterValue=YOUR_SHOPIFY_API_SECRET `
    ParameterKey=ShopifyAppUrl,ParameterValue=https://your-api-url.execute-api.us-east-1.amazonaws.com `
  --capabilities CAPABILITY_NAMED_IAM `
  --region us-east-1
```

**Note:** The `ShopifyAppUrl` will be provided in the stack outputs. You can update it later.

#### Step 2: Wait for Stack Creation

```powershell
# Monitor stack creation
aws cloudformation describe-stacks `
  --stack-name shopify-invoice-app `
  --query "Stacks[0].StackStatus"

# Or use wait command
aws cloudformation wait stack-create-complete `
  --stack-name shopify-invoice-app
```

#### Step 3: Get Stack Outputs

```powershell
# Get all outputs
aws cloudformation describe-stacks `
  --stack-name shopify-invoice-app `
  --query "Stacks[0].Outputs"
```

Save these values:
- **ApiGatewayUrl**: Your app endpoint
- **AssetsBucketName**: For deploying static assets
- **LambdaFunctionName**: For code deployment

#### Step 4: Build and Deploy Your Code

```powershell
# Build the application
npm run build

# Deploy using the deployment script
.\deploy.ps1 -BucketName <AssetsBucketName-from-outputs> -FunctionName <LambdaFunctionName-from-outputs>
```

#### Step 5: Update Shopify App URL

After deployment, update the CloudFormation stack with the actual API Gateway URL:

```powershell
aws cloudformation update-stack `
  --stack-name shopify-invoice-app `
  --use-previous-template `
  --parameters `
    ParameterKey=ShopifyApiKey,UsePreviousValue=true `
    ParameterKey=ShopifyApiSecret,UsePreviousValue=true `
    ParameterKey=ShopifyAppUrl,ParameterValue=https://ACTUAL-API-GATEWAY-URL `
    ParameterKey=DynamoDBSessionTable,UsePreviousValue=true `
    ParameterKey=Scopes,UsePreviousValue=true `
  --capabilities CAPABILITY_NAMED_IAM
```

### Option 2: Using AWS SAM

```powershell
# Build the SAM application
sam build --template template.yaml

# Deploy interactively
sam deploy --guided

# Or deploy directly
sam deploy `
  --template-file template.yaml `
  --stack-name shopify-invoice-app `
  --parameter-overrides `
    ShopifyApiKey=YOUR_KEY `
    ShopifyApiSecret=YOUR_SECRET `
  --capabilities CAPABILITY_NAMED_IAM
```

### Option 3: Manual Deployment

If you prefer manual setup, follow these steps:

#### 1. Create S3 Bucket
```powershell
aws s3 mb s3://your-app-assets-bucket --region us-east-1
```

#### 2. Create DynamoDB Table
```powershell
aws dynamodb create-table `
  --table-name shopify_sessions `
  --attribute-definitions `
    AttributeName=id,AttributeType=S `
    AttributeName=shop,AttributeType=S `
  --key-schema AttributeName=id,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST `
  --global-secondary-indexes `
    "IndexName=shop_index,KeySchema=[{AttributeName=shop,KeyType=HASH}],Projection={ProjectionType=ALL}" `
  --region us-east-1
```

#### 3. Create IAM Role
Create a role with permissions for Lambda, DynamoDB, and S3 (see CloudFormation template for policy details).

#### 4. Deploy Lambda Function
```powershell
# Build
npm run build

# Create deployment package
.\deploy.ps1 -BucketName your-app-assets-bucket -FunctionName shopify-invoice-app
```

#### 5. Create API Gateway
- Create HTTP API in AWS Console
- Create route: `ANY /{proxy+}`
- Set integration to your Lambda function
- Deploy API

## 🔧 Configuration

### Environment Variables

The Lambda function requires these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `SHOPIFY_API_KEY` | Shopify API Key | `abc123...` |
| `SHOPIFY_API_SECRET` | Shopify API Secret | `xyz789...` |
| `SHOPIFY_APP_URL` | Your app URL | `https://xxx.execute-api.us-east-1.amazonaws.com` |
| `SCOPES` | Shopify API scopes | `read_orders,write_orders` |
| `DYNAMODB_SESSION_TABLE` | Session table name | `shopify_sessions` |
| `AWS_REGION` | AWS region | `us-east-1` |

### Update Environment Variables

```powershell
aws lambda update-function-configuration `
  --function-name shopify-invoice-app `
  --environment Variables="{NODE_ENV=production,SHOPIFY_API_KEY=your_key,...}"
```

## 📦 Deployment Scripts

### PowerShell (Windows)

```powershell
# Full deployment
.\deploy.ps1 -BucketName your-bucket -FunctionName your-function

# Skip build (use existing)
.\deploy.ps1 -BucketName your-bucket -FunctionName your-function -SkipBuild

# Different region
.\deploy.ps1 -BucketName your-bucket -Region eu-west-1
```

### Bash (Linux/Mac)

```bash
# Make script executable
chmod +x deploy.sh

# Full deployment
./deploy.sh --bucket-name your-bucket --function-name your-function

# Skip build
./deploy.sh --bucket-name your-bucket --skip-build
```

## 🔍 Testing Your Deployment

### 1. Test Lambda Function

```powershell
# Test with a simple event
aws lambda invoke `
  --function-name shopify-invoice-app `
  --payload '{"rawPath":"/","requestContext":{"http":{"method":"GET"}},"headers":{"host":"localhost"}}' `
  response.json

# View response
cat response.json
```

### 2. Test API Gateway

```powershell
# Get your API Gateway URL from outputs
$API_URL = "https://xxx.execute-api.us-east-1.amazonaws.com"

# Test endpoint
curl $API_URL
```

### 3. Check Logs

```powershell
# View recent logs
aws logs tail /aws/lambda/shopify-invoice-app --follow

# Or in CloudWatch console
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Lambda Timeout
**Symptom:** Requests timeout after 30 seconds

**Solution:**
```powershell
aws lambda update-function-configuration `
  --function-name shopify-invoice-app `
  --timeout 60
```

#### 2. Memory Issues
**Symptom:** Lambda runs out of memory

**Solution:**
```powershell
aws lambda update-function-configuration `
  --function-name shopify-invoice-app `
  --memory-size 2048
```

#### 3. Cold Start Issues
**Symptom:** First request is very slow

**Solutions:**
- Enable Lambda Provisioned Concurrency
- Increase memory (faster cold starts)
- Use Lambda SnapStart (for Java, not Node.js yet)

#### 4. Static Assets Not Loading
**Symptom:** CSS/JS files return 404

**Solution:**
```powershell
# Re-sync assets
aws s3 sync ./build/client s3://your-bucket/assets/ --delete

# Check bucket policy allows public access
aws s3api get-bucket-policy --bucket your-bucket
```

#### 5. DynamoDB Permissions
**Symptom:** Session storage fails

**Solution:** Verify Lambda role has DynamoDB permissions (see CloudFormation template).

### Debug Logging

Enable verbose logging:

```powershell
# Update function
aws lambda update-function-configuration `
  --function-name shopify-invoice-app `
  --environment Variables="{NODE_ENV=development,...}"
```

## 🔄 Updating Your Deployment

### Code Updates

```powershell
# Build new version
npm run build

# Deploy update
.\deploy.ps1 -BucketName your-bucket -FunctionName your-function
```

### Infrastructure Updates

```powershell
# Update CloudFormation stack
aws cloudformation update-stack `
  --stack-name shopify-invoice-app `
  --template-body file://cloudformation-template.json `
  --parameters ... `
  --capabilities CAPABILITY_NAMED_IAM
```

## 💰 Cost Optimization

### Estimated Monthly Costs (Low Traffic)

- **Lambda**: $0-5 (Free tier: 1M requests, 400,000 GB-seconds)
- **API Gateway**: $0-5 (Free tier: 1M requests)
- **DynamoDB**: $0-2 (On-demand, low traffic)
- **S3**: $0-1 (GB storage + requests)
- **CloudWatch Logs**: $0-1

**Total**: ~$0-15/month for low traffic

### Tips to Reduce Costs

1. Use S3 lifecycle policies for old assets
2. Set DynamoDB TTL for expired sessions
3. Monitor CloudWatch logs retention
4. Use CloudFront for S3 if high traffic

## 🔐 Security Best Practices

1. **Use Secrets Manager** for sensitive credentials:
   ```powershell
   aws secretsmanager create-secret `
     --name shopify-app-secrets `
     --secret-string '{"apiKey":"...","apiSecret":"..."}'
   ```

2. **Enable API Gateway throttling**
3. **Use VPC** for Lambda if accessing private resources
4. **Enable CloudWatch alarms** for errors/throttles
5. **Implement request signing** for webhooks

## 📚 Additional Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [Shopify App Development](https://shopify.dev/docs/apps)
- [React Router Docs](https://reactrouter.com/)

## 🆘 Getting Help

If you encounter issues:

1. Check CloudWatch logs
2. Review IAM permissions
3. Verify environment variables
4. Test Lambda function directly
5. Check API Gateway integration

## 📝 Next Steps

After successful deployment:

1. ✅ Update Shopify app configuration with your API Gateway URL
2. ✅ Configure webhooks in Shopify Partner Dashboard
3. ✅ Set up monitoring and alarms
4. ✅ Configure custom domain (optional)
5. ✅ Set up CI/CD pipeline (optional)

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
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: ./deploy.sh --bucket-name ${{ secrets.S3_BUCKET }}
```

---

**Happy Deploying! 🚀**
