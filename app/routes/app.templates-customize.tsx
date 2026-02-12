import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, Form, useNavigation, useNavigate, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import { saveTemplateConfiguration, getTemplateConfiguration } from "../services/dynamodb.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  // Get template ID from URL params
  const url = new URL(request.url);
  const templateId = url.searchParams.get("template") || "minimalist";
  
  // Try to load existing configuration from DynamoDB
  let existingConfig = null;
  try {
    existingConfig = await getTemplateConfiguration(shop, templateId);
  } catch (error) {
    console.error("Error loading template config:", error);
  }
  
  // Configuration based on lambda-generate-invoice .env structure
  const configuration = {
    // Fonts and Colors
    styling: {
      primaryColor: { label: "Primary Color", type: "color", default: existingConfig?.styling?.primaryColor || "#333333", envVar: "INVOICE_PRIMARY_COLOR" },
      headerBackgroundColor: { label: "Header Background Color", type: "color", default: existingConfig?.styling?.headerBackgroundColor || "#333333", envVar: "INVOICE_HEADER_BG_COLOR" },
      headerTextColor: { label: "Header Text Color", type: "color", default: existingConfig?.styling?.headerTextColor || "#ffffff", envVar: "INVOICE_HEADER_TEXT_COLOR" },
      fontFamily: { label: "Font Family", type: "select", default: existingConfig?.styling?.fontFamily || "Helvetica", options: ["Helvetica", "Courier", "Times-Roman"], envVar: "INVOICE_FONT_FAMILY" },
      titleFontSize: { label: "Title Font Size", type: "number", default: existingConfig?.styling?.titleFontSize || 28, min: 20, max: 40, envVar: "INVOICE_TITLE_FONT_SIZE" },
      headingFontSize: { label: "Heading Font Size", type: "number", default: existingConfig?.styling?.headingFontSize || 16, min: 12, max: 24, envVar: "INVOICE_HEADING_FONT_SIZE" },
      bodyFontSize: { label: "Body Font Size", type: "number", default: existingConfig?.styling?.bodyFontSize || 11, min: 8, max: 16, envVar: "INVOICE_BODY_FONT_SIZE" },
      itemTableFontSize: { label: "Item Table Font Size", type: "number", default: existingConfig?.styling?.itemTableFontSize || 8, min: 6, max: 12, envVar: "INVOICE_TABLE_FONT_SIZE" },
    },
  };
  
  return { shop, templateId, configuration };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  const formData = await request.formData();
  const templateId = formData.get("templateId") as string || "minimalist";
  
  // Get existing configuration first to preserve values not in current form
  let existingConfig = await getTemplateConfiguration(shop, templateId);
  if (!existingConfig) {
    existingConfig = { styling: {}, company: {} };
  }
  
  // Helper to get form value or fallback to existing/default
  const getFormValue = (key: string, fallback: any) => {
    const value = formData.get(key);
    if (value === null || value === undefined) return fallback;
    const strValue = value as string;
    return strValue.trim() === "" ? fallback : strValue;
  };
  
  // Parse form data into configuration structure - only update fields that are present
  const styling = {
    primaryColor: getFormValue("styling.primaryColor", existingConfig.styling?.primaryColor || "#333333"),
    headerBackgroundColor: getFormValue("styling.headerBackgroundColor", existingConfig.styling?.headerBackgroundColor || "#333333"),
    headerTextColor: getFormValue("styling.headerTextColor", existingConfig.styling?.headerTextColor || "#ffffff"),
    fontFamily: getFormValue("styling.fontFamily", existingConfig.styling?.fontFamily || "Helvetica"),
    titleFontSize: formData.get("styling.titleFontSize") ? parseInt(formData.get("styling.titleFontSize") as string) : (existingConfig.styling?.titleFontSize || 28),
    headingFontSize: formData.get("styling.headingFontSize") ? parseInt(formData.get("styling.headingFontSize") as string) : (existingConfig.styling?.headingFontSize || 16),
    bodyFontSize: formData.get("styling.bodyFontSize") ? parseInt(formData.get("styling.bodyFontSize") as string) : (existingConfig.styling?.bodyFontSize || 11),
    itemTableFontSize: formData.get("styling.itemTableFontSize") ? parseInt(formData.get("styling.itemTableFontSize") as string) : (existingConfig.styling?.itemTableFontSize || 8),
  };
  
  // Keep existing company details unchanged (now stored in Shops table)
  const company = existingConfig.company || {};
  
  try {
    await saveTemplateConfiguration(shop, templateId, { styling, company });
    console.log(`✅ Configuration saved for shop: ${shop}, template: ${templateId}`);
    return { success: true, message: "Template styling saved successfully" };
  } catch (error) {
    console.error("Error saving configuration:", error);
    return { success: false, error: "Failed to save configuration" };
  }
};

