# Insert all templates into Templates table

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Inserting All Templates" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Insert Minimalist template
Write-Host "[1/2] Inserting Minimalist template..." -ForegroundColor Yellow
& "$PSScriptRoot\insert-default-template.ps1"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Failed to insert Minimalist template" -ForegroundColor Red
  exit 1
}

Write-Host ""

# 2. Insert Zen template
Write-Host "[2/2] Inserting Zen template..." -ForegroundColor Yellow
& "$PSScriptRoot\insert-zen-template.ps1"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Failed to insert Zen template" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  All Templates Inserted Successfully" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Templates created:" -ForegroundColor Cyan
Write-Host "  - Minimalist (default)" -ForegroundColor White
Write-Host "  - Zen" -ForegroundColor White
Write-Host ""
