import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // List all registered webhooks
    const webhookResponse = await admin.graphql(
      `#graphql
        query {
          webhookSubscriptions(first: 50) {
            edges {
              node {
                id
                topic
                endpoint {
                  __typename
                  ... on WebhookHttpEndpoint {
                    callbackUrl
                  }
                }
              }
            }
          }
        }
      `
    );

    const responseJson: any = await webhookResponse.json();
    const webhooks = responseJson?.data?.webhookSubscriptions?.edges || [];

    return Response.json({ 
      success: true, 
      webhooks: webhooks.map((edge: any) => edge.node)
    });
  } catch (error) {
    console.error("Error listing webhooks:", error);
    return Response.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
};

export default function WebhooksPage() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Registered Webhooks</h1>
      <p>Check API response for webhook list</p>
    </div>
  );
}
