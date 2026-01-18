# AWS Deployment Checklist

Use this checklist to ensure a successful deployment of your Shopify Invoice App to AWS Lambda and S3.

## 📋 Pre-Deployment Checklist

### AWS Account Setup
- [ ] AWS Account created and active
- [ ] AWS CLI installed (`aws --version`)
- [ ] AWS credentials configured (`aws configure`)
- [ ] IAM user has necessary permissions:
  - [ ] Lambda (create/update functions)
  - [ ] S3 (create bucket, upload objects)
  - [ ] DynamoDB (create table)
  - [ ] API Gateway (create API)
  - [ ] CloudFormation (create/update stacks)
  - [ ] IAM (create roles, attach policies)

### Shopify Setup
- [ ] Shopify Partner account created
- [ ] Shopify app created in Partner Dashboard
- [ ] API Key obtained
- [ ] API Secret obtained
- [ ] Required scopes identified (e.g., `read_orders,write_orders`)

### Local Development Environment
- [ ] Node.js 20+ installed (`node --version`)
- [ ] npm or yarn available
- [ ] Dependencies installed (`npm install`)
- [ ] App builds successfully (`npm run build`)
- [ ] App runs locally (`npm run dev`)

### Files Ready
- [ ] All deployment files present:
  - [ ] `server.lambda.mjs`
  - [ ] `cloudformation-template.json`
  - [ ] `template.yaml`
  - [ ] `deploy.ps1` / `deploy.sh`
  - [ ] `setup-aws.ps1`
  - [ ] `AWS_DEPLOYMENT.md`

## 🏗️ Infrastructure Deployment

### Option 1: Automated Setup (Recommended)
- [ ] Run setup script: `.\setup-aws.ps1`
- [ ] Provide Shopify API credentials when prompted
- [ ] Wait for CloudFormation stack creation (~5 minutes)
- [ ] Save the output values (API URL, Bucket Name, Function Name)
- [ ] Note the API Gateway URL for Shopify configuration

### Option 2: Manual CloudFormation
- [ ] Review `cloudformation-template.json`
- [ ] Update parameter values if needed
- [ ] Create stack:
  ```powershell
  aws cloudformation create-stack \
    --stack-name shopify-invoice-app \
    --template-body file://cloudformation-template.json \
    --parameters ... \
    --capabilities CAPABILITY_NAMED_IAM
  ```
- [ ] Wait for stack creation: `aws cloudformation wait stack-create-complete --stack-name shopify-invoice-app`
- [ ] Get stack outputs: `aws cloudformation describe-stacks --stack-name shopify-invoice-app --query "Stacks[0].Outputs"`

### Option 3: SAM Deployment
- [ ] Install SAM CLI: `pip install aws-sam-cli`
- [ ] Build: `sam build`
- [ ] Deploy: `sam deploy --guided`

## 📦 Code Deployment

### Build Application
- [ ] Clean previous builds: `rm -rf build/`
- [ ] Run build: `npm run build`
- [ ] Verify build output in `build/` directory
- [ ] Check for build errors in console

### Deploy to AWS
- [ ] Get bucket name from CloudFormation outputs
- [ ] Get function name from CloudFormation outputs
- [ ] Run deployment:
  ```powershell
  .\deploy.ps1 -BucketName YOUR-BUCKET -FunctionName YOUR-FUNCTION
  ```
- [ ] Verify successful deployment (no errors in output)
- [ ] Check deployment package size (should be < 50MB)

## ✅ Post-Deployment Verification

### Lambda Function
- [ ] Function appears in AWS Console
- [ ] Environment variables are set correctly:
  - [ ] `NODE_ENV`
  - [ ] `SHOPIFY_API_KEY`
  - [ ] `SHOPIFY_API_SECRET`
  - [ ] `SHOPIFY_APP_URL`
  - [ ] `SCOPES`
  - [ ] `DYNAMODB_SESSION_TABLE`
  - [ ] `AWS_REGION`
