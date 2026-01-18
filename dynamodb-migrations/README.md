# DynamoDB Migrations

This folder contains scripts and templates for setting up DynamoDB tables required by the Shopify app.

## Table: shopify_sessions

This table stores OAuth session data for the Shopify app.

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
