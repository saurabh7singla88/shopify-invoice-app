# Shop and Template Configuration Updates

## Overview
Implemented automatic shop registration and default template configuration when merchants install the app.

## Changes Made

### 1. New DynamoDB Service (`app/services/dynamodb.server.ts`)
Created a centralized service for all DynamoDB operations:

**Shop Management:**
- `upsertShop()` - Creates/updates shop record on installation
- `markShopUninstalled()` - Marks shop as inactive on uninstallation
- `logAuditEvent()` - Logs all app lifecycle events

**Template Configuration:**
- `getDefaultTemplate()` - Fetches the minimalist template from Templates table
- `createDefaultTemplateConfiguration()` - Creates default template config for new shops
- `getTemplateConfiguration()` - Retrieves shop's template configuration
- `updateTemplateConfiguration()` - Updates shop's template settings

### 2. Updated Authentication Flow (`app/routes/auth.$.tsx`)

**On App Installation:**
1. Creates/updates record in `Shops` table with:
   - shop domain
   - accessToken
   - scopes
   - isActive: true
   - installedAt timestamp

2. Checks if shop already has template configuration:
   - **New Installation**: Creates default template configuration in `TemplateConfigurations` table
   - **Reinstallation**: Only updates shop record

3. Logs audit event:
   - `APP_INSTALLED` for new installations
   - `APP_REINSTALLED` for existing shops

**Default Template Configuration Includes:**
```json
{
  "shop": "merchant-shop.myshopify.com",
  "templateId": "minimalist",
  "styling": {
    "fonts": {
      "heading": "Helvetica-Bold",
      "body": "Helvetica",
      "emphasis": "Helvetica-Bold"
    },
    "colors": {
      "primary": "#1a1a1a",
      "secondary": "#666666",
      "accent": "#0066cc",
      "background": "#ffffff",
      "border": "#dddddd"
    }
  },
  "company": {
    "name": "",
    "address": "",
    "city": "",
    "state": "",
    "zipCode": "",
    "country": "",
    "phone": "",
    "email": "",
    "gstin": "",
    "pan": ""
  },
  "createdAt": 1738454400000,
  "updatedAt": 1738454400000
}
```

### 3. Updated Uninstall Webhook (`app/routes/webhooks.app.uninstalled.tsx`)

**On App Uninstallation:**
1. Updates `Shops` table:
   - Sets `isActive: false`
   - Adds `uninstalledAt` timestamp
   - Updates `updatedAt`

2. Logs audit event: `APP_UNINSTALLED`

3. Deletes all sessions for the shop (existing behavior)

**Note:** Template configurations are preserved (not deleted) in case merchant reinstalls the app.

## Database Tables Updated

### Shops Table
```
shop (PK)         | accessToken | scopes      | isActive | installedAt | uninstalledAt | updatedAt
------------------|-------------|-------------|----------|-------------|---------------|----------
store.myshopify.. | gid://...   | read_orders | true     | 1738454400  | null          | 1738454400
```

### TemplateConfigurations Table
```
shop (PK)         | templateId (SK) | styling | company | createdAt  | updatedAt
------------------|-----------------|---------|---------|------------|----------
store.myshopify.. | minimalist      | {...}   | {...}   | 1738454400 | 1738454400
```

### AuditLogs Table
```
logId (PK)        | shop            | action           | details | timestamp  | ttl
------------------|-----------------|------------------|---------|------------|----------
shop-1738454400-. | store.myshopify | APP_INSTALLED    | {...}   | 1738454400 | 1746230400
shop-1738454401-. | store.myshopify | APP_UNINSTALLED  | {...}   | 1738454401 | 1746230401
```

## Environment Variables Required

Already configured in CloudFormation template:
```bash
SHOPS_TABLE_NAME=Shops
TEMPLATES_TABLE_NAME=Templates
TEMPLATE_CONFIG_TABLE_NAME=TemplateConfigurations
AUDIT_LOGS_TABLE_NAME=AuditLogs
```

## Testing

### Test App Installation
1. Install app on development store
2. Check CloudWatch logs for: `App installed for {shop} - default template configured`
3. Verify DynamoDB:
   ```powershell
   aws dynamodb get-item --table-name Shops --key '{"shop":{"S":"your-store.myshopify.com"}}'
   aws dynamodb get-item --table-name TemplateConfigurations --key '{"shop":{"S":"your-store.myshopify.com"},"templateId":{"S":"minimalist"}}'
   ```

### Test App Uninstallation
1. Uninstall app from development store
2. Check CloudWatch logs for: `Shop {shop} marked as uninstalled successfully`
3. Verify `isActive` is false in Shops table

### Test App Reinstallation
1. Reinstall app on the same store
2. Check logs for: `App reinstalled for {shop}`
3. Verify existing template configuration is preserved
4. Verify `isActive` is true again

## Next Steps

1. ✅ Shop registration on installation
2. ✅ Default template configuration on first install
3. ✅ Shop deactivation on uninstallation
4. ✅ Audit logging for app lifecycle events
5. ⏭️ Implement template customization UI (load/save from TemplateConfigurations)
6. ⏭️ Use shop's template configuration when generating invoices

## Notes

- Template configurations are NOT deleted on uninstallation (allows preservation of merchant's customizations)
- Audit logs have 90-day TTL (automatically deleted after 90 days)
- All database operations are wrapped in try-catch to prevent authentication failures
- Logging is comprehensive for debugging in CloudWatch
