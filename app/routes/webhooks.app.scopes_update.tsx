import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";
import { archiveWebhookPayload } from "../services/s3.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    // Archive webhook payload to S3 (data loss prevention)
    await archiveWebhookPayload(shop, topic, payload);

    const current = payload.current as string[];
    if (session) {
        // Update session scope in DynamoDB
        session.scope = current.join(",");
        await sessionStorage.storeSession(session);
    }
    return new Response();
};
