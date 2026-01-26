import { useEffect, useState } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import dynamodb from "../db.server";
import { S3Client } from "@aws-sdk/client-s3";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const TABLE_NAME = process.env.ORDERS_TABLE_NAME || "ShopifyOrders";
  const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "";
  const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

  try {
    // Fetch orders from DynamoDB filtered by shop
    const result = await dynamodb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "shop = :shop",
        ExpressionAttributeValues: {
          ":shop": session.shop,
        },
      })
    );

    // Sort by updatedAt/timestamp (newest first)
    const orders = (result.Items || []).sort((a: any, b: any) => {
      const dateA = new Date(a.updatedAt || a.timestamp || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.timestamp || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return { orders, bucketName: S3_BUCKET_NAME, shop: session.shop };
  } catch (error) {
    console.error("Error loading orders:", error);
    return { orders: [], bucketName: S3_BUCKET_NAME, shop: session.shop, error: String(error) };
  }
};

export default function Index() {
  const { orders, bucketName, shop, error } = useLoaderData<typeof loader>();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isClient, setIsClient] = useState(false);
  const itemsPerPage = 10;

  // Set isClient after hydration to prevent mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Pagination logic
  const totalPages = Math.ceil(orders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentOrders = orders.slice(startIndex, endIndex);

  const downloadInvoice = async (orderName: string, s3Key: string) => {
    setDownloading(orderName);
    const startTime = Date.now();
    
    try {
      const response = await fetch('/api/download-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3Key })
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('[DOWNLOAD] Error response:', errorData);
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cleanOrderName = orderName.replace('#', '');
      a.href = url;
      a.download = `invoice-${cleanOrderName}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('[DOWNLOAD] Error downloading invoice:', err);
      alert(`Failed to download invoice: ${err.message}`);
    } finally {
      // Ensure loading indicator shows for at least 1.5 seconds
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 1500 - elapsed);
      
      await new Promise(resolve => setTimeout(resolve, remainingTime));
      setDownloading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      'Generated': 'success',
      'Cancelled': 'critical',
      'Returned': 'warning',
    };
    return statusColors[status] || 'default';
  };

  return (
    <s-page heading="Invoice Management">
      <s-section>
        {error && (
          <s-banner tone="critical">
            <s-text>Error loading orders: {error}</s-text>
          </s-banner>
        )}

        {orders.length === 0 ? (
          <s-banner tone="info">
            <s-text>No orders found. Create an order in your Shopify store to generate invoices.</s-text>
          </s-banner>
        ) : (
          <s-stack direction="block" gap="large">
            <s-text variant="heading-sm">
              Showing {startIndex + 1} - {Math.min(endIndex, orders.length)} of {orders.length} orders
            </s-text>
            
            {/* Order Cards */}
            <s-stack direction="block" gap="base">
              {currentOrders.map((order: any) => {
                const isDisabled = order.status === 'Cancelled';
                
                return (
                  <s-box 
                    key={order.name}
                    padding="large"
                    borderWidth="base"
                    borderRadius="base"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Header Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <s-text variant="heading-sm">{order.name}</s-text>
                          <s-badge tone={getStatusBadge(order.status)}>
                            {order.status || 'Generated'}
                          </s-badge>
                        </div>
                        {order.s3Key && (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            {isClient && downloading === order.name && (
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '6px',
                                zIndex: 10,
                                color: 'white',
                                fontSize: '12px',
                                fontWeight: '600',
                              }}>
                                Downloading...
                              </div>
                            )}
                            <form 
                              method="post" 
                              action="/api/download-invoice"
                              onSubmit={(e) => {
                                e.preventDefault();
                                downloadInvoice(order.name, order.s3Key);
                              }}
                              style={{ display: 'inline' }}
                            >
                              <input type="hidden" name="s3Key" value={order.s3Key} />
                              <button
                                type="submit"
                                disabled={downloading === order.name}
                                style={{
                                  padding: '8px 16px',
                                  backgroundColor: downloading === order.name ? '#9ca3af' : '#2563eb',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: downloading === order.name ? 'not-allowed' : 'pointer',
                                  fontSize: '14px',
                                  fontWeight: '500',
                                }}
                              >
                                Download Invoice
                              </button>
                            </form>
                          </div>
                        )}
                      </div>

                    {/* Details Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Customer</div>
                        <div style={{ fontSize: '14px' }}>
                          {order.customer?.first_name} {order.customer?.last_name || 'N/A'}
                        </div>
                      </div>
                      
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Email</div>
                        <div style={{ fontSize: '14px' }}>{order.email || 'N/A'}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total</div>
                        <div style={{ fontSize: '14px', fontWeight: '600' }}>
                          {order.currency} {order.total_price}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Updated At</div>
                        <div style={{ fontSize: '14px' }}>
                          {new Date(order.timestamp || order.updatedAt || order.createdAt || order.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </s-box>
              );
              })}
            </s-stack>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: currentPage === 1 ? '#e5e7eb' : '#2563eb',
                    color: currentPage === 1 ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Previous
                </button>
                
                <s-text variant="body-sm">
                  Page {currentPage} of {totalPages}
                </s-text>

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: currentPage === totalPages ? '#e5e7eb' : '#2563eb',
                    color: currentPage === totalPages ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Statistics">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text variant="heading-lg">
              {orders.filter((o: any) => o.status === 'Generated' || !o.status).length}
            </s-text>
            <s-text variant="body-sm">Active Invoices</s-text>
          </s-box>
          
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text variant="heading-lg">
              {orders.filter((o: any) => o.status === 'Cancelled').length}
            </s-text>
            <s-text variant="body-sm">Cancelled</s-text>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text variant="heading-lg">
              {orders.filter((o: any) => o.status === 'Returned').length}
            </s-text>
            <s-text variant="body-sm">Returned</s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Quick Links">
        <s-stack direction="block" gap="base">
          <s-link href="/app/webhooks">Manage Webhooks</s-link>
          <s-link href="/app/setup">Setup Webhooks</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
