# Quick Setup Script for AWS Deployment
# This script helps set up your AWS environment quickly

param(
    [string]$StackName = "shopify-invoice-app",
    [string]$Region = "us-east-1",
    [switch]$Validate = $false
)

function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Error { Write-Host $args -ForegroundColor Red }

Write-Info "AWS Deployment Quick Setup"
Write-Info "=========================="

# Check AWS CLI
Write-Info "`nChecking AWS CLI..."
$awsVersion = aws --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "AWS CLI not found. Please install: https://aws.amazon.com/cli/"
    exit 1
}
Write-Success "AWS CLI installed: $awsVersion"

# Check AWS credentials
Write-Info "`nChecking AWS credentials..."
$identity = aws sts get-caller-identity 2>$null | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    Write-Error "AWS credentials not configured. Run: aws configure"
    exit 1
}
Write-Success "AWS credentials configured"
Write-Info "  Account: $($identity.Account)"
Write-Info "  User: $($identity.Arn)"

# Check Node.js
Write-Info "`nChecking Node.js..."
$nodeVersion = node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Node.js not found. Please install Node.js 20+"
    exit 1
}
Write-Success "Node.js installed: $nodeVersion"

# Validate template if requested
if ($Validate) {
    Write-Info "`nValidating CloudFormation template..."
    aws cloudformation validate-template --template-body file://cloudformation-template.json --region $Region
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Template is valid"
    } else {
        Write-Error "Template validation failed"
        exit 1
    }
    exit 0
}

# Collect parameters
Write-Info "`n=== Configuration ==="
Write-Host ""

$ShopifyApiKey = Read-Host "Enter your Shopify API Key"
$ShopifyApiSecret = Read-Host "Enter your Shopify API Secret" -AsSecureString
$ShopifyApiSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ShopifyApiSecret))

Write-Host ""
Write-Info "Optional Settings (press Enter to use defaults):"
$Scopes = Read-Host "Shopify API Scopes (default: read_orders,write_orders)"
if ([string]::IsNullOrEmpty($Scopes)) { $Scopes = "read_orders,write_orders" }

$TableName = Read-Host "DynamoDB Table Name (default: shopify_sessions)"
if ([string]::IsNullOrEmpty($TableName)) { $TableName = "shopify_sessions" }

# Confirm deployment
Write-Host ""
Write-Info "=== Deployment Summary ==="
Write-Info "Stack Name: $StackName"
Write-Info "Region: $Region"
Write-Info "Shopify API Key: $ShopifyApiKey"
Write-Info "Scopes: $Scopes"
Write-Info "DynamoDB Table: $TableName"
Write-Host ""

$confirm = Read-Host "Deploy CloudFormation stack? (yes/no)"
if ($confirm -ne "yes") {
    Write-Info "Deployment cancelled"
    exit 0
}

# Deploy CloudFormation stack
Write-Info "`nDeploying CloudFormation stack..."
Write-Info "This may take 2-5 minutes..."

# Create parameters JSON file
$paramsJson = @"
[
  {
    "ParameterKey": "ShopifyApiKey",
    "ParameterValue": "$ShopifyApiKey"
  },
  {
    "ParameterKey": "ShopifyApiSecret",
    "ParameterValue": "$ShopifyApiSecretPlain"
  },
  {
    "ParameterKey": "ShopifyAppUrl",
    "ParameterValue": "PLACEHOLDER"
  },
  {
    "ParameterKey": "Scopes",
    "ParameterValue": "$Scopes"
  },
  {
    "ParameterKey": "DynamoDBSessionTable",
    "ParameterValue": "$TableName"
  }
]
"@
[System.IO.File]::WriteAllText("$PWD\cf-parameters.json", $paramsJson)

aws cloudformation create-stack --stack-name $StackName --template-body file://cloudformation-template.json --parameters file://cf-parameters.json --capabilities CAPABILITY_NAMED_IAM --region $Region

Remove-Item "cf-parameters.json" -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Error "Stack creation failed"
    exit 1
}

Write-Info "`nWaiting for stack creation to complete..."
aws cloudformation wait stack-create-complete --stack-name $StackName --region $Region

if ($LASTEXITCODE -ne 0) {
    Write-Error "Stack creation failed. Check CloudFormation console for details."
    exit 1
}

# Get outputs
Write-Success "`nStack created successfully!"
Write-Info "`nStack Outputs:"
$outputs = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs" | ConvertFrom-Json

foreach ($output in $outputs) {
    Write-Host "  $($output.OutputKey): " -NoNewline
    Write-Host $output.OutputValue -ForegroundColor Yellow
}

# Save outputs to file
$outputsFile = "aws-outputs.json"
$outputs | ConvertTo-Json | Out-File $outputsFile
Write-Info "`nOutputs saved to: $outputsFile"

# Extract key values
$apiUrl = ($outputs | Where-Object { $_.OutputKey -eq "ApiGatewayUrl" }).OutputValue
$bucketName = ($outputs | Where-Object { $_.OutputKey -eq "AssetsBucketName" }).OutputValue
$functionName = ($outputs | Where-Object { $_.OutputKey -eq "LambdaFunctionName" }).OutputValue

# Update stack with actual API URL
Write-Info "`nUpdating stack with API Gateway URL..."

# Create update parameters JSON file
$updateParamsJson = @"
[
  {
    "ParameterKey": "ShopifyApiKey",
    "UsePreviousValue": true
  },
  {
    "ParameterKey": "ShopifyApiSecret",
    "UsePreviousValue": true
  },
  {
    "ParameterKey": "ShopifyAppUrl",
    "ParameterValue": "$apiUrl"
  },
  {
    "ParameterKey": "Scopes",
    "UsePreviousValue": true
  },
  {
    "ParameterKey": "DynamoDBSessionTable",
    "UsePreviousValue": true
  }
]
"@
[System.IO.File]::WriteAllText("$PWD\cf-update-parameters.json", $updateParamsJson)

aws cloudformation update-stack --stack-name $StackName --use-previous-template --parameters file://cf-update-parameters.json --capabilities CAPABILITY_NAMED_IAM --region $Region

Remove-Item "cf-update-parameters.json" -ErrorAction SilentlyContinue

Write-Info "Waiting for stack update..."
aws cloudformation wait stack-update-complete --stack-name $StackName --region $Region 2>$null

Write-Success "`nInfrastructure setup complete!"
Write-Info "`n=== Next Steps ==="
Write-Info "1. Build your application:"
Write-Info "   npm run build"
Write-Info ""
Write-Info "2. Deploy your code:"
Write-Info "   .\deploy.ps1 -BucketName $bucketName -FunctionName $functionName"
Write-Info ""
Write-Info "3. Update Shopify App Configuration:"
Write-Info "   App URL: $apiUrl"
Write-Info ""
Write-Info "4. Test your deployment:"
Write-Info "   curl $apiUrl"
Write-Info ""
Write-Info "For detailed instructions, see AWS_DEPLOYMENT.md"
