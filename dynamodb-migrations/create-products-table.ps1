# Create Products Table
# Caches product metadata including HSN codes from Shopify products

$TABLE_NAME = if ($env:PRODUCTS_TABLE) { $env:PRODUCTS_TABLE } else { "Products" }
$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Creating DynamoDB Table: $TABLE_NAME in region: $REGION" -ForegroundColor Green

aws dynamodb create-table `
    --table-name $TABLE_NAME `
    --attribute-definitions `
        AttributeName=shopProductId,AttributeType=S `
    --key-schema `
        AttributeName=shopProductId,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST `
    --region $REGION

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nWaiting for table to be active..." -ForegroundColor Cyan
    
    aws dynamodb wait table-exists `
        --table-name $TABLE_NAME `
        --region $REGION
    
    Write-Host "`nEnabling TTL on 'ttl' attribute..." -ForegroundColor Cyan
    
    aws dynamodb update-time-to-live `
        --table-name $TABLE_NAME `
        --time-to-live-specification "Enabled=true,AttributeName=ttl" `
        --region $REGION
    
    Write-Host "`n✅ Table created successfully!" -ForegroundColor Green
    Write-Host "`nTable Structure:" -ForegroundColor Cyan
    Write-Host "  Primary Key: shopProductId (String - format: shop#productId)" -ForegroundColor White
    Write-Host "  Billing Mode: PAY_PER_REQUEST (on-demand)" -ForegroundColor White
    Write-Host "  TTL: Enabled on 'ttl' attribute (90-day cache)" -ForegroundColor White
    Write-Host "`nAttributes stored:" -ForegroundColor Cyan
    Write-Host "  - shopProductId: Composite key (shop#productId)" -ForegroundColor White
    Write-Host "  - shop: Shop domain" -ForegroundColor White
    Write-Host "  - productId: Shopify product ID" -ForegroundColor White
    Write-Host "  - variantId: Shopify variant ID" -ForegroundColor White
    Write-Host "  - title: Product title" -ForegroundColor White
    Write-Host "  - sku: Product SKU" -ForegroundColor White
    Write-Host "  - hsnCode: HSN/SAC code from metafields" -ForegroundColor White
    Write-Host "  - updatedAt: Last update timestamp" -ForegroundColor White
    Write-Host "  - ttl: Unix timestamp for automatic expiration (90 days)" -ForegroundColor White
    Write-Host "`nUsage:" -ForegroundColor Cyan
    Write-Host "  This table caches HSN codes from Shopify products to avoid" -ForegroundColor White
    Write-Host "  repeated API calls. Updated automatically via products/update webhook." -ForegroundColor White
} else {
    Write-Host "`n❌ Failed to create table" -ForegroundColor Red
    exit 1
}
