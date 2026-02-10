import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { hasPrioritySupport as checkPrioritySupport } from "../utils/billing-helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  
  // Check if user has Advanced plan for Priority Support
  const billingCheck = await billing.check({
    plans: ["Advanced Monthly", "Advanced Annual"],
    isTest: process.env.NODE_ENV !== "production",
  });
  
  let currentPlan = "Free";
  if (billingCheck.appSubscriptions.length > 0) {
    currentPlan = billingCheck.appSubscriptions[0].name;
  }
  
  const hasPrioritySupport = checkPrioritySupport(currentPlan);
  
  // Extract URL params for embedded app context
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const shop = url.searchParams.get("shop");
  
  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    host: host || "",
    shop: shop || "",
    hasPrioritySupport,
  };
};

export default function App() {
  const { apiKey, host, shop, hasPrioritySupport } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey} host={host}>
      <s-app-nav>
        <s-link href="/app">Orders</s-link>
        <s-link href="/app/templates">Templates</s-link>
        <s-link href="/app/reports">Reports</s-link>
        <s-link href="/app/settings/setup-guide">Settings</s-link>
        <s-link href="/app/pricing">Pricing</s-link>
        {hasPrioritySupport && (
          <div style={{ 
            marginTop: 'auto', 
            padding: '12px 16px', 
            borderTop: '1px solid #e5e7eb' 
          }}>
            <div style={{ 
              backgroundColor: '#f0fdf4', 
              border: '1px solid #86efac', 
              borderRadius: '8px', 
              padding: '12px',
              fontSize: '13px'
            }}>
              <div style={{ fontWeight: '600', color: '#166534', marginBottom: '4px' }}>
                ⭐ Priority Support
              </div>
              <div style={{ color: '#15803d', fontSize: '12px', marginBottom: '8px' }}>
                Need help? Get priority assistance
              </div>
              <a 
                href="mailto:support@invoiceninja.com?subject=Priority Support Request"
                style={{
                  display: 'inline-block',
                  padding: '6px 12px',
                  backgroundColor: '#22c55e',
                  color: 'white',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500',
                  textDecoration: 'none'
                }}
              >
                Contact Support
              </a>
            </div>
          </div>
        )}
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
