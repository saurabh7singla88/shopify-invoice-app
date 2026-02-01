# Create Invoices Table
# Tracks all generated invoices with their metadata

$TABLE_NAME = "Invoices"
$REGION = "us-east-1"

Write-Host "Creating DynamoDB Table: $TABLE_NAME" -ForegroundColor Green

aws dynamodb create-table `
    --table-name $TABLE_NAME `
    --attribute-definitions `
        AttributeName=invoiceId,AttributeType=S `
        AttributeName=shop,AttributeType=S `
        AttributeName=orderId,AttributeType=S `
        AttributeName=createdAt,AttributeType=N `
    --key-schema `
        AttributeName=invoiceId,KeyType=HASH `
    --global-secondary-indexes `
        "IndexName=shop-createdAt-index,KeySchema=[{AttributeName=shop,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" `
        "IndexName=orderId-index,KeySchema=[{AttributeName=orderId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" `
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 `
    --region $REGION

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Table created successfully!" -ForegroundColor Green
    Write-Host "`nTable Structure:" -ForegroundColor Cyan
    Write-Host "  Primary Key: invoiceId (String)" -ForegroundColor White
    Write-Host "  GSI: shop-createdAt-index (shop + createdAt)" -ForegroundColor White
    Write-Host "  GSI: orderId-index (orderId)" -ForegroundColor White
    Write-Host "`nAttributes stored:" -ForegroundColor Cyan
    Write-Host "  - invoiceId: Unique invoice identifier (UUID)" -ForegroundColor White
    Write-Host "  - shop: Shop domain" -ForegroundColor White
    Write-Host "  - orderId: Shopify order ID" -ForegroundColor White
    Write-Host "  - orderName: Order number (e.g., #1001)" -ForegroundColor White
    Write-Host "  - customerEmail: Customer email address" -ForegroundColor White
    Write-Host "  - s3Key: S3 path to PDF" -ForegroundColor White
    Write-Host "  - s3Url: Pre-signed URL" -ForegroundColor White
    Write-Host "  - emailSentTo: Email address where invoice was sent" -ForegroundColor White
    Write-Host "  - emailSentAt: Timestamp when email was sent" -ForegroundColor White
    Write-Host "  - total: Invoice total amount" -ForegroundColor White
    Write-Host "  - status: Invoice status (generated, sent, failed)" -ForegroundColor White
    Write-Host "  - createdAt: Creation timestamp" -ForegroundColor White
    Write-Host "  - updatedAt: Last update timestamp" -ForegroundColor White
} else {
    Write-Host "`n❌ Failed to create table" -ForegroundColor Red
    exit 1
}
