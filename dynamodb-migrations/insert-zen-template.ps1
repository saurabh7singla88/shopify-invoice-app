# Insert Zen template into Templates table

$TABLE_NAME = if ($env:TEMPLATES_TABLE) { $env:TEMPLATES_TABLE } else { "Templates" }
$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

Write-Host "Inserting Zen template into $TABLE_NAME..."

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

# Create temporary JSON file
$tempFile = [System.IO.Path]::GetTempFileName()

$jsonContent = @"
{
  "templateId": {"S": "zen"},
  "name": {"S": "Zen"},
  "description": {"S": "Colorful, modern design with vibrant gradients and accents. Perfect for brands with a bold identity. Fully configurable like Minimalist."},
  "previewImageUrl": {"S": "/templates/zen-preview.svg"},
  "isDefault": {"N": "0"},
  "isActive": {"N": "1"},
  "category": {"S": "creative"},
  "supportedFeatures": {"L": [
    {"S": "GST"},
    {"S": "CGST/SGST"},
    {"S": "IGST"},
    {"S": "logo"},
    {"S": "signature"},
    {"S": "custom-colors"},
    {"S": "custom-fonts"},
    {"S": "gradients"}
  ]},
  "configurableOptions": {"M": {
    "primaryColor": {"M": {
      "type": {"S": "color"},
      "label": {"S": "Primary Color"},
      "default": {"S": "#6366f1"}
    }},
    "secondaryColor": {"M": {
      "type": {"S": "color"},
      "label": {"S": "Secondary Color"},
      "default": {"S": "#8b5cf6"}
    }},
    "accentColor": {"M": {
      "type": {"S": "color"},
      "label": {"S": "Accent Color"},
      "default": {"S": "#ec4899"}
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
      "default": {"N": "32"}
    }},
    "headingFontSize": {"M": {
      "type": {"S": "number"},
      "label": {"S": "Heading Font Size"},
      "min": {"N": "12"},
      "max": {"N": "24"},
      "default": {"N": "18"}
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

# Write without BOM (Byte Order Mark) which AWS CLI doesn't like
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($tempFile, $jsonContent, $utf8NoBom)

# Insert template using AWS CLI
try {
  aws dynamodb put-item `
    --table-name $TABLE_NAME `
    --item file://$tempFile `
    --region $REGION

  if ($LASTEXITCODE -eq 0) {
    Write-Host "[SUCCESS] Zen template inserted successfully" -ForegroundColor Green
  } else {
    Write-Host "[ERROR] Failed to insert Zen template" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host "[ERROR] Error inserting Zen template: $_" -ForegroundColor Red
  exit 1
} finally {
  # Clean up temp file
  if (Test-Path $tempFile) {
    Remove-Item $tempFile
  }
}

Write-Host ""
Write-Host "Zen template configuration inserted into Templates table" -ForegroundColor Cyan
