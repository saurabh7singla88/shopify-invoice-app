/**
 * API Route: Billing Subscription
 * Handles plan subscription requests and redirects to Shopify's billing approval page
 */

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");

  if (!plan) {
    return new Response("Plan parameter is required", { status: 400 });
  }

  try {
    // Request billing for the selected plan
    const billingResponse = await billing.request({
      plan,
      isTest: process.env.NODE_ENV !== "production",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/pricing`,
    });

    // Redirect to Shopify's billing approval page
    return new Response(null, {
      status: 302,
      headers: {
        Location: billingResponse,
      },
    });
  } catch (error) {
    console.error("[Billing] Error requesting subscription:", error);
    return new Response("Failed to initiate billing", { status: 500 });
  }
};