- [ ] Memory size is adequate (1024 MB minimum)
- [ ] Timeout is adequate (30 seconds minimum)
- [ ] Test function invocation:
  ```powershell
  aws lambda invoke --function-name shopify-invoice-app response.json
  cat response.json
  ```

### S3 Bucket
- [ ] Bucket exists in AWS Console
- [ ] Assets folder contains files
- [ ] Files are publicly accessible
- [ ] Bucket policy allows public read access
- [ ] Test asset access: `curl https://BUCKET-NAME.s3.amazonaws.com/assets/index.html`

### DynamoDB Table
- [ ] Table exists (`shopify_sessions`)
- [ ] GSI `shop_index` exists
- [ ] TTL enabled on `expires` attribute
- [ ] Billing mode is PAY_PER_REQUEST

### API Gateway
- [ ] HTTP API exists
- [ ] Route `$default` configured
- [ ] Integration to Lambda function working
- [ ] CORS configured correctly
- [ ] Test endpoint:
  ```powershell
  curl https://YOUR-API.execute-api.us-east-1.amazonaws.com/
  ```

## 🔧 Shopify Configuration

### Update Shopify App Settings
- [ ] Log into Shopify Partner Dashboard
- [ ] Open your app configuration
- [ ] Update App URL:
  - Set to: `https://YOUR-API.execute-api.us-east-1.amazonaws.com`
- [ ] Update Allowed redirection URL(s):
  - Add: `https://YOUR-API.execute-api.us-east-1.amazonaws.com/auth/callback`
  - Add: `https://YOUR-API.execute-api.us-east-1.amazonaws.com/auth/shopify/callback`
- [ ] Save changes

### Configure Webhooks
- [ ] Set webhook URLs in Shopify Partner Dashboard
- [ ] Configure required webhooks:
  - [ ] `orders/create` → `https://YOUR-API.../webhooks/orders/create`
  - [ ] `orders/updated` → `https://YOUR-API.../webhooks/orders/updated`
  - [ ] `orders/cancelled` → `https://YOUR-API.../webhooks/orders/cancelled`
  - [ ] `app/uninstalled` → `https://YOUR-API.../webhooks/app/uninstalled`

## 🧪 Testing

### Basic Functionality
- [ ] Access app URL in browser
- [ ] Install app on test store
- [ ] OAuth flow completes successfully
- [ ] App loads in Shopify admin
- [ ] Session persists across page refreshes

### Core Features
- [ ] Can view orders
- [ ] Can generate invoices
- [ ] Can download invoices
- [ ] Webhooks are received
- [ ] Data is stored in DynamoDB

### Performance
- [ ] Initial load < 5 seconds
- [ ] Subsequent loads < 2 seconds
- [ ] No timeout errors
- [ ] No memory errors

### Error Handling
- [ ] Errors are logged to CloudWatch
- [ ] User sees friendly error messages
- [ ] App doesn't crash on errors

## 📊 Monitoring Setup

### CloudWatch Logs
- [ ] Log group exists: `/aws/lambda/shopify-invoice-app`
- [ ] Logs are being written
- [ ] Log retention configured (7-30 days recommended)
- [ ] Can view logs:
  ```powershell
  aws logs tail /aws/lambda/shopify-invoice-app --follow
  ```

### CloudWatch Alarms (Recommended)
- [ ] Alarm for Lambda errors (threshold: > 5 in 5 minutes)
- [ ] Alarm for Lambda throttles (threshold: > 0)
- [ ] Alarm for API Gateway 5xx errors (threshold: > 10 in 5 minutes)
- [ ] Alarm for DynamoDB throttles (threshold: > 0)
- [ ] SNS topic configured for alarm notifications

