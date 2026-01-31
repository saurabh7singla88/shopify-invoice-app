import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";
import { markShopUninstalled, logAuditEvent } from "../services/dynamodb.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

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
