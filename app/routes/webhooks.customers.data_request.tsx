import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { logAuditEvent } from "../services/dynamodb.server";

/**
 * GDPR Compliance Webhook: customers/data_request
 * 
 * Handles customer data access requests (GDPR Article 15).
 * When a customer requests their data, this webhook is triggered.
 * 
 * Required response: Provide all customer data stored by the app.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  console.log(`[customers/data_request] Received for shop: ${shop}`);
  console.log(`[customers/data_request] Payload:`, JSON.stringify(payload, null, 2));

  try {
    const { customer, orders_requested } = payload as {
      customer: {
        id: number;
        email: string;
        phone: string | null;
      };
      orders_requested: number[];
    };

    console.log(`[customers/data_request] Customer ID: ${customer.id}, Email: ${customer.email}`);
    console.log(`[customers/data_request] Orders requested: ${orders_requested.join(", ")}`);

    // Log to audit table
    await logAuditEvent(shop, "GDPR_DATA_REQUEST", {
      customerId: customer.id,
      customerEmail: customer.email,
      ordersRequested: orders_requested,
      requestedAt: new Date().toISOString(),
    });

    // TODO: Implement actual data collection logic
    // 1. Query DynamoDB for customer's order data
    // 2. Query S3 for customer's invoice PDFs
    // 3. Compile all data into a structured format
    // 4. Send data to customer via email or Shopify interface

    // For now, just log the request
    console.log(`[customers/data_request] Data request logged. Manual action may be required.`);

    return new Response("Data request received", { status: 200 });
  } catch (error) {
    console.error(`[customers/data_request] Error processing request:`, error);
    return new Response("Error processing data request", { status: 500 });
  }
};
