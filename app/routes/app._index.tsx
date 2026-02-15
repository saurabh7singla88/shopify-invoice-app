import { useEffect, useState } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useSearchParams, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrderLimit, getPlanTier } from "../utils/billing-helpers";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import dynamodb from "../db.server";
import { S3Client } from "@aws-sdk/client-s3";

import { TABLE_NAMES } from "../constants/tables";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  
  // Check current billing plan for order limits
  const billingCheck = await billing.check({
    plans: [
      "Basic Monthly", "Basic Annual",
      "Premium Monthly", "Premium Annual",
      "Advanced Monthly", "Advanced Annual"
    ],
    isTest: process.env.NODE_ENV !== "production",
  });
  
  let currentPlan = "Free";
  
  if (billingCheck.appSubscriptions.length > 0) {
    const subscription = billingCheck.appSubscriptions[0];
    currentPlan = subscription.name;
  }
  
  const orderLimit = getOrderLimit(currentPlan);
  
  // Update billing plan in Shops table for webhook access
  try {
    await dynamodb.send(new (await import("@aws-sdk/lib-dynamodb")).UpdateCommand({
      TableName: TABLE_NAMES.SHOPS,
      Key: { shop: session.shop },
      UpdateExpression: "SET billingPlan = :plan, updatedAt = :now",
      ExpressionAttributeValues: {
        ":plan": currentPlan,
        ":now": Date.now(),
      },
    }));
  } catch (error) {
    console.error("Error updating billing plan in Shops table:", error);
  }
  
  // Setup shop in background (non-blocking)
  setupShop(session.shop, session.accessToken, session.scope || "");
  
  const TABLE_NAME = TABLE_NAMES.ORDERS;
  const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "";
  const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    
    // Fetch all items to ensure proper sorting
    let allItems: any[] = [];
    let lastEvaluatedKey: any = undefined;

    do {
      const queryParams: any = {
        TableName: TABLE_NAME,
        IndexName: "shop-timestamp-index",
        KeyConditionExpression: "shop = :shop",
        ExpressionAttributeValues: {
          ":shop": session.shop,
        },
        ScanIndexForward: false, // Descending order (newest first)
      };

      if (lastEvaluatedKey) {
        queryParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamodb.send(new QueryCommand(queryParams));
      allItems = allItems.concat(result.Items || []);
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Sort by updatedAt/timestamp (newest first), then by order number (descending)
    const sortedOrders = allItems.sort((a: any, b: any) => {
      // Get timestamps
      const dateA = new Date(a.updatedAt || a.timestamp || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.timestamp || b.createdAt || 0).getTime();
      
      // Get date strings (without time) for comparison
      const dayA = new Date(dateA).toDateString();
      const dayB = new Date(dateB).toDateString();
      
      // If dates are different, sort by timestamp
      if (dayA !== dayB) {
        return dateB - dateA;
      }
      
      // If dates are same day, sort by order number descending (highest first)
      const orderNumA = parseInt((a.name || '').replace(/\D/g, ''), 10) || 0;
      const orderNumB = parseInt((b.name || '').replace(/\D/g, ''), 10) || 0;
      return orderNumB - orderNumA;
    });

    // Paginate after sorting
    const itemsPerPage = 10;
    const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const displayOrders = sortedOrders.slice(startIndex, endIndex);

    // Calculate stats from ALL orders (not just paginated)
    // Active count based on fulfillment status, not invoice generation
    const activeCount = allItems.filter((o: any) => o.status !== 'Cancelled' && o.status !== 'Returned').length;
    const cancelledCount = allItems.filter((o: any) => o.status === 'Cancelled').length;
    const returnedCount = allItems.filter((o: any) => o.status === 'Returned').length;
    
    // Count orders this month for plan limit enforcement
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const ordersThisMonth = allItems.filter((o: any) => {
      const orderDate = new Date(o.timestamp || o.createdAt || 0);
      return orderDate >= startOfMonth && o.status !== 'Cancelled';
    }).length;

    // Calculate daily order data for the last 30 days
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      date.setHours(0, 0, 0, 0);
      return date;
    });

    const dailyOrderData = last30Days.map(date => {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const ordersOnDay = allItems.filter((o: any) => {
        const orderDate = new Date(o.timestamp || o.createdAt || 0);
        return orderDate >= date && orderDate < nextDay && o.status !== 'Cancelled';
      }).length;

      return {
        date: date.toISOString().split('T')[0],
        count: ordersOnDay
      };
    });

    return { 
      orders: displayOrders, 
      currentPage: page,
      totalPages,
      totalOrders: sortedOrders.length,
      activeCount,
      cancelledCount,
      returnedCount,
      bucketName: S3_BUCKET_NAME, 
      shop: session.shop,
      currentPlan,
      orderLimit,
      ordersThisMonth,
      dailyOrderData,
    };
  } catch (error) {
    console.error("Error loading orders:", error);
    return { 
      orders: [], 
      currentPage: 1, 
      totalPages: 1, 
      totalOrders: 0, 
      activeCount: 0,
      cancelledCount: 0,
      returnedCount: 0,
      bucketName: S3_BUCKET_NAME, 
      shop: session.shop,
      currentPlan: "Free",
      orderLimit: 50,
      ordersThisMonth: 0,
      dailyOrderData: [],
      error: String(error) 
    };
  }
};

