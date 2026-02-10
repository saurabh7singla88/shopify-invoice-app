/**
 * Billing Helper Utilities
 * Provides consistent billing checks with development mode overrides
 */

const DEV_MODE = process.env.NODE_ENV === "development" || process.env.ENABLE_DEV_BILLING === "true";

// Set this to the plan you want to simulate in development
const DEV_PLAN = process.env.DEV_BILLING_PLAN || "Advanced Monthly"; // Change as needed: "Free", "Basic Monthly", "Premium Monthly", "Advanced Monthly"

/**
 * Get effective plan with development override
 */
export function getEffectivePlan(actualPlan: string): string {
  return DEV_MODE ? DEV_PLAN : actualPlan;
}

/**
 * Check if user has access to GSTR reports (Basic, Premium, or Advanced)
 */
export function hasGSTRAccess(planName: string): boolean {
  const effectivePlan = getEffectivePlan(planName);
  return effectivePlan !== "Free";
}

/**
 * Check if user has access to multiple templates (Premium or Advanced)
 */
export function hasMultipleTemplates(planName: string): boolean {
  const effectivePlan = getEffectivePlan(planName);
  return effectivePlan.includes("Premium") || effectivePlan.includes("Advanced");
}

/**
 * Check if user has priority support (Advanced only)
 */
export function hasPrioritySupport(planName: string): boolean {
  const effectivePlan = getEffectivePlan(planName);
  return effectivePlan.includes("Advanced");
}

/**
 * Get order limit based on plan
 */
export function getOrderLimit(planName: string): number | null {
  const effectivePlan = getEffectivePlan(planName);
  
  if (effectivePlan === "Free") return 50;
  if (effectivePlan.includes("Basic")) return 250;
  if (effectivePlan.includes("Premium")) return 3000;
  if (effectivePlan.includes("Advanced")) return null; // Unlimited
  
  return 50; // Default to Free
}

/**
 * Get plan tier for display (Free, Basic, Premium, Advanced)
 */
export function getPlanTier(planName: string): string {
  const effectivePlan = getEffectivePlan(planName);
  
  if (effectivePlan === "Free") return "Free";
  if (effectivePlan.includes("Basic")) return "Basic";
  if (effectivePlan.includes("Premium")) return "Premium";
  if (effectivePlan.includes("Advanced")) return "Advanced";
  
  return "Free";
}
