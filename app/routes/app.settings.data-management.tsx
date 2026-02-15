import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useActionData, Form } from "react-router";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";
import dynamodb from "../db.server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  // Get data counts for display
  const shop = session.shop;
  
  try {
    // Count orders
    const ordersResult = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAMES.ORDERS,
      IndexName: "shop-timestamp-index",
      KeyConditionExpression: "shop = :shop",
      ExpressionAttributeValues: { ":shop": shop },
      Select: "COUNT"
    }));
    
    // Count invoices
    const invoicesResult = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAMES.INVOICES,
      IndexName: "shop-createdAt-index",
      KeyConditionExpression: "shop = :shop",
      ExpressionAttributeValues: { ":shop": shop },
      Select: "COUNT"
    }));
    
    // Count GST items
    const gstItemsResult = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
      KeyConditionExpression: "shop = :shop",
      ExpressionAttributeValues: { ":shop": shop },
      Select: "COUNT"
    }));
    
    return {
      shop,
      counts: {
        orders: ordersResult.Count || 0,
        invoices: invoicesResult.Count || 0,
        gstItems: gstItemsResult.Count || 0
      }
    };
  } catch (error) {
    console.error("Error loading data counts:", error);
    return {
      shop,
      counts: { orders: 0, invoices: 0, gstItems: 0 }
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const shop = session.shop;

  if (action === "export") {
    try {
      // Check total order count first
      const orderCountResult = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAMES.ORDERS,
        IndexName: "shop-timestamp-index",
        KeyConditionExpression: "shop = :shop",
        ExpressionAttributeValues: { ":shop": shop },
        Select: "COUNT"
      }));

      const totalOrders = orderCountResult.Count || 0;

      // If more than 5000 orders, return message without exporting
      if (totalOrders > 5000) {
        return {
          success: false,
          action: "export",
          error: `Your store has ${totalOrders.toLocaleString()} orders. For data exports larger than 5,000 orders, please contact support@gstgo.app for a complete data export.`,
          isLargeDataset: true
        };
      }

      // Fetch all shop data (with 5000 limit on orders)
      const [orders, invoices, gstItems, shopConfig, templateConfigs] = await Promise.all([
        // Orders (limited to 5000)
        dynamodb.send(new QueryCommand({
          TableName: TABLE_NAMES.ORDERS,
          IndexName: "shop-timestamp-index",
          KeyConditionExpression: "shop = :shop",
          ExpressionAttributeValues: { ":shop": shop },
          Limit: 5000
        })),
        
        // Invoices
        dynamodb.send(new QueryCommand({
          TableName: TABLE_NAMES.INVOICES,
          IndexName: "shop-createdAt-index",
          KeyConditionExpression: "shop = :shop",
          ExpressionAttributeValues: { ":shop": shop }
        })),
        
        // GST Items
        dynamodb.send(new QueryCommand({
          TableName: TABLE_NAMES.SHOPIFY_ORDER_ITEMS,
          KeyConditionExpression: "shop = :shop",
          ExpressionAttributeValues: { ":shop": shop }
        })),
        
        // Shop Config
        dynamodb.send(new QueryCommand({
          TableName: TABLE_NAMES.SHOPS,
          KeyConditionExpression: "shop = :shop",
          ExpressionAttributeValues: { ":shop": shop }
        })),
        
        // Template Configs
        dynamodb.send(new QueryCommand({
          TableName: TABLE_NAMES.TEMPLATE_CONFIGURATIONS,
          KeyConditionExpression: "shop = :shop",
          ExpressionAttributeValues: { ":shop": shop }
        }))
      ]);

      const exportData = {
        exportDate: new Date().toISOString(),
        shop,
        data: {
          orders: orders.Items || [],
          invoices: invoices.Items || [],
          gstReportingItems: gstItems.Items || [],
          shopConfiguration: shopConfig.Items || [],
          templateConfigurations: templateConfigs.Items || []
        },
        metadata: {
          totalOrders: orders.Items?.length || 0,
          totalInvoices: invoices.Items?.length || 0,
          totalGSTItems: gstItems.Items?.length || 0
        }
      };

      return {
        success: true,
        action: "export",
        data: exportData
      };
    } catch (error) {
      console.error("Error exporting data:", error);
      return {
        success: false,
        action: "export",
        error: "Failed to export data. Please try again."
      };
    }
  }

  if (action === "request-deletion") {
    try {
      const reason = formData.get("reason") as string;
      
      // Log deletion request to audit table
      const { logAuditEvent } = await import("../services/dynamodb.server");
      await logAuditEvent(shop, "DATA_DELETION_REQUESTED", {
        requestedAt: new Date().toISOString(),
        reason: reason || "Not specified"
      });

      console.log(`[Data Deletion Request] Shop: ${shop}, Reason: ${reason}`);

      return {
        success: true,
        action: "request-deletion",
        message: "Deletion request submitted. Our team will contact you within 48 hours."
      };
    } catch (error) {
      console.error("Error logging deletion request:", error);
      return {
        success: false,
        action: "request-deletion",
        error: "Failed to submit request. Please try again."
      };
    }
  }

  return { success: false, error: "Invalid action" };
};

