# Master script to create all DynamoDB tables for Shopify Invoice GST app
# Run this script to set up all required tables at once

$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Creating all DynamoDB tables in region: $REGION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Shops table
Write-Host "[1/4] Creating Shops table..." -ForegroundColor Yellow
& "$PSScriptRoot\create-shops-table.ps1"
Write-Host ""

# 2. Templates table
Write-Host "[2/4] Creating Templates table..." -ForegroundColor Yellow
& "$PSScriptRoot\create-templates-table.ps1"
Write-Host ""

# 3. TemplateConfigurations table
Write-Host "[3/4] Creating TemplateConfigurations table..." -ForegroundColor Yellow
& "$PSScriptRoot\create-template-configurations-table.ps1"
Write-Host ""

# 4. AuditLogs table
Write-Host "[4/4] Creating AuditLogs table..." -ForegroundColor Yellow
& "$PSScriptRoot\create-audit-logs-table.ps1"
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "All tables created successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Tables created:" -ForegroundColor Cyan
Write-Host "  - Shops" -ForegroundColor White
Write-Host "  - Templates (with default minimalist template)" -ForegroundColor White
Write-Host "  - TemplateConfigurations" -ForegroundColor White
Write-Host "  - AuditLogs (with TTL enabled)" -ForegroundColor White
