import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * API endpoint to create a test order in Shopify
 * POST /api/create-test-order
 * 
 * Body (optional):
 * {
 *   "customerEmail": "test@example.com",
 *   "lineItems": [{ "variant_id": 123, "quantity": 1 }],
 *   "financial_status": "paid"
 * }
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  try {
    const body = await request.json().catch(() => ({}));

    // Default test order data
    const orderData = {
      order: {
        line_items: body.lineItems || [
          {
            title: "Test Product",
            price: "100.00",
            quantity: 1,
            taxable: true,
            tax_lines: [
              {
                title: "IGST",
                price: "18.00",
                rate: 0.18,
              },
            ],
          },
        ],
        customer: {
          first_name: "Test",
          last_name: "Customer",
          email: body.customerEmail || "test@example.com",
        },
        billing_address: {
          first_name: "Test",
          last_name: "Customer",
          address1: "123 Test Street",
          city: "Mumbai",
          province: "Maharashtra",
          country: "India",
          zip: "400001",
        },
        shipping_address: {
          first_name: "Test",
          last_name: "Customer",
          address1: "123 Test Street",
          city: "Mumbai",
          province: "Maharashtra",
          country: "India",
          zip: "400001",
        },
        financial_status: body.financial_status || "paid",
        fulfillment_status: body.fulfillment_status || null,
        send_receipt: false,
        send_fulfillment_receipt: false,
        note: "Test order created via API",
        tags: "test-order",
      },
    };

    // Create order using Shopify Admin API
    const response = await admin.rest.resources.Order.all({
      session: session,
      status: "any",
      limit: 1,
    });

    // Use GraphQL to create order (more flexible)
    const orderCreateMutation = `
      mutation orderCreate($order: OrderInput!) {
        orderCreate(order: $order) {
          order {
            id
            name
            email
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const graphQLOrderData = {
      order: {
        lineItems: (body.lineItems || orderData.order.line_items).map((item: any) => ({
          title: item.title || "Test Product",
          quantity: item.quantity || 1,
          originalUnitPrice: item.price || "100.00",
          taxable: item.taxable !== false,
        })),
        customer: {
          email: body.customerEmail || "test@example.com",
        },
        billingAddress: orderData.order.billing_address,
        shippingAddress: orderData.order.shipping_address,
        note: "Test order created via API for invoice testing",
        tags: ["test-order"],
      },
    };

    const graphqlResponse = await admin.graphql(orderCreateMutation, {
      variables: graphQLOrderData,
    });

    const result = await graphqlResponse.json();

    if (result.data?.orderCreate?.userErrors?.length > 0) {
      return Response.json(
        {
          success: false,
          errors: result.data.orderCreate.userErrors,
        },
        { status: 400 }
      );
    }

    const createdOrder = result.data?.orderCreate?.order;

    return Response.json({
      success: true,
      order: createdOrder,
      message: `Test order ${createdOrder?.name} created successfully`,
    });
  } catch (error) {
    console.error("Error creating test order:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
