# Build and Deploy Script for AWS Lambda + S3
# This script builds the React Router app and deploys it to AWS

param(
    [string]$Environment = "production",
    [string]$Region = "us-east-1",
    [string]$BucketName = "",
    [string]$FunctionName = "shopify-invoice-app",
    [switch]$SkipBuild = $false
)

# Color output functions
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Error { Write-Host $args -ForegroundColor Red }

# Check required parameters
if ([string]::IsNullOrEmpty($BucketName)) {
    Write-Error "Error: BucketName parameter is required"
    Write-Host "Usage: .\deploy.ps1 -BucketName your-bucket-name [-FunctionName your-function-name] [-Region us-east-1]"
    exit 1
}

# Store absolute paths
$ScriptDir = $PSScriptRoot
$DeployDir = Join-Path $ScriptDir "deploy-lambda"
$ZipFile = Join-Path $ScriptDir "lambda-deployment.zip"

Write-Info "Starting deployment process..."
Write-Info "Environment: $Environment"
Write-Info "Region: $Region"
Write-Info "S3 Bucket: $BucketName"
Write-Info "Lambda Function: $FunctionName"

# Set environment
$env:NODE_ENV = $Environment

# Build the application
if (-not $SkipBuild) {
    Write-Info "`n[1/6] Building React Router application..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed!"
        exit 1
    }
    Write-Success "Build completed successfully"
} else {
    Write-Info "`n[1/6] Skipping build (using existing build)..."
}

# Create deployment directory
Write-Info "`n[2/6] Preparing deployment package..."
if (Test-Path $DeployDir) {
    Write-Info "Removing old deployment directory..."
    # Use robocopy to handle long paths better
    $emptyDir = Join-Path $ScriptDir "temp-empty"
    New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
    robocopy $emptyDir $DeployDir /MIR /NFL /NDL /NJH /NJS | Out-Null
    Remove-Item $emptyDir -Force
    Remove-Item $DeployDir -Force
}
New-Item -ItemType Directory -Path $DeployDir | Out-Null

# Copy server build
Copy-Item -Path ".\build\server" -Destination "$DeployDir\build\server" -Recurse
Copy-Item -Path ".\server.mjs" -Destination "$DeployDir\"
Copy-Item -Path ".\package.json" -Destination "$DeployDir\"

# Copy node_modules (production only)
Write-Info "Installing production dependencies..."
Set-Location $DeployDir
npm install --production --omit=dev
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install failed!"
    Set-Location ..
    exit 1
}

# Clean up unnecessary files to reduce package size
Write-Info "Removing unnecessary files to reduce package size..."
$unnecessaryPatterns = @(
    "*.md", "*.ts", "*.map", "*.txt",
    "LICENSE*", "CHANGELOG*", "README*",
    "test", "tests", "__tests__", "*.test.js", "*.spec.js",
    "example", "examples", "docs", "doc",
    ".github", ".vscode", ".idea",
    "*.d.ts.map", "tsconfig.json"
)

foreach ($pattern in $unnecessaryPatterns) {
    Get-ChildItem -Path ".\node_modules" -Recurse -Force -Filter $pattern -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

Set-Location ..
Write-Success "Deployment package prepared"

# Deploy client assets to S3
Write-Info "`n[3/6] Deploying client assets to S3..."
$ClientPath = ".\build\client"
if (Test-Path $ClientPath) {
    aws s3 sync $ClientPath "s3://$BucketName/assets/" `
        --region $Region `
        --cache-control "public, max-age=31536000, immutable" `
        --exclude "*.html"
    
    # Upload HTML files with no-cache
    aws s3 sync $ClientPath "s3://$BucketName/assets/" `
        --region $Region `
        --exclude "*" `
        --include "*.html" `
        --cache-control "public, max-age=0, must-revalidate"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "S3 sync failed!"
        exit 1
    }
    Write-Success "Client assets deployed to S3"
} else {
    Write-Error "Client build not found at $ClientPath"
    exit 1
}

# Create Lambda deployment package
Write-Info "`n[4/6] Creating Lambda deployment package..."
Set-Location $DeployDir
if (Test-Path $ZipFile) {
    Remove-Item $ZipFile
}

# Use 7-Zip if available, otherwise use PowerShell compress
$7zPath = Get-Command 7z -ErrorAction SilentlyContinue
if (-not $7zPath) {
    # Try common installation paths
    $7zPaths = @(
        "C:\Program Files\7-Zip\7z.exe",
        "C:\Program Files (x86)\7-Zip\7z.exe"
    )
    foreach ($path in $7zPaths) {
        if (Test-Path $path) {
            $7zPath = $path
            break
        }
    }
}

if ($7zPath) {
    Write-Info "Using 7-Zip for compression..."
    & $7zPath a -tzip $ZipFile * -mx=9
    if ($LASTEXITCODE -ne 0) {
        Write-Error "7-Zip compression failed!"
        Set-Location ..
        exit 1
    }
} else {
    Write-Info "Using PowerShell compression (may fail with long paths)..."
    try {
        Compress-Archive -Path * -DestinationPath $ZipFile -CompressionLevel Optimal -ErrorAction Stop
    } catch {
        Write-Error "Compression failed! Please install 7-Zip: winget install 7zip.7zip"
        Write-Error $_.Exception.Message
        Set-Location ..
        exit 1
    }
}

Set-Location ..
$ZipSize = (Get-Item $ZipFile).Length / 1MB
Write-Success "Lambda package created ($([math]::Round($ZipSize, 2)) MB)"

# Check if Lambda function exists
Write-Info "`n[5/6] Checking Lambda function..."
$FunctionExists = aws lambda get-function --function-name $FunctionName --region $Region 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Info "Updating existing Lambda function..."
    aws lambda update-function-code `
        --function-name $FunctionName `
        --zip-file fileb://lambda-deployment.zip `
        --region $Region
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Lambda update failed!"
        exit 1
    }
    Write-Success "Lambda function updated"
} else {
    Write-Info "Lambda function does not exist. Please create it using CloudFormation template first."
    Write-Info "Or use AWS CLI to create it manually (see AWS_DEPLOYMENT.md for details)"
}

# Cleanup
Write-Info "`n[6/6] Cleaning up..."
if (Test-Path $DeployDir) {
    Write-Info "Removing temporary deployment directory..."
    # Use robocopy to handle long paths
    $emptyDir = Join-Path $env:TEMP "empty_$(Get-Random)"
    New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
    robocopy $emptyDir $DeployDir /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    Remove-Item -Path $emptyDir -Force
    Remove-Item -Path $DeployDir -Force
}
Write-Success "Cleanup completed"

Write-Success "`n✨ Deployment process completed!"
Write-Info "`nNext steps:"
Write-Info "1. Configure API Gateway to point to your Lambda function"
Write-Info "2. Set up CloudFront distribution for S3 assets"
Write-Info "3. Update SHOPIFY_APP_URL environment variable"
Write-Info "4. Test the deployment"
