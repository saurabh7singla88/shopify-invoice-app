import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Register orders/create webhook
    const webhookResponse = await admin.graphql(
      `#graphql
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
              endpoint {
                __typename
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          topic: "ORDERS_CREATE",
          webhookSubscription: {
            callbackUrl: `${process.env.SHOPIFY_APP_URL}/webhooks/orders/create`,
            format: "JSON",
          },
        },
      }
    );

    const responseJson: any = await webhookResponse.json();
    const { data, errors } = responseJson;

    if (errors || data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
      console.error("Webhook registration errors:", 
        errors || data?.webhookSubscriptionCreate?.userErrors);
      return Response.json({ 
        success: false, 
        error: errors || data?.webhookSubscriptionCreate?.userErrors 
      });
    }

    console.log("Webhook registered successfully:", 
      data?.webhookSubscriptionCreate?.webhookSubscription);

    return Response.json({ 
      success: true, 
      webhook: data?.webhookSubscriptionCreate?.webhookSubscription 
    });
  } catch (error) {
    console.error("Error registering webhook:", error);
    return Response.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
};

export default function SetupPage() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>App Setup</h1>
      <p>Setting up webhooks...</p>
      <form method="post">
        <button type="submit">Register Order Webhooks</button>
      </form>
    </div>
  );
}
