import type { LoaderFunctionArgs } from "react-router";

// No authentication needed - public route
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return null;
};

export default function PrivacyPolicy() {
  return (
    <div style={{ 
      maxWidth: '900px', 
      margin: '40px auto', 
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '16px', color: '#111827' }}>
        Privacy Policy - GSTGo
      </h1>

      <div style={{ 
        padding: '12px 16px', 
        backgroundColor: '#f3f4f6', 
        borderRadius: '6px', 
        marginBottom: '32px',
        fontSize: '14px'
      }}>
        <strong>Last Updated:</strong> February 15, 2026
      </div>

      {/* Introduction */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          Introduction
        </h2>
        <p style={{ lineHeight: '1.8', color: '#374151' }}>
          GSTGo ("we", "our", or "us") is committed to protecting your privacy and handling your data in 
          an open and transparent manner. This Privacy Policy explains how we collect, use, store, and 
          protect personal data when you use our GST invoice generation application for Shopify.
        </p>
      </section>

      {/* Data We Collect */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          1. Data We Collect
        </h2>
        <p style={{ marginBottom: '12px', lineHeight: '1.8', color: '#374151' }}>
          We collect and process the minimum personal data required to provide GST-compliant invoice 
          generation services:
        </p>
        
        <div style={{ marginLeft: '20px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
            Shop Information
          </h3>
          <ul style={{ lineHeight: '1.8', color: '#374151' }}>
            <li>Shop domain and Shopify store URL</li>
            <li>Store owner email address</li>
            <li>Company name and GST registration details (if provided)</li>
            <li>Store location and business address</li>
          </ul>
        </div>

        <div style={{ marginLeft: '20px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
            Order Data
          </h3>
          <ul style={{ lineHeight: '1.8', color: '#374151' }}>
            <li>Order numbers and order details</li>
            <li>Customer names and billing/shipping addresses</li>
            <li>Product details including names, quantities, prices, and tax information</li>
            <li>HSN/SAC codes associated with products</li>
          </ul>
        </div>

        <div style={{ marginLeft: '20px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
            Technical Data
          </h3>
          <ul style={{ lineHeight: '1.8', color: '#374151' }}>
            <li>Session tokens for authentication</li>
            <li>API access logs for security purposes</li>
            <li>Usage statistics (anonymized)</li>
          </ul>
        </div>
      </section>

      {/* How We Use Your Data */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          2. How We Use Your Data
        </h2>
        <ul style={{ lineHeight: '1.8', color: '#374151', marginLeft: '20px' }}>
          <li>Generate GST-compliant invoices for your orders</li>
          <li>Store invoice PDFs securely for future access</li>
          <li>Generate GST reports (GSTR-1, HSN summaries)</li>
          <li>Provide customer support and troubleshooting</li>
          <li>Improve our services and add new features</li>
          <li>Comply with legal and regulatory requirements</li>
        </ul>
      </section>

      {/* Data Storage and Security */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          3. Data Storage and Security
        </h2>
        <ul style={{ lineHeight: '1.8', color: '#374151', marginLeft: '20px' }}>
          <li><strong>Cloud Infrastructure:</strong> We use AWS (Amazon Web Services) for secure data storage</li>
          <li><strong>Encryption:</strong> All data is encrypted in transit (HTTPS) and at rest</li>
          <li><strong>Access Control:</strong> Strict access controls limit who can access your data</li>
          <li><strong>Data Location:</strong> Data is stored in secure AWS data centers</li>
          <li><strong>Retention:</strong> We retain data only as long as necessary to provide services</li>
        </ul>
      </section>

      {/* Data Sharing */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          4. Data Sharing
        </h2>
        <p style={{ lineHeight: '1.8', color: '#374151', marginBottom: '12px' }}>
          We do not sell, rent, or trade your personal data. We only share data in these limited circumstances:
        </p>
        <ul style={{ lineHeight: '1.8', color: '#374151', marginLeft: '20px' }}>
          <li><strong>Shopify:</strong> We access data through Shopify's API as authorized by you</li>
          <li><strong>Service Providers:</strong> AWS for hosting and infrastructure</li>
          <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
        </ul>
      </section>

      {/* Your Rights */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          5. Your Rights
        </h2>
        <p style={{ lineHeight: '1.8', color: '#374151', marginBottom: '12px' }}>
          You have the following rights regarding your data:
        </p>
        <ul style={{ lineHeight: '1.8', color: '#374151', marginLeft: '20px' }}>
          <li><strong>Access:</strong> Request a copy of your data</li>
          <li><strong>Correction:</strong> Update incorrect or incomplete data</li>
          <li><strong>Deletion:</strong> Request deletion of your data (subject to legal requirements)</li>
          <li><strong>Export:</strong> Download your invoices and reports anytime</li>
          <li><strong>Withdrawal:</strong> Uninstall the app to revoke data access</li>
        </ul>
      </section>

      {/* Data Deletion */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          6. Data Deletion
        </h2>
        <p style={{ lineHeight: '1.8', color: '#374151' }}>
          When you uninstall GSTGo, we automatically delete most of your data within 30 days. 
          Invoice PDFs may be retained for up to 90 days to comply with tax record-keeping requirements. 
          You can request immediate deletion by contacting us.
        </p>
      </section>

      {/* Cookies and Tracking */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          7. Cookies and Tracking
        </h2>
        <p style={{ lineHeight: '1.8', color: '#374151' }}>
          We use session cookies for authentication within the Shopify admin. We do not use third-party 
          tracking or advertising cookies.
        </p>
      </section>

      {/* Children's Privacy */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          8. Children's Privacy
        </h2>
        <p style={{ lineHeight: '1.8', color: '#374151' }}>
          Our services are intended for businesses only. We do not knowingly collect data from children 
          under 13 years of age.
        </p>
      </section>

      {/* Changes to This Policy */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          9. Changes to This Policy
        </h2>
        <p style={{ lineHeight: '1.8', color: '#374151' }}>
          We may update this Privacy Policy from time to time. We will notify you of significant changes 
          via email or through the app. Continued use after changes constitutes acceptance.
        </p>
      </section>

      {/* Contact Us */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          10. Contact Us
        </h2>
        <p style={{ lineHeight: '1.8', color: '#374151', marginBottom: '12px' }}>
          For questions, concerns, or data requests regarding this Privacy Policy:
        </p>
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#f9fafb', 
          borderLeft: '4px solid #3b82f6',
          borderRadius: '4px'
        }}>
          <p style={{ margin: '4px 0', color: '#374151' }}><strong>Email:</strong> contactus.gstgo@gmail.com</p>
          <p style={{ margin: '4px 0', color: '#374151' }}><strong>App Name:</strong> GSTGo</p>
          <p style={{ margin: '4px 0', color: '#374151' }}><strong>Developer:</strong> GSTGo Team</p>
        </div>
      </section>

      {/* Compliance */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          11. Compliance
        </h2>
        <p style={{ lineHeight: '1.8', color: '#374151' }}>
          This Privacy Policy complies with:
        </p>
        <ul style={{ lineHeight: '1.8', color: '#374151', marginLeft: '20px' }}>
          <li>Shopify's App Store requirements</li>
          <li>Information Technology Act, 2000 (India)</li>
          <li>General Data Protection Regulation (GDPR) principles</li>
          <li>GST record-keeping requirements in India</li>
        </ul>
      </section>

      {/* Footer */}
      <div style={{ 
        marginTop: '48px', 
        paddingTop: '24px', 
        borderTop: '1px solid #e5e7eb',
        textAlign: 'center',
        fontSize: '14px',
        color: '#6b7280'
      }}>
        <p>© 2026 GSTGo. All rights reserved.</p>
        <p style={{ marginTop: '8px' }}>
          By using GSTGo, you agree to this Privacy Policy.
        </p>
      </div>
    </div>
  );
}
