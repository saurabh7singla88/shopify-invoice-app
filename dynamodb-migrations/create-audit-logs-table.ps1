# PowerShell script to create DynamoDB AuditLogs table
# Track user actions, API calls, and system events

$TABLE_NAME = if ($env:AUDIT_LOGS_TABLE) { $env:AUDIT_LOGS_TABLE } else { "AuditLogs" }
$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Creating DynamoDB table: $TABLE_NAME in region: $REGION"

aws dynamodb create-table `
  --table-name $TABLE_NAME `
  --attribute-definitions `
    AttributeName=logId,AttributeType=S `
    AttributeName=shop,AttributeType=S `
    AttributeName=timestamp,AttributeType=N `
  --key-schema `
    AttributeName=logId,KeyType=HASH `
  --global-secondary-indexes `
    "IndexName=shop-timestamp-index,KeySchema=[{AttributeName=shop,KeyType=HASH},{AttributeName=timestamp,KeyType=RANGE}],Projection={ProjectionType=ALL}" `
  --billing-mode PAY_PER_REQUEST `
  --region $REGION

Write-Host "Table creation initiated. Waiting for table to be active..."

aws dynamodb wait table-exists `
  --table-name $TABLE_NAME `
  --region $REGION

Write-Host "Table $TABLE_NAME is now active!"

# Optional: Enable TTL for auto-deletion of old logs (e.g., after 90 days)
Write-Host "Enabling TTL (Time to Live) on 'ttl' attribute for automatic cleanup..."

aws dynamodb update-time-to-live `
  --table-name $TABLE_NAME `
  --time-to-live-specification "Enabled=true,AttributeName=ttl" `
  --region $REGION

Write-Host "TTL enabled. Logs will be automatically deleted based on the 'ttl' attribute value."
