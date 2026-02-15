import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function PrivacyPolicy() {
  return (
    <s-page heading="Privacy Policy">
      <s-section>
        <div style={{ maxWidth: '800px', fontSize: '14px', lineHeight: '1.8', color: '#374151' }}>
          
          {/* Last Updated */}
          <div style={{ 
            padding: '12px 16px', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '6px', 
            marginBottom: '24px',
            fontSize: '13px'
          }}>
            <strong>Last Updated:</strong> February 13, 2026
          </div>

          {/* Introduction */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              Introduction
            </h2>
            <p>
              GSTGo ("we", "our", or "us") is committed to protecting your privacy and handling your data in 
              an open and transparent manner. This Privacy Policy explains how we collect, use, store, and 
              protect personal data when you use our GST invoice generation application for Shopify.
            </p>
          </section>

          {/* Data We Collect */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              1. Data We Collect
            </h2>
            <p style={{ marginBottom: '12px' }}>
              We collect and process the minimum personal data required to provide GST-compliant invoice 
              generation services:
            </p>
            
            <div style={{ marginLeft: '20px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                Shop Information
              </h3>
              <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
                <li>Shop domain and name</li>
                <li>OAuth access token (encrypted)</li>
                <li>Installation date and subscription status</li>
                <li>Company details (name, GSTIN, address, email, phone)</li>
              </ul>

              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                Order Data
              </h3>
              <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
                <li>Order ID, number, and status</li>
                <li>Order date and timestamps</li>
                <li>Payment and fulfillment status</li>
                <li>Line items (products, quantities, prices)</li>
                <li>Tax calculations and GST breakdowns</li>
              </ul>

              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                Customer Data
              </h3>
              <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
                <li>Customer name</li>
                <li>Billing and shipping addresses</li>
                <li>Email address (for invoice delivery, if enabled)</li>
              </ul>

              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                Product Data
              </h3>
              <ul style={{ paddingLeft: '20px' }}>
                <li>Product titles and SKUs</li>
                <li>HSN codes (for GST classification)</li>
                <li>Prices and tax rates</li>
              </ul>
            </div>
          </section>

          {/* How We Use Data */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              2. How We Use Your Data
            </h2>
            <p style={{ marginBottom: '12px' }}>
              We use the collected data exclusively for the following purposes:
            </p>
            <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
              <li><strong>Invoice Generation:</strong> Create GST-compliant invoices for your orders</li>
              <li><strong>GST Reporting:</strong> Generate GSTR-1 compliance reports</li>
              <li><strong>App Functionality:</strong> Provide template customization and configuration</li>
              <li><strong>Service Delivery:</strong> Store and retrieve invoices from secure cloud storage</li>
              <li><strong>Support:</strong> Troubleshoot issues and provide customer support</li>
              <li><strong>Legal Compliance:</strong> Meet Indian tax law requirements for invoice retention</li>
            </ul>
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#fef3c7', 
              borderLeft: '4px solid #f59e0b',
              borderRadius: '4px',
              fontSize: '13px'
            }}>
              <strong>Important:</strong> We do NOT use your data for marketing, advertising, or sell it to third parties.
            </div>
          </section>

          {/* Data Retention */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              3. Data Retention
            </h2>
            <p style={{ marginBottom: '12px' }}>
              We retain your data for the following periods:
            </p>
            <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
              <li><strong>Orders & Invoices:</strong> 7 years (as required by Indian tax laws)</li>
              <li><strong>GST Reporting Data:</strong> 7 years (tax compliance requirement)</li>
              <li><strong>Session Data:</strong> 90 days (auto-deleted after expiry)</li>
              <li><strong>Audit Logs:</strong> 2 years</li>
              <li><strong>Shop Configuration:</strong> Retained while app is installed; deleted 30 days after uninstallation</li>
            </ul>
          </section>

          {/* Data Security */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              4. Data Security
            </h2>
            <p style={{ marginBottom: '12px' }}>
              We implement industry-standard security measures to protect your data:
            </p>
            <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
              <li><strong>Encryption in Transit:</strong> All data transmitted via HTTPS/TLS</li>
              <li><strong>Encryption at Rest:</strong> Data stored in AWS DynamoDB with server-side encryption</li>
              <li><strong>Access Control:</strong> Role-based access with least privilege principle</li>
              <li><strong>OAuth 2.0:</strong> Secure authentication using Shopify's token exchange</li>
              <li><strong>Data Isolation:</strong> Each shop's data is logically isolated</li>
              <li><strong>Secure Storage:</strong> Invoice PDFs stored in AWS S3 with private access</li>
            </ul>
          </section>

          {/* Your Rights */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              5. Your Rights
            </h2>
            <p style={{ marginBottom: '12px' }}>
              As a merchant using our app, you have the following rights:
            </p>
            
            <div style={{ marginLeft: '20px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                Right to Access
              </h3>
              <p style={{ marginBottom: '12px' }}>
                You can access all your data through the app dashboard. For a complete data export, 
                contact our support team.
              </p>

              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                Right to Rectification
              </h3>
              <p style={{ marginBottom: '12px' }}>
                You can update company details and configurations through the Settings page at any time.
              </p>

              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                Right to Erasure
              </h3>
              <p style={{ marginBottom: '12px' }}>
                Upon uninstalling the app, your shop configuration will be deleted after a 30-day grace period. 
                Note: Order and invoice data is retained for 7 years due to tax law requirements. To request 
                earlier deletion (subject to legal obligations), contact support.
              </p>

              <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                Right to Data Portability
              </h3>
              <p style={{ marginBottom: '12px' }}>
                You can download invoices as PDFs and export GST reports as Excel files directly from the app.
              </p>
            </div>
          </section>

          {/* Third-Party Services */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              6. Third-Party Services
            </h2>
            <p style={{ marginBottom: '12px' }}>
              We use the following trusted third-party services to operate our app:
            </p>
            <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
              <li><strong>Amazon Web Services (AWS):</strong> Cloud infrastructure for data storage and processing</li>
              <li><strong>Shopify:</strong> OAuth authentication and order data retrieval</li>
            </ul>
            <p style={{ fontSize: '13px', color: '#6b7280' }}>
              These services are GDPR-compliant and have their own privacy policies. We have data processing 
              agreements in place with all third-party providers.
            </p>
          </section>

          {/* Automated Decision-Making */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              7. Automated Decision-Making
            </h2>
            <p>
              Our app automatically generates GST-compliant invoices based on your order data. This is a 
              necessary function of the service. The process:
            </p>
            <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
              <li>Does not make decisions with legal or significant effects on individuals</li>
              <li>Is transparent and rule-based (GST tax calculations)</li>
              <li>Allows manual review and regeneration of invoices at any time</li>
            </ul>
          </section>

          {/* Data Processing Agreement */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              8. Data Processing Agreement
            </h2>
            <p style={{ marginBottom: '12px' }}>
              By installing and using GSTGo, you agree that:
            </p>
            <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
              <li>You have the right to share customer and order data with us</li>
              <li>You have informed your customers about data processing as required by law</li>
              <li>We act as a data processor on your behalf</li>
              <li>You are the data controller responsible for your customers' data</li>
            </ul>
          </section>

          {/* Changes to Policy */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              9. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant changes 
              via email or in-app notification. Continued use of the app after changes constitutes acceptance 
              of the updated policy.
            </p>
          </section>

          {/* Contact */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              10. Contact Us
            </h2>
            <p style={{ marginBottom: '8px' }}>
              If you have questions about this Privacy Policy or wish to exercise your data rights, contact us at:
            </p>
            <div style={{ 
              padding: '16px', 
              backgroundColor: '#f9fafb', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              fontSize: '13px'
            }}>
              <p style={{ margin: '4px 0' }}><strong>Email:</strong>contactus.gstgo@gmail.com</p>
              <p style={{ margin: '4px 0' }}><strong>Response Time:</strong> Within 48 hours</p>
            </div>
          </section>

          {/* Footer */}
          <div style={{ 
            marginTop: '48px', 
            paddingTop: '24px', 
            borderTop: '1px solid #e5e7eb',
            fontSize: '12px',
            color: '#9ca3af',
            textAlign: 'center'
          }}>
            This privacy policy is compliant with GDPR, Indian IT Act 2000, and Digital Personal Data Protection Act 2023.
          </div>

        </div>
      </s-section>
    </s-page>
  );
}
