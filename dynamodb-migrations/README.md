# DynamoDB Tables

This folder contains scripts and templates for setting up DynamoDB tables required by the Shopify Invoice GST app.

## Tables Overview

| Table Name | Purpose | Primary Key | GSI | Environment Variable |
|------------|---------|-------------|-----|---------------------|
| `shopify_sessions` | Stores OAuth session data for Shopify authentication | `id` (String) | `shop_index` on `shop` | `DYNAMODB_SESSION_TABLE` |
| `ShopifyOrders` | Stores order data from Shopify webhooks for invoice generation | `orderId` (String) | - | `ORDERS_TABLE_NAME` |
| `Templates` | Master list of available invoice templates with metadata | `templateId` (String) | - | `TEMPLATES_TABLE` |
| `TemplateConfigurations` | Stores custom template styling and company configurations per shop | `shop` (String), `templateId` (String) | - | `TEMPLATE_CONFIG_TABLE` |
| `Shops` | Store metadata, installation details, subscription status | `shop` (String) | - | `SHOPS_TABLE` |
| `AuditLogs` | Track user actions, API calls, and system events for compliance | `logId` (String) | `shop-timestamp-index` on `shop` and `timestamp` | `AUDIT_LOGS_TABLE` |

---

## Table: shopify_sessions

**Purpose**: Stores OAuth session data for the Shopify app authentication.

### Schema

- **Primary Key**: `id` (String) - Session identifier (format: `offline_<shop-domain>` or `<session-id>`)
- **Global Secondary Index**: `shop_index` on `shop` attribute
- **Attributes**:
  - `id` - Session identifier
  - `shop` - Shop domain (e.g., `mystore.myshopify.com`)
  - `state` - OAuth state parameter
  - `isOnline` - Boolean indicating online/offline session
  - `scope` - Granted permission scopes
  - `accessToken` - Shopify access token
  - `expires` - Expiration timestamp (for online sessions)
  - `onlineAccessInfo` - Additional online session data

---

## Table: ShopifyOrders

**Purpose**: Stores order data from Shopify webhooks to enable invoice generation and management.

### Schema

