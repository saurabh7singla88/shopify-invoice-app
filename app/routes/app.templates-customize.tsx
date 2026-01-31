import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, Form, useNavigation, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  // Get template ID from URL params
  const url = new URL(request.url);
  const templateId = url.searchParams.get("template") || "minimalist";
  
  // Configuration based on lambda-generate-invoice .env structure
  const configuration = {
    // Fonts and Colors
    styling: {
      primaryColor: { label: "Primary Color", type: "color", default: "#333333", envVar: "INVOICE_PRIMARY_COLOR" },
      fontFamily: { label: "Font Family", type: "select", default: "Helvetica", options: ["Helvetica", "Courier", "Times-Roman"], envVar: "INVOICE_FONT_FAMILY" },
      titleFontSize: { label: "Title Font Size", type: "number", default: 28, min: 20, max: 40, envVar: "INVOICE_TITLE_FONT_SIZE" },
      headingFontSize: { label: "Heading Font Size", type: "number", default: 16, min: 12, max: 24, envVar: "INVOICE_HEADING_FONT_SIZE" },
      bodyFontSize: { label: "Body Font Size", type: "number", default: 11, min: 8, max: 16, envVar: "INVOICE_BODY_FONT_SIZE" },
    },
    // Company Configuration
    company: {
      companyName: { label: "Company Name", type: "text", default: "", envVar: "COMPANY_NAME" },
      legalName: { label: "Legal Name", type: "text", default: "", envVar: "COMPANY_LEGAL_NAME" },
      addressLine1: { label: "Address Line 1", type: "text", default: "", envVar: "COMPANY_ADDRESS_LINE1" },
      addressLine2: { label: "Address Line 2", type: "text", default: "", envVar: "COMPANY_ADDRESS_LINE2" },
      state: { label: "State", type: "text", default: "", envVar: "COMPANY_STATE" },
      gstin: { label: "GSTIN", type: "text", default: "", envVar: "COMPANY_GSTIN" },
      supportEmail: { label: "Support Email", type: "email", default: "", envVar: "COMPANY_SUPPORT_EMAIL" },
      phone: { label: "Phone", type: "text", default: "", envVar: "COMPANY_PHONE" },
      logoFilename: { label: "Logo Filename", type: "file", default: "logo.jpg", envVar: "COMPANY_LOGO_FILENAME" },
      signatureFilename: { label: "Signature Filename", type: "file", default: "", envVar: "COMPANY_SIGNATURE_FILENAME" },
    }
  };
  
  return { templateId, configuration };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  
  const formData = await request.formData();
  // TODO: Save configuration to database or update .env
  console.log("Saving configuration:", Object.fromEntries(formData));
  
  return { success: true };
};

export default function CustomizeTemplate() {
  const { templateId, configuration } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("styling");
  
  const sections = [
    { id: "styling", label: "Fonts and Colors", icon: "🎨" },
    { id: "company", label: "Company Configuration", icon: "🏢" },
  ];

  const isSubmitting = navigation.state === "submitting";

  const renderFormField = (key: string, config: any) => {
    const commonStyle = {
      padding: '10px 12px',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '14px',
      width: '100%',
      boxSizing: 'border-box' as const,
    };

    switch (config.type) {
      case "color":
        return (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="color"
              name={key}
              defaultValue={config.default}
              style={{
                width: '60px',
                height: '44px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '2px'
              }}
            />
            <input
              type="text"
              defaultValue={config.default}
              style={{ ...commonStyle, width: '140px' }}
              placeholder="#333333"
            />
          </div>
        );
      
      case "select":
        return (
          <select name={key} defaultValue={config.default} style={{ ...commonStyle, cursor: 'pointer' }}>
            {config.options?.map((option: string) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      
      case "number":
        return (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="number"
              name={key}
              defaultValue={config.default}
              min={config.min}
              max={config.max}
              style={{ ...commonStyle, width: '100px' }}
            />
            <input
              type="range"
              defaultValue={config.default}
              min={config.min}
              max={config.max}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280', width: '80px' }}>
              {config.min} - {config.max}
            </span>
          </div>
        );

      case "file":
        return (
          <div>
            <input
              type="text"
              name={key}
              defaultValue={config.default}
              style={commonStyle}
              placeholder={config.label}
            />
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Place file in lambda-generate-invoice/assets/ folder
            </p>
          </div>
        );

      case "email":
        return (
          <input
            type="email"
            name={key}
            defaultValue={config.default}
            style={commonStyle}
            placeholder={config.label}
          />
        );
      
      default:
        return (
          <input
            type="text"
            name={key}
            defaultValue={config.default}
            style={commonStyle}
            placeholder={config.label}
          />
        );
    }
  };

  return (
    <s-page>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <s-link href="/app/templates" style={{ textDecoration: 'none' }}>
            <button
              style={{
                fontSize: '18px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#374151',
                padding: '4px 8px'
              }}
            >
              ←
            </button>
          </s-link>
          <h1 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>Customize Template</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Reset to Defaults
          </button>
          <button
            type="submit"
            form="customize-form"
            disabled={isSubmitting}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1f2937',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', gap: '24px', minHeight: '600px' }}>
        {/* Left Sidebar - Sections */}
        <div style={{ 
          width: '280px', 
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
          height: 'fit-content'
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', color: '#6b7280', textTransform: 'uppercase' }}>Customize</h2>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: activeSection === section.id ? '#f3f4f6' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                marginBottom: '4px',
                fontSize: '14px',
                color: activeSection === section.id ? '#1f2937' : '#6b7280',
                fontWeight: activeSection === section.id ? '500' : '400',
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '16px' }}>{section.icon}</span>
                <span>{section.label}</span>
              </div>
              <span style={{ color: '#9ca3af' }}>›</span>
            </button>
          ))}
        </div>

        {/* Right Side - Configuration Form */}
        <div style={{ 
          flex: 1, 
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px'
        }}>
          <Form method="post" id="customize-form">
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="section" value={activeSection} />
            
            {activeSection === "styling" && (
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Fonts and Colors</h3>
                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
                  Customize the visual appearance of your invoices
                </p>
                
                {Object.entries(configuration.styling).map(([key, config]: [string, any]) => (
                  <div key={key} style={{ marginBottom: '24px' }}>
                    <label style={{ 
                      display: 'block', 
                      fontSize: '14px', 
                      fontWeight: '500', 
                      marginBottom: '8px',
                      color: '#374151'
                    }}>
                      {config.label}
                    </label>
                    {renderFormField(key, config)}
                    <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                      Environment variable: <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{config.envVar}</code>
                    </p>
                  </div>
                ))}
              </div>
            )}
            
            {activeSection === "company" && (
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Company Configuration</h3>
                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
                  Configure your company details that appear on invoices
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  {Object.entries(configuration.company).map(([key, config]: [string, any]) => (
                    <div key={key} style={{ gridColumn: ['addressLine1', 'addressLine2'].includes(key) ? 'span 2' : 'span 1' }}>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '14px', 
                        fontWeight: '500', 
                        marginBottom: '8px',
                        color: '#374151'
                      }}>
                        {config.label}
                      </label>
                      {renderFormField(key, config)}
                      <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                        <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{config.envVar}</code>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Form>
        </div>
      </div>
    </s-page>
  );
}
