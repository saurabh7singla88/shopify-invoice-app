# PowerShell script to create DynamoDB TemplateConfigurations table
# Stores custom template styling and company configurations per shop

$TABLE_NAME = if ($env:TEMPLATE_CONFIG_TABLE) { $env:TEMPLATE_CONFIG_TABLE } else { "TemplateConfigurations" }
$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Creating DynamoDB table: $TABLE_NAME in region: $REGION"

aws dynamodb create-table `
  --table-name $TABLE_NAME `
  --attribute-definitions `
    AttributeName=shop,AttributeType=S `
    AttributeName=templateId,AttributeType=S `
  --key-schema `
    AttributeName=shop,KeyType=HASH `
    AttributeName=templateId,KeyType=RANGE `
  --billing-mode PAY_PER_REQUEST `
  --region $REGION

Write-Host "Table creation initiated. Waiting for table to be active..."

aws dynamodb wait table-exists `
  --table-name $TABLE_NAME `
  --region $REGION

Write-Host "Table $TABLE_NAME is now active!"
