# PowerShell script to add shop-timestamp-index GSI to ShopifyOrders table
# This enables efficient querying of orders by shop with timestamp-based sorting
# Eliminates need for table scans when fetching orders for a specific shop

$TABLE_NAME = if ($env:ORDERS_TABLE_NAME) { $env:ORDERS_TABLE_NAME } else { "ShopifyOrders" }
$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }
$INDEX_NAME = "shop-timestamp-index"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding GSI to ShopifyOrders Table" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Table: $TABLE_NAME" -ForegroundColor Yellow
Write-Host "Region: $REGION" -ForegroundColor Yellow
Write-Host "Index: $INDEX_NAME" -ForegroundColor Yellow
Write-Host ""

# Check if table exists
Write-Host "Checking if table exists..." -ForegroundColor Cyan
$ErrorActionPreference = "SilentlyContinue"
$tableCheck = aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION 2>&1
$ErrorActionPreference = "Continue"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Table $TABLE_NAME does not exist!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Table exists" -ForegroundColor Green
Write-Host ""

# Check if index already exists
Write-Host "Checking if index already exists..." -ForegroundColor Cyan
$tableDescription = aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION | ConvertFrom-Json

$indexExists = $false
if ($tableDescription.Table.GlobalSecondaryIndexes) {
    foreach ($gsi in $tableDescription.Table.GlobalSecondaryIndexes) {
        if ($gsi.IndexName -eq $INDEX_NAME) {
            $indexExists = $true
            break
        }
    }
}

if ($indexExists) {
    Write-Host "⚠️  Index '$INDEX_NAME' already exists on table $TABLE_NAME" -ForegroundColor Yellow
    Write-Host "No action needed." -ForegroundColor Yellow
    exit 0
}

Write-Host "Index does not exist. Creating..." -ForegroundColor Cyan
Write-Host ""

# Update table with new GSI
Write-Host "Adding Global Secondary Index..." -ForegroundColor Green
Write-Host "This operation may take several minutes depending on table size." -ForegroundColor Yellow
Write-Host ""

# Create temporary JSON file for GSI configuration
$tempFile = [System.IO.Path]::GetTempFileName()
$gsiConfig = @"
[
  {
    "Create": {
      "IndexName": "$INDEX_NAME",
      "KeySchema": [
        {
          "AttributeName": "shop",
          "KeyType": "HASH"
        },
        {
          "AttributeName": "timestamp",
          "KeyType": "RANGE"
        }
      ],
      "Projection": {
        "ProjectionType": "ALL"
      }
    }
  }
]
"@

# Write without BOM
[System.IO.File]::WriteAllText($tempFile, $gsiConfig)

aws dynamodb update-table `
  --table-name $TABLE_NAME `
  --attribute-definitions `
    AttributeName=orderId,AttributeType=S `
    AttributeName=shop,AttributeType=S `
    AttributeName=timestamp,AttributeType=S `
  --global-secondary-index-updates file://$tempFile `
  --region $REGION

# Clean up temp file
Remove-Item $tempFile -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Failed to add GSI to table" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ GSI creation initiated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "⏳ Waiting for index to become ACTIVE..." -ForegroundColor Cyan
Write-Host "   (This may take several minutes for large tables)" -ForegroundColor Yellow
Write-Host ""

# Poll index status
$maxAttempts = 60
$attempt = 0
$indexActive = $false

while ($attempt -lt $maxAttempts -and -not $indexActive) {
    Start-Sleep -Seconds 10
    $attempt++
    
    $tableDescription = aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION | ConvertFrom-Json
    
    foreach ($gsi in $tableDescription.Table.GlobalSecondaryIndexes) {
        if ($gsi.IndexName -eq $INDEX_NAME) {
            $status = $gsi.IndexStatus
            Write-Host "   Attempt $attempt/$maxAttempts - Index status: $status" -ForegroundColor Cyan
            
            if ($status -eq "ACTIVE") {
                $indexActive = $true
                break
            }
        }
    }
}

Write-Host ""
if ($indexActive) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✅ Index '$INDEX_NAME' is now ACTIVE!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "The index is ready to use. Your queries will now be much faster!" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "⚠️  Index creation is still in progress" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Check status manually with:" -ForegroundColor Yellow
    Write-Host "aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION" -ForegroundColor Cyan
}
