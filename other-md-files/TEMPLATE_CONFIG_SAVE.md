# Template Configuration Save Feature

## Overview
Implemented functionality to save and load template configurations from DynamoDB. Merchants can now customize invoice templates through the UI and their settings will be persisted per shop.

## Changes Made

### 1. Database Service (`app/services/dynamodb.server.ts`)
- ✅ Added `saveTemplateConfiguration()` - Saves config to TemplateConfigurations table
- ✅ Added `getTemplateConfiguration()` - Retrieves existing config from DB

### 2. Customize Route (`app/routes/app.templates-customize.tsx`)

#### Loader Function
- Fetches existing configuration from DynamoDB for the shop
- Populates form defaults with saved values or fallback to environment variables
- Structure: `{shop, templateId, configuration: {styling, company}}`

#### Action Function
- Parses form data with nested field names (`styling.primaryColor`, `company.companyName`)
- Saves configuration to DynamoDB with structure:
  ```json
  {
    "shop": "invoice-22239.myshopify.com",
    "templateId": "minimalist",
    "styling": {
      "primaryColor": "#4f46e5",
      "fontFamily": "Helvetica",
      "titleFontSize": 24,
      "headingFontSize": 14,
      "bodyFontSize": 10
    },
    "company": {
      "companyName": "My Company",
      "legalName": "My Company Pvt Ltd",
      "addressLine1": "123 Business St",
      "addressLine2": "Suite 100",
      "state": "Maharashtra",
      "gstin": "27XXXXX1234X1ZX",
      "supportEmail": "support@company.com",
      "phone": "+91-1234567890",
      "logoFilename": "logo.JPG",
      "signatureFilename": ""
    },
    "updatedAt": "2025-01-08T10:30:00Z",
    "createdAt": "2025-01-08T10:30:00Z"
  }
  ```

#### UI Updates
- Updated `renderFormField()` to accept `section` parameter
- Changed all input field names from `key` to `fieldName` (`styling.${key}` or `company.${key}`)
- Added success notification toast (auto-dismisses after 3 seconds)
- Added error message display
- Shows loading state while submitting

## Field Naming Structure

### Before
```html
<input name="primaryColor" />
<input name="companyName" />
```

### After
```html
<input name="styling.primaryColor" />
<input name="company.companyName" />
```

This nested structure allows the action handler to easily parse and group fields:
```typescript
const styling = {
  primaryColor: formData.get("styling.primaryColor"),
  fontFamily: formData.get("styling.fontFamily"),
  // ...
};
```

## How It Works

### Save Flow
1. User modifies fields in Customize Template page
2. Clicks "Save" button
3. Form submits via POST to action handler
4. Action parses form data into `styling` and `company` objects
5. `saveTemplateConfiguration()` upserts to DynamoDB
6. Success message shown to user
7. Page reloads with updated configuration

### Load Flow
1. User navigates to Customize Template page
2. Loader fetches shop from session
3. `getTemplateConfiguration(shop, templateId)` queries DynamoDB
4. If config exists, populate form defaults
5. If not, use environment variable fallbacks
6. Render form with defaults

### Invoice Generation Flow
1. Order created in Shopify
2. Webhook triggers Lambda
3. Lambda calls `templateConfigService.getTemplateConfig(shop, templateId)`
4. Service checks 4-tier fallback:
   - TemplateConfigurations table (shop-specific)
   - Templates table (template defaults)
   - Environment variables
   - Hard-coded defaults
5. Lambda generates PDF with fetched configuration

## Testing Instructions

### 1. Test Configuration Save
```bash
# Start the app
cd shopify-app-v2/invoice-1
npm run dev
```

1. Navigate to: `https://[your-domain]/app/templates/customize?templateId=minimalist`
2. Change some values:
   - Primary Color: `#ff5733`
   - Company Name: `Test Company ABC`
   - Support Email: `test@example.com`
3. Click "Save"
4. Should see green success notification
5. Refresh the page
6. Values should persist

### 2. Verify Database Record
```bash
# Query DynamoDB
aws dynamodb get-item \
  --table-name TemplateConfigurations \
  --key '{"shop":{"S":"invoice-22239.myshopify.com"},"templateId":{"S":"minimalist"}}'
```

Expected output:
```json
{
  "Item": {
    "shop": {"S": "invoice-22239.myshopify.com"},
    "templateId": {"S": "minimalist"},
    "styling": {
      "M": {
        "primaryColor": {"S": "#ff5733"},
        "fontFamily": {"S": "Helvetica"},
        ...
      }
    },
    "company": {
      "M": {
        "companyName": {"S": "Test Company ABC"},
        ...
      }
    },
    "updatedAt": {"S": "2025-01-08T..."},
    "createdAt": {"S": "2025-01-08T..."}
  }
}
```

### 3. Test Invoice Generation
1. Create a test order in Shopify admin
2. Check Lambda logs:
   ```bash
   aws logs tail /aws/lambda/shopify-generate-invoice --follow
   ```
3. Look for log entry: `"Loading template configuration for shop: invoice-22239.myshopify.com"`
4. Should show: `"Using config from: TemplateConfigurations table"`
5. Download generated invoice from S3
6. Verify it uses the customized settings (colors, company name, etc.)

### 4. Test Error Handling
1. Temporarily break DynamoDB connection (invalid region in config)
2. Try to save configuration
3. Should see red error message
4. Check console logs for error details

## DynamoDB Table Structure

### TemplateConfigurations Table
- **Partition Key**: `shop` (String) - e.g., "invoice-22239.myshopify.com"
- **Sort Key**: `templateId` (String) - e.g., "minimalist"
- **Attributes**:
  - `styling` (Map) - Font, color settings
  - `company` (Map) - Business info
  - `createdAt` (String) - ISO timestamp
  - `updatedAt` (String) - ISO timestamp

### Query Pattern
```javascript
// Get config for specific shop and template
const config = await dynamodb.send(new GetCommand({
  TableName: "TemplateConfigurations",
  Key: { shop, templateId }
}));
```

## Next Steps (Optional Enhancements)

1. **Validation**
   - Add form validation for required fields
   - Validate email format, phone format
   - Validate color hex codes

2. **Preview**
   - Add live preview of invoice with current settings
   - Update preview as user types

3. **Reset Functionality**
   - Implement "Reset to Defaults" button
   - Clear saved config and reload environment variable defaults

4. **Multiple Templates**
   - Allow switching between different template styles
   - Save separate configs for each template

5. **Export/Import**
   - Export configuration as JSON
   - Import configuration from file
   - Useful for backup and migration

## Troubleshooting

### Configuration Not Saving
- Check DynamoDB table exists: `aws dynamodb describe-table --table-name TemplateConfigurations`
- Verify IAM permissions for Lambda role
- Check console logs for error messages

### Values Not Loading
- Verify shop domain matches exactly in DB query
- Check loader function is fetching from correct table
- Ensure `getTemplateConfiguration()` is returning data

### Invoice Not Using Saved Config
- Verify Lambda has `TEMPLATE_CONFIG_TABLE` environment variable
- Check Lambda logs to see which fallback tier is being used
- Ensure shop record has `templateId` field set

## Files Modified
- ✅ `app/services/dynamodb.server.ts` - Database operations
- ✅ `app/routes/app.templates-customize.tsx` - UI and save logic
- ✅ `lambda-generate-invoice/services/templateConfigService.mjs` - Already exists (4-tier fallback)

## Status
✅ **Complete and ready for testing**
