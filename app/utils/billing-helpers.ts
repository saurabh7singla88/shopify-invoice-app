/**
 * Billing Helper Utilities
 * Provides consistent billing checks based on plan name
 * 
 * Note: Dev billing overrides are now handled at the database level
 * in dynamodb.server.ts getShopBillingPlan() function
 */

/**
 * Check if user has access to GSTR reports (Basic, Premium, or Advanced)
 */
export function hasGSTRAccess(planName: string): boolean {
  return planName !== "Free";
}

/**
 * Check if user has access to multiple templates (Premium or Advanced)
 */
export function hasMultipleTemplates(planName: string): boolean {
  return planName.includes("Premium") || planName.includes("Advanced");
}

/**
 * Check if user has priority support (Advanced only)
 */
export function hasPrioritySupport(planName: string): boolean {
  return planName.includes("Advanced");
}

/**
 * Get order limit based on plan
 */
export function getOrderLimit(planName: string): number | null {
  if (planName === "Free") return 50;
  if (planName.includes("Basic")) return 250;
  if (planName.includes("Premium")) return 3000;
  if (planName.includes("Advanced")) return null; // Unlimited
  
  return 50; // Default to Free
}

/**
 * Get plan tier for display (Free, Basic, Premium, Advanced)
 */
export function getPlanTier(planName: string): string {
  if (planName === "Free") return "Free";
  if (planName.includes("Basic")) return "Basic";
  if (planName.includes("Premium")) return "Premium";
  if (planName.includes("Advanced")) return "Advanced";
  
  return "Free";
}
