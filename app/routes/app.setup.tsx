import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const topics = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED"];
  const results = [];

  try {
    for (const topic of topics) {
      // Map topic to endpoint: 
      // ORDERS_CREATE -> /webhooks/orders/create
      // ORDERS_UPDATED -> /webhooks/orders/updated
      // ORDERS_CANCELLED -> /webhooks/orders/cancelled
      const subpath = topic.toLowerCase().replace("_", "/");
      const callbackUrl = `${process.env.SHOPIFY_APP_URL}/webhooks/${subpath}`;
      
      const webhookResponse = await admin.graphql(
        `#graphql
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            topic,
            webhookSubscription: {
              callbackUrl,
              format: "JSON",
            },
          },
        }
      );

      const responseJson: any = await webhookResponse.json();
      const { data, errors } = responseJson;

      if (errors || data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
        console.error(`Error registering ${topic}:`, errors || data?.webhookSubscriptionCreate?.userErrors);
        results.push({ topic, success: false, error: errors || data?.webhookSubscriptionCreate?.userErrors });
      } else {
        console.log(`Registered ${topic} successfully`);
        results.push({ topic, success: true, webhook: data?.webhookSubscriptionCreate?.webhookSubscription });
      }
    }

    return Response.json({ success: true, results });
  } catch (error) {
    console.error("Error registering webhooks:", error);
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
