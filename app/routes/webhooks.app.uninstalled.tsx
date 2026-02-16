import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";
import { markShopUninstalled, logAuditEvent } from "../services/dynamodb.server";
import { archiveWebhookPayload } from "../services/s3.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Archive webhook payload to S3 (data loss prevention)
  await archiveWebhookPayload(shop, topic, { shop, uninstalledAt: new Date().toISOString() });

  try {
    await markShopUninstalled(shop);
    await logAuditEvent(shop, "APP_UNINSTALLED", { uninstalledAt: new Date().toISOString() });
    console.log(`✅ Shop ${shop} marked as uninstalled`);
  } catch (error) {
    console.error(`❌ Error marking shop ${shop} as uninstalled:`, error);
  }

  if (session) {
    await sessionStorage.deleteSessions([session.id]);
  }

  return new Response();
};
