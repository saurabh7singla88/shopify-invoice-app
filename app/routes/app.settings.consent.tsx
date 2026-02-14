import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useActionData, Form } from "react-router";
import { authenticate } from "../shopify.server";
import dynamodb from "../db.server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Get shop record with consent information
    const result = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAMES.SHOPS,
      Key: { shop }
    }));

    const shopData = result.Item;
    
    return {
      shop,
      consent: {
        dataProcessing: shopData?.consent?.dataProcessing || null,
        marketingCommunications: shopData?.consent?.marketingCommunications || null,
        version: shopData?.consent?.version || null,
        lastUpdated: shopData?.consent?.lastUpdated || null
      },
      isActive: shopData?.isActive || false
    };
  } catch (error) {
    console.error("Error loading consent data:", error);
    return {
      shop,
      consent: {
        dataProcessing: null,
        marketingCommunications: null,
        version: null,
        lastUpdated: null
      },
      isActive: false
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const shop = session.shop;

  if (action === "update-consent") {
    try {
      const dataProcessing = formData.get("dataProcessing") === "true";
      const marketingCommunications = formData.get("marketingCommunications") === "true";

      // Update consent in Shops table
      await dynamodb.send(new UpdateCommand({
        TableName: TABLE_NAMES.SHOPS,
        Key: { shop },
        UpdateExpression: "SET consent = :consent, updatedAt = :now",
        ExpressionAttributeValues: {
          ":consent": {
            dataProcessing,
            marketingCommunications,
            version: "1.0",
            lastUpdated: new Date().toISOString()
          },
          ":now": Date.now()
        }
      }));

      // Log consent change to audit
      const { logAuditEvent } = await import("../services/dynamodb.server");
      await logAuditEvent(shop, "CONSENT_UPDATED", {
        dataProcessing,
        marketingCommunications,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: "Consent preferences updated successfully"
      };
    } catch (error) {
      console.error("Error updating consent:", error);
      return {
        success: false,
        error: "Failed to update consent preferences"
      };
    }
  }

  return { success: false, error: "Invalid action" };
};

export default function ConsentManagement() {
  const { shop, consent, isActive } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Auto-consent given when app is installed
  const hasGivenConsent = consent.dataProcessing !== null;
  const consentDate = consent.lastUpdated ? new Date(consent.lastUpdated).toLocaleDateString() : "Not set";

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Customer Consent & Data Processing</h2>
      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>
        Manage how customer data is processed and track consent history
      </p>

      {/* Auto-Consent Disclaimer */}
      <section style={{ marginBottom: '24px' }}>
        <div style={{ 
          backgroundColor: '#eff6ff', 
          border: '1px solid #bfdbfe', 
          borderRadius: '8px', 
          padding: '16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'start'
        }}>
          <div style={{ fontSize: '20px', marginTop: '2px' }}>ℹ️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af', marginBottom: '6px' }}>
              Automatic Consent on Installation
            </div>
            <div style={{ fontSize: '13px', color: '#1e3a8a', lineHeight: '1.5' }}>
              By installing this app, you automatically consent to customer data processing for invoice generation. 
              This is required for the app to function. Your consent is recorded as:
            </div>
            <ul style={{ fontSize: '13px', color: '#1e3a8a', marginTop: '8px', marginBottom: '0', paddingLeft: '20px' }}>
              <li><strong>Customer Data Processing:</strong> ✅ Enabled (Required)</li>
              <li><strong>Marketing Communications:</strong> ❌ Disabled (You can opt-in below)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Current Consent Status */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Current Status</h3>
        <div style={{ 
          backgroundColor: hasGivenConsent ? '#f0fdf4' : '#fef2f2', 
          border: `1px solid ${hasGivenConsent ? '#bbf7d0' : '#fecaca'}`, 
          borderRadius: '8px', 
          padding: '16px' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ 
              fontSize: '24px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: hasGivenConsent ? '#dcfce7' : '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {hasGivenConsent ? '✓' : '⚠️'}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: hasGivenConsent ? '#166534' : '#991b1b' }}>
                {hasGivenConsent ? 'Active Consent' : 'Consent Required'}
              </div>
              <div style={{ fontSize: '13px', color: hasGivenConsent ? '#15803a' : '#7f1d1d' }}>
                {hasGivenConsent 
                  ? `Last updated: ${consentDate} • Version ${consent.version || '1.0'}`
                  : 'Please review and accept data processing consent below'
                }
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Data We Collect */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Data We Process</h3>
        <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#374151' }}>
            <p style={{ marginBottom: '12px', fontWeight: '500' }}>
              To generate GST-compliant invoices, we process the following customer data from your Shopify orders:
            </p>
            <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
              <li><strong>Customer Information:</strong> Name, email</li>
              <li><strong>Billing Address:</strong> Street, city, state, postal code, country</li>
              <li><strong>Order Details:</strong> Product names, quantities, prices, tax amounts</li>
              <li><strong>Business Data:</strong> GSTIN (if provided), company name</li>
            </ul>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
              ℹ️ This data is used solely for invoice generation and GST compliance. We retain this data for 7 years as required by Indian tax law.
            </p>
          </div>
        </div>
      </section>

      {/* Legal Basis */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Legal Basis for Processing</h3>
        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#78350f' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>📋 Contractual Necessity:</strong> Processing customer data is necessary to fulfill our contract with you (generating invoices).
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong>⚖️ Legal Obligation:</strong> GST law requires maintaining customer and transaction records for tax compliance.
            </div>
            <div>
              <strong>🎯 Legitimate Interest:</strong> Providing accurate invoicing services for your business operations.
            </div>
          </div>
        </div>
      </section>

      {/* Consent Management Form */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Manage Consent Preferences</h3>
        <Form method="post">
          <input type="hidden" name="action" value="update-consent" />
          <input type="hidden" name="dataProcessing" value="true" />
          
          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
            {/* Required Consent - Display Only */}
            <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <div style={{ 
                  marginTop: '4px', 
                  width: '16px', 
                  height: '16px',
                  backgroundColor: '#10b981',
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  ✓
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '14px', fontWeight: '500', color: '#111827', display: 'block', marginBottom: '4px' }}>
                    Customer Data Processing (Always Active) *
                  </label>
                  <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                    Processing customer information from Shopify orders for generating GST-compliant invoices. 
                    This includes customer names, addresses, order details, and tax information.
                  </p>
                  <div style={{ fontSize: '12px', color: '#059669', fontWeight: '500', backgroundColor: '#d1fae5', padding: '6px 10px', borderRadius: '4px', display: 'inline-block', marginBottom: '8px' }}>
                    ✓ Required for app functionality - Always enabled
                  </div>
                  <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px' }}>
                    ℹ️ To withdraw this consent, you must uninstall the app.
                  </p>
                </div>
              </div>
            </div>

            {/* Optional Consent */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                <input
                  type="checkbox"
                  name="marketingCommunications"
                  value="true"
                  defaultChecked={consent.marketingCommunications === true}
                  style={{ marginTop: '4px', width: '16px', height: '16px' }}
                />
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '14px', fontWeight: '500', color: '#111827', display: 'block', marginBottom: '4px' }}>
                    Product Updates & Tips (Optional)
                  </label>
                  <p style={{ fontSize: '13px', color: '#6b7280' }}>
                    I agree to receive occasional emails about new features, GST compliance updates, and helpful tips. 
                    You can unsubscribe anytime.
                  </p>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!isActive}
              style={{
                padding: '10px 20px',
                backgroundColor: isActive ? '#2563eb' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: isActive ? 'pointer' : 'not-allowed'
              }}
            >
              Save Consent Preferences
            </button>

            {!isActive && (
              <p style={{ marginTop: '12px', fontSize: '12px', color: '#dc2626' }}>
                App must be active to update consent preferences
              </p>
            )}
          </div>
        </Form>

        {/* Action Feedback */}
        {actionData?.success && (
          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: '6px' }}>
            <div style={{ fontSize: '13px', color: '#065f46', fontWeight: '500' }}>
              ✅ {actionData.message}
            </div>
          </div>
        )}
        {actionData?.success === false && (
          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px' }}>
            <div style={{ fontSize: '13px', color: '#991b1b' }}>
              ❌ {actionData.error}
            </div>
          </div>
        )}
      </section>

      {/* Customer Rights */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Your Customer's Rights</h3>
        <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '16px' }}>
          <p style={{ fontSize: '13px', color: '#0c4a6e', marginBottom: '12px' }}>
            Your customers have the following rights regarding their data:
          </p>
          <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#075985' }}>
            <div>✓ <strong>Right to Access:</strong> Request copies of their data</div>
            <div>✓ <strong>Right to Rectification:</strong> Correct inaccurate data</div>
            <div>✓ <strong>Right to Erasure:</strong> Request deletion (subject to legal retention)</div>
            <div>✓ <strong>Right to Object:</strong> Object to processing in certain cases</div>
            <div>✓ <strong>Right to Data Portability:</strong> Receive data in machine-readable format</div>
          </div>
          <p style={{ fontSize: '12px', color: '#0c4a6e', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #bae6fd' }}>
            💬 Customer data requests should be sent to <strong>support@gstgo.app</strong>
          </p>
        </div>
      </section>

      {/* Consent Withdrawal */}
      <section>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Withdraw Consent</h3>
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
          <p style={{ fontSize: '13px', color: '#7f1d1d', marginBottom: '8px' }}>
            If you wish to withdraw consent for data processing, you must uninstall the app. 
            This will stop all new data processing immediately.
          </p>
          <p style={{ fontSize: '12px', color: '#991b1b' }}>
            ⚠️ Note: Existing data will be retained for 7 years as required by tax law. 
            To request deletion after this period, use the <strong>Data Management</strong> section.
          </p>
        </div>
      </section>
    </div>
  );
}
