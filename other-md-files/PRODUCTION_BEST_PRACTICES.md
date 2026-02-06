# Production Best Practices

## Current Setup

- Lambda: `shopify-invoice-app-ShopifyAppFunction`
- DynamoDB: `ShopifyOrders`
- S3: `shopify-invoice-master`
- URL: `https://b2d6rmict3.execute-api.us-east-1.amazonaws.com`
- **Setting:** `automatically_update_urls_on_dev = false` ✅

## Commands

```bash
npm run dev                 # Local development
npm run deploy:aws          # Deploy code to production
shopify app deploy          # Update Shopify config (URLs, webhooks)
```

## Reinstallation Required?

**❌ Yes:**
- Changing `application_url`
- Modifying OAuth redirect URLs

**✅ No:**
- Code updates via `npm run deploy:aws`

## Safe Workflow

1. Test locally: `npm run dev`
2. Deploy: `npm run deploy:aws`
3. Verify on production
4. Rollback if needed

## Future: Separate Dev/Prod

**When you get customers:**
- Separate Shopify apps: `invoice-1-dev` and `invoice-1`
- Separate AWS resources
- Separate TOML configs: `shopify.app.dev.toml` and `shopify.app.prod.toml`

## Common Mistakes

1. `shopify app dev` overwrites URLs → **Fixed:** `automatically_update_urls_on_dev = false`
2. Deploy without testing → Always test locally first
3. Forget `shopify app deploy` after webhook changes → Only for config changes

## Emergency Rollback

```bash
aws lambda update-function-code \
  --function-name shopify-invoice-app-ShopifyAppFunction \
  --zip-file fileb://./previous-build.zip
```
