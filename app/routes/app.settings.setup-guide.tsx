export default function SetupGuide() {
  return (
    <div>
      <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>HSN/SAC Code Configuration</h3>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
        Configure HSN codes on your Shopify products for GST-compliant invoices
      </p>

      {/* Info Banner */}
      <div style={{
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '6px',
        padding: '12px 16px',
        marginBottom: '24px',
        fontSize: '13px',
        color: '#1e40af',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span>ℹ️</span>
        <span>HSN codes are automatically synced when you update products in Shopify.</span>
      </div>

      {/* Step 1 */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
          Step 1: Add HSN Metafield to Products
        </label>
        <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
          <ol style={{ fontSize: '13px', color: '#374151', paddingLeft: '18px', lineHeight: '2', margin: 0 }}>
            <li>Go to <strong>Shopify Admin → Products</strong></li>
            <li>Select a product → scroll to <strong>Metafields</strong></li>
            <li>Add a custom metafield:</li>
          </ol>
          <div style={{ marginLeft: '18px', marginTop: '8px' }}>
            <table style={{ fontSize: '12px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', color: '#6b7280', fontWeight: 500 }}>Namespace</td>
                  <td><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '3px', fontSize: '12px' }}>custom</code></td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', color: '#6b7280', fontWeight: 500 }}>Key</td>
                  <td><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '3px', fontSize: '12px' }}>hsn</code> or <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '3px', fontSize: '12px' }}>hsn_code</code></td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', color: '#6b7280', fontWeight: 500 }}>Type</td>
                  <td><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '3px', fontSize: '12px' }}>Single line text</code></td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', color: '#6b7280', fontWeight: 500 }}>Value</td>
                  <td><code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '3px', fontSize: '12px' }}>e.g. 64029990</code></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
          Both "hsn" and "hsn_code" are supported as metafield keys
        </p>
      </div>

      {/* Step 2 */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
          Step 2: Automatic Sync
        </label>
        <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
          <ul style={{ fontSize: '13px', color: '#374151', paddingLeft: '18px', lineHeight: '2', margin: 0 }}>
            <li>Product updates trigger a webhook automatically</li>
            <li>HSN code is cached in the database <span style={{ color: '#6b7280' }}>(90-day TTL)</span></li>
            <li>Future invoices include HSN — no manual work needed</li>
          </ul>
        </div>
        <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
          Zero API calls during invoice generation — uses local cache
        </p>
      </div>

      {/* Step 3 */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
          Step 3: Verify on Invoices
        </label>
        <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
          <ul style={{ fontSize: '13px', color: '#374141', paddingLeft: '18px', lineHeight: '2', margin: 0 }}>
            <li>Go to <strong>Orders</strong> page in this app</li>
            <li>View or download a generated invoice PDF</li>
            <li>HSN code appears in the line items table</li>
            <li>GST summary is grouped by HSN code + tax rate</li>
          </ul>
        </div>
      </div>

      {/* Troubleshooting */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
          Troubleshooting
        </label>
        <div style={{ backgroundColor: '#fef9ee', padding: '16px', borderRadius: '6px', border: '1px solid #fde68a' }}>
          <p style={{ fontSize: '13px', fontWeight: 500, color: '#92400e', marginBottom: '8px', marginTop: 0 }}>
            HSN not showing on invoice?
          </p>
          <ul style={{ fontSize: '13px', color: '#78350f', paddingLeft: '18px', lineHeight: '2', margin: 0 }}>
            <li>Verify metafield namespace is <code style={{ backgroundColor: '#fef3c7', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>custom</code></li>
            <li>Verify metafield key is <code style={{ backgroundColor: '#fef3c7', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>hsn</code> or <code style={{ backgroundColor: '#fef3c7', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>hsn_code</code></li>
            <li>Create a new test order after updating the metafield</li>
            <li>Check Shopify Admin → Settings → Notifications → Webhooks</li>
          </ul>
        </div>
      </div>

      {/* Resources */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
          Resources
        </label>
        <div style={{ display: 'flex', gap: '12px' }}>
          <a
            href="https://services.gst.gov.in/services/searchhsnsac"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              padding: '12px 16px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              textDecoration: 'none',
              color: '#374151',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <span>🔍</span>
            <span>Search HSN/SAC Code (GST Portal)</span>
          </a>
          <a
            href="https://help.shopify.com/en/manual/custom-data/metafields"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              padding: '12px 16px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              textDecoration: 'none',
              color: '#374151',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <span>📖</span>
            <span>Shopify Metafields Docs</span>
          </a>
        </div>
      </div>
    </div>
  );
}