- **Primary Key**: `orderId` (String) - Unique Shopify order ID
- **Attributes**:
  - `orderId` - Shopify order ID
  - `shop` - Shop domain
  - `name` - Order number (e.g., #1001)
  - `orderData` - Complete Shopify order JSON
  - `invoiceUrl` - S3 URL of generated invoice PDF
  - `status` - Order status (e.g., pending, completed, cancelled)
  - `timestamp` - Order creation timestamp
  - `updatedAt` - Last update timestamp

---

## Table: Templates

**Purpose**: Master list of available invoice templates with metadata and configuration options.

### Schema

- **Primary Key**: `templateId` (String) - Template identifier (partition key)
- **Attributes**:
  - `templateId` - Unique template identifier (e.g., minimalist, classic, modern)
  - `name` - Display name of the template
  - `description` - Template description
  - `previewImageUrl` - URL to template preview image
  - `isDefault` - Boolean flag (1 = default template, 0 = non-default)
  - `isActive` - Boolean flag indicating if template is available for use
  - `category` - Template category (e.g., professional, creative, minimal)
  - `supportedFeatures` - JSON array of supported features (e.g., GST, logo, signature)
  - `configurableOptions` - JSON object describing configurable options
  - `version` - Template version number
  - `createdAt` - Template creation timestamp
  - `updatedAt` - Last update timestamp

### Initial Data

```json
{
  "templateId": "minimalist",
  "name": "Minimalist",
  "description": "Clean, professional design with GST compliance and configurable colors. Supports both intrastate (CGST/SGST) and interstate (IGST) transactions.",
  "previewImageUrl": "/templates/minimalist-preview.svg",
  "isDefault": 1,
  "isActive": 1,
  "category": "professional",
  "supportedFeatures": ["GST", "CGST/SGST", "IGST", "logo", "signature", "custom-colors", "custom-fonts"],
  "configurableOptions": {
    "primaryColor": { "type": "color", "label": "Primary Color", "default": "#333333" },
    "fontFamily": { "type": "select", "label": "Font Family", "options": ["Helvetica", "Courier", "Times-Roman"], "default": "Helvetica" },
    "titleFontSize": { "type": "number", "label": "Title Font Size", "min": 20, "max": 40, "default": 28 },
    "headingFontSize": { "type": "number", "label": "Heading Font Size", "min": 12, "max": 24, "default": 16 },
    "bodyFontSize": { "type": "number", "label": "Body Font Size", "min": 8, "max": 16, "default": 11 }
  },
  "version": "1.0",
  "createdAt": 1706659200000,
  "updatedAt": 1706659200000
}
```

---

## Table: TemplateConfigurations

**Purpose**: Stores custom template styling (fonts, colors) and company configuration per shop and template.

### Schema

- **Primary Key**: 
  - `shop` (String) - Partition key (shop domain)
  - `templateId` (String) - Sort key (template identifier)
- **Attributes**:
  - `shop` - Shop domain
  - `templateId` - Template identifier (e.g., minimalist, classic)
  - `styling` - JSON object with font and color settings
    - `primaryColor` - Hex color code
    - `fontFamily` - Font family name
    - `titleFontSize` - Number
    - `headingFontSize` - Number
    - `bodyFontSize` - Number
  - `company` - JSON object with company information
    - `companyName`, `legalName`, `addressLine1`, `addressLine2`
    - `state`, `gstin`, `supportEmail`, `phone`
    - `logoFilename`, `signatureFilename`
  - `updatedAt` - Last update timestamp

---

## Table: Shops

**Purpose**: Store metadata about each shop that has installed the app, including installation details and subscription status.

### Schema

- **Primary Key**: `shop` (String) - Shop domain (partition key)
- **Attributes**:
  - `shop` - Shop domain (e.g., `mystore.myshopify.com`)
  - `accessToken` - Shopify access token for API calls
  - `scopes` - Granted permission scopes
  - `isActive` - Boolean indicating if app is currently installed
  - `templateId` - Selected invoice template (default: "minimalist")
  - `billingPlan` - Current Shopify billing plan (e.g., "Free", "Basic Monthly", "Premium Monthly", "Advanced Monthly")
  - `installedAt` - First installation timestamp
  - `updatedAt` - Last update timestamp
  - `uninstalledAt` - Uninstallation timestamp (null if currently installed)
  - `configurations` - JSON object with shop-wide settings
    - `companyDetails` - Company information (GSTIN, address, etc.)
    - `multiWarehouseGST` - Boolean for multi-warehouse GST support
    - `taxCalculationMethod` - "app" or "shopify"
  - `timezone` - Store timezone
  - `features` - JSON object with enabled features/flags
  - `settings` - JSON object with shop-specific app settings
  - `createdAt` - Record creation timestamp
  - `updatedAt` - Last update timestamp

---

## Table: AuditLogs

**Purpose**: Track user actions, API calls, and system events for compliance, debugging, and security monitoring.

### Schema

- **Primary Key**: `logId` (String) - Unique log identifier (ULID or UUID)
- **Global Secondary Index**: `shop-timestamp-index` 
  - Partition key: `shop` (String)
  - Sort key: `timestamp` (Number)
- **Attributes**:
  - `logId` - Unique identifier for the log entry
  - `shop` - Shop domain
  - `timestamp` - Unix timestamp (milliseconds)
  - `eventType` - Type of event (e.g., invoice.generated, settings.updated, order.created)
  - `action` - Action performed (e.g., CREATE, UPDATE, DELETE, READ)
  - `resource` - Resource affected (e.g., template, order, invoice)
  - `resourceId` - ID of the affected resource
  - `userId` - User who performed the action (if applicable)
  - `ipAddress` - IP address of the request
  - `userAgent` - User agent string
  - `requestId` - Request/trace ID for correlation
  - `status` - Status (e.g., success, failure)
  - `errorMessage` - Error message if status is failure
  - `metadata` - JSON object with additional context
  - `ttl` - TTL for auto-deletion (optional, e.g., 90 days)

---

## Setup Options

### Option 1: AWS CLI (Recommended for development)

**For Bash/Linux/Mac:**
```bash
chmod +x create-sessions-table.sh
./create-sessions-table.sh
```

**For Windows PowerShell:**
```powershell
.\create-sessions-table.ps1
```

### Option 2: CloudFormation (Recommended for production)

```bash
aws cloudformation create-stack \
  --stack-name shopify-sessions-table \
  --template-body file://cloudformation-template.json \
  --parameters ParameterKey=TableName,ParameterValue=shopify_sessions
```

### Option 3: Terraform

```bash
terraform init
terraform plan
terraform apply
```

## Manual Table Creation

If you prefer to create the table manually via AWS Console:

1. Go to DynamoDB console
2. Click "Create table"
3. Table name: `shopify_sessions`
4. Partition key: `id` (String)
5. Click "Add index" and create GSI:
   - Index name: `shop_index`
   - Partition key: `shop` (String)
   - Projection type: All attributes
6. Billing mode: On-demand
7. Create table

## Verification

After creating the table, verify it exists:

```bash
aws dynamodb describe-table --table-name shopify_sessions
```

## Notes

- **Billing Mode**: Set to PAY_PER_REQUEST (on-demand) to avoid provisioned capacity charges
- **Global Secondary Index**: Required for querying sessions by shop domain
- **No TTL configured**: Sessions don't expire automatically (cleanup must be manual if needed)
