# PowerShell script to create DynamoDB Templates table
# Master list of available invoice templates

$TABLE_NAME = if ($env:TEMPLATES_TABLE) { $env:TEMPLATES_TABLE } else { "Templates" }
$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Creating DynamoDB table: $TABLE_NAME in region: $REGION"

aws dynamodb create-table `
  --table-name $TABLE_NAME `
  --attribute-definitions `
    AttributeName=templateId,AttributeType=S `
  --key-schema `
    AttributeName=templateId,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST `
  --region $REGION

Write-Host "Table creation initiated. Waiting for table to be active..."

aws dynamodb wait table-exists `
  --table-name $TABLE_NAME `
  --region $REGION

Write-Host "Table $TABLE_NAME is now active!"

# Insert default template (minimalist)
Write-Host "Inserting default template (minimalist)..."

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

# Create temporary JSON file
$tempFile = [System.IO.Path]::GetTempFileName()

$jsonContent = @"
{
  "templateId": {"S": "minimalist"},
  "name": {"S": "Minimalist"},
  "description": {"S": "Clean, professional design with GST compliance and configurable colors. Supports both intrastate (CGST/SGST) and interstate (IGST) transactions."},
  "previewImageUrl": {"S": "/templates/minimalist-preview.svg"},
  "isDefault": {"N": "1"},
  "isActive": {"N": "1"},
  "category": {"S": "professional"},
  "supportedFeatures": {"L": [
    {"S": "GST"},
    {"S": "CGST/SGST"},
    {"S": "IGST"},
    {"S": "logo"},
    {"S": "signature"},
    {"S": "custom-colors"},
    {"S": "custom-fonts"}
  ]},
  "configurableOptions": {"M": {
    "primaryColor": {"M": {
      "type": {"S": "color"},
      "label": {"S": "Primary Color"},
      "default": {"S": "#333333"}
    }},
    "fontFamily": {"M": {
      "type": {"S": "select"},
      "label": {"S": "Font Family"},
      "options": {"L": [
        {"S": "Helvetica"},
        {"S": "Courier"},
        {"S": "Times-Roman"}
      ]},
      "default": {"S": "Helvetica"}
    }},
    "titleFontSize": {"M": {
      "type": {"S": "number"},
      "label": {"S": "Title Font Size"},
      "min": {"N": "20"},
      "max": {"N": "40"},
      "default": {"N": "28"}
    }},
    "headingFontSize": {"M": {
      "type": {"S": "number"},
      "label": {"S": "Heading Font Size"},
      "min": {"N": "12"},
      "max": {"N": "24"},
      "default": {"N": "16"}
    }},
    "bodyFontSize": {"M": {
      "type": {"S": "number"},
      "label": {"S": "Body Font Size"},
      "min": {"N": "8"},
      "max": {"N": "16"},
      "default": {"N": "11"}
    }}
  }},
  "version": {"S": "1.0"},
  "createdAt": {"N": "$timestamp"},
  "updatedAt": {"N": "$timestamp"}
}
"@

$jsonContent | Out-File -FilePath $tempFile -Encoding ASCII

aws dynamodb put-item `
  --table-name $TABLE_NAME `
  --item file://$tempFile `
  --region $REGION

if ($LASTEXITCODE -eq 0) {
    Write-Host "Default template inserted successfully!"
} else {
    Write-Host "Error inserting template. Exit code: $LASTEXITCODE" -ForegroundColor Red
}

# Clean up temp file
Remove-Item $tempFile -ErrorAction SilentlyContinue