export default function Index() {
  const { orders, currentPage, totalPages, totalOrders, activeCount, cancelledCount, returnedCount, bucketName, shop, currentPlan, orderLimit, ordersThisMonth, dailyOrderData, error } = useLoaderData<typeof loader>();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  
  const isOverLimit = orderLimit !== null && ordersThisMonth >= orderLimit;

  // Set isClient after hydration to prevent mismatch
  useEffect(() => {
    console.log('[Index] Component mounted, currentPage:', currentPage, 'totalPages:', totalPages);
    setIsClient(true);
  }, []);

  const handleNextPage = () => {
    console.log('[handleNextPage] Called, currentPage:', currentPage, 'totalPages:', totalPages);
    if (currentPage < totalPages) {
      console.log('[handleNextPage] Setting page to:', currentPage + 1);
      setSearchParams({ page: String(currentPage + 1) });
    }
  };

  const handlePrevPage = () => {
    console.log('[handlePrevPage] Called, currentPage:', currentPage);
    if (currentPage > 1) {
      console.log('[handlePrevPage] Setting page to:', currentPage - 1);
      setSearchParams({ page: String(currentPage - 1) });
    }
  };

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
      alert(`Failed to download invoice: ${(err as Error).message}`);
    } finally {
      // Ensure loading indicator shows for at least 1.5 seconds
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 1500 - elapsed);
      
      await new Promise(resolve => setTimeout(resolve, remainingTime));
      setDownloading(null);
    }
  };

  const printInvoice = async (orderName: string, s3Key: string) => {
    try {
      const response = await fetch('/api/download-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3Key })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Open PDF in new window and trigger print
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
      
      // Clean up after a delay
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error('[PRINT] Error printing invoice:', err);
      alert(`Failed to print invoice: ${(err as Error).message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      'Generated': 'success',
      'Fulfilled': 'success',
      'Partially Fulfilled': 'attention',
      'On Hold': 'warning',
      'Cancelled': 'critical',
      'Returned': 'warning',
      'Created': 'default',
    };
    return statusColors[status] || 'default';
  };

  // Calculate chart dimensions and data points
  const chartWidth = 800;
  const chartHeight = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  const maxOrders = Math.max(...(dailyOrderData?.map((d: any) => d.count) || [1]), 1);
  const xStep = innerWidth / Math.max((dailyOrderData?.length || 1) - 1, 1);
  
  const points = (dailyOrderData || []).map((d: any, i: number) => {
    const x = padding.left + i * xStep;
    const y = padding.top + innerHeight - (d.count / maxOrders) * innerHeight;
    return { x, y, count: d.count, date: d.date };
  });
  
  const pathData = points.length > 0 
    ? `M ${points.map((p: any) => `${p.x},${p.y}`).join(' L ')}`
    : '';

  const areaPathData = points.length > 0
    ? `M ${padding.left},${padding.top + innerHeight} L ${points.map((p: any) => `${p.x},${p.y}`).join(' L ')} L ${padding.left + innerWidth},${padding.top + innerHeight} Z`
    : '';

  return (
    <s-page heading="Invoice Ninja">
      <s-section>
        {error && (
          <s-banner tone="critical">
            <s-text>Error loading orders: {error}</s-text>
          </s-banner>
        )}

        {/* Order Trend Chart */}
        {dailyOrderData && dailyOrderData.length > 0 && (
          <div style={{ 
            backgroundColor: 'white', 
            padding: '24px', 
            borderRadius: '12px', 
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: '0 0 4px 0' }}>
                Order Trend (Last 30 Days)
              </h2>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                Daily order volume over the past month
              </p>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <svg width={chartWidth} height={chartHeight} style={{ display: 'block' }}>
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                  const y = padding.top + innerHeight * (1 - ratio);
                  return (
                    <g key={i}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={padding.left + innerWidth}
                        y2={y}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                        strokeDasharray="3,3"
                      />
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="#6b7280"
                      >
                        {Math.round(maxOrders * ratio)}
                      </text>
                    </g>
                  );
                })}

                {/* Area fill */}
                <path
                  d={areaPathData}
                  fill="url(#areaGradient)"
                  opacity="0.3"
                />

                {/* Line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data points */}
                {points.map((point: any, i: number) => (
                  <circle
                    key={i}
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill="white"
                    stroke="#6366f1"
                    strokeWidth="2"
                  >
                    <title>{`${new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${point.count} orders`}</title>
                  </circle>
                ))}

                {/* X-axis labels (show every 5 days) */}
                {points.filter((_: any, i: number) => i % 5 === 0 || i === points.length - 1).map((point: any, i: number) => (
                  <text
                    key={i}
                    x={point.x}
                    y={padding.top + innerHeight + 20}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#6b7280"
                  >
                    {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </text>
                ))}

                {/* Gradient definition */}
                <defs>
                  <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        )}
        
        {isOverLimit && (
          <div style={{
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', color: '#92400e' }}>
                Monthly Order Limit Reached
              </div>
              <div style={{ fontSize: '13px', color: '#78350f', marginTop: '4px' }}>
                You've processed {ordersThisMonth} out of {orderLimit} orders this month on the {currentPlan} plan.
                Upgrade to process more orders.
              </div>
            </div>
            <Link
              to="/app/pricing"
              style={{
                padding: '8px 16px',
                backgroundColor: '#f59e0b',
                color: 'white',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                textDecoration: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              Upgrade Plan
            </Link>
          </div>
        )}
        
        {!isOverLimit && orderLimit !== null && ordersThisMonth >= orderLimit * 0.8 && (
          <div style={{
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: '#fef9c3',
            border: '1px solid #facc15',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '20px' }}>💡</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', color: '#713f12' }}>
                Approaching Order Limit
              </div>
              <div style={{ fontSize: '13px', color: '#854d0e', marginTop: '4px' }}>
                {ordersThisMonth} of {orderLimit} orders used this month. Consider upgrading before reaching your limit.
              </div>
            </div>
          </div>
        )}

        {orders.length === 0 ? (
          <s-banner tone="info">
            <s-text>No orders found. Create an order in your Shopify store to generate invoices.</s-text>
          </s-banner>
        ) : (
          <s-stack direction="block" gap="large">
            {/* Order Statistics */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ 
                flex: '1',
                minWidth: '160px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                padding: '20px', 
                borderRadius: '12px', 
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 4px 6px rgba(99, 102, 241, 0.2)'
              }}>
                <div style={{ 
                  position: 'absolute', 
                  top: '-20px', 
                  right: '-20px', 
                  width: '80px', 
                  height: '80px', 
                  borderRadius: '50%', 
                  background: 'rgba(255, 255, 255, 0.15)' 
                }} />
                <div style={{ fontSize: '36px', fontWeight: '700', color: 'white', marginBottom: '4px', position: 'relative', zIndex: 1 }}>
                  {activeCount}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: '500', position: 'relative', zIndex: 1 }}>Active Orders</div>
              </div>

              <div style={{ 
                flex: '1',
                minWidth: '160px',
                background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
                padding: '20px', 
                borderRadius: '12px', 
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 4px 6px rgba(236, 72, 153, 0.2)'
              }}>
                <div style={{ 
                  position: 'absolute', 
                  top: '-20px', 
                  right: '-20px', 
                  width: '80px', 
                  height: '80px', 
                  borderRadius: '50%', 
                  background: 'rgba(255, 255, 255, 0.15)' 
                }} />
                <div style={{ fontSize: '36px', fontWeight: '700', color: 'white', marginBottom: '4px', position: 'relative', zIndex: 1 }}>
                  {cancelledCount}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: '500', position: 'relative', zIndex: 1 }}>Cancelled</div>
              </div>

              <div style={{ 
                flex: '1',
                minWidth: '160px',
                background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                padding: '20px', 
                borderRadius: '12px', 
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 4px 6px rgba(6, 182, 212, 0.2)'
              }}>
                <div style={{ 
                  position: 'absolute', 
                  top: '-20px', 
                  right: '-20px', 
                  width: '80px', 
                  height: '80px', 
                  borderRadius: '50%', 
                  background: 'rgba(255, 255, 255, 0.15)' 
                }} />
                <div style={{ fontSize: '36px', fontWeight: '700', color: 'white', marginBottom: '4px', position: 'relative', zIndex: 1 }}>
                  {returnedCount}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: '500', position: 'relative', zIndex: 1 }}>Returned</div>
              </div>
            </div>

            {/* Section Heading */}
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
              Recent orders
            </div>

            {/* Table */}
            <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Order</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Date</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Customer</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Total</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Payment Status</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Fulfillment Status</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order: any) => (
                    <tr key={order.name} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                        {order.name}
                        {order.exchangeType === "exchange" && order.relatedOrderId && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '11px', 
                            color: '#6366f1',
                            backgroundColor: '#eef2ff',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: '500'
                          }} title={`Exchange from ${order.relatedOrderId}`}>
                            ↻ Exchange
                          </span>
                        )}
                        {order.exchangeType === "original" && order.relatedOrderId && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '11px', 
                            color: '#f59e0b',
                            backgroundColor: '#fffbeb',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: '500'
                          }} title={`Exchanged to ${order.relatedOrderId}`}>
                            ⤴ Exchanged
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', color: '#374151' }}>
                        {new Date(order.timestamp || order.updatedAt || order.createdAt || order.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', color: '#374151' }}>
                        {(() => {
                          const payload = order.payload || order;
                          // Try billing address name first (most common in webhooks)
                          if (payload.billing_address?.name) {
                            return payload.billing_address.name;
                          }
                          // Try shipping address name
                          if (payload.shipping_address?.name) {
                            return payload.shipping_address.name;
                          }
                          // Try customer name from stored field
                          if (order.customerName) {
                            return order.customerName;
                          }
                          // Try billing address first/last name
                          const billFirst = payload.billing_address?.first_name || '';
                          const billLast = payload.billing_address?.last_name || '';
                          if (billFirst || billLast) {
                            return [billFirst, billLast].filter(Boolean).join(' ');
                          }
                          // Try shipping address first/last name
                          const shipFirst = payload.shipping_address?.first_name || '';
                          const shipLast = payload.shipping_address?.last_name || '';
                          if (shipFirst || shipLast) {
                            return [shipFirst, shipLast].filter(Boolean).join(' ');
                          }
                          // Try customer first/last name
                          const custFirst = payload.customer?.first_name || '';
                          const custLast = payload.customer?.last_name || '';
                          if (custFirst || custLast) {
                            return [custFirst, custLast].filter(Boolean).join(' ');
                          }
                          // Fallback to customer ID
                          if (payload.customer?.id) {
                            return `Customer #${payload.customer.id}`;
                          }
                          return 'Guest';
                        })()}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                        {(() => {
                          // Prefer top-level total_price (updated for exchanges), fallback to payload
                          const total = order.total_price || order.payload?.total_price || order.payload?.current_total_price || '0.00';
                          const currency = order.currency || order.payload?.currency || order.payload?.presentment_currency || 'INR';
                          return `${currency} ${total}`;
                        })()}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <s-badge tone={(() => {
                          // Check top-level field first (from webhook updates), then payload
                          const status = order.financial_status || order.payload?.financial_status;
                          return status === 'paid' ? 'success' : 
                                 status === 'partially_paid' ? 'warning' : 
                                 status === 'pending' ? 'warning' : 
                                 status === 'refunded' ? 'critical' : 
                                 'neutral';
                        })()}>
                          {(() => {
                            const status = order.financial_status || order.payload?.financial_status || 'Pending';
                            // Format for display
                            return status === 'partially_paid' ? 'Partially Paid' :
                                   status === 'paid' ? 'Paid' :
                                   status === 'pending' ? 'Pending' :
                                   status === 'refunded' ? 'Refunded' :
                                   status.charAt(0).toUpperCase() + status.slice(1);
                          })()}
                        </s-badge>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <s-badge tone={getStatusBadge(order.status)}>
                            {(() => {
                              // Map fulfillment_status to display status
                              const fulfillmentStatus = order.fulfillment_status;
                              if (fulfillmentStatus === 'fulfilled') return 'Fulfilled';
                              if (fulfillmentStatus === 'partial') return 'Partially Fulfilled';
                              if (fulfillmentStatus === 'on_hold') return 'On Hold';
                              if (fulfillmentStatus === 'unfulfilled') return 'Unfulfilled';
                              // Fallback to order.status (but skip if it's "Limit Reached" - we show that separately)
                              if (order.status === 'Limit Reached') return 'Created';
                              return order.status || 'Created';
                            })()}
                          </s-badge>
                          {(order.limitReached || order.status === 'Limit Reached') && (
                            <s-badge tone="warning">
                              Limit Reached
                            </s-badge>
                          )}
                          {(order.exchangeType === "original" || order.returnType === "return") && (
                            <span style={{ 
                              fontSize: '11px', 
                              color: (() => {
                                // Check if returns are still in progress by looking at closed_at field
                                const payload = order.payload || order;
                                const returns = payload.returns || [];
                                const hasOpenReturns = returns.some((r: any) => r.closed_at === null || !r.closed_at);
                                const isExchange = order.exchangeType === "original";
                                // Show blue (in process) if returns are not closed yet
                                // Show orange/red based on type when completed
                                if (hasOpenReturns) return '#6366f1'; // Blue for in-process
                                return isExchange ? '#f59e0b' : '#ef4444'; // Orange for exchange, red for return
                              })(),
                              backgroundColor: (() => {
                                const payload = order.payload || order;
                                const returns = payload.returns || [];
                                const hasOpenReturns = returns.some((r: any) => r.closed_at === null || !r.closed_at);
                                if (hasOpenReturns) return '#eef2ff'; // Blue bg
                                return order.exchangeType === "original" ? '#fffbeb' : '#fee2e2'; // Orange/red bg
                              })(),
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: '500',
                              whiteSpace: 'nowrap'
                            }} title={(() => {
                              const payload = order.payload || order;
                              const returns = payload.returns || [];
                              const hasOpenReturns = returns.some((r: any) => r.closed_at === null || !r.closed_at);
                              const isExchange = order.exchangeType === "original";
                              const type = isExchange ? "exchange" : "return";
                              return `${hasOpenReturns ? `${type === 'exchange' ? 'Exchange' : 'Return'} in process` : `${type === 'exchange' ? 'Exchange completed' : 'Returned'}`}${order.relatedOrderId ? `: ${order.relatedOrderId}` : ''}`;
                            })()}>
                              {(() => {
                                const payload = order.payload || order;
                                const returns = payload.returns || [];
                                const hasOpenReturns = returns.some((r: any) => r.closed_at === null || !r.closed_at);
                                const isExchange = order.exchangeType === "original";
                                if (hasOpenReturns) {
                                  return isExchange ? '⏳ Exchange in process' : '⏳ Return in process';
                                }
                                return isExchange ? '↻ Exchanged' : '↩ Returned';
                              })()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {order.s3Key && (
                          <div style={{ position: 'relative', display: 'inline-flex', gap: '8px' }}>
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
                                .....
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
                                title="Download PDF"
                                style={{
                                  padding: '8px',
                                  backgroundColor: downloading === order.name ? '#9ca3af' : 'white',
                                  color: downloading === order.name ? 'white' : '#1f2937',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  cursor: downloading === order.name ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: '32px',
                                  minHeight: '32px',
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M8.5 1.5v9.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 11.293V1.5a.5.5 0 0 1 1 0z"/>
                                  <path d="M1 12.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5z"/>
                                </svg>
                              </button>
                            </form>
                            <button
                              type="button"
                              onClick={() => printInvoice(order.name, order.s3Key)}
                              title="Print PDF"
                              style={{
                                padding: '8px',
                                backgroundColor: 'white',
                                color: '#1f2937',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: '32px',
                                minHeight: '32px',
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/>
                                <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center', marginTop: '16px' }}>
                <button
                  disabled={currentPage === 1}
                  onClick={handlePrevPage}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'white',
                    color: currentPage === 1 ? '#9ca3af' : '#1f2937',
                    border: '1px solid #d1d5db',
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
                  onClick={handleNextPage}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'white',
                    color: currentPage === totalPages ? '#9ca3af' : '#1f2937',
                    border: '1px solid #d1d5db',
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
    </s-page>
  );
}

// Background shop setup (fire and forget)
function setupShop(shop: string, accessToken: string, scopes: string) {
  import("../services/dynamodb.server").then(async ({ upsertShop, getTemplateConfiguration, createDefaultTemplateConfiguration, logAuditEvent }) => {
    try {
      await upsertShop(shop, accessToken, scopes);
      
      const existingConfig = await getTemplateConfiguration(shop, "minimalist");
      if (!existingConfig) {
        await createDefaultTemplateConfiguration(shop);
        await logAuditEvent(shop, "APP_INSTALLED", { scopes, installedAt: new Date().toISOString() });
        console.log(`✅ Shop setup complete for ${shop}`);
      }
    } catch (error) {
      console.error(`❌ Shop setup error for ${shop}:`, error);
    }
  }).catch(err => console.error("Failed to load dynamodb service:", err));
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
