/**
 * Billing Helper Utilities
 * Provides consistent billing checks based on plan name
 * 
 * Note: Dev billing overrides are now handled at the database level
 * in dynamodb.server.ts getShopBillingPlan() function
 *
 * ENABLE_DEV_BILLING (env var) — bypass Shopify billing entirely, return a fake
 * premium plan. Used during development to test premium features without a real
 * subscription. Handled in getShopBillingPlan() in dynamodb.server.ts.
 */

/**
 * Whether to create test charges (no real money).
 *
 * Controlled by BILLING_TEST_MODE env var (set in CloudFormation):
 *   "true"  → test charges  — use for dev stores, Shopify review, staging
 *   "false" → real charges  — use only for production with real merchant stores
 *
 * IMPORTANT: Shopify development stores ONLY support test charges.
 * Setting this to false on a dev store causes "Error while billing the store".
 *
 * To go live: update CloudFormation parameter BillingTestMode → "false" and redeploy.
 */
export function isBillingTestMode(): boolean {
  // Default to true if env var not set (safe fallback — never breaks on dev stores)
  return process.env.BILLING_TEST_MODE !== "false";
}

/**
 * Whether to use Shopify Managed Pricing instead of the Billing API.
 *
 * Controlled by BILLING_MODE env var (set in CloudFormation):
 *   "api"     → Billing API mode (default) — app calls billing.request() to create charges.
 *               Plans must be defined in shopify.server.ts billing config.
 *   "managed" → Managed Pricing mode — Shopify handles all billing UI at install/plan change.
 *               Plans are defined in the Shopify Partner Dashboard only.
 *               billing.request() is NEVER called; merchants manage plans via
 *               https://{shop}/admin/charges/{apiKey}/pricing_plans
 *
 * NOTE: These two modes are mutually exclusive. If the Partner Dashboard app has
 * "Managed Pricing" enabled, using Billing API mode will throw
 * "Managed Pricing Apps cannot use the Billing API".
 *
 * To switch modes: update CloudFormation parameter BillingMode → "managed" (or "api") and redeploy.
 */
export function isManagedPricingMode(): boolean {
  return process.env.BILLING_MODE === "managed";
}

/**
 * Check if user has access to GSTR reports (Basic, Premium, or Advanced)
 * Case-insensitive — works with both Billing API names ("Basic Monthly") and
 * Managed Pricing names ("basic").
 */
export function hasGSTRAccess(planName: string): boolean {
  const tier = planName.toLowerCase();
  return tier !== "free";
}

/**
 * Check if user has access to multiple templates (Premium or Advanced)
 * Case-insensitive.
 */
export function hasMultipleTemplates(planName: string): boolean {
  const tier = planName.toLowerCase();
  return tier.includes("premium") || tier.includes("advanced");
}

/**
 * Check if user has priority support (Advanced only)
 * Case-insensitive.
 */
export function hasPrioritySupport(planName: string): boolean {
  return planName.toLowerCase().includes("advanced");
}

/**
 * Get order limit based on plan
 */
export function getOrderLimit(planName: string): number | null {
  const tier = planName.toLowerCase();
  if (tier === "free") return 50;
  if (tier.includes("basic")) return 250;
  if (tier.includes("premium")) return 3000;
  if (tier.includes("advanced")) return null; // Unlimited
  return 50; // Default to Free
}

/**
 * Get plan tier for display (Free, Basic, Premium, Advanced)
 * Case-insensitive — works with both Billing API names and Managed Pricing names.
 */
export function getPlanTier(planName: string): string {
  const tier = planName.toLowerCase();
  if (tier === "free") return "Free";
  if (tier.includes("basic")) return "Basic";
  if (tier.includes("premium")) return "Premium";
  if (tier.includes("advanced")) return "Advanced";
  return "Free";
}