export default function DataManagement() {
  const { shop, counts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  // Trigger download when export data is available
  useEffect(() => {
    if (actionData?.success && actionData.action === "export" && actionData.data) {
      const blob = new Blob([JSON.stringify(actionData.data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gstgo-data-export-${shop}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  }, [actionData, shop]);

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Data Management</h2>
      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>
        Manage your data retention, export, and deletion preferences
      </p>

      {/* Data Retention Information */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Data Retention Periods</h3>
        <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
            <div>
              <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>Orders & Invoices</div>
              <div style={{ color: '#6b7280' }}>7 years (tax compliance)</div>
            </div>
            <div>
              <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>GST Reporting Data</div>
              <div style={{ color: '#6b7280' }}>7 years (tax compliance)</div>
            </div>
            <div>
              <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>Session Data</div>
              <div style={{ color: '#6b7280' }}>90 days (auto-deleted)</div>
            </div>
            <div>
              <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>Audit Logs</div>
              <div style={{ color: '#6b7280' }}>2 years</div>
            </div>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
          💡 Retention periods are mandated by Indian Income Tax Act and GST regulations
        </p>
      </section>

      {/* Current Data Overview */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Your Data Overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '24px', fontWeight: '600', color: '#111827' }}>{counts.orders}</div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Orders</div>
          </div>
          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '24px', fontWeight: '600', color: '#111827' }}>{counts.invoices}</div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Invoices</div>
          </div>
          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '24px', fontWeight: '600', color: '#111827' }}>{counts.gstItems}</div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>GST Records</div>
          </div>
        </div>
      </section>

      {/* Export Data */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Export Your Data</h3>
        <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e40af', marginBottom: '4px' }}>
                Download Complete Data Export
              </div>
              <div style={{ fontSize: '13px', color: '#1e3a8a' }}>
                Export all orders, invoices, GST records, and configurations as JSON file
              </div>
            </div>
            <Form method="post">
              <input type="hidden" name="action" value="export" />
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                📥 Export Data
              </button>
            </Form>
          </div>
          {actionData?.success && actionData.action === "export" && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#15803d', fontWeight: '500' }}>
              ✅ Data exported successfully! Download started.
            </div>
          )}
          {actionData?.success === false && actionData.action === "export" && (
            <div style={{ 
              marginTop: '12px', 
              padding: actionData.isLargeDataset ? '12px' : '0',
              backgroundColor: actionData.isLargeDataset ? '#fef3c7' : 'transparent',
              border: actionData.isLargeDataset ? '1px solid #fcd34d' : 'none',
              borderRadius: actionData.isLargeDataset ? '6px' : '0',
              fontSize: '13px', 
              color: actionData.isLargeDataset ? '#92400e' : '#dc2626'
            }}>
              {actionData.isLargeDataset ? '⚠️' : '❌'} {actionData.error}
            </div>
          )}
        </div>
      </section>

      {/* Request Data Deletion */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: '#dc2626' }}>
          Request Data Deletion
        </h3>
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#991b1b', marginBottom: '4px' }}>
              Need to Delete Your Data?
            </div>
            <div style={{ fontSize: '13px', color: '#7f1d1d', marginBottom: '8px' }}>
              Due to tax compliance requirements (7-year retention mandate), data deletion requests 
              must be reviewed by our team to ensure legal obligations are met.
            </div>
          </div>

          <div style={{ 
            padding: '12px', 
            backgroundColor: '#fff7ed', 
            border: '1px solid #fed7aa',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '12px',
            color: '#92400e'
          }}>
            <strong>📋 Process:</strong>
            <ol style={{ paddingLeft: '20px', marginTop: '4px', marginBottom: 0 }}>
              <li>Submit deletion request below</li>
              <li>Our team will review within 48 hours</li>
              <li>We'll verify legal requirements are met</li>
              <li>Data will be deleted after confirmation</li>
            </ol>
          </div>

          {!showDeleteWarning ? (
            <button
              onClick={() => setShowDeleteWarning(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Submit Deletion Request
            </button>
          ) : (
            <Form method="post">
              <input type="hidden" name="action" value="request-deletion" />
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#7f1d1d', display: 'block', marginBottom: '6px' }}>
                  Reason for deletion (optional):
                </label>
                <textarea
                  name="reason"
                  placeholder="e.g., Switching to another app, No longer need invoicing..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #fca5a5',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>
              <div style={{ 
                padding: '8px 12px', 
                backgroundColor: '#fee2e2', 
                borderRadius: '4px',
                fontSize: '12px',
                color: '#7f1d1d',
                marginBottom: '12px'
              }}>
                By submitting this request, you acknowledge that we'll contact you at your shop's email 
                address to confirm the deletion.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Submit Request
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteWarning(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </Form>
          )}

          {actionData?.success && actionData.action === "request-deletion" && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '6px' }}>
              <div style={{ fontSize: '13px', color: '#065f46', fontWeight: '500' }}>
                ✅ Request Submitted Successfully
              </div>
              <div style={{ fontSize: '12px', color: '#047857', marginTop: '4px' }}>
                Our team will review your request and contact you at your shop's email within 48 hours.
              </div>
            </div>
          )}
          {actionData?.success === false && actionData.action === "request-deletion" && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#dc2626' }}>
              ❌ {actionData.error}
            </div>
          )}
        </div>
      </section>

      {/* GDPR Info */}
      <section>
        <div style={{ 
          padding: '12px 16px', 
          backgroundColor: '#f3f4f6', 
          borderRadius: '6px',
          fontSize: '12px',
          color: '#6b7280'
        }}>
          <strong>Your Rights:</strong> Under GDPR and Indian data protection laws, you have the right to access, 
          rectify, export, and delete your personal data. For questions, contact support@gstgo.app
        </div>
      </section>
    </div>
  );
}
