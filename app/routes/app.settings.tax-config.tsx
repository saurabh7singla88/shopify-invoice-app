/**
 * Settings: Tax Configuration
 * Configure how tax should be calculated for invoices
 */

import { useState, useEffect } from "react";
import { useFetcher } from "react-router";

export default function TaxConfigSettings() {
  const fetcher = useFetcher();
  const [taxMethod, setTaxMethod] = useState<"app" | "shopify">("shopify");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Load current configuration
  useEffect(() => {
    fetcher.load("/api/settings/tax-config");
  }, []);

  // Update local state when data loads
  useEffect(() => {
    if (fetcher.data && !('error' in fetcher.data)) {
      setTaxMethod(fetcher.data.taxCalculationMethod || "shopify");
      setIsLoading(false);
    }
  }, [fetcher.data]);

  const handleSave = () => {
    setIsSaving(true);
    setShowSuccess(false);
    fetcher.submit(
      { taxCalculationMethod: taxMethod },
      {
        method: "POST",
        action: "/api/settings/tax-config",
        encType: "application/json",
      }
    );
  };

  // Handle save completion
  useEffect(() => {
    if (fetcher.state === "idle" && isSaving) {
      setIsSaving(false);
      if (fetcher.data && 'success' in fetcher.data) {
        setShowSuccess(true);
        // Hide success message after 3 seconds
        setTimeout(() => setShowSuccess(false), 3000);
      }
    }
  }, [fetcher.state, fetcher.data, isSaving]);

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
        Loading configuration...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
        Tax Calculation Method
      </h2>
      <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '14px', lineHeight: '1.6' }}>
        Choose how GST/tax should be calculated for your invoices and reports.
      </p>

      {/* Configuration Options */}
      <div style={{
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        {/* Option 1: Shopify's Tax Lines */}
        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '16px',
          backgroundColor: 'white',
          border: taxMethod === "shopify" ? '2px solid #2563eb' : '1px solid #d1d5db',
          borderRadius: '8px',
          cursor: 'pointer',
          marginBottom: '16px'
        }}>
          <input
            type="radio"
            name="taxMethod"
            value="shopify"
            checked={taxMethod === "shopify"}
            onChange={(e) => setTaxMethod(e.target.value as "shopify")}
            style={{ marginTop: '3px', cursor: 'pointer' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '15px' }}>
              Shopify's Tax Data <span style={{ color: '#059669', fontSize: '12px', fontWeight: 500 }}>✓ Recommended</span>
            </div>
            <div style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.5' }}>
              Uses tax amounts calculated by Shopify based on your store's tax configuration.
              Supports all GST rates (0%, 5%, 12%, 18%, 28%) and custom tax settings.
              Falls back to app's logic if Shopify tax data is unavailable.
            </div>
            <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#d1fae5', borderRadius: '6px', fontSize: '12px', color: '#065f46' }}>
              ✓ <strong>Benefit:</strong> Ensures tax accuracy by using Shopify's calculated values from your tax settings.
            </div>
          </div>
        </label>

        {/* Option 2: App's Logic */}
        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '16px',
          backgroundColor: 'white',
          border: taxMethod === "app" ? '2px solid #2563eb' : '1px solid #d1d5db',
          borderRadius: '8px',
          cursor: 'pointer'
        }}>
          <input
            type="radio"
            name="taxMethod"
            value="app"
            checked={taxMethod === "app"}
            onChange={(e) => setTaxMethod(e.target.value as "app")}
            style={{ marginTop: '3px', cursor: 'pointer' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '15px' }}>
              App's Tax Calculation
            </div>
            <div style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.5' }}>
              Uses app's built-in logic with GST slab rates (5% for items under ₹2500, 18% for items ₹2500 and above).
              Tax is calculated backward from the product's selling price.
            </div>
            <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#fef3c7', borderRadius: '6px', fontSize: '12px', color: '#92400e' }}>
              ⚠️ <strong>Note:</strong> This method ignores Shopify's tax configuration and may not reflect your actual tax settings.
            </div>
          </div>
        </label>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            padding: '10px 24px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.6 : 1
          }}
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>

        {showSuccess && (
          <div style={{
            padding: '8px 16px',
            backgroundColor: '#d1fae5',
            color: '#065f46',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            ✓ Configuration saved successfully!
          </div>
        )}

        {fetcher.data && 'error' in fetcher.data && (
          <span style={{ color: '#dc2626', fontSize: '14px' }}>
            {fetcher.data.error}
          </span>
        )}
      </div>

      {/* Additional Information */}
      <div style={{
        marginTop: '32px',
        padding: '16px',
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#1e40af',
        lineHeight: '1.6'
      }}>
        <strong>💡 How it works:</strong>
        <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
          <li>Your tax configuration applies to all new invoices generated after saving.</li>
          <li>Existing invoices remain unchanged.</li>
          <li>Tax breakdowns (CGST/SGST or IGST) are automatically calculated based on buyer/seller states.</li>
        </ul>
      </div>
    </div>
  );
}
