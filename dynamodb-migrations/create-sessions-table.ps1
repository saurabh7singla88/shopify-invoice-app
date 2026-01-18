# PowerShell script to create DynamoDB table for Shopify session storage
# Run this script to set up the required DynamoDB table

$TABLE_NAME = if ($env:DYNAMODB_SESSION_TABLE) { $env:DYNAMODB_SESSION_TABLE } else { "shopify_sessions" }
$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Creating DynamoDB table: $TABLE_NAME in region: $REGION"

aws dynamodb create-table `
  --table-name $TABLE_NAME `
  --attribute-definitions `
    AttributeName=id,AttributeType=S `
    AttributeName=shop,AttributeType=S `
  --key-schema `
    AttributeName=id,KeyType=HASH `
  --global-secondary-indexes `
    "IndexName=shop_index,KeySchema=[{AttributeName=shop,KeyType=HASH}],Projection={ProjectionType=ALL}" `
  --billing-mode PAY_PER_REQUEST `
  --region $REGION

Write-Host "Table creation initiated. Waiting for table to be active..."

aws dynamodb wait table-exists `
  --table-name $TABLE_NAME `
  --region $REGION

Write-Host "Table $TABLE_NAME is now active!"
