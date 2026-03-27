/**
 * API Route: Billing Subscription
 * Handles plan subscription requests and redirects to Shopify's billing approval page.
 *
 * billing.request() always THROWS — it never returns.
 * - For embedded XHR requests: throws Response(401) with X-Shopify-API-Request-Failure-Reauthorize-Url header
 * - For non-embedded requests: throws a React Router redirect() to the billing URL directly
 * We handle both cases and convert to a standard 302 redirect.
 */

import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { isBillingTestMode, isManagedPricingMode } from "../utils/billing-helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  // ── Managed Pricing mode: skip billing.request(), go straight to Shopify's plan page──
  if (isManagedPricingMode()) {
    const shop = session.shop;
    const apiKey = process.env.SHOPIFY_API_KEY || "";
    return redirect(`https://${shop}/admin/charges/${apiKey}/pricing_plans`);
  }

  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");

  if (!plan) {
    return new Response("Plan parameter is required", { status: 400 });
  }

  try {
    const billingParams = {
      plan,
      isTest: isBillingTestMode(),
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/pricing`,
    };
    console.log("[Billing] Calling appSubscriptionCreate GraphQL mutation:", JSON.stringify(billingParams));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (billing.request as any)(billingParams);
    // Never reached
    return new Response(null, { status: 200 });
  } catch (error: any) {
    if (error instanceof Response) {
      // Case 1: embedded XHR — 401 with reauth URL header
      const reauthUrl = error.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url");
      if (reauthUrl) {
        return redirect(reauthUrl);
      }
      // Case 2: exitIframe or direct redirect — has Location header
      const location = error.headers.get("Location");
      if (location) {
        return redirect(location);
      }
      // Unknown Response — re-throw for React Router to handle
      throw error;
    }
    // Real error
    console.error("[Billing] Error requesting subscription:", error?.message);
    return new Response(`Billing error: ${error?.message || "Unknown error"}`, { status: 500 });
  }
};
