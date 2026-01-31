import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await authenticate.admin(request);
  
  // Extract URL params for embedded app context
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const shop = url.searchParams.get("shop");
  
  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    host: host || "",
    shop: shop || ""
  };
};

export default function App() {
  const { apiKey, host, shop } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey} host={host}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/templates">Templates</s-link>
        <s-link href="/app/additional">Additional page</s-link>
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
