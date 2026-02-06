# Create ShopifyOrderItems table for GST reporting compliance
# Run this script to create the DynamoDB table manually
# Or deploy via CloudFormation stack update

Write-Host "Creating ShopifyOrderItems DynamoDB table..." -ForegroundColor Green

$tableName = "ShopifyOrderItems"
$region = "us-east-1" # Change if needed

# Check if table already exists
Write-Host "Checking if table exists..." -ForegroundColor Cyan
$ErrorActionPreference = "SilentlyContinue"
$tableCheck = aws dynamodb describe-table --table-name $tableName --region $region 2>&1
$ErrorActionPreference = "Continue"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Table $tableName already exists!" -ForegroundColor Yellow
    exit 0
}

Write-Host "Table does not exist, creating..." -ForegroundColor Cyan

# Get the directory where the script is located
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$gsiConfigPath = Join-Path $scriptDir "gst-gsi-config.json"

# Create the table
aws dynamodb create-table `
    --table-name $tableName `
    --billing-mode PAY_PER_REQUEST `
    --attribute-definitions `
        AttributeName=shop,AttributeType=S `
        AttributeName=orderNumber_lineItemIdx,AttributeType=S `
        AttributeName=yearMonth_invoiceDate,AttributeType=S `
        AttributeName=hsn_yearMonth,AttributeType=S `
        AttributeName=taxRate_yearMonth,AttributeType=S `
    --key-schema `
        AttributeName=shop,KeyType=HASH `
        AttributeName=orderNumber_lineItemIdx,KeyType=RANGE `
    --global-secondary-indexes "file://$gsiConfigPath" `
    --tags `
        Key=Application,Value=Shopify-Invoice-App `
        Key=Purpose,Value=GST-Reporting `
    --region $region

if ($LASTEXITCODE -eq 0) {
    Write-Host "Table created successfully!" -ForegroundColor Green
    Write-Host "Waiting for table to become active..." -ForegroundColor Cyan
    
    aws dynamodb wait table-exists --table-name $tableName --region $region
    
    Write-Host "Table is now active and ready to use!" -ForegroundColor Green
} else {
    Write-Host "Failed to create table. Check AWS CLI configuration." -ForegroundColor Red
    exit 1
}