export default function CustomizeTemplate() {
  const { shop, templateId, configuration } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("styling");
  const [showNotification, setShowNotification] = useState(false);
  
  // Show notification after successful save
  useEffect(() => {
    if (actionData?.success) {
      setShowNotification(true);
      const timer = setTimeout(() => setShowNotification(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);
  
  const sections = [
    { id: "styling", label: "Fonts and Colors", icon: "🎨" },
  ];

  const isSubmitting = navigation.state === "submitting";

  const renderFormField = (key: string, config: any, section: string) => {
    const fieldName = `${section}.${key}`;
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
        const colorTextId = `${fieldName}-text`;
        const colorPickerId = `${fieldName}-picker`;
        return (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="color"
              id={colorPickerId}
              name={fieldName}
              defaultValue={config.default}
              onChange={(e) => {
                const textInput = document.getElementById(colorTextId) as HTMLInputElement;
                if (textInput) {
                  textInput.value = e.target.value;
                }
              }}
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
              id={colorTextId}
              defaultValue={config.default}
              onChange={(e) => {
                const colorInput = document.getElementById(colorPickerId) as HTMLInputElement;
                if (colorInput && /^#[0-9A-F]{6}$/i.test(e.target.value)) {
                  colorInput.value = e.target.value;
                }
              }}
              style={{ ...commonStyle, width: '140px' }}
              placeholder="#333333"
            />
          </div>
        );
      
      case "select":
        return (
          <select name={fieldName} defaultValue={config.default} style={{ ...commonStyle, cursor: 'pointer' }}>
            {!config.default && <option value="">Select {config.label}</option>}
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
              name={fieldName}
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
        const isLogo = key === "logoFilename";
        const isSignature = key === "signatureFilename";
        const fileInputName = isLogo ? "logoFile" : isSignature ? "signatureFile" : fieldName;
        
        return (
          <div>
            <div style={{ marginBottom: '8px' }}>
              <input
                type="file"
                name={fileInputName}
                accept="image/*"
                style={{ 
                  ...commonStyle,
                  padding: '8px',
                  cursor: 'pointer'
                }}
              />
            </div>
            {config.default && (
              <p style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>✓</span>
                <span>Current: {config.default}</span>
              </p>
            )}
            <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
              Accepted: JPG, PNG, GIF • Max 5MB • Stored in S3
            </p>
          </div>
        );

      case "email":
        return (
          <input
            type="email"
            name={fieldName}
            defaultValue={config.default}
            style={commonStyle}
            placeholder={config.label}
          />
        );
      
      case "checkbox":
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                name={fieldName}
                defaultChecked={config.default}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '12px', color: '#374151' }}>Enable this option</span>
            </div>
            {config.description && (
              <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px', lineHeight: '1.5', backgroundColor: '#f9fafb', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #d1d5db' }}>
                {config.description}
              </p>
            )}
          </div>
        );
      
      default:
        return (
          <input
            type="text"
            name={fieldName}
            defaultValue={config.default}
            style={commonStyle}
            placeholder={config.label}
          />
        );
    }
  };

  return (
    <s-page>
      {/* Success/Error Notification */}
      {showNotification && actionData?.success && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <span style={{ fontSize: '18px' }}>✓</span>
          <span>{actionData.message}</span>
        </div>
      )}
      
      {actionData?.error && (
        <div style={{
          backgroundColor: '#fee',
          color: '#c00',
          padding: '12px 24px',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px solid #fcc'
        }}>
          ⚠️ {actionData.error}
        </div>
      )}
      
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
          <Form method="post" id="customize-form" encType="multipart/form-data">
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="section" value={activeSection} />
            
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Fonts and Colors</h3>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
                Customize the visual appearance of your invoices
              </p>
              
              {Object.entries(configuration.styling).map(([key, config]: [string, any]) => (
                <div key={key} style={{ marginBottom: '20px' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '13px', 
                    fontWeight: '500', 
                    marginBottom: '6px',
                    color: '#374151'
                  }}>
                    {config.label}
                  </label>
                  {renderFormField(key, config, "styling")}
                  <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                    Environment variable: <code style={{ backgroundColor: '#f3f4f6', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>{config.envVar}</code>
                  </p>
                </div>
              ))}
            </div>
          </Form>
        </div>
      </div>
    </s-page>
  );
}
