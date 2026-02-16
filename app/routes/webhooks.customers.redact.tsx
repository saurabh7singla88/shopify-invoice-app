import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { logAuditEvent } from "../services/dynamodb.server";
import { archiveWebhookPayload } from "../services/s3.server";

/**
 * GDPR Compliance Webhook: customers/redact
 * 
 * Handles customer data deletion requests (GDPR Article 17 - Right to be forgotten).
 * When a customer requests deletion of their data, this webhook is triggered.
 * 
 * Required action: Delete all customer personal data within 30 days.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  console.log(`[customers/redact] Received for shop: ${shop}`);
  console.log(`[customers/redact] Payload:`, JSON.stringify(payload, null, 2));

  // Archive webhook payload to S3 (data loss prevention)
  await archiveWebhookPayload(shop, "customers/redact", payload);

  try {
    const { customer, orders_to_redact } = payload as {
      customer: {
        id: number;
        email: string;
        phone: string | null;
      };
      orders_to_redact: number[];
    };

    console.log(`[customers/redact] Customer ID: ${customer.id}, Email: ${customer.email}`);
    console.log(`[customers/redact] Orders to redact: ${orders_to_redact.join(", ")}`);

    // Log to audit table
    await logAuditEvent(shop, "GDPR_CUSTOMER_REDACT", {
      customerId: customer.id,
      customerEmail: customer.email,
      ordersToRedact: orders_to_redact,
      requestedAt: new Date().toISOString(),
      status: "pending",
    });

    // TODO: Implement actual data deletion logic
    // 1. Query ShopifyOrders table for customer's orders
    // 2. Redact customer name, email, phone, address (keep order for tax records)
    // 3. Update ShopifyOrderItems to remove personal data
    // 4. Optionally delete invoice PDFs from S3 (or redact customer info)
    // 5. Log deletion for audit trail

    // For GST compliance, we may need to retain invoice data for 6 years
    // So we should REDACT rather than DELETE (replace with anonymized data)

    console.log(`[customers/redact] Customer data redaction logged. Will process within 30 days.`);

    return new Response("Customer redaction request received", { status: 200 });
  } catch (error) {
    console.error(`[customers/redact] Error processing redaction:`, error);
    return new Response("Error processing redaction", { status: 500 });
  }
};
