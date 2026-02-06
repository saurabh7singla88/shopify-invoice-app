# AWS Lambda Deployment - Quick Reference

## 🚀 Quick Commands

### Initial Setup (One-time)
```powershell
# Setup infrastructure
.\setup-aws.ps1

# Or manually with CloudFormation
aws cloudformation create-stack \
  --stack-name shopify-invoice-app \
  --template-body file://cloudformation-template.json \
  --parameters ... \
  --capabilities CAPABILITY_NAMED_IAM
```

### Regular Deployment
```powershell
# Build and deploy in one command
npm run deploy:aws

# Or step by step
npm run build
.\deploy.ps1 -BucketName YOUR-BUCKET -FunctionName YOUR-FUNCTION
```

### Bash (Linux/Mac)
```bash
chmod +x deploy.sh
./deploy.sh --bucket-name YOUR-BUCKET --function-name YOUR-FUNCTION
```

## 📋 Files Overview

| File | Purpose |
|------|---------|
| `server.lambda.mjs` | Lambda handler adapter for React Router |
| `cloudformation-template.json` | Infrastructure as Code (CloudFormation) |
| `template.yaml` | Infrastructure as Code (SAM) |
| `deploy.ps1` | PowerShell deployment script |
| `deploy.sh` | Bash deployment script |
| `setup-aws.ps1` | Interactive setup wizard |
| `AWS_DEPLOYMENT.md` | Complete deployment guide |

## 🔧 Environment Variables

Set these in Lambda configuration or `.env`:

```bash
NODE_ENV=production
SHOPIFY_API_KEY=your_key
SHOPIFY_API_SECRET=your_secret
SHOPIFY_APP_URL=https://your-api.execute-api.us-east-1.amazonaws.com
SCOPES=read_orders,write_orders
DYNAMODB_SESSION_TABLE=shopify_sessions
AWS_REGION=us-east-1
```

## 📦 What Gets Deployed

### To Lambda:
- `build/server/` - Server-side React Router code
- `node_modules/` - Production dependencies only
- `server.lambda.mjs` - Lambda handler

### To S3:
- `build/client/` - Static assets (JS, CSS, images)
- Cached with proper headers for performance

## 🔍 Verification Commands

```powershell
# Check stack status
aws cloudformation describe-stacks --stack-name shopify-invoice-app

# Test Lambda directly
aws lambda invoke --function-name shopify-invoice-app response.json

# View logs
aws logs tail /aws/lambda/shopify-invoice-app --follow

# Test API endpoint
curl https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com
```

## 🐛 Troubleshooting Quick Fixes

### Lambda Timeout
```powershell
aws lambda update-function-configuration \
  --function-name shopify-invoice-app \
  --timeout 60
```

### Increase Memory
```powershell
aws lambda update-function-configuration \
  --function-name shopify-invoice-app \
  --memory-size 2048
```

### Re-deploy Assets
```powershell
aws s3 sync ./build/client s3://YOUR-BUCKET/assets/ --delete
```

### View Latest Errors
```powershell
aws logs tail /aws/lambda/shopify-invoice-app --since 1h --filter-pattern ERROR
```

## 💰 Cost Estimates

**Monthly cost for low-medium traffic (~10k requests/month):**
- Lambda: $0-5 (free tier)
- API Gateway: $0-5 (free tier) 
- DynamoDB: $0-2
- S3: $0-1
- **Total: ~$0-15/month**

## 🔐 Security Checklist

- [ ] API keys stored in Lambda env vars (encrypted at rest)
- [ ] IAM role with least privilege permissions
- [ ] API Gateway throttling enabled
- [ ] CloudWatch alarms set up
- [ ] Regular security updates (`npm audit`)

## 📊 Monitoring

**CloudWatch Dashboard widgets to create:**
- Lambda invocations
- Lambda errors
- Lambda duration (P50, P99)
- API Gateway 4xx/5xx errors
- DynamoDB read/write capacity

**Key metrics to watch:**
- Error rate > 1%
- Duration > 10 seconds
- Throttles > 0

## 🔄 Update Workflow

```powershell
# 1. Make code changes
# 2. Test locally
npm run dev

# 3. Build
npm run build

# 4. Deploy
.\deploy.ps1 -BucketName YOUR-BUCKET -FunctionName YOUR-FUNCTION

# 5. Verify
curl https://YOUR-API-URL/
```

## 🆘 Emergency Rollback

```powershell
# Rollback to previous Lambda version
aws lambda update-function-code \
  --function-name shopify-invoice-app \
  --s3-bucket YOUR-BACKUP-BUCKET \
  --s3-key previous-version.zip

# Or rollback CloudFormation stack
aws cloudformation cancel-update-stack --stack-name shopify-invoice-app
```

## 📞 Support Resources

- **AWS Docs**: https://docs.aws.amazon.com/lambda/
- **Shopify Docs**: https://shopify.dev/docs/apps
- **React Router**: https://reactrouter.com/
- **Full Guide**: See `AWS_DEPLOYMENT.md`

## 🎯 Performance Tips

1. **Enable Lambda SnapStart** (when available for Node.js)
2. **Use Provisioned Concurrency** for consistent performance
3. **Optimize bundle size** - tree shake unused code
4. **Use CloudFront** for S3 assets (global CDN)
5. **Enable DynamoDB DAX** (if high session traffic)

---

**Need help?** Check `AWS_DEPLOYMENT.md` for detailed instructions!
