# PowerShell script to create DynamoDB Shops table
# Stores metadata about shops that have installed the app

$TABLE_NAME = if ($env:SHOPS_TABLE) { $env:SHOPS_TABLE } else { "Shops" }
$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Creating DynamoDB table: $TABLE_NAME in region: $REGION"

aws dynamodb create-table `
  --table-name $TABLE_NAME `
  --attribute-definitions `
    AttributeName=shop,AttributeType=S `
  --key-schema `
    AttributeName=shop,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST `
  --region $REGION

Write-Host "Table creation initiated. Waiting for table to be active..."

aws dynamodb wait table-exists `
  --table-name $TABLE_NAME `
  --region $REGION

Write-Host "Table $TABLE_NAME is now active!"