### Metrics to Monitor
- [ ] Lambda invocations
- [ ] Lambda duration (P50, P95, P99)
- [ ] Lambda errors
- [ ] Lambda concurrent executions
- [ ] API Gateway requests
- [ ] API Gateway latency
- [ ] DynamoDB read/write capacity

## 🔐 Security Hardening

### Secrets Management
- [ ] Consider moving secrets to AWS Secrets Manager:
  ```powershell
  aws secretsmanager create-secret \
    --name shopify-app-secrets \
    --secret-string '{"apiKey":"...","apiSecret":"..."}'
  ```
- [ ] Update Lambda to read from Secrets Manager

### IAM Permissions
- [ ] Lambda role follows least privilege principle
- [ ] No overly permissive policies (e.g., `*` actions)
- [ ] Resource ARNs are specific (not `*`)

### API Security
- [ ] API Gateway throttling configured
- [ ] Rate limiting in place
- [ ] Request validation enabled
- [ ] API key/authorization if needed

### Network Security
- [ ] Consider VPC for Lambda (if accessing private resources)
- [ ] Security groups configured correctly
- [ ] VPC endpoints for AWS services (if using VPC)

## 💰 Cost Optimization

### Review Settings
- [ ] Lambda memory size appropriate (not over-provisioned)
- [ ] Lambda timeout appropriate (not excessive)
- [ ] DynamoDB using on-demand (for variable traffic)
- [ ] S3 lifecycle policies configured (if needed)
- [ ] CloudWatch log retention set (not unlimited)

### Enable Cost Monitoring
- [ ] AWS Cost Explorer enabled
- [ ] Budget alerts configured
- [ ] Tag resources for cost allocation:
  - `Application: shopify-invoice-app`
  - `Environment: production`

## 📝 Documentation

### Update Documentation
- [ ] Document your specific configuration
- [ ] Note any custom modifications
- [ ] Document environment variables
- [ ] Create runbook for common tasks

### Knowledge Transfer
- [ ] Share access credentials (securely)
- [ ] Document deployment process
- [ ] Create troubleshooting guide
- [ ] Set up on-call procedures (if applicable)

## 🔄 CI/CD Setup (Optional)

### Version Control
- [ ] Code in Git repository
- [ ] `.gitignore` configured properly
- [ ] Sensitive files excluded

### Automation
- [ ] GitHub Actions / GitLab CI configured
- [ ] Automated testing on PRs
- [ ] Automated deployment on merge to main
- [ ] Environment-specific deployments (dev, staging, prod)

## 🆘 Rollback Plan

### Backup Strategy
- [ ] Previous Lambda versions retained
- [ ] CloudFormation stack versioned
- [ ] Database backups enabled (if applicable)
- [ ] Document rollback procedure

### Test Rollback
- [ ] Know how to rollback Lambda:
  ```powershell
  aws lambda update-function-code \
    --function-name shopify-invoice-app \
    --s3-bucket backup-bucket \
    --s3-key previous-version.zip
  ```

## ✅ Final Verification

### Smoke Tests
- [ ] Install app on fresh test store
- [ ] Complete one full workflow
- [ ] Generate and download invoice
- [ ] Trigger webhook and verify processing
- [ ] Uninstall app and verify cleanup

### Performance Baseline
- [ ] Record initial metrics:
  - Average response time: _______
  - Cold start time: _______
  - Error rate: _______
- [ ] Set up performance monitoring

### Go-Live Checklist
- [ ] All tests passing
- [ ] Monitoring in place
- [ ] Team notified
- [ ] Support plan ready
- [ ] Documentation complete

## 📞 Support Contacts

- AWS Support Plan: ________________
- Shopify Partner Support: https://partners.shopify.com/
- Internal Team Contact: ________________
- On-Call Schedule: ________________

---

## ✅ Deployment Complete!

Once all items are checked:
1. Monitor application for 24-48 hours
2. Address any issues that arise
3. Optimize based on real-world usage
4. Schedule regular reviews

**Congratulations on your deployment! 🎉**
